import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  writeBatch,
  Firestore 
} from 'firebase/firestore';
import { InventoryItem } from '../types';
import { cleanData } from '../utils';

export const COLL_INVENTORY = 'inventory';
export const COLL_INVENTORY_INDEX = 'inventory_index';
export const INDEX_CHUNK_SIZE = 800;

export interface IndexChunk {
  chunkIndex: number;
  items: InventoryItem[];
  updatedAt: string;
}

/**
 * Parses snapshot of `inventory_index` collection and reassembles all inventory items.
 */
export function parseIndexSnapshot(snapshot: any): InventoryItem[] {
  const chunks: { chunkIndex: number; items: InventoryItem[] }[] = [];
  snapshot.forEach((docSnap: any) => {
    const data = docSnap.data();
    if (data && Array.isArray(data.items)) {
      chunks.push({
        chunkIndex: typeof data.chunkIndex === 'number' ? data.chunkIndex : 0,
        items: data.items
      });
    }
  });

  // Sort chunks in sequential order
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  const allItems: InventoryItem[] = [];
  chunks.forEach(c => {
    allItems.push(...c.items);
  });

  return allItems;
}

/**
 * Strips heavy secondary metadata (full PDF base64/blobs, excessive logs) 
 * while keeping all fields required for search, tables, pickers, accessories, and serials badge.
 */
export function extractCompactItem(item: InventoryItem): InventoryItem {
  return cleanData({
    id: item.id,
    name: item.name || '',
    category: item.category || 'Altro',
    subcategory: item.subcategory || '',
    folder: item.folder || '',
    productCode: item.productCode || '',
    qrCode: item.qrCode || '',
    alias: item.alias || '',
    location: item.location || '',
    inStock: item.inStock ?? 1,
    databaseId: item.databaseId || 'default',
    stockType: item.stockType || 'bulk',
    description: item.description || '',
    internalRemark: item.internalRemark || '',
    externalRemark: item.externalRemark || '',
    rentalPrice: item.rentalPrice || 0,
    purchasePrice: item.purchasePrice,
    subhirePrice: item.subhirePrice,
    subrentalCost: item.subrentalCost,
    rentalSaleType: item.rentalSaleType || 'rental',
    canHaveContent: item.canHaveContent,
    weight: item.weight,
    dimensions: item.dimensions,
    volume: item.volume,
    packedPer: item.packedPer,
    current: item.current,
    powerConsumption: item.powerConsumption,
    powerPhase: item.powerPhase,
    powerSupplyRating: item.powerSupplyRating,
    powerConnector: item.powerConnector,
    accessories: item.accessories || [],
    reminders: item.reminders || [],
    instances: (item.instances || []).map(i => ({
      id: i.id,
      serialNumber: i.serialNumber || '',
      internalReference: i.internalReference || '',
      purchaseDate: i.purchaseDate || '',
      active: i.active !== false,
      notes: i.notes || '',
      status: (i as any).status || (i.active === false ? 'maintenance' : 'active')
    })),
    documents: (item.documents || []).map(d => ({
      id: d.id,
      name: d.name || '',
      url: d.url || '',
      type: (d as any).type || 'link'
    })),
    periodicInspections: item.periodicInspections || [],
    userModifiedFields: item.userModifiedFields || [],
    lastModifiedByUserAt: item.lastModifiedByUserAt,
    isCustomized: item.isCustomized
  });
}

// Sequential queue to prevent concurrent read-modify-write races on index chunks (e.g. duplicate -> immediate save)
let indexMutationQueue: Promise<any> = Promise.resolve();

function enqueueIndexMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = indexMutationQueue.then(fn, fn);
  indexMutationQueue = next.catch(() => {});
  return next;
}

/**
 * Rebuilds the entire compact catalog index from all raw inventory items.
 * Chunks 3,000+ items into ~4 documents of ~250KB each (vastly below 1MB limit).
 */
export async function rebuildInventoryIndex(db: Firestore, preloadedItems?: InventoryItem[]): Promise<InventoryItem[]> {
  return enqueueIndexMutation(async () => {
    let sourceItems = preloadedItems;

    if (!sourceItems || sourceItems.length === 0) {
      const invSnap = await getDocs(collection(db, COLL_INVENTORY));
      sourceItems = invSnap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryItem));
    }

    const compactItems = sourceItems.map(extractCompactItem);
    const chunksCount = Math.max(1, Math.ceil(compactItems.length / INDEX_CHUNK_SIZE));

    for (let c = 0; c < chunksCount; c++) {
      const slice = compactItems.slice(c * INDEX_CHUNK_SIZE, (c + 1) * INDEX_CHUNK_SIZE);
      const chunkRef = doc(db, COLL_INVENTORY_INDEX, `chunk_${c}`);
      await setDoc(chunkRef, {
        chunkIndex: c,
        items: slice,
        updatedAt: new Date().toISOString()
      });
    }

    console.log(`⚡ [CATALOG INDEX] Creati con successo ${chunksCount} chunks di indice per ${compactItems.length} articoli.`);
    return compactItems;
  });
}

/**
 * Updates or adds an item in the compact index chunks.
 */
export async function updateItemInIndex(db: Firestore, item: InventoryItem): Promise<void> {
  return enqueueIndexMutation(async () => {
    try {
      const indexSnap = await getDocs(collection(db, COLL_INVENTORY_INDEX));
      const compact = extractCompactItem(item);

      if (indexSnap.empty) {
        let sourceItems = [item];
        const compactItems = sourceItems.map(extractCompactItem);
        const chunkRef = doc(db, COLL_INVENTORY_INDEX, `chunk_0`);
        await setDoc(chunkRef, {
          chunkIndex: 0,
          items: compactItems,
          updatedAt: new Date().toISOString()
        });
        return;
      }

      let foundChunkId: string | null = null;
      let targetChunkData: any = null;
      let highestChunkIndex = -1;
      let highestChunkId = 'chunk_0';
      let lastChunkData: any = null;

      for (const d of indexSnap.docs) {
        const data = d.data();
        const cIdx = typeof data.chunkIndex === 'number' ? data.chunkIndex : 0;
        if (cIdx >= highestChunkIndex) {
          highestChunkIndex = cIdx;
          highestChunkId = d.id;
          lastChunkData = data;
        }
        if (Array.isArray(data.items) && data.items.some((i: any) => i.id === item.id)) {
          foundChunkId = d.id;
          targetChunkData = data;
          break;
        }
      }

      if (foundChunkId && targetChunkData) {
        const updatedList = targetChunkData.items.map((i: any) => i.id === item.id ? compact : i);
        await setDoc(doc(db, COLL_INVENTORY_INDEX, foundChunkId), {
          ...targetChunkData,
          items: updatedList,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Append to the highest chunk or create new one if full
        const safeHighestIdx = highestChunkIndex >= 0 ? highestChunkIndex : 0;
        const lastRef = doc(db, COLL_INVENTORY_INDEX, highestChunkId);
        const lastData = lastChunkData || { chunkIndex: safeHighestIdx, items: [] };
        if (Array.isArray(lastData.items) && lastData.items.length < INDEX_CHUNK_SIZE) {
          const nextItems = [...lastData.items, compact];
          await setDoc(lastRef, {
            ...lastData,
            items: nextItems,
            updatedAt: new Date().toISOString()
          });
        } else {
          const newChunkId = `chunk_${safeHighestIdx + 1}`;
          await setDoc(doc(db, COLL_INVENTORY_INDEX, newChunkId), {
            chunkIndex: safeHighestIdx + 1,
            items: [compact],
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.warn("Notice updating catalog index chunk:", err);
    }
  });
}

/**
 * Removes an item from the compact index chunks.
 */
export async function deleteItemFromIndex(db: Firestore, itemId: string): Promise<void> {
  return enqueueIndexMutation(async () => {
    try {
      const indexSnap = await getDocs(collection(db, COLL_INVENTORY_INDEX));
      for (const d of indexSnap.docs) {
        const data = d.data();
        if (Array.isArray(data.items) && data.items.some((i: any) => i.id === itemId)) {
          const filtered = data.items.filter((i: any) => i.id !== itemId);
          await setDoc(doc(db, COLL_INVENTORY_INDEX, d.id), {
            ...data,
            items: filtered,
            updatedAt: new Date().toISOString()
          });
          break;
        }
      }
    } catch (err) {
      console.warn("Notice deleting from catalog index chunk:", err);
    }
  });
}
