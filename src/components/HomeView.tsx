import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { 
  Download, Upload, LayoutDashboard, Database, Package, FileText, 
  AlertCircle, Archive, Trash2, Plus, Star, Check, Edit2, ShieldAlert, CheckCircle2 
} from 'lucide-react';
import { InventoryItem, Kit, PackingList, InventoryDatabase } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import { 
  batchWriteItems, addOrUpdateItem, deleteItem, 
  COLL_DATABASES, DEFAULT_DATABASE_ID, getInventoryCollection, getKitsCollection 
} from '../firebase';

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
    description: '',
    cloneCurrent: false,
    setAsDefault: false
  });

  const [editingDb, setEditingDb] = useState<InventoryDatabase | null>(null);
  const [editDbForm, setEditDbForm] = useState({
    name: '',
    description: ''
  });

  const [dbToDelete, setDbToDelete] = useState<InventoryDatabase | null>(null);

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
  const currentDb = useMemo(() => {
    return databases.find(d => d.id === activeDatabaseId) || {
      id: DEFAULT_DATABASE_ID,
      name: 'Database Principale',
      description: 'Database predefinito di produzione',
      isDefault: true,
      createdAt: new Date().toISOString()
    };
  }, [databases, activeDatabaseId]);

  // --- Multi-Database Actions ---

  const handleCreateDatabase = async () => {
    if (!newDbForm.name.trim()) return;

    const newDbId = `db_${generateId().toLowerCase()}`;
    const newDbObj: InventoryDatabase = {
      id: newDbId,
      name: newDbForm.name.trim(),
      description: newDbForm.description.trim() || undefined,
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

      // Clone current inventory/kits if requested
      if (newDbForm.cloneCurrent) {
        const targetInventoryCol = getInventoryCollection(newDbId);
        const targetKitsCol = getKitsCollection(newDbId);
        if (inventory.length > 0) {
          await batchWriteItems(targetInventoryCol, inventory);
        }
        if (kits.length > 0) {
          await batchWriteItems(targetKitsCol, kits);
        }
      }

      // Switch to new database
      if (setActiveDatabaseId) {
        setActiveDatabaseId(newDbId);
      }

      setIsNewDbModalOpen(false);
      setNewDbForm({ name: '', description: '', cloneCurrent: false, setAsDefault: false });
      alert(`Database "${newDbObj.name}" creato e attivato con successo!`);
    } catch (err) {
      console.error("Errore creazione database:", err);
      alert("Si è verificato un errore durante la creazione del database.");
    }
  };

  const handleSaveEditDatabase = async () => {
    if (!editingDb || !editDbForm.name.trim()) return;

    try {
      const updated: InventoryDatabase = {
        ...editingDb,
        name: editDbForm.name.trim(),
        description: editDbForm.description.trim() || undefined
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
                    itemsToWrite.push({ ...importedItem, id: existing.id });
                } else {
                    itemsToWrite.push({ ...importedItem, id: importedItem.id || generateId() });
                }
             });
             
             if (itemsToWrite.length > 0) {
                 await batchWriteItems(targetInventoryCol, itemsToWrite);
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
        
        {/* Header Dashboard with Active DB Indicator */}
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

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl">
                <Database size={18} className="text-emerald-400" />
                <div className="text-xs">
                    <span className="text-slate-500 block uppercase font-bold text-[10px]">Database Attivo:</span>
                    <span className="text-white font-bold">{currentDb.name}</span>
                </div>
                <span className="ml-2 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="Database in uso sincronizzato in tempo reale" />
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
                <button 
                  onClick={() => {
                    setNewDbForm({ name: '', description: '', cloneCurrent: false, setAsDefault: false });
                    setIsNewDbModalOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/30 active:scale-95 shrink-0"
                >
                    <Plus size={18} /> Nuovo Database
                </button>
            </div>

            {/* Databases Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {databases.map((dbItem) => {
                    const isActive = dbItem.id === activeDatabaseId;
                    const isDefault = !!dbItem.isDefault;

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
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <h3 className="font-bold text-slate-200 truncate text-base">{dbItem.name}</h3>
                                        </div>
                                        {dbItem.description && (
                                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{dbItem.description}</p>
                                        )}
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

                            <div className="pt-4 border-t border-slate-800/60 mt-4 flex items-center justify-between gap-2">
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
                                        setEditDbForm({ name: dbItem.name, description: dbItem.description || '' });
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

        {/* Catalog (Inventory & Kits) Management Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Archive className="text-indigo-400" /> 
                Gestione Catalogo (DB: {currentDb.name})
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Export Catalog */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
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
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
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
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-emerald-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <FileText size={32} className="text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Gestione Checklist</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Modifica la struttura della checklist globale (Settori, Gruppi, Voci).
                    </p>
                    <button onClick={onNavigateToChecklist} className="w-full py-3 md:py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg shadow-emerald-900/20 transition-colors">
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

            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome Database *</label>
              <input 
                type="text" 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                placeholder="Es. Rentman Import, Magazzino Service 2..."
                value={newDbForm.name}
                onChange={e => setNewDbForm({ ...newDbForm, name: e.target.value })}
                autoFocus
              />
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

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={newDbForm.cloneCurrent}
                  onChange={e => setNewDbForm({ ...newDbForm, cloneCurrent: e.target.checked })}
                  className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950 w-4 h-4"
                />
                <span>Copia materiali e kit attuali nel nuovo database</span>
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
            <div className="space-y-1">
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
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
              <textarea 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-20 resize-none text-sm"
                value={editDbForm.description}
                onChange={e => setEditDbForm({ ...editDbForm, description: e.target.value })}
              />
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
          isDanger={true}
        />

        <div className="text-center space-y-1 pb-8">
            <div className="text-xs text-slate-500 font-medium tracking-wide transition-opacity">
                CuePack Manager <span className="text-blue-500/80 font-bold ml-1 px-1.5 py-0.5 bg-blue-500/10 rounded border border-blue-500/20">v0.5.6</span>
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
