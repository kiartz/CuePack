import React, { useRef, useState } from 'react';
import { Download, Upload, RefreshCw, LayoutDashboard, Database, Package, FileText, AlertCircle, Archive } from 'lucide-react';
import { InventoryItem, Kit, PackingList } from '../types';
import { ConfirmationModal } from './ConfirmationModal';

interface HomeViewProps {
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  kits: Kit[];
  setKits: React.Dispatch<React.SetStateAction<Kit[]>>;
  lists: PackingList[];
  setLists: React.Dispatch<React.SetStateAction<PackingList[]>>;
  setActiveListId: React.Dispatch<React.SetStateAction<string>>;
}

export const HomeView: React.FC<HomeViewProps> = ({ 
  inventory,
  setInventory,
  kits,
  setKits,
  lists, 
  setLists, 
  setActiveListId 
}) => {
  const listsFileInputRef = useRef<HTMLInputElement>(null);
  const catalogFileInputRef = useRef<HTMLInputElement>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // --- Statistics ---
  const totalItems = inventory.length;
  const totalKits = kits.length;
  const totalLists = lists.length;
  const totalItemsInLists = lists.reduce((acc, list) => {
    return acc + list.sections.reduce((sAcc, section) => sAcc + section.components.length, 0);
  }, 0);

  // --- Lists (Events) Actions ---

  const handleExportLists = () => {
    const dataStr = JSON.stringify(lists, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cuepack_events_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportListsClick = () => {
    listsFileInputRef.current?.click();
  };

  const handleListsFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedLists = JSON.parse(content);

        // Basic validation check
        if (!Array.isArray(importedLists)) {
            alert("Il file non sembra contenere una lista valida.");
            return;
        }

        // Add imports to current lists (Generate new IDs to avoid conflicts)
        const sanitizedLists = importedLists.map((l: any) => ({
            ...l,
            id: crypto.randomUUID(),
            eventName: `${l.eventName} (Importato)`,
            creationDate: new Date().toISOString()
        }));

        setLists(prev => [...prev, ...sanitizedLists]);
        // Switch to the first imported list
        if (sanitizedLists.length > 0) {
            setActiveListId(sanitizedLists[0].id);
        }
        
        // Reset input
        if (listsFileInputRef.current) listsFileInputRef.current.value = '';
        
      } catch (error) {
        console.error("Import error:", error);
        alert("Errore durante la lettura del file. Verifica che sia un JSON valido.");
      }
    };
    reader.readAsText(file);
  };

  const handleResetLists = () => {
    // Reset lists only (Keep Inventory and Kits)
    const newList: PackingList = {
      id: crypto.randomUUID(),
      eventName: 'Nuovo Evento',
      eventDate: '',
      location: '',
      creationDate: new Date().toISOString(),
      notes: '',
      sections: [
        { id: crypto.randomUUID(), name: 'Audio', components: [] },
        { id: crypto.randomUUID(), name: 'Luci', components: [] },
        { id: crypto.randomUUID(), name: 'Video', components: [] },
        { id: crypto.randomUUID(), name: 'Regia', components: [] },
      ]
    };
    setLists([newList]);
    setActiveListId(newList.id);
  };

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
    link.download = `cuepack_catalog_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCatalogClick = () => {
      catalogFileInputRef.current?.click();
  };

  const handleCatalogFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        let importedItems = 0;
        let importedKits = 0;

        if (data.inventory && Array.isArray(data.inventory)) {
             // We append items. To avoid exact duplicates, we could check IDs, 
             // but here we just assign new IDs to ensure uniqueness in the React state key map
             // or keep existing if they are "templates". 
             // Strategy: Append all, let user clean up if duplicate names. Safest for data loss prevention.
             const newItems = data.inventory.map((i: any) => ({...i, id: crypto.randomUUID() }));
             setInventory(prev => [...prev, ...newItems]);
             importedItems = newItems.length;
        }

        if (data.kits && Array.isArray(data.kits)) {
            const newKits = data.kits.map((k: any) => ({...k, id: crypto.randomUUID() }));
            setKits(prev => [...prev, ...newKits]);
            importedKits = newKits.length;
        }
        
        alert(`Importazione completata!\nAggiunti ${importedItems} articoli e ${importedKits} kit.`);

        // Reset input
        if (catalogFileInputRef.current) catalogFileInputRef.current.value = '';
        
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

        {/* Event/List Management Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <FileText className="text-emerald-400" /> 
                Gestione Eventi (Liste)
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Export Lists */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-emerald-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-emerald-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Download size={32} className="text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Esporta Eventi</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Salva i tuoi eventi attivi in un file JSON.
                    </p>
                    <button onClick={handleExportLists} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
                        Salva Eventi
                    </button>
                </div>

                {/* Import Lists */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-emerald-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-emerald-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload size={32} className="text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Importa Eventi</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Carica eventi salvati precedentemente.
                    </p>
                    <input type="file" ref={listsFileInputRef} onChange={handleListsFileChange} className="hidden" accept=".json" />
                    <button onClick={handleImportListsClick} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
                        Carica Eventi
                    </button>
                </div>

                {/* Reset Lists */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-rose-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-rose-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <RefreshCw size={32} className="text-rose-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Reset Eventi</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Cancella tutti gli eventi attivi.
                    </p>
                    <button onClick={() => setIsResetModalOpen(true)} className="w-full py-2 bg-rose-900/20 border border-rose-900/50 hover:bg-rose-900/40 text-rose-400 rounded-lg font-medium transition-colors">
                        Resetta Liste
                    </button>
                </div>
            </div>
        </div>

        {/* Catalog (Inventory & Kits) Management Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Archive className="text-indigo-400" /> 
                Gestione Catalogo (Inventario & Kit)
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Export Catalog */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors group">
                    <div className="w-16 h-16 bg-indigo-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Download size={32} className="text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">Esporta Catalogo Completo</h3>
                    <p className="text-sm text-slate-500 mb-6 flex-1">
                        Salva tutto il tuo inventario materiale e le definizioni dei tuoi Kit in un unico file. Utile per backup o per trasferire il database su un altro dispositivo.
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
                        Importa materiale e kit da un file. 
                        <span className="block text-slate-400 text-xs mt-1">Nota: I dati verranno aggiunti a quelli esistenti.</span>
                    </p>
                    <input type="file" ref={catalogFileInputRef} onChange={handleCatalogFileChange} className="hidden" accept=".json" />
                    <button onClick={handleImportCatalogClick} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
                        Carica Catalogo
                    </button>
                </div>
            </div>
        </div>

        <div className="bg-blue-900/10 border border-blue-900/30 rounded-lg p-4 flex items-start gap-3">
             <AlertCircle className="text-blue-400 shrink-0 mt-0.5" size={20} />
             <div className="text-sm text-blue-200">
                <strong>Nota:</strong> Questa app funziona interamente nel browser. Se chiudi la pagina o ricarichi senza aver salvato, i dati torneranno ai valori predefiniti (a meno che tu non abbia implementato un salvataggio automatico). Usa le funzioni di esportazione regolarmente.
             </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetLists}
        title="Reset Completo Liste"
        message="Sei sicuro di voler cancellare TUTTE le liste eventi attive? Questa azione è irreversibile."
      />
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