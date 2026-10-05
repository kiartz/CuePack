import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  waitForPendingWrites,
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  writeBatch 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { InventoryItem, Kit, PackingList, ChecklistCategory, Template } from './types';

// Define a Union type for all possible database items
export type DbItem = InventoryItem | Kit | PackingList | Template | { id: string, categories: ChecklistCategory[] };


// Helper to safely access environment variables without strict type checking
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key];
  }
  return undefined;
};

// Configuration from Environment Variables
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent multi-tab local cache for full offline support
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.warn("Unable to initialize persistent local cache for Firestore, falling back to getFirestore:", error);
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);

/**
 * Waits for all pending offline writes to be committed to Firestore remote servers.
 * Times out after maxWaitMs to avoid blocking indefinitely.
 */
export const syncPendingWrites = async (maxWaitMs: number = 8000): Promise<boolean> => {
  try {
    const syncPromise = waitForPendingWrites(db);
    const timeoutPromise = new Promise<boolean>((_, reject) => 
      setTimeout(() => reject(new Error('Sync timeout')), maxWaitMs)
    );
    await Promise.race([syncPromise, timeoutPromise]);
    return true;
  } catch (err) {
    console.warn("syncPendingWrites notice:", err);
    return false;
  }
};

// Collection References Constants
export const COLL_INVENTORY = 'inventory';
export const COLL_KITS = 'kits';
export const COLL_TEMPLATES = 'templates';
export const COLL_LISTS = 'packing_lists';
export const COLL_CHECKLIST_CONFIG = 'checklist_config';
export const COLL_CATEGORIES_CONFIG = 'categories_config';
export const COLL_CONNECTORS_CONFIG = 'connectors_config';
export const COLL_DATABASES = 'databases_meta';

export { DEFAULT_DATABASE_ID } from './types';

export const getInventoryCollection = (_dbId?: string): string => {
  return COLL_INVENTORY;
};

export const getKitsCollection = (_dbId?: string): string => {
  return COLL_KITS;
};

export const getTemplatesCollection = (_dbId?: string): string => {
  return COLL_TEMPLATES;
};

// --- Generic Helper Functions ---

/**
 * Strips 'undefined' values recursively from an object to prevent Firestore errors.
 */
export const cleanData = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(item => cleanData(item));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => [key, cleanData(value)])
    );
  }
  return obj;
};

/**
 * Adds or Overwrites a document in a collection with a specific ID.
 */
export const addOrUpdateItem = async <T extends { id: string }>(collectionName: string, item: T) => {
  try {
    const docRef = doc(db, collectionName, item.id);
    const cleaned = cleanData(item);
    await setDoc(docRef, cleaned);
  } catch (error) {
    console.error(`Error writing to ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Updates specific fields of a document.
 */
export const updateItemFields = async <T extends object>(collectionName: string, id: string, fields: Partial<T>) => {
  try {
    const docRef = doc(db, collectionName, id);
    const cleaned = cleanData(fields);
    await updateDoc(docRef, cleaned); 
  } catch (error) {
    console.error(`Error updating ${collectionName}:`, error);
    throw error;
  }
};


/**
 * Deletes a document.
 */
export const deleteItem = async (collectionName: string, id: string) => {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.error(`Error deleting from ${collectionName}:`, error);
    throw error;
  }
};

// --- Batch Helper for Reset/Import ---

export const batchWriteItems = async <T extends { id: string }>(collectionName: string, items: T[]) => {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(item => {
            const docRef = doc(db, collectionName, item.id);
            const cleaned = cleanData(item);
            batch.set(docRef, cleaned);
        });
        await batch.commit();
    }
};