import React, { useRef, useState } from 'react';
import { Download, Upload, LayoutDashboard, Database, Package, FileText, AlertCircle, Archive, Trash2 } from 'lucide-react';
import { InventoryItem, Kit, PackingList } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { INITIAL_INVENTORY, INITIAL_KITS } from '../constants';
import { batchWriteItems, addOrUpdateItem, deleteItem, COLL_INVENTORY, COLL_KITS, COLL_LISTS } from '../firebase';

interface HomeViewProps {
  inventory: InventoryItem[];
  kits: Kit[];
  lists: PackingList[];
  setActiveListId: React.Dispatch<React.SetStateAction<string>>;
  onNavigateToChecklist: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ 
  inventory,
  kits,
  lists, 
  setActiveListId,
  onNavigateToChecklist
}) => {
  const catalogFileInputRef = useRef<HTMLInputElement>(null);

  // --- Statistics ---
  const totalItems = inventory.length;
  const totalKits = kits.length;
  const totalLists = lists.length;
  const totalItemsInLists = lists.reduce((acc, list) => {
    // Count items in legacy 'sections'
    const legacyCount = (list.sections || []).reduce((sAcc, section) => sAcc + (section.components?.length || 0), 0);
    
    // Count items in new 'zones' structure
    const zonesCount = (list.zones || []).reduce((zAcc, zone) => {
        return zAcc + (zone.sections || []).reduce((sAcc, section) => sAcc + (section.components?.length || 0), 0);
    }, 0);

    return acc + legacyCount + zonesCount;
  }, 0);

  // --- Catalog (Inventory & Kits) Actions ---

  const handleExportCatalog = () => {
    const catalogData = {
        type: 'cuepack_catalog',
        exportDate: new Date().toISOString(),
        inventory: inventory,
        kits: kits
    };
    
    const dataStr = JSON.stringify(catalogData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Generate Filename: CuePack_Catalogo_YYYY-MM-DD_HH-mm.json
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    link.download = `CuePack_Catalogo_${year}-${month}-${day}_${hours}-${minutes}.json`;
    
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

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // --- IMPORTAZIONE INVENTARIO (Safe Merge via Firestore) ---
        if (data.inventory && Array.isArray(data.inventory)) {
             // 1. Map existing by Name (normalized)
             const nameMap = new Map<string, InventoryItem>();
             inventory.forEach(item => nameMap.set(item.name.trim().toLowerCase(), item));
             
             const itemsToWrite: InventoryItem[] = [];

             data.inventory.forEach((importedItem: InventoryItem) => {
                if (!importedItem.name) return;
                const key = importedItem.name.trim().toLowerCase();
                const existing = nameMap.get(key);
                
                if (existing) {
                    // Update existing item (keep ID)
                    itemsToWrite.push({ ...importedItem, id: existing.id });
                } else {
                    // Create new item
                    itemsToWrite.push({ ...importedItem, id: importedItem.id || crypto.randomUUID() });
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
                    kitsToWrite.push({ ...importedKit, id: importedKit.id || crypto.randomUUID() });
                }
             });

             if (kitsToWrite.length > 0) {
                 await batchWriteItems(COLL_KITS, kitsToWrite);
             }
        }
        
        alert(`Importazione completata!\nDatabase aggiornato con successo.`);
        
      } catch (error) {
        console.error("Import error:", error);
        alert("Errore durante la lettura del file. Verifica che sia un JSON valido (formato CuePack Catalog).");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-full p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/20">
                <LayoutDashboard size={32} className="text-white" />
            </div>
            <div>
                <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                <p className="text-slate-400">Panoramica e gestione workspace</p>
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Database} label="Articoli in Inventario" value={totalItems} color="bg-slate-800" iconColor="text-blue-500" />
            <StatCard icon={Package} label="Kit Configurati" value={totalKits} color="bg-slate-800" iconColor="text-purple-500" />
            <StatCard icon={FileText} label="Eventi Attivi" value={totalLists} color="bg-slate-800" iconColor="text-emerald-500" />
            <StatCard icon={LayoutDashboard} label="Totale Materiale Impiegato" value={totalItemsInLists} color="bg-slate-800" iconColor="text-amber-500" />
        </div>

        {/* Catalog (Inventory & Kits) Management Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Archive className="text-indigo-400" /> 
                Gestione Catalogo (Inventario & Kit)
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Export Catalog */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-indigo-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Download size={32} className="text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Esporta Catalogo</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Salva inventario e kit in un file backup.
                    </p>
                    <button onClick={handleExportCatalog} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
                        Salva Catalogo
                    </button>
                </div>

                {/* Import Catalog */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-indigo-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload size={32} className="text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Importa Catalogo</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Ripristina backup o unisci cataloghi.
                    </p>
                    <input type="file" ref={catalogFileInputRef} onChange={handleCatalogFileChange} className="hidden" accept=".json" />
                    <button onClick={handleImportCatalogClick} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
                        Carica Catalogo
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
                    <button onClick={onNavigateToChecklist} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
                        Modifica Checklist
                    </button>
                </div>
            </div>
        </div>

        <div className="text-center text-xs text-slate-600 pb-8">
            CuePack Manager utilizza Firebase Cloud. I dati sono sincronizzati.
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