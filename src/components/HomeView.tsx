import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { 
  Download, Upload, LayoutDashboard, Database, Package, FileText, 
  AlertCircle, Archive, Trash2, Plus, Star, Check, Edit2, ShieldAlert, CheckCircle2,
  FileSpreadsheet, RefreshCw, ChevronDown, QrCode, Hash, Layers, Zap
} from 'lucide-react';
import { InventoryItem, Kit, PackingList, InventoryDatabase } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import { RentmanSyncModal } from './RentmanSyncModal';
import { CategoryManager } from './CategoryManager';
import { ConnectorManager } from './ConnectorManager';
import { 
  batchWriteItems, addOrUpdateItem, deleteItem, 
  COLL_DATABASES, COLL_INVENTORY, COLL_KITS, DEFAULT_DATABASE_ID, getInventoryCollection, getKitsCollection 
} from '../firebase';
import { getDbBadgeStyle, getDbDotColor, DB_COLORS } from '../utils/databaseColors';

interface HomeViewProps {
  inventory: InventoryItem[];
  kits: Kit[];
  lists: PackingList[];
  setActiveListId: React.Dispatch<React.SetStateAction<string>>;
  onNavigateToChecklist: () => void;
  databases?: InventoryDatabase[];
  activeDatabaseId?: string;
  setActiveDatabaseId?: (dbId: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ 
  inventory,
  kits,
  lists, 
  setActiveListId,
  onNavigateToChecklist,
  databases = [],
  activeDatabaseId = DEFAULT_DATABASE_ID,
  setActiveDatabaseId
}) => {
  const catalogFileInputRef = useRef<HTMLInputElement>(null);

  // --- Multi-Database Modals & Forms ---
  const [isNewDbModalOpen, setIsNewDbModalOpen] = useState(false);
  const [newDbForm, setNewDbForm] = useState({
    name: '',
    code: '',
    color: 'blue',
    description: '',
    barcodePrefix: '20',
    productCodePrefix: '2',
    productCodeDigits: 4,
    cloneCurrent: false,
    setAsDefault: false
  });

  const [editingDb, setEditingDb] = useState<InventoryDatabase | null>(null);
  const [editDbForm, setEditDbForm] = useState({
    name: '',
    code: '',
    color: 'emerald',
    description: '',
    barcodePrefix: '20',
    productCodePrefix: '2',
    productCodeDigits: 4
  });

  const [dbToDelete, setDbToDelete] = useState<InventoryDatabase | null>(null);
  const [isRentmanSyncModalOpen, setIsRentmanSyncModalOpen] = useState(false);
  const [selectedDbForRentman, setSelectedDbForRentman] = useState<string | null>(null);
  const [homeConfigTab, setHomeConfigTab] = useState<'categories' | 'connectors'>('categories');

  // --- Statistics ---
  const totalItems = inventory.length;
  const totalKits = kits.length;
  const totalLists = lists.length;
  const totalItemsInLists = lists.reduce((acc, list) => {
    const legacyCount = (list.sections || []).reduce((sAcc, section) => sAcc + (section.components?.length || 0), 0);
    const zonesCount = (list.zones || []).reduce((zAcc, zone) => {
        return zAcc + (zone.sections || []).reduce((sAcc, section) => sAcc + (section.components?.length || 0), 0);
    }, 0);
    return acc + legacyCount + zonesCount;
  }, 0);

  // --- Active Database Info ---
  const currentDb: InventoryDatabase = useMemo(() => {
    return databases.find(d => d.id === activeDatabaseId) || {
      id: DEFAULT_DATABASE_ID,
      name: 'Database Principale',
      code: 'PRI',
      color: 'emerald',
      description: 'Database predefinito di produzione',
      isDefault: true,
      createdAt: new Date().toISOString()
    };
  }, [databases, activeDatabaseId]);

  // --- Multi-Database Actions ---

  const handleCreateDatabase = async () => {
    if (!newDbForm.name.trim()) return;

    const rawCode = (newDbForm.code.trim() || newDbForm.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3) || 'DB').toUpperCase();
    const newDbId = `db_${generateId().toLowerCase()}`;
    const newDbObj: InventoryDatabase = {
      id: newDbId,
      name: newDbForm.name.trim(),
      code: rawCode,
      color: newDbForm.color || 'blue',
      description: newDbForm.description.trim() || undefined,
      barcodePrefix: (newDbForm.barcodePrefix || '20').replace(/\D/g, '').slice(0, 3) || '20',
      productCodePrefix: (newDbForm.productCodePrefix || '2').replace(/\D/g, '').slice(0, 3) || '2',
      productCodeDigits: Math.max(2, Math.min(8, Number(newDbForm.productCodeDigits) || 4)),
      isDefault: newDbForm.setAsDefault,
      createdAt: new Date().toISOString()
    };

    try {
      // If setting as default, remove default from other dbs
      if (newDbForm.setAsDefault) {
        for (const d of databases) {
          if (d.isDefault) {
            await addOrUpdateItem(COLL_DATABASES, { ...d, isDefault: false });
          }
        }
      }

      // Save database metadata
      await addOrUpdateItem(COLL_DATABASES, newDbObj);

      // Clone current inventory if requested into unified collection
      if (newDbForm.cloneCurrent && inventory.length > 0) {
        const clonedItems = inventory.map(item => ({
          ...item,
          id: generateId(),
          databaseId: newDbId
        }));
        await batchWriteItems(COLL_INVENTORY, clonedItems);
      }

      // Switch to new database
      if (setActiveDatabaseId) {
        setActiveDatabaseId(newDbId);
      }

      setIsNewDbModalOpen(false);
      setNewDbForm({ 
        name: '', 
        code: '', 
        color: 'blue', 
        description: '', 
        barcodePrefix: '20', 
        productCodePrefix: '2', 
        productCodeDigits: 4, 
        cloneCurrent: false, 
        setAsDefault: false 
      });
      alert(`Database "${newDbObj.name}" [${newDbObj.code}] creato e attivato con successo!`);
    } catch (err) {
      console.error("Errore creazione database:", err);
      alert("Si è verificato un errore durante la creazione del database.");
    }
  };

  const handleSaveEditDatabase = async () => {
    if (!editingDb || !editDbForm.name.trim()) return;

    try {
      const rawCode = (editDbForm.code.trim() || editingDb.code || editDbForm.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3) || 'DB').toUpperCase();
      const updated: InventoryDatabase = {
        ...editingDb,
        name: editDbForm.name.trim(),
        code: rawCode,
        color: editDbForm.color || editingDb.color || 'blue',
        description: editDbForm.description.trim() || undefined,
        barcodePrefix: (editDbForm.barcodePrefix || '20').replace(/\D/g, '').slice(0, 3) || '20',
        productCodePrefix: (editDbForm.productCodePrefix || '2').replace(/\D/g, '').slice(0, 3) || '2',
        productCodeDigits: Math.max(2, Math.min(8, Number(editDbForm.productCodeDigits) || 4))
      };

      await addOrUpdateItem(COLL_DATABASES, updated);
      setEditingDb(null);
    } catch (err) {
      console.error("Errore modifica database:", err);
      alert("Si è verificato un errore durante l'aggiornamento del database.");
    }
  };

  const handleSetDefaultDatabase = async (dbItem: InventoryDatabase) => {
    try {
      for (const d of databases) {
        const isTarget = d.id === dbItem.id;
        if (d.isDefault !== isTarget) {
          await addOrUpdateItem(COLL_DATABASES, { ...d, isDefault: isTarget });
        }
      }
    } catch (err) {
      console.error("Errore impostazione default:", err);
      alert("Si è verificato un errore.");
    }
  };

  const handleDeleteDatabase = async () => {
    if (!dbToDelete) return;
    if (dbToDelete.id === DEFAULT_DATABASE_ID) {
      alert("Non è possibile eliminare il Database Principale di sistema.");
      setDbToDelete(null);
      return;
    }
    if (dbToDelete.id === activeDatabaseId) {
      alert("Non è possibile eliminare il database attualmente in uso. Seleziona prima un altro database.");
      setDbToDelete(null);
      return;
    }

    try {
      await deleteItem(COLL_DATABASES, dbToDelete.id);
      setDbToDelete(null);
      alert(`Database "${dbToDelete.name}" eliminato con successo.`);
    } catch (err) {
      console.error("Errore eliminazione database:", err);
      alert("Si è verificato un errore durante l'eliminazione del database.");
    }
  };

  // --- Catalog (Inventory & Kits) Actions ---

  const handleExportCatalog = () => {
    const catalogData = {
        type: 'cuepack_catalog',
        databaseId: activeDatabaseId,
        databaseName: currentDb.name,
        exportDate: new Date().toISOString(),
        inventory: inventory,
        kits: kits
    };
    
    const dataStr = JSON.stringify(catalogData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const safeDbName = currentDb.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    link.download = `CuePack_Catalogo_${safeDbName}_${year}-${month}-${day}_${hours}-${minutes}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCatalogClick = () => {
      if (catalogFileInputRef.current) {
          catalogFileInputRef.current.value = '';
          catalogFileInputRef.current.click();
      }
  };

  const handleCatalogFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const targetInventoryCol = getInventoryCollection(activeDatabaseId);
    const targetKitsCol = getKitsCollection(activeDatabaseId);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // --- IMPORTAZIONE INVENTARIO (Safe Merge via Firestore) ---
        if (data.inventory && Array.isArray(data.inventory)) {
             const nameMap = new Map<string, InventoryItem>();
             inventory.forEach(item => nameMap.set(item.name.trim().toLowerCase(), item));
             
             const itemsToWrite: InventoryItem[] = [];

             data.inventory.forEach((importedItem: InventoryItem) => {
                if (!importedItem.name) return;
                const key = importedItem.name.trim().toLowerCase();
                const existing = nameMap.get(key);
                
                if (existing) {
                    itemsToWrite.push({ ...importedItem, id: existing.id, databaseId: importedItem.databaseId || activeDatabaseId });
                } else {
                    itemsToWrite.push({ ...importedItem, id: importedItem.id || generateId(), databaseId: importedItem.databaseId || activeDatabaseId });
                }
             });
             
             if (itemsToWrite.length > 0) {
                 await batchWriteItems(COLL_INVENTORY, itemsToWrite);
             }
        }

        // --- IMPORTAZIONE KIT (Safe Merge via Firestore) ---
        if (data.kits && Array.isArray(data.kits)) {
             const kitMap = new Map<string, Kit>();
             kits.forEach(k => kitMap.set(k.name.trim().toLowerCase(), k));
             
             const kitsToWrite: Kit[] = [];

             data.kits.forEach((importedKit: Kit) => {
                if (!importedKit.name) return;
                const key = importedKit.name.trim().toLowerCase();
                const existing = kitMap.get(key);
                
                if (existing) {
                    kitsToWrite.push({ ...importedKit, id: existing.id });
                } else {
                    kitsToWrite.push({ ...importedKit, id: importedKit.id || generateId() });
                }
             });

             if (kitsToWrite.length > 0) {
                 await batchWriteItems(targetKitsCol, kitsToWrite);
             }
        }
        
        alert(`Importazione completata nel database "${currentDb.name}"!\nDatabase aggiornato con successo.`);
        
      } catch (error) {
        console.error("Import error:", error);
        alert("Errore durante la lettura del file. Verifica che sia un JSON valido (formato CuePack Catalog).");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-full p-4 md:p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Dashboard with Active DB Indicator & Theme Switch */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/20">
                    <LayoutDashboard size={32} className="text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white leading-tight">Dashboard</h1>
                    <p className="text-xs text-slate-500">Panoramica e gestione workspace</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                {/* Database Attivo Indicator */}
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl shadow-inner">
                    <Database size={18} className="text-emerald-400" />
                    <div className="text-xs">
                        <span className="text-slate-500 block uppercase font-bold text-[10px]">Database Attivo:</span>
                        <span className="text-white font-bold">{currentDb.name}</span>
                    </div>
                    <span className="ml-2 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="Database in uso sincronizzato in tempo reale" />
                </div>
            </div>
        </div>

        {/* Stats Grid for Currently Active Database */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Database} label="Articoli nel DB Attivo" value={totalItems} color="bg-slate-800" iconColor="text-blue-500" />
            <StatCard icon={Package} label="Kit nel DB Attivo" value={totalKits} color="bg-slate-800" iconColor="text-purple-500" />
            <StatCard icon={FileText} label="Eventi Totali" value={totalLists} color="bg-slate-800" iconColor="text-emerald-500" />
            <StatCard icon={LayoutDashboard} label="Totale Materiale in Uso" value={totalItemsInLists} color="bg-slate-800" iconColor="text-amber-500" />
        </div>

        {/* --- MULTI-DATABASE MANAGEMENT SECTION --- */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Database className="text-blue-400" /> 
                        Database di Inventario
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Gestisci molteplici archivi di materiali (es. Database Attuale, Rentman, Service Esterni) e seleziona quale utilizzare.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button 
                    onClick={() => {
                      setNewDbForm({ 
                        name: '', 
                        code: '', 
                        color: 'blue', 
                        description: '', 
                        barcodePrefix: '20',
                        productCodePrefix: '2',
                        productCodeDigits: 4,
                        cloneCurrent: false, 
                        setAsDefault: false 
                      });
                      setIsNewDbModalOpen(true);
                    }}
                    className="hidden md:flex bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold items-center gap-2 transition-all shadow-lg shadow-blue-900/30 active:scale-95 shrink-0"
                  >
                    <Plus size={18} /> Nuovo Database
                  </button>
                </div>
            </div>

            {/* Mobile Compact Database Selector */}
            <div className="md:hidden bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database size={14} className="text-blue-400" /> Database Attivo
                </span>
                {currentDb.isDefault ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-900/30 text-amber-400 border border-amber-800/40 px-2 py-0.5 rounded-full">
                    <Star size={11} className="fill-current" /> Principale (Default)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetDefaultDatabase(currentDb as any)}
                    className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-800/50 hover:bg-amber-900/40 px-2.5 py-1 rounded-lg transition-all active:scale-95"
                    title="Imposta questo database come principale predefinito"
                  >
                    <Star size={12} /> Rendi Principale
                  </button>
                )}
              </div>

              {/* Dropdown Select */}
              <div className="relative">
                <select
                  value={activeDatabaseId || DEFAULT_DATABASE_ID}
                  onChange={(e) => setActiveDatabaseId && setActiveDatabaseId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg py-2.5 pl-3 pr-10 text-sm font-semibold appearance-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  {databases.map((dbItem) => {
                    const dbItemsCount = inventory.filter(i => (i.databaseId || DEFAULT_DATABASE_ID) === dbItem.id).length;
                    const isDef = !!dbItem.isDefault;
                    return (
                      <option key={dbItem.id} value={dbItem.id}>
                        [{dbItem.code || 'DB'}] {dbItem.name} ({dbItemsCount} art.){isDef ? ' ⭐ Principale' : ''}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <ChevronDown size={18} />
                </div>
              </div>

              {/* Compact details pill */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5 border-t border-slate-900">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getDbBadgeStyle(currentDb.color)}`}>
                    {currentDb.code || 'DB'}
                  </span>
                  <span className="text-slate-300 font-medium truncate max-w-[180px]">{currentDb.name}</span>
                </div>
                <span className="text-slate-400">
                  <strong className="text-white font-mono">{inventory.filter(i => (i.databaseId || DEFAULT_DATABASE_ID) === currentDb.id).length}</strong> articoli
                </span>
              </div>
            </div>

            {/* Databases Cards Grid */}
            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {databases.map((dbItem) => {
                    const isActive = dbItem.id === activeDatabaseId;
                    const isDefault = !!dbItem.isDefault;
                    const dbItemsCount = inventory.filter(i => (i.databaseId || DEFAULT_DATABASE_ID) === dbItem.id).length;

                    return (
                        <div 
                          key={dbItem.id} 
                          className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                            isActive 
                              ? 'bg-blue-950/30 border-blue-500/80 shadow-lg shadow-blue-950/50 ring-1 ring-blue-500/30' 
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                            <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded border shrink-0 ${getDbBadgeStyle(dbItem.color)}`}>
                                                {dbItem.code || 'DB'}
                                            </span>
                                            <h3 className="font-bold text-slate-200 truncate text-base">{dbItem.name}</h3>
                                        </div>
                                        {dbItem.description && (
                                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{dbItem.description}</p>
                                        )}
                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                                            <span><strong className="text-slate-200">{dbItemsCount}</strong> articoli</span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-400 mt-2 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                                            <span className="flex items-center gap-1 text-emerald-400 font-bold" title="Prefisso Barcode / QR (7 cifre)">
                                                <QrCode size={12} /> Barcode: {dbItem.barcodePrefix || '20'}... (7 cifre)
                                            </span>
                                            <span className="text-slate-600">•</span>
                                            <span className="flex items-center gap-1 text-cyan-400 font-bold" title="Prefisso e lunghezza Codice Prodotto">
                                                <Hash size={12} /> Codice: {dbItem.productCodePrefix || '2'}... ({dbItem.productCodeDigits || 4} cifre)
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {isDefault && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-900/30 text-amber-400 border border-amber-800/40 px-2 py-0.5 rounded-full" title="Database Predefinito all'avvio">
                                                <Star size={12} className="fill-current" /> Default
                                            </span>
                                        )}
                                        {isActive ? (
                                            <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                                                <CheckCircle2 size={12} /> In Uso
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            {/* Rentman Per-Database Action */}
                            <div className="hidden lg:block pt-3 border-t border-slate-800/60 mt-3">
                                {dbItemsCount === 0 ? (
                                    <button 
                                      type="button" 
                                      onClick={() => {
                                        setSelectedDbForRentman(dbItem.id);
                                        setIsRentmanSyncModalOpen(true);
                                      }}
                                      className="w-full py-1.5 px-3 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 hover:border-emerald-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98"
                                      title={`Importa per la prima volta materiale Rentman nel database "${dbItem.name}"`}
                                    >
                                      <FileSpreadsheet size={14} className="text-emerald-400" />
                                      <span>Importa da Rentman</span>
                                    </button>
                                ) : (
                                    <button 
                                      type="button" 
                                      onClick={() => {
                                        setSelectedDbForRentman(dbItem.id);
                                        setIsRentmanSyncModalOpen(true);
                                      }}
                                      className="w-full py-1.5 px-3 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 hover:border-cyan-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98"
                                      title={`Sincronizza e riconcilia catalogo Rentman nel database "${dbItem.name}"`}
                                    >
                                      <RefreshCw size={13} className="text-cyan-400" />
                                      <span>Sincronizza Rentman</span>
                                    </button>
                                )}
                            </div>

                            <div className="pt-3 border-t border-slate-800/60 mt-3 flex items-center justify-between gap-2">
                                <div>
                                    {!isActive ? (
                                        <button 
                                          onClick={() => setActiveDatabaseId && setActiveDatabaseId(dbItem.id)}
                                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                                        >
                                          Usa questo DB
                                        </button>
                                    ) : (
                                        <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                                            <Check size={14} /> Attivo
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-1">
                                    {!isDefault && (
                                        <button 
                                          onClick={() => handleSetDefaultDatabase(dbItem)}
                                          className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                                          title="Imposta come database predefinito"
                                        >
                                          <Star size={16} />
                                        </button>
                                    )}
                                    <button 
                                      onClick={() => {
                                        setEditingDb(dbItem);
                                        setEditDbForm({
                                          name: dbItem.name,
                                          code: dbItem.code || '',
                                          color: dbItem.color || 'blue',
                                          description: dbItem.description || '',
                                          barcodePrefix: dbItem.barcodePrefix || '20',
                                          productCodePrefix: dbItem.productCodePrefix || '2',
                                          productCodeDigits: dbItem.productCodeDigits || 4
                                        });
                                      }}
                                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                                      title="Modifica nome e descrizione"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    {dbItem.id !== DEFAULT_DATABASE_ID && !isActive && (
                                        <button 
                                          onClick={() => setDbToDelete(dbItem)}
                                          className="p-1.5 text-slate-500 hover:text-rose-500 hover:bg-slate-800 rounded transition-colors"
                                          title="Elimina database"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* --- UNIVERSAL CONFIG: CATEGORIES & CONNECTORS MANAGEMENT SECTION --- */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 lg:p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-800">
                <div>
                    <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
                        {homeConfigTab === 'categories' ? (
                          <>
                            <Layers className="text-emerald-400" size={20} /> 
                            Gestione Categorie & Sottocategorie
                          </>
                        ) : (
                          <>
                            <Zap className="text-yellow-400" size={20} /> 
                            Gestione Connettori Elettrici
                          </>
                        )}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {homeConfigTab === 'categories'
                          ? "Albero universale delle categorie valido per tutti i database. Trascina le righe per riordinare la visualizzazione negli elenchi e nei filtri."
                          : "Elenco universale dei connettori di alimentazione con voltaggio e amperaggio predefiniti. Trascina per personalizzare l'ordine."
                        }
                    </p>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                    <button
                        type="button"
                        onClick={() => setHomeConfigTab('categories')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            homeConfigTab === 'categories'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                    >
                        <Layers size={14} />
                        Categorie
                    </button>
                    <button
                        type="button"
                        onClick={() => setHomeConfigTab('connectors')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            homeConfigTab === 'connectors'
                                ? 'bg-yellow-500 text-slate-950 shadow-sm'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                    >
                        <Zap size={14} />
                        Connettori
                    </button>
                </div>
            </div>

            {homeConfigTab === 'categories' ? (
                <CategoryManager />
            ) : (
                <ConnectorManager />
            )}
        </div>

        {/* Catalog (Inventory & Kits) Management Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 lg:p-6">
            <h2 className="text-lg lg:text-xl font-bold text-white mb-3 lg:mb-6 flex items-center gap-2">
                <Archive className="text-indigo-400" size={20} /> 
                Gestione Catalogo (DB: {currentDb.name})
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-6">
                {/* Export Catalog */}
                <div className="hidden lg:flex bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-indigo-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Download size={32} className="text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Esporta Catalogo</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Salva inventario e kit del database attivo in un file JSON di backup.
                    </p>
                    <button onClick={handleExportCatalog} className="w-full py-3 md:py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-colors">
                        Salva Catalogo ({currentDb.name})
                    </button>
                </div>

                {/* Import Catalog */}
                <div className="hidden lg:flex bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-indigo-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload size={32} className="text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Importa Catalogo</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Carica materiali e kit nel database attualmente attivo ({currentDb.name}).
                    </p>
                    <input type="file" ref={catalogFileInputRef} onChange={handleCatalogFileChange} className="hidden" accept=".json" />
                    <button onClick={handleImportCatalogClick} className="w-full py-3 md:py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-colors">
                        Carica nel DB Attivo
                    </button>
                </div>

                {/* Manage Checklist */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 lg:p-6 flex flex-row lg:flex-col items-center justify-between lg:justify-center text-left lg:text-center hover:border-emerald-500/50 transition-colors group gap-3 lg:gap-0">
                    <div className="flex items-center gap-3 lg:flex-col lg:gap-0 min-w-0 flex-1">
                        <div className="w-10 h-10 lg:w-16 lg:h-16 bg-emerald-900/20 rounded-full flex items-center justify-center lg:mb-4 group-hover:scale-110 transition-transform shrink-0">
                            <FileText size={20} className="text-emerald-500 lg:hidden" />
                            <FileText size={32} className="text-emerald-500 hidden lg:block" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm lg:text-lg font-bold text-slate-200 lg:mb-2 truncate">Gestione Checklist</h3>
                            <p className="text-xs lg:text-sm text-slate-500 lg:mb-6 line-clamp-1 lg:line-clamp-none">
                                Modifica settori, gruppi e voci checklist.
                            </p>
                        </div>
                    </div>
                    <button onClick={onNavigateToChecklist} className="w-auto lg:w-full px-3.5 py-2 lg:py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs lg:text-sm font-bold shadow-md lg:shadow-lg shadow-emerald-900/20 transition-colors shrink-0 active:scale-95">
                        Modifica Checklist
                    </button>
                </div>
            </div>
        </div>

        {/* --- MODAL CREA NUOVO DATABASE --- */}
        <Modal 
          isOpen={isNewDbModalOpen} 
          onClose={() => setIsNewDbModalOpen(false)} 
          title="Nuovo Database di Inventario"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Crea un nuovo archivio di inventario isolato. Potrai importare nuovi prodotti o caricarlo da Rentman mantenendo separato il database principale.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome Database *</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                  placeholder="Es. Rentman Import, Magazzino Service 2..."
                  value={newDbForm.name}
                  onChange={e => {
                    const val = e.target.value;
                    const autoCode = !newDbForm.code ? val.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() : newDbForm.code;
                    setNewDbForm({ ...newDbForm, name: val, code: autoCode });
                  }}
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Sigla (3-4 Car.) *</label>
                <input 
                  type="text" 
                  maxLength={4}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold focus:border-blue-500 outline-none uppercase"
                  placeholder="PRI"
                  value={newDbForm.code}
                  onChange={e => setNewDbForm({ ...newDbForm, code: e.target.value.toUpperCase().slice(0, 4) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Colore Badge</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DB_COLORS.map(c => {
                  const isSelected = newDbForm.color === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewDbForm({ ...newDbForm, color: c.id })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        isSelected 
                          ? `${c.badge} ring-2 ring-blue-500` 
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                      <span className="truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione (Opzionale)</label>
              <textarea 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-20 resize-none text-sm"
                placeholder="Note o dettagli su questo database..."
                value={newDbForm.description}
                onChange={e => setNewDbForm({ ...newDbForm, description: e.target.value })}
              />
            </div>

            {/* Numerazione Automatica Barcode & Codice Prodotto */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <QrCode size={16} className="text-emerald-400" />
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Numerazione Automatica (Barcode & Codici)
                </h4>
              </div>

              {/* Barcode / QR */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-400">
                    Prefisso Barcode / QR (1-3 cifre)
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    7 cifre (Es. {((newDbForm.barcodePrefix || '20').replace(/\D/g, '').slice(0, 3) || '20').padEnd(7, '0').slice(0, 6)}1)
                  </span>
                </div>
                <input 
                  type="text" 
                  maxLength={3}
                  placeholder="Es. 20"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-mono font-bold focus:border-emerald-500 outline-none"
                  value={newDbForm.barcodePrefix}
                  onChange={e => setNewDbForm({ ...newDbForm, barcodePrefix: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  I barcode Rentman iniziano con 10 o 1 (es. 1027273). Imposta 2, 20 o 3 per evitare sovrapposizioni.
                </p>
              </div>

              {/* Codice Prodotto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-400">
                      Prefisso Cod. Prodotto
                    </label>
                  </div>
                  <input 
                    type="text" 
                    maxLength={3}
                    placeholder="Es. 2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-mono font-bold focus:border-cyan-500 outline-none"
                    value={newDbForm.productCodePrefix}
                    onChange={e => setNewDbForm({ ...newDbForm, productCodePrefix: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-400">
                      Totale Cifre Codice
                    </label>
                    <span className="text-[10px] text-cyan-400 font-mono font-bold">
                      Es. {((newDbForm.productCodePrefix || '2').replace(/\D/g, '').slice(0, 3) || '2').padEnd(Math.max(2, Math.min(8, Number(newDbForm.productCodeDigits) || 4)), '0').slice(0, -1)}1
                    </span>
                  </div>
                  <input 
                    type="number" 
                    min={Math.max(2, (newDbForm.productCodePrefix || '2').length + 1)}
                    max={8}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-mono font-bold focus:border-cyan-500 outline-none"
                    value={newDbForm.productCodeDigits}
                    onChange={e => setNewDbForm({ ...newDbForm, productCodeDigits: Math.max(2, Math.min(8, parseInt(e.target.value, 10) || 4)) })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={newDbForm.cloneCurrent}
                  onChange={e => setNewDbForm({ ...newDbForm, cloneCurrent: e.target.checked })}
                  className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950 w-4 h-4"
                />
                <span>Copia materiali attuali nel nuovo database</span>
              </label>

              <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={newDbForm.setAsDefault}
                  onChange={e => setNewDbForm({ ...newDbForm, setAsDefault: e.target.checked })}
                  className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950 w-4 h-4"
                />
                <span>Imposta come database predefinito all'avvio</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button 
                type="button" 
                onClick={() => setIsNewDbModalOpen(false)}
                className="px-4 py-2 text-slate-400 hover:text-white rounded-lg text-sm"
              >
                Annulla
              </button>
              <button 
                type="button" 
                onClick={handleCreateDatabase}
                disabled={!newDbForm.name.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-900/30 transition-all"
              >
                Crea Database
              </button>
            </div>
          </div>
        </Modal>

        {/* --- MODAL MODIFICA DATABASE --- */}
        <Modal 
          isOpen={!!editingDb} 
          onClose={() => setEditingDb(null)} 
          title={`Modifica: ${editingDb?.name || ''}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome Database *</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                  value={editDbForm.name}
                  onChange={e => setEditDbForm({ ...editDbForm, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Sigla (3-4 Car.) *</label>
                <input 
                  type="text" 
                  maxLength={4}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold focus:border-blue-500 outline-none uppercase"
                  value={editDbForm.code}
                  onChange={e => setEditDbForm({ ...editDbForm, code: e.target.value.toUpperCase().slice(0, 4) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Colore Badge</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DB_COLORS.map(c => {
                  const isSelected = editDbForm.color === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditDbForm({ ...editDbForm, color: c.id })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        isSelected 
                          ? `${c.badge} ring-2 ring-blue-500` 
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                      <span className="truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
              <textarea 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-20 resize-none text-sm"
                value={editDbForm.description}
                onChange={e => setEditDbForm({ ...editDbForm, description: e.target.value })}
              />
            </div>

            {/* Numerazione Automatica Barcode & Codice Prodotto */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <QrCode size={16} className="text-emerald-400" />
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Numerazione Automatica (Barcode & Codici)
                </h4>
              </div>

              {/* Barcode / QR */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-400">
                    Prefisso Barcode / QR (1-3 cifre)
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    7 cifre (Es. {((editDbForm.barcodePrefix || '20').replace(/\D/g, '').slice(0, 3) || '20').padEnd(7, '0').slice(0, 6)}1)
                  </span>
                </div>
                <input 
                  type="text" 
                  maxLength={3}
                  placeholder="Es. 20"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-mono font-bold focus:border-emerald-500 outline-none"
                  value={editDbForm.barcodePrefix}
                  onChange={e => setEditDbForm({ ...editDbForm, barcodePrefix: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  I barcode Rentman iniziano con 10 o 1 (es. 1027273). Imposta 2, 20 o 3 per evitare sovrapposizioni.
                </p>
              </div>

              {/* Codice Prodotto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-400">
                      Prefisso Cod. Prodotto
                    </label>
                  </div>
                  <input 
                    type="text" 
                    maxLength={3}
                    placeholder="Es. 2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-mono font-bold focus:border-cyan-500 outline-none"
                    value={editDbForm.productCodePrefix}
                    onChange={e => setEditDbForm({ ...editDbForm, productCodePrefix: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-400">
                      Totale Cifre Codice
                    </label>
                    <span className="text-[10px] text-cyan-400 font-mono font-bold">
                      Es. {((editDbForm.productCodePrefix || '2').replace(/\D/g, '').slice(0, 3) || '2').padEnd(Math.max(2, Math.min(8, Number(editDbForm.productCodeDigits) || 4)), '0').slice(0, -1)}1
                    </span>
                  </div>
                  <input 
                    type="number" 
                    min={Math.max(2, (editDbForm.productCodePrefix || '2').length + 1)}
                    max={8}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white font-mono font-bold focus:border-cyan-500 outline-none"
                    value={editDbForm.productCodeDigits}
                    onChange={e => setEditDbForm({ ...editDbForm, productCodeDigits: Math.max(2, Math.min(8, parseInt(e.target.value, 10) || 4)) })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button 
                type="button" 
                onClick={() => setEditingDb(null)}
                className="px-4 py-2 text-slate-400 hover:text-white rounded-lg text-sm"
              >
                Annulla
              </button>
              <button 
                type="button" 
                onClick={handleSaveEditDatabase}
                disabled={!editDbForm.name.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-900/30 transition-all"
              >
                Salva Modifiche
              </button>
            </div>
          </div>
        </Modal>

        {/* --- CONFIRMATION MODAL ELIMINAZIONE DATABASE --- */}
        <ConfirmationModal 
          isOpen={!!dbToDelete}
          onClose={() => setDbToDelete(null)}
          onConfirm={handleDeleteDatabase}
          title="Elimina Database di Inventario"
          message={`Sei sicuro di voler eliminare il database "${dbToDelete?.name || ''}"? Questa azione rimuoverà il database dal registro.`}
          confirmText="Elimina Database"
          variant="danger"
        />

        {/* --- RENTMAN SYNC & DIFF STUDIO MODAL --- */}
        <RentmanSyncModal 
          isOpen={isRentmanSyncModalOpen}
          onClose={() => {
            setIsRentmanSyncModalOpen(false);
            setSelectedDbForRentman(null);
          }}
          inventory={inventory}
          databases={databases}
          targetDatabaseId={selectedDbForRentman || activeDatabaseId}
          activeDatabaseId={activeDatabaseId}
          setActiveDatabaseId={setActiveDatabaseId}
        />

        <div className="text-center space-y-1 pb-8">
            <div className="text-xs text-slate-500 font-medium tracking-wide transition-opacity">
                CuePack Manager <span className="text-blue-500/80 font-bold ml-1 px-1.5 py-0.5 bg-blue-500/10 rounded border border-blue-500/20">v0.5.8.2</span>
            </div>
            <div className="text-xs text-slate-600 uppercase tracking-widest font-bold">
                Cloud Sync Active • Multi-Database Architecture
            </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color, iconColor }: any) => (
  <div className={`${color} border border-slate-700 rounded-xl p-4 flex items-center gap-4`}>
    <div className={`p-3 rounded-lg bg-slate-950 ${iconColor}`}>
      <Icon size={24} />
    </div>
    <div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</div>
    </div>
  </div>
);
