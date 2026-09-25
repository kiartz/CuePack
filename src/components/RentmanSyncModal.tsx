import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  UploadCloud, 
  FileSpreadsheet, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft, 
  RefreshCw, 
  Database, 
  Plus, 
  Sparkles, 
  Search, 
  Layers,
  ChevronDown,
  ChevronUp,
  FileCheck,
  ShieldCheck,
  ShieldAlert,
  PackageCheck,
  Info
} from 'lucide-react';
import { InventoryItem, InventoryDatabase, DEFAULT_DATABASE_ID } from '../types';
import { ParsedRentmanItem, RentmanParseResult, parseRentmanFile } from '../utils/rentmanParser';
import { getDbBadgeStyle } from '../utils/databaseColors';
import { db, COLL_INVENTORY, COLL_DATABASES } from '../firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { generateId } from '../utils';

export type DiffStatus = 'new' | 'modified' | 'unchanged' | 'orphan';

export interface FieldDiff {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
  isUserModified?: boolean; // Se questo campo è stato modificato dall'utente su CuePack
  applyChange: boolean; // Se true applica il valore Excel; se false preserva il valore CuePack
}

export interface DiffItem {
  key: string;
  status: DiffStatus;
  selected: boolean;
  parsedItem?: ParsedRentmanItem;
  existingItem?: InventoryItem;
  diffs: FieldDiff[];
  orphanAction?: 'keep' | 'zero_stock' | 'delete';
  hasUserModifications?: boolean; // Articolo personalizzato/modificato dall'utente su CuePack
}

interface RentmanSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  databases: InventoryDatabase[];
  targetDatabaseId?: string; // Specific DB passed from DB card or active DB
  activeDatabaseId?: string; // Fallback active DB
  setActiveDatabaseId?: (dbId: string) => void;
  onSyncComplete?: (targetDbId: string) => void;
}

const COLOR_OPTIONS = [
  { value: 'emerald', label: 'Smeraldo', class: 'bg-emerald-500' },
  { value: 'blue', label: 'Blu', class: 'bg-blue-500' },
  { value: 'amber', label: 'Ambra', class: 'bg-amber-500' },
  { value: 'purple', label: 'Viola', class: 'bg-purple-500' },
  { value: 'rose', label: 'Rosa/Rosso', class: 'bg-rose-500' },
  { value: 'cyan', label: 'Ciano', class: 'bg-cyan-500' },
  { value: 'indigo', label: 'Indaco', class: 'bg-indigo-500' }
];

export const RentmanSyncModal: React.FC<RentmanSyncModalProps> = ({
  isOpen,
  onClose,
  inventory,
  databases,
  targetDatabaseId: propTargetDbId,
  activeDatabaseId,
  setActiveDatabaseId,
  onSyncComplete
}) => {
  const initialDbId = propTargetDbId || activeDatabaseId || DEFAULT_DATABASE_ID;
  // Stage control
  const [stage, setStage] = useState<'upload' | 'configure' | 'diff' | 'syncing' | 'complete'>('upload');
  
  // File & Parsing state
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<RentmanParseResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configuration state
  const [selectedDbId, setSelectedDbId] = useState<string>(initialDbId);
  const [syncMode, setSyncMode] = useState<'target_db' | 'new_db'>('target_db');
  const [newDbForm, setNewDbForm] = useState({
    name: 'Rentman Import',
    code: 'RNT',
    color: 'emerald',
    description: 'Catalogo importato da Rentman',
    isDefault: false
  });

  // Diff & Selection state
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'new' | 'modified' | 'user_modified' | 'orphan' | 'unchanged'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Progress state
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, percent: 0, message: '' });
  const [syncSummary, setSyncSummary] = useState<{
    added: number;
    updated: number;
    zeroed: number;
    deleted: number;
    protectedFields: number;
    targetDbName: string;
  } | null>(null);

  // Synchronize target DB when propTargetDbId or activeDatabaseId changes
  useEffect(() => {
    const target = propTargetDbId || activeDatabaseId;
    if (target) {
      setSelectedDbId(target);
      setSyncMode('target_db');
    }
  }, [propTargetDbId, activeDatabaseId]);

  // Reset state when modal is opened or closed
  useEffect(() => {
    if (isOpen) {
      setStage('upload');
      setParseResult(null);
      setDiffItems([]);
      setFileName('');
      setFileSize(0);
      setSearchTerm('');
      setFilterTab('all');
      setSyncSummary(null);
      setParseError(null);
    }
  }, [isOpen]);

  // Targeted database info
  const effectiveDb = useMemo(() => {
    return databases.find(d => d.id === selectedDbId) || databases[0] || {
      id: DEFAULT_DATABASE_ID,
      name: 'Database Principale',
      code: 'PRI',
      color: 'emerald',
      isDefault: true
    };
  }, [databases, selectedDbId]);

  // Existing items belonging EXCLUSIVELY to the targeted database
  const targetDbItems = useMemo(() => {
    return inventory.filter(i => (i.databaseId || DEFAULT_DATABASE_ID) === effectiveDb.id);
  }, [inventory, effectiveDb.id]);

  const isInitialImport = targetDbItems.length === 0;

  // Handle Drag & Drop / File Select
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setParseError('Formato file non valido. Selezionare un file Excel (.xlsx o .xls).');
      return;
    }

    try {
      setIsParsing(true);
      setParseError(null);
      setFileName(file.name);
      setFileSize(file.size);

      const result = await parseRentmanFile(file);
      setParseResult(result);
      
      // Auto-switch to configure stage
      setStage('configure');
    } catch (err: any) {
      console.error('Error parsing Rentman file:', err);
      setParseError(err.message || 'Errore durante la lettura del file Excel.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Run the Diff Engine or Initial Import Setup
  const proceedToDiff = () => {
    if (!parseResult) return;

    if (syncMode === 'new_db' || isInitialImport) {
      // All items from file are treated as NEW in this target DB
      const items: DiffItem[] = parseResult.items.map(item => ({
        key: item.id,
        status: 'new',
        selected: true,
        parsedItem: item,
        diffs: []
      }));
      setDiffItems(items);
      setStage('diff');
      return;
    }

    // Merge Mode: compare strictly with the target DB inventory
    const matchedExistingIds = new Set<string>();
    const computedDiffs: DiffItem[] = [];

    for (const parsed of parseResult.items) {
      // Find candidate among still UNMATCHED items in target database
      const available = targetDbItems.filter(ex => !matchedExistingIds.has(ex.id));

      // Match Strategy (Tiered Priority):
      // 1. Rentman ID match (if present on both)
      let existing: InventoryItem | undefined;
      if (parsed.rentmanId) {
        existing = available.find(ex => (ex as any).rentmanId && String((ex as any).rentmanId).trim() === String(parsed.rentmanId).trim());
      }

      // 2. Product Code match (strong unique catalog code, e.g. "2658", "2659")
      if (!existing && parsed.productCode) {
        const normPCode = parsed.productCode.trim().toLowerCase();
        existing = available.find(ex => ex.productCode && ex.productCode.trim().toLowerCase() === normPCode);
      }

      // 3. Product QR Code / RFID match (handling single or comma-separated lists)
      if (!existing && parsed.qrCode) {
        const pQrs = parsed.qrCode.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        existing = available.find(ex => {
          if (!ex.qrCode) return false;
          // Must not contradict distinct product codes
          if (parsed.productCode && ex.productCode && parsed.productCode.trim().toLowerCase() !== ex.productCode.trim().toLowerCase()) {
            return false;
          }
          const exQrs = ex.qrCode.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          return pQrs.some(q => exQrs.includes(q));
        });
      }

      // 4. Exact Name match (ONLY IF product codes and QR codes do not conflict!)
      if (!existing && parsed.name) {
        const normPName = parsed.name.trim().toLowerCase();
        existing = available.find(ex => {
          if (!ex.name || ex.name.trim().toLowerCase() !== normPName) return false;
          // If both have product codes and they differ, they are strictly different items!
          if (parsed.productCode && ex.productCode && parsed.productCode.trim().toLowerCase() !== ex.productCode.trim().toLowerCase()) {
            return false;
          }
          return true;
        });
      }

      if (!existing) {
        // NEW Item
        computedDiffs.push({
          key: parsed.id,
          status: 'new',
          selected: true,
          parsedItem: parsed,
          diffs: []
        });
      } else {
        matchedExistingIds.add(existing.id);
        const diffs: FieldDiff[] = [];
        const userFields = new Set<string>(existing.userModifiedFields || []);
        const hasUserMods = !!(existing.isCustomized || userFields.size > 0);

        const addDiff = (field: string, label: string, oldValue: any, newValue: any) => {
          const isUserMod = userFields.has(field);
          diffs.push({
            field,
            label,
            oldValue,
            newValue,
            isUserModified: isUserMod,
            applyChange: !isUserMod // Default: Protect user modified fields!
          });
        };

        if (parsed.name !== existing.name) {
          addDiff('name', 'Nome', existing.name, parsed.name);
        }
        if (parsed.inStock !== existing.inStock) {
          addDiff('inStock', 'Giacenza', existing.inStock, parsed.inStock);
        }
        if ((parsed.location || '') !== (existing.location || '')) {
          addDiff('location', 'Ubicazione', existing.location || 'Nessuna', parsed.location || 'Nessuna');
        }
        if ((parsed.category || '') !== (existing.category || '')) {
          addDiff('category', 'Categoria', existing.category, parsed.category);
        }
        if ((parsed.subcategory || '') !== (existing.subcategory || '')) {
          addDiff('subcategory', 'Sottocategoria', existing.subcategory || 'Nessuna', parsed.subcategory || 'Nessuna');
        }
        if ((parsed.alias || '') !== (existing.alias || '')) {
          addDiff('alias', 'Alias', existing.alias || 'Nessuno', parsed.alias || 'Nessuno');
        }
        if ((parsed.weight || 0) !== (existing.weight || 0)) {
          addDiff('weight', 'Peso (kg)', existing.weight || 0, parsed.weight || 0);
        }
        if ((parsed.powerConsumption || 0) !== (existing.powerConsumption || 0)) {
          addDiff('powerConsumption', 'Potenza (W)', existing.powerConsumption || 0, parsed.powerConsumption || 0);
        }
        if ((parsed.current || 0) !== (existing.current || 0)) {
          addDiff('current', 'Corrente (A)', existing.current || 0, parsed.current || 0);
        }
        if ((parsed.rentalPrice || 0) !== (existing.rentalPrice || 0)) {
          addDiff('rentalPrice', 'Prezzo Noleggio (€)', existing.rentalPrice || 0, parsed.rentalPrice || 0);
        }
        if ((parsed.purchasePrice || 0) !== (existing.purchasePrice || 0)) {
          addDiff('purchasePrice', 'Prezzo Acquisto (€)', existing.purchasePrice || 0, parsed.purchasePrice || 0);
        }
        if ((parsed.subrentalCost || 0) !== (existing.subrentalCost || 0)) {
          addDiff('subrentalCost', 'Costo Subnoleggio (€)', existing.subrentalCost || 0, parsed.subrentalCost || 0);
        }

        // Compare instances/serial numbers
        const parsedInstCount = parsed.instances?.length || 0;
        const existInstCount = existing.instances?.length || 0;
        if (parsedInstCount !== existInstCount) {
          addDiff(
            'instances',
            'Matricole/Seriali',
            `${existInstCount} seriali`,
            `${parsedInstCount} seriali (${parsedInstCount > existInstCount ? '+' : ''}${parsedInstCount - existInstCount})`
          );
        }

        if (diffs.length > 0) {
          computedDiffs.push({
            key: existing.id,
            status: 'modified',
            selected: true,
            parsedItem: parsed,
            existingItem: existing,
            diffs,
            hasUserModifications: hasUserMods
          });
        } else {
          computedDiffs.push({
            key: existing.id,
            status: 'unchanged',
            selected: false,
            parsedItem: parsed,
            existingItem: existing,
            diffs: [],
            hasUserModifications: hasUserMods
          });
        }
      }
    }

    // Check Orphan items in target DB (items present in DB but absent from file)
    for (const existing of targetDbItems) {
      if (!matchedExistingIds.has(existing.id)) {
        computedDiffs.push({
          key: existing.id,
          status: 'orphan',
          selected: false,
          existingItem: existing,
          diffs: [],
          orphanAction: 'keep',
          hasUserModifications: !!(existing.isCustomized || (existing.userModifiedFields && existing.userModifiedFields.length > 0))
        });
      }
    }

    setDiffItems(computedDiffs);
    setStage('diff');
  };

  // Mass selection helpers
  const selectAll = useCallback((targetStatus?: DiffStatus) => {
    setDiffItems(prev => prev.map(item => {
      if (targetStatus && item.status !== targetStatus) return item;
      return { ...item, selected: true };
    }));
  }, []);

  const deselectAll = useCallback(() => {
    setDiffItems(prev => prev.map(item => ({ ...item, selected: false })));
  }, []);

  const toggleItem = useCallback((key: string) => {
    setDiffItems(prev => prev.map(item => 
      item.key === key ? { ...item, selected: !item.selected } : item
    ));
  }, []);

  const setOrphanAction = useCallback((key: string, action: 'keep' | 'zero_stock' | 'delete') => {
    setDiffItems(prev => prev.map(item =>
      item.key === key ? { ...item, orphanAction: action, selected: action !== 'keep' } : item
    ));
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Toggle single field diff: apply Excel vs preserve CuePack
  const toggleFieldDiff = useCallback((itemKey: string, fieldName: string) => {
    setDiffItems(prev => prev.map(item => {
      if (item.key !== itemKey) return item;
      return {
        ...item,
        diffs: item.diffs.map(d => 
          d.field === fieldName ? { ...d, applyChange: !d.applyChange } : d
        )
      };
    }));
  }, []);

  // Protect all customized fields on a single item
  const protectItemCustomFields = useCallback((itemKey: string) => {
    setDiffItems(prev => prev.map(item => {
      if (item.key !== itemKey) return item;
      return {
        ...item,
        diffs: item.diffs.map(d => ({
          ...d,
          applyChange: d.isUserModified ? false : true
        }))
      };
    }));
  }, []);

  // Overwrite all fields of a single item with Excel
  const overwriteItemWithExcel = useCallback((itemKey: string) => {
    setDiffItems(prev => prev.map(item => {
      if (item.key !== itemKey) return item;
      return {
        ...item,
        diffs: item.diffs.map(d => ({
          ...d,
          applyChange: true
        }))
      };
    }));
  }, []);

  // Mass action: Protect ALL user-modified fields across all items
  const massProtectAllUserModifications = useCallback(() => {
    setDiffItems(prev => prev.map(item => ({
      ...item,
      diffs: item.diffs.map(d => ({
        ...d,
        applyChange: d.isUserModified ? false : d.applyChange
      }))
    })));
  }, []);

  // Mass action: Update ONLY stock and serials, protecting all other fields (name, weight, location, etc.)
  const massUpdateOnlyStockAndSerials = useCallback(() => {
    setDiffItems(prev => prev.map(item => ({
      ...item,
      diffs: item.diffs.map(d => ({
        ...d,
        applyChange: (d.field === 'inStock' || d.field === 'instances')
      }))
    })));
  }, []);

  // Mass action: Overwrite all diffs with Excel values
  const massOverwriteAllWithExcel = useCallback(() => {
    setDiffItems(prev => prev.map(item => ({
      ...item,
      diffs: item.diffs.map(d => ({
        ...d,
        applyChange: true
      }))
    })));
  }, []);

  // KPI counters (always called unconditionally)
  const counts = useMemo(() => {
    const res = { 
      all: diffItems.length, 
      new: 0, 
      modified: 0, 
      unchanged: 0, 
      orphan: 0, 
      selected: 0,
      userModified: 0,
      protectedDiffs: 0,
      overwritingDiffs: 0
    };
    for (const item of diffItems) {
      if (item.status === 'new') res.new++;
      if (item.status === 'modified') {
        res.modified++;
        if (item.hasUserModifications || item.diffs.some(d => d.isUserModified)) {
          res.userModified++;
        }
        for (const d of item.diffs) {
          if (!d.applyChange) res.protectedDiffs++;
          else res.overwritingDiffs++;
        }
      }
      if (item.status === 'unchanged') res.unchanged++;
      if (item.status === 'orphan') res.orphan++;
      if (item.selected) res.selected++;
    }
    return res;
  }, [diffItems]);

  // Filtered Items for the Table (always called unconditionally)
  const filteredItems = useMemo(() => {
    return diffItems.filter(item => {
      // Tab filter
      if (filterTab === 'user_modified') {
        if (!item.hasUserModifications && !item.diffs.some(d => d.isUserModified)) return false;
      } else if (filterTab !== 'all' && item.status !== filterTab) {
        return false;
      }

      // Text search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const name = (item.parsedItem?.name || item.existingItem?.name || '').toLowerCase();
        const code = (item.parsedItem?.productCode || item.existingItem?.productCode || '').toLowerCase();
        const qr = (item.parsedItem?.qrCode || item.existingItem?.qrCode || '').toLowerCase();
        return name.includes(query) || code.includes(query) || qr.includes(query);
      }
      return true;
    });
  }, [diffItems, filterTab, searchTerm]);

  // Execute Firestore Batch Commit
  const executeSync = async () => {
    setStage('syncing');
    setIsParsing(true);

    try {
      let finalTargetDbId = effectiveDb.id;
      let finalDbName = effectiveDb.name;

      // 1. If New Database mode, create the database record in Firestore first
      if (syncMode === 'new_db') {
        const newDbId = `db_${generateId()}`;
        finalTargetDbId = newDbId;
        finalDbName = newDbForm.name.trim() || 'Rentman Import';

        const newDbRecord: InventoryDatabase = {
          id: newDbId,
          name: finalDbName,
          code: (newDbForm.code.trim() || 'RNT').toUpperCase().slice(0, 4),
          color: newDbForm.color || 'emerald',
          description: newDbForm.description.trim(),
          isDefault: newDbForm.isDefault,
          createdAt: new Date().toISOString()
        };

        const dbRef = doc(db, COLL_DATABASES, newDbId);
        const batch = writeBatch(db);
        batch.set(dbRef, newDbRecord);
        await batch.commit();

        if (setActiveDatabaseId) {
          setActiveDatabaseId(newDbId);
        }
      }

      // 2. Prepare items to add/update/delete
      const itemsToSync = diffItems.filter(item => item.selected);
      const totalOperations = itemsToSync.length;
      let processed = 0;
      let addedCount = 0;
      let updatedCount = 0;
      let zeroedCount = 0;
      let deletedCount = 0;
      let protectedFieldsCount = 0;

      const BATCH_SIZE = 300; // Safe below Firestore 500 limit
      const batches: { type: 'set' | 'update' | 'delete', ref: any, data?: any }[][] = [];
      let currentBatchOps: { type: 'set' | 'update' | 'delete', ref: any, data?: any }[] = [];

      const cleanObject = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(cleanObject);
        if (obj !== null && typeof obj === 'object') {
          return Object.fromEntries(
            Object.entries(obj)
              .filter(([_, v]) => v !== undefined)
              .map(([k, v]) => [k, cleanObject(v)])
          );
        }
        return obj;
      };

      for (const item of itemsToSync) {
        if (item.status === 'new' && item.parsedItem) {
          const newDocId = `item_${generateId()}`;
          const docRef = doc(db, COLL_INVENTORY, newDocId);
          const fullItem: InventoryItem = {
            ...item.parsedItem,
            id: newDocId,
            databaseId: finalTargetDbId // STRICTLY ASSIGNED TO THIS DATABASE
          };
          currentBatchOps.push({ type: 'set', ref: docRef, data: cleanObject(fullItem) });
          addedCount++;
        } else if (item.status === 'modified' && item.parsedItem && item.existingItem) {
          const docRef = doc(db, COLL_INVENTORY, item.existingItem.id);
          
          // Baseline: start from existing item so custom relations/fields are preserved
          const mergedItem: InventoryItem = {
            ...item.existingItem,
            id: item.existingItem.id,
            databaseId: finalTargetDbId,
            reminders: item.existingItem.reminders || item.parsedItem.reminders,
            documents: item.existingItem.documents || item.parsedItem.documents,
            accessories: item.existingItem.accessories || item.parsedItem.accessories
          };

          const userModifiedSet = new Set<string>(item.existingItem.userModifiedFields || []);

          // Apply only fields where diff.applyChange is true!
          for (const diff of item.diffs) {
            if (diff.applyChange) {
              if (diff.field === 'instances') {
                if (item.parsedItem.instances) {
                  mergedItem.instances = item.parsedItem.instances;
                }
              } else {
                (mergedItem as any)[diff.field] = (item.parsedItem as any)[diff.field];
              }
              // If user explicitly chose to overwrite a user-modified field, remove it
              if (diff.isUserModified) {
                userModifiedSet.delete(diff.field);
              }
            } else {
              // Explicitly protect existing CuePack value
              if (diff.field === 'instances') {
                mergedItem.instances = item.existingItem.instances;
              } else {
                (mergedItem as any)[diff.field] = (item.existingItem as any)[diff.field];
              }
              protectedFieldsCount++;
            }
          }

          mergedItem.userModifiedFields = Array.from(userModifiedSet);
          mergedItem.isCustomized = mergedItem.userModifiedFields.length > 0;

          currentBatchOps.push({ type: 'set', ref: docRef, data: cleanObject(mergedItem) });
          updatedCount++;
        } else if (item.status === 'orphan' && item.existingItem) {
          const docRef = doc(db, COLL_INVENTORY, item.existingItem.id);
          if (item.orphanAction === 'delete') {
            currentBatchOps.push({ type: 'delete', ref: docRef });
            deletedCount++;
          } else if (item.orphanAction === 'zero_stock') {
            currentBatchOps.push({
              type: 'update',
              ref: docRef,
              data: cleanObject({
                inStock: 0,
                instances: (item.existingItem.instances || []).map(i => ({ ...i, active: false }))
              })
            });
            zeroedCount++;
          }
        }

        if (currentBatchOps.length >= BATCH_SIZE) {
          batches.push(currentBatchOps);
          currentBatchOps = [];
        }
      }

      if (currentBatchOps.length > 0) {
        batches.push(currentBatchOps);
      }

      // Execute batches sequentially with progress bar updates
      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batchOps = batches[bIdx];
        const batch = writeBatch(db);

        for (const op of batchOps) {
          if (op.type === 'set') batch.set(op.ref, op.data);
          else if (op.type === 'update') batch.update(op.ref, op.data);
          else if (op.type === 'delete') batch.delete(op.ref);
        }

        await batch.commit();
        processed += batchOps.length;

        const percent = Math.round((processed / (totalOperations || 1)) * 100);
        setSyncProgress({
          current: processed,
          total: totalOperations,
          percent,
          message: `Sincronizzazione in corso... ${processed}/${totalOperations}`
        });
      }

      setSyncSummary({
        added: addedCount,
        updated: updatedCount,
        zeroed: zeroedCount,
        deleted: deletedCount,
        protectedFields: protectedFieldsCount,
        targetDbName: finalDbName
      });

      setStage('complete');
      if (onSyncComplete) {
        onSyncComplete(finalTargetDbId);
      }
    } catch (err: any) {
      console.error('Error during Firestore batch sync:', err);
      alert('Errore durante la scrittura su Firestore: ' + (err.message || 'Errore sconosciuto'));
      setStage('diff');
    } finally {
      setIsParsing(false);
    }
  };

  const resetAll = () => {
    setStage('upload');
    setParseResult(null);
    setDiffItems([]);
    setFileName('');
    setFileSize(0);
    setSearchTerm('');
    setFilterTab('all');
    setSyncSummary(null);
  };

  // Crucial: Early return is placed HERE after ALL hooks are called!
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* --- HEADER --- */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {isInitialImport ? 'Importa Catalogo Rentman' : 'Sincronizza Catalogo Rentman'}
                </h2>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getDbBadgeStyle(effectiveDb.color)}`}>
                  [{effectiveDb.code}] {effectiveDb.name}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isInitialImport 
                  ? `Importazione iniziale: i materiali verranno registrati solo nel database "${effectiveDb.name}"` 
                  : `Sincronizzazione e Diff: aggiorna esclusivamente il database "${effectiveDb.name}"`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Step Progress Indicators */}
            <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold">
              <span className={`px-2.5 py-1 rounded-lg ${stage === 'upload' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1. File</span>
              <span className="text-slate-600">→</span>
              <span className={`px-2.5 py-1 rounded-lg ${stage === 'configure' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>2. Verifica</span>
              <span className="text-slate-600">→</span>
              <span className={`px-2.5 py-1 rounded-lg ${stage === 'diff' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {isInitialImport ? '3. Anteprima' : '3. Diff Studio'}
              </span>
              <span className="text-slate-600">→</span>
              <span className={`px-2.5 py-1 rounded-lg ${stage === 'complete' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>4. Report</span>
            </div>

            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* --- BODY ACCORDING TO STAGE --- */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          
          {/* ================= STAGE 1: UPLOAD ================= */}
          {stage === 'upload' && (
            <div className="h-full flex flex-col justify-center items-center max-w-2xl mx-auto py-8">
              
              {/* Database Context Banner */}
              <div className="w-full mb-6 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
                  <div className="text-xs">
                    <span className="text-slate-400">Database di destinazione selezionato: </span>
                    <strong className="text-white">[{effectiveDb.code}] {effectiveDb.name}</strong>
                    <span className="text-slate-500 ml-2">({targetDbItems.length} materiali attuali)</span>
                  </div>
                </div>

                {databases.length > 1 && (
                  <select 
                    value={selectedDbId}
                    onChange={(e) => setSelectedDbId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-bold outline-none focus:border-blue-500"
                  >
                    {databases.map(d => (
                      <option key={d.id} value={d.id}>[{d.code}] {d.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-700 hover:border-emerald-500/80 bg-slate-950/60 hover:bg-slate-950 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all group shadow-xl"
              >
                <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-2xl mb-4 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all">
                  <UploadCloud size={44} />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">
                  Trascina qui il file Excel di Rentman
                </h3>
                <p className="text-xs text-slate-400 max-w-md mb-6">
                  Seleziona il file <span className="text-emerald-400 font-mono font-semibold">.xlsx</span> esportato da Rentman per il database <strong className="text-slate-200">{effectiveDb.name}</strong>. Gli altri database rimarranno inalterati al 100%.
                </p>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }} 
                />

                <button 
                  type="button"
                  disabled={isParsing}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all active:scale-95"
                >
                  <FileSpreadsheet size={18} />
                  {isParsing ? 'Analisi in corso...' : 'Sfoglia file dal computer'}
                </button>
              </div>

              {parseError && (
                <div className="mt-4 w-full p-4 bg-rose-950/50 border border-rose-800/60 rounded-xl flex items-center gap-3 text-rose-300 text-xs">
                  <AlertCircle size={20} className="shrink-0 text-rose-400" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Informative Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-8">
                <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1">
                    <Sparkles size={14} /> Isolamento Totale
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    L'importazione e la sincronizzazione agiscono esclusivamente sul database selezionato.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-xl">
                  <div className="flex items-center gap-2 text-blue-400 text-xs font-bold mb-1">
                    <Layers size={14} /> Seriali Aggregati
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Le matricole Rentman su righe multiple vengono unite in ciascun articolo con le proprie date e stato attivo.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-xl">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold mb-1">
                    <RefreshCw size={14} /> Prima Importazione o Diff
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Se il DB è vuoto importa direttamente tutto; se già popolato ti mostra le modifiche prima di salvare.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= STAGE 2: CONFIGURE ================= */}
          {stage === 'configure' && parseResult && (
            <div className="max-w-2xl mx-auto space-y-6 py-4">
              
              {/* File stats card */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-600/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                    <FileCheck size={28} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{fileName}</h3>
                    <p className="text-xs text-slate-400">
                      {parseResult.totalRows} righe grezze analizzate • {(fileSize / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 rounded-lg text-xs font-mono font-bold">
                    {parseResult.totalItems} Articoli Univoci
                  </span>
                  <span className="px-3 py-1 bg-blue-950/60 border border-blue-800/50 text-blue-300 rounded-lg text-xs font-mono font-bold">
                    {parseResult.totalInstancesCount} Seriali
                  </span>
                </div>
              </div>

              {/* Destination Mode */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Destinazione dell'importazione
                </label>

                {/* Targeted Database Card */}
                <div className="p-5 rounded-xl border bg-slate-950/80 border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Database className="text-emerald-400" size={20} />
                      <div>
                        <span className="text-xs text-slate-400 block uppercase font-bold text-[10px]">Database di Destinazione:</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getDbBadgeStyle(effectiveDb.color)}`}>
                            {effectiveDb.code}
                          </span>
                          <span className="text-sm font-bold text-white">{effectiveDb.name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Articoli già nel DB:</span>
                      <strong className="text-sm font-bold text-white">{targetDbItems.length}</strong>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                    {isInitialImport ? (
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <CheckCircle2 size={16} />
                        Questo database è attualmente vuoto. Tutti i {parseResult.totalItems} articoli verranno importati da zero in questo archivio.
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-blue-400 font-semibold">
                        <RefreshCw size={16} />
                        Questo database contiene già {targetDbItems.length} articoli. Procedendo verrà avviato il confronto (Diff Studio) per rilevare variazioni di prezzi, quantità e posizioni.
                      </div>
                    )}
                  </div>
                </div>

                {/* Option to create a new DB instead */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSyncMode(syncMode === 'new_db' ? 'target_db' : 'new_db')}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 underline"
                  >
                    <Plus size={14} />
                    {syncMode === 'new_db' ? 'Usa il database selezionato sopra' : 'Oppure crea un Nuovo Database indipendente per questo file'}
                  </button>

                  {syncMode === 'new_db' && (
                    <div className="mt-3 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">
                          Nome del Nuovo Database:
                        </label>
                        <input 
                          type="text" 
                          value={newDbForm.name}
                          onChange={(e) => setNewDbForm(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
                          placeholder="Es. Rentman Service Esterno"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 mb-1">
                            Sigla (3-4 car.):
                          </label>
                          <input 
                            type="text" 
                            maxLength={4}
                            value={newDbForm.code}
                            onChange={(e) => setNewDbForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-white uppercase outline-none focus:border-emerald-500"
                            placeholder="RNT"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 mb-1">
                            Colore Badge:
                          </label>
                          <select 
                            value={newDbForm.color}
                            onChange={(e) => setNewDbForm(prev => ({ ...prev, color: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
                          >
                            {COLOR_OPTIONS.map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                <button 
                  onClick={resetAll}
                  className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <ArrowLeft size={16} /> Cambia File
                </button>

                <button 
                  onClick={proceedToDiff}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
                >
                  {isInitialImport || syncMode === 'new_db' ? (
                    <>
                      <span>Anteprima e Importazione</span>
                      <ArrowRight size={16} />
                    </>
                  ) : (
                    <>
                      <span>Confronta Modifiche (Diff Studio)</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {/* ================= STAGE 3: DIFF & SELECTION STUDIO ================= */}
          {stage === 'diff' && (
            <div className="h-full flex flex-col space-y-4">
              
              {/* Top Target DB Reminder */}
              <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <Database size={15} className="text-emerald-400" />
                  <span className="text-slate-400">Database di destinazione:</span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getDbBadgeStyle(effectiveDb.color)}`}>
                    {effectiveDb.code}
                  </span>
                  <strong className="text-white">{effectiveDb.name}</strong>
                </div>

                <div className="text-slate-400">
                  {isInitialImport 
                    ? '✨ Modalità Prima Importazione: tutti gli articoli selezionati verranno registrati in questo archivio'
                    : '🔄 Modalità Sincronizzazione: confronto con gli articoli preesistenti nel database'}
                </div>
              </div>

              {/* Top KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                
                {/* Nuovi */}
                <div 
                  onClick={() => setFilterTab('new')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all relative ${
                    filterTab === 'new' 
                      ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500' 
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-400">🟢 Nuovi da Aggiungere</span>
                      <div className="relative group/info" onClick={(e) => e.stopPropagation()}>
                        <button 
                          type="button" 
                          className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-emerald-300 hover:bg-emerald-900/40 transition-colors"
                          title="Informazioni"
                        >
                          <Info size={12} />
                        </button>
                        <div className="absolute z-50 left-0 top-full mt-2 w-64 sm:w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 pointer-events-none text-left">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-xs mb-1">
                            <CheckCircle2 size={13} />
                            <span>Nuovi da Aggiungere</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            Articoli presenti nel file Excel che non esistono ancora in questo database CuePack.
                          </p>
                          <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                            <strong className="text-white">Cosa succede:</strong> Cliccando filtri la lista mostrando solo i nuovi articoli. Premendo "Applica Sincronizzazione" verranno aggiunti all'inventario con codici, prezzi, specifiche e matricole.
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className="text-lg font-bold font-mono text-white">{counts.new}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); selectAll('new'); }}
                    className="text-[11px] text-emerald-400/80 hover:text-emerald-300 underline mt-1"
                  >
                    Seleziona tutti ({counts.new})
                  </button>
                </div>

                {/* Modificati */}
                <div 
                  onClick={() => setFilterTab('modified')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all relative ${
                    filterTab === 'modified' 
                      ? 'bg-amber-950/40 border-amber-500 shadow-md ring-1 ring-amber-500' 
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-amber-400">🟡 Con Modifiche</span>
                      <div className="relative group/info" onClick={(e) => e.stopPropagation()}>
                        <button 
                          type="button" 
                          className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-amber-900/40 transition-colors"
                          title="Informazioni"
                        >
                          <Info size={12} />
                        </button>
                        <div className="absolute z-50 left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-64 sm:w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 pointer-events-none text-left">
                          <div className="flex items-center gap-1.5 font-bold text-amber-400 text-xs mb-1">
                            <RefreshCw size={13} />
                            <span>Con Modifiche Rilevate</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            Articoli già presenti nel database per cui il file Excel riporta differenze (prezzi, giacenze, ubicazioni, pesi, matricole).
                          </p>
                          <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                            <strong className="text-white">Cosa succede:</strong> Cliccando vedi le differenze prima/dopo per ogni campo. I valori che hai personalizzato su CuePack vengono protetti in automatico. Puoi decidere quali campi accettare e quali mantenere.
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className="text-lg font-bold font-mono text-white">{counts.modified}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); selectAll('modified'); }}
                    className="text-[11px] text-amber-400/80 hover:text-amber-300 underline mt-1"
                  >
                    Seleziona tutti ({counts.modified})
                  </button>
                </div>

                {/* Non Presenti / Orphan */}
                <div 
                  onClick={() => setFilterTab('orphan')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all relative ${
                    filterTab === 'orphan' 
                      ? 'bg-rose-950/40 border-rose-500 shadow-md ring-1 ring-rose-500' 
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-rose-400">🔴 Non nel File</span>
                      <div className="relative group/info" onClick={(e) => e.stopPropagation()}>
                        <button 
                          type="button" 
                          className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-300 hover:bg-rose-900/40 transition-colors"
                          title="Informazioni"
                        >
                          <Info size={12} />
                        </button>
                        <div className="absolute z-50 left-0 sm:left-auto sm:right-0 top-full mt-2 w-64 sm:w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 pointer-events-none text-left">
                          <div className="flex items-center gap-1.5 font-bold text-rose-400 text-xs mb-1">
                            <AlertCircle size={13} />
                            <span>Non Presenti nel File</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            Articoli salvati nel tuo database CuePack che non compaiono in questo file Excel.
                          </p>
                          <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400 space-y-1">
                            <strong className="text-white block">Cosa puoi fare:</strong>
                            <p className="text-slate-300 leading-tight">• <strong>Mantieni:</strong> lascia l'articolo invariato nel DB.</p>
                            <p className="text-slate-300 leading-tight">• <strong>Azzera Giacenza:</strong> imposta disponibilità a 0 se dismesso.</p>
                            <p className="text-slate-300 leading-tight">• <strong>Elimina dal DB:</strong> rimuove l'articolo dal catalogo.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className="text-lg font-bold font-mono text-white">{counts.orphan}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Presenti solo nel DB</p>
                </div>

                {/* Invariati */}
                <div 
                  onClick={() => setFilterTab('unchanged')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all relative ${
                    filterTab === 'unchanged' 
                      ? 'bg-slate-800 border-slate-600 shadow-md ring-1 ring-slate-600' 
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-400">⚪ Invariati</span>
                      <div className="relative group/info" onClick={(e) => e.stopPropagation()}>
                        <button 
                          type="button" 
                          className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                          title="Informazioni"
                        >
                          <Info size={12} />
                        </button>
                        <div className="absolute z-50 right-0 top-full mt-2 w-64 sm:w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 pointer-events-none text-left">
                          <div className="flex items-center gap-1.5 font-bold text-slate-300 text-xs mb-1">
                            <Check size={13} />
                            <span>Dati Già Allineati</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            Articoli i cui dati in CuePack e nel file Excel sono già perfettamente identici.
                          </p>
                          <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                            <strong className="text-white">Cosa succede:</strong> I dati coincidono al 100%. Non necessitano di alcun aggiornamento e sono deselezionati di default.
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className="text-lg font-bold font-mono text-white">{counts.unchanged}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Dati già allineati</p>
                </div>

              </div>

              {/* Presets and Protection Actions */}
              {counts.modified > 0 && (
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0 border border-amber-500/20">
                      <ShieldAlert size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Riconciliazione Modifiche CuePack vs Excel</span>
                        {counts.userModified > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {counts.userModified} articoli modificati da te
                          </span>
                        )}
                        <div className="relative group/info" onClick={(e) => e.stopPropagation()}>
                          <button 
                            type="button" 
                            className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                            title="Informazioni sui preset"
                          >
                            <Info size={12} />
                          </button>
                          <div className="absolute z-50 left-0 top-full mt-2 w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 pointer-events-none text-left">
                            <span className="font-bold text-white text-xs block mb-1">Come funzionano i Preset:</span>
                            <p className="text-[10px] text-slate-300 leading-relaxed mb-1.5">
                              • <strong className="text-blue-300">Proteggi Valori CuePack:</strong> preserva tutti i nomi, pesi o specifiche che hai corretto a mano su CuePack, impedendo a Excel di sovrascriverli.
                            </p>
                            <p className="text-[10px] text-slate-300 leading-relaxed mb-1.5">
                              • <strong className="text-emerald-300">Solo Giacenze & Matricole:</strong> aggiorna da Excel solo quantità e seriali arrivati in azienda, lasciando intatti i nomi e i dettagli aggiustati.
                            </p>
                            <p className="text-[10px] text-slate-300 leading-relaxed">
                              • <strong className="text-amber-300">Sovrascrivi Tutto:</strong> resetta tutti i valori al file Excel originale.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
                        <span className="text-blue-400 font-bold">🛡️ {counts.protectedDiffs} valori CuePack protetti</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-amber-400 font-bold">🔄 {counts.overwritingDiffs} da aggiornare da Excel</span>
                      </div>
                    </div>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={massProtectAllUserModifications}
                      className="px-2.5 py-1.5 bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-700/50 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                      title="Mantieni tutti i valori modificati manualmente su CuePack, proteggendoli dalla sovrascrittura"
                    >
                      <ShieldCheck size={14} className="text-blue-400" />
                      <span>Proteggi Valori CuePack</span>
                    </button>

                    <button
                      type="button"
                      onClick={massUpdateOnlyStockAndSerials}
                      className="px-2.5 py-1.5 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                      title="Aggiorna solo quantità a magazzino e numeri di serie da Excel, proteggendo nomi e specifiche corretti"
                    >
                      <PackageCheck size={14} className="text-emerald-400" />
                      <span>Solo Giacenze & Matricole</span>
                    </button>

                    <button
                      type="button"
                      onClick={massOverwriteAllWithExcel}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                      title="Reimposta tutti i valori a quelli presenti nel file Excel"
                    >
                      <RefreshCw size={14} className="text-slate-400" />
                      <span>Sovrascrivi Tutto da Excel</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Toolbar & Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 border border-slate-800 p-3 rounded-xl shrink-0">
                
                {/* Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  <button 
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tutti ({counts.all})
                  </button>
                  <button 
                    onClick={() => setFilterTab('new')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'new' ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Nuovi ({counts.new})
                  </button>
                  {counts.modified > 0 && (
                    <button 
                      onClick={() => setFilterTab('modified')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        filterTab === 'modified' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Modificati ({counts.modified})
                    </button>
                  )}
                  {counts.userModified > 0 && (
                    <button 
                      onClick={() => setFilterTab('user_modified')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        filterTab === 'user_modified' 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm' 
                          : 'text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10'
                      }`}
                    >
                      <ShieldAlert size={13} className="text-amber-400" />
                      Modificati da te ({counts.userModified})
                    </button>
                  )}
                  {counts.orphan > 0 && (
                    <button 
                      onClick={() => setFilterTab('orphan')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        filterTab === 'orphan' ? 'bg-rose-900/40 text-rose-300 border border-rose-700/50' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Non Presenti ({counts.orphan})
                    </button>
                  )}
                  {counts.unchanged > 0 && (
                    <button 
                      onClick={() => setFilterTab('unchanged')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        filterTab === 'unchanged' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Invariati ({counts.unchanged})
                    </button>
                  )}
                </div>

                {/* Search & Actions */}
                <div className="flex items-center gap-2 flex-grow sm:flex-grow-0 justify-end">
                  <div className="relative w-48 sm:w-64">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Cerca materiale o codice..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>

                  <button 
                    onClick={() => selectAll()}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"
                    title="Seleziona tutti gli elementi"
                  >
                    Tutti
                  </button>
                  <button 
                    onClick={deselectAll}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"
                    title="Deseleziona tutti gli elementi"
                  >
                    Nessuno
                  </button>
                </div>

              </div>

              {/* Table / List Container */}
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-y-auto custom-scrollbar">
                {filteredItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Nessun articolo trovato con i filtri correnti.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/80">
                    {filteredItems.map(item => {
                      const isExpanded = expandedKeys.has(item.key);
                      const name = item.parsedItem?.name || item.existingItem?.name || '';
                      const code = item.parsedItem?.productCode || item.existingItem?.productCode || '';
                      const qr = item.parsedItem?.qrCode || item.existingItem?.qrCode || '';
                      const category = item.parsedItem?.category || item.existingItem?.category || '';
                      const subcategory = item.parsedItem?.subcategory || item.existingItem?.subcategory || '';

                      return (
                        <div 
                          key={item.key} 
                          className={`p-3.5 transition-colors ${
                            item.selected ? 'bg-slate-900/60' : 'bg-transparent hover:bg-slate-900/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            
                            {/* Checkbox & Basic Info */}
                            <div className="flex items-start gap-3 min-w-0">
                              <input 
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleItem(item.key)}
                                className="mt-1 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 cursor-pointer shrink-0"
                              />

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-white truncate">
                                    {name}
                                  </span>

                                  {/* Status Badge */}
                                  {item.status === 'new' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      Nuovo
                                    </span>
                                  )}
                                  {item.status === 'modified' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      Modificato ({item.diffs.length})
                                    </span>
                                  )}
                                  {item.status === 'orphan' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                      Non nel file
                                    </span>
                                  )}
                                  {item.status === 'unchanged' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                                      Invariato
                                    </span>
                                  )}

                                  {/* User Modified Badge */}
                                  {(item.hasUserModifications || item.diffs.some(d => d.isUserModified)) && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1" title="Questo articolo è stato modificato manualmente su CuePack">
                                      <ShieldAlert size={11} /> Modificato da te
                                    </span>
                                  )}

                                  {/* Item diff breakdown counters */}
                                  {item.status === 'modified' && (
                                    <div className="flex items-center gap-1.5">
                                      {item.diffs.filter(d => !d.applyChange).length > 0 && (
                                        <span className="px-1.5 py-0.5 bg-blue-900/30 text-blue-300 text-[10px] font-mono font-bold rounded border border-blue-800/40" title="Valori personalizzati che rimarranno intatti">
                                          🛡️ {item.diffs.filter(d => !d.applyChange).length} protetti
                                        </span>
                                      )}
                                      {item.diffs.filter(d => d.applyChange).length > 0 && (
                                        <span className="px-1.5 py-0.5 bg-amber-900/30 text-amber-300 text-[10px] font-mono font-bold rounded border border-amber-800/40" title="Valori che verranno aggiornati da Excel">
                                          🔄 {item.diffs.filter(d => d.applyChange).length} da Excel
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Code and QR tags */}
                                  {code && (
                                    <span className="text-[11px] font-mono font-semibold text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-800/30">
                                      #{code}
                                    </span>
                                  )}
                                  {qr && (
                                    <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                      QR: {qr}
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                                  <span>{category} {subcategory && `• ${subcategory}`}</span>
                                  
                                  {/* Instances count */}
                                  {item.parsedItem?.instances && item.parsedItem.instances.length > 0 && (
                                    <span className="text-emerald-400/90 font-mono text-[11px]">
                                      {item.parsedItem.instances.length} matricole Rentman
                                    </span>
                                  )}

                                  {/* Stock count */}
                                  <span>
                                    Giacenza: <strong className="text-white">{item.parsedItem?.inStock ?? item.existingItem?.inStock ?? 0}</strong>
                                  </span>

                                  {/* Location */}
                                  {(item.parsedItem?.location || item.existingItem?.location) && (
                                    <span>
                                      Ubicazione: <strong className="text-white">{item.parsedItem?.location || item.existingItem?.location}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Action / Expand Button */}
                            <div className="shrink-0 flex items-center gap-2">
                              {/* Orphan Action Selector */}
                              {item.status === 'orphan' && (
                                <select 
                                  value={item.orphanAction || 'keep'}
                                  onChange={(e) => setOrphanAction(item.key, e.target.value as any)}
                                  className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1 outline-none font-bold"
                                >
                                  <option value="keep">Mantieni (Nessuna modifica)</option>
                                  <option value="zero_stock">Azzera Giacenza (Fuori Uso)</option>
                                  <option value="delete">Elimina dal DB</option>
                                </select>
                              )}

                              {/* Modified Expand Toggle */}
                              {item.status === 'modified' && (
                                <button 
                                  type="button"
                                  onClick={() => toggleExpand(item.key)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                                >
                                  <span>{isExpanded ? 'Nascondi Diff' : 'Vedi Diff'}</span>
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              )}
                            </div>

                          </div>

                          {/* Expanded Differences Details */}
                          {item.status === 'modified' && isExpanded && (
                            <div className="mt-3 ml-7 p-3 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                                    Confronto Campi (CuePack Attuale vs Excel):
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => protectItemCustomFields(item.key)}
                                    className="px-2 py-1 bg-blue-900/30 hover:bg-blue-800/50 text-blue-300 border border-blue-700/40 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                                    title="Mantieni i valori personalizzati su questo articolo"
                                  >
                                    <ShieldCheck size={12} />
                                    <span>Proteggi CuePack</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => overwriteItemWithExcel(item.key)}
                                    className="px-2 py-1 bg-amber-900/30 hover:bg-amber-800/50 text-amber-300 border border-amber-700/40 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                                    title="Accetta tutti i valori da Excel per questo articolo"
                                  >
                                    <RefreshCw size={12} />
                                    <span>Accetta da Excel</span>
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-2">
                                {item.diffs.map((diff, dIdx) => {
                                  const isProtected = !diff.applyChange;
                                  return (
                                    <div 
                                      key={dIdx} 
                                      className={`p-2.5 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                        diff.isUserModified 
                                          ? isProtected 
                                            ? 'bg-blue-950/30 border-blue-800/50 shadow-sm' 
                                            : 'bg-amber-950/30 border-amber-800/50' 
                                          : isProtected
                                            ? 'bg-slate-900/80 border-slate-700'
                                            : 'bg-slate-900 border-slate-800'
                                      }`}
                                    >
                                      {/* Field Info & Comparison */}
                                      <div className="min-w-0 space-y-1 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-white text-xs">{diff.label}</span>
                                          {diff.isUserModified && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                              <ShieldAlert size={10} /> Modificato da te
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                                            isProtected 
                                              ? 'bg-blue-900/40 border border-blue-700/50 text-blue-200 font-bold' 
                                              : 'bg-slate-950 text-slate-400 line-through opacity-75'
                                          }`}>
                                            <span className="text-[10px] text-slate-500 font-sans">CuePack:</span>
                                            <span>{String(diff.oldValue || '—')}</span>
                                            {isProtected && <span className="text-[10px] text-blue-300 ml-1 font-sans">✓ Attivo</span>}
                                          </div>

                                          <span className="text-slate-600 font-bold">→</span>

                                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                                            !isProtected 
                                              ? 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 font-bold' 
                                              : 'bg-slate-950 text-slate-500'
                                          }`}>
                                            <span className="text-[10px] text-slate-500 font-sans">Excel:</span>
                                            <span>{String(diff.newValue || '—')}</span>
                                            {!isProtected && <span className="text-[10px] text-emerald-300 ml-1 font-sans">✓ Sarà applicato</span>}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Toggle Protection/Overwrite Button */}
                                      <div className="shrink-0 flex items-center">
                                        <button
                                          type="button"
                                          onClick={() => toggleFieldDiff(item.key, diff.field)}
                                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                                            isProtected
                                              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/40'
                                              : 'bg-amber-600/80 hover:bg-amber-500 text-white shadow-sm shadow-amber-900/40'
                                          }`}
                                          title={isProtected ? 'Clicca per sovrascrivere questo campo con il valore del file Excel' : 'Clicca per proteggere e mantenere il valore attuale di CuePack'}
                                        >
                                          {isProtected ? (
                                            <>
                                              <ShieldCheck size={13} />
                                              <span>Mantieni CuePack (Protetto)</span>
                                            </>
                                          ) : (
                                            <>
                                              <RefreshCw size={13} />
                                              <span>Aggiorna con Excel</span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Sticky Action Bar */}
              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Elementi selezionati:</span>
                  <span className="font-bold text-white px-2 py-0.5 bg-blue-900/30 text-blue-400 border border-blue-800/40 rounded">
                    {counts.selected} di {counts.all}
                  </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button 
                    onClick={() => setStage('configure')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <ArrowLeft size={16} /> Indietro
                  </button>

                  <button 
                    onClick={executeSync}
                    disabled={counts.selected === 0}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
                  >
                    <CheckCircle2 size={18} />
                    {isInitialImport 
                      ? `Importa ${counts.selected} Articoli in [${effectiveDb.code}]` 
                      : `Applica Sincronizzazione in [${effectiveDb.code}] (${counts.selected})`}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ================= STAGE 4: SYNCING PROGRESS ================= */}
          {stage === 'syncing' && (
            <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-6">
              <div className="p-4 bg-blue-600/10 text-blue-400 rounded-full animate-spin border-2 border-blue-500 border-t-transparent">
                <RefreshCw size={36} />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Sincronizzazione in corso...</h3>
                <p className="text-xs text-slate-400">
                  Scrittura atomica dei lotti in Firestore nel database <strong className="text-white">"{effectiveDb.name}"</strong>.
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${syncProgress.percent}%` }}
                />
              </div>

              <div className="text-xs font-mono font-bold text-emerald-400">
                {syncProgress.percent}% ({syncProgress.current} / {syncProgress.total})
              </div>
            </div>
          )}

          {/* ================= STAGE 5: COMPLETE REPORT ================= */}
          {stage === 'complete' && syncSummary && (
            <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center space-y-6 py-6">
              <div className="p-5 bg-emerald-600/20 text-emerald-400 rounded-full border border-emerald-500/30 shadow-xl shadow-emerald-950/50 animate-in zoom-in duration-300">
                <CheckCircle2 size={54} />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">
                  {isInitialImport ? 'Importazione Completata!' : 'Sincronizzazione Completata!'}
                </h3>
                <p className="text-xs text-slate-400">
                  Il catalogo nel database <strong className="text-white">"{syncSummary.targetDbName}"</strong> è stato aggiornato con successo. Gli altri database sono rimasti intatti.
                </p>
              </div>

              {/* Stats Card */}
              <div className="w-full grid grid-cols-2 gap-3 p-4 bg-slate-950 border border-slate-800 rounded-xl text-left">
                <div className="p-3 bg-slate-900 rounded-lg">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase block">Articoli Aggiunti</span>
                  <span className="text-xl font-bold font-mono text-white">{syncSummary.added}</span>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg">
                  <span className="text-[11px] font-bold text-amber-400 uppercase block">Articoli Aggiornati</span>
                  <span className="text-xl font-bold font-mono text-white">{syncSummary.updated}</span>
                </div>
                {syncSummary.protectedFields > 0 && (
                  <div className="p-3 bg-slate-900 rounded-lg">
                    <span className="text-[11px] font-bold text-blue-400 uppercase block">Campi CuePack Protetti</span>
                    <span className="text-xl font-bold font-mono text-white">{syncSummary.protectedFields}</span>
                  </div>
                )}
                {syncSummary.zeroed > 0 && (
                  <div className="p-3 bg-slate-900 rounded-lg">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase block">Giacenze Azzerate</span>
                    <span className="text-xl font-bold font-mono text-white">{syncSummary.zeroed}</span>
                  </div>
                )}
                {syncSummary.deleted > 0 && (
                  <div className="p-3 bg-slate-900 rounded-lg">
                    <span className="text-[11px] font-bold text-rose-400 uppercase block">Articoli Eliminati</span>
                    <span className="text-xl font-bold font-mono text-white">{syncSummary.deleted}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button 
                  onClick={resetAll}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  Importa un altro file
                </button>

                <button 
                  onClick={onClose}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
                >
                  Chiudi e Visualizza Catalogo
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
