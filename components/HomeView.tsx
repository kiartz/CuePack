import React, { useRef, useState } from 'react';
import { Download, Upload, RefreshCw, LayoutDashboard, Database, Package, FileText, AlertCircle, Archive, Trash2 } from 'lucide-react';
import { InventoryItem, Kit, PackingList } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { INITIAL_INVENTORY, INITIAL_KITS } from '../constants';

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
  const [isResetListsModalOpen, setIsResetListsModalOpen] = useState(false);
  const [isFactoryResetModalOpen, setIsFactoryResetModalOpen] = useState(false);

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

  const handleFactoryReset = () => {
      // Wipes everything back to INITIAL constants
      localStorage.clear();
      setInventory(INITIAL_INVENTORY);
      setKits(INITIAL_KITS);
      handleResetLists(); // Reset lists to default
      window.location.reload(); // Force reload to ensure clean state
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

        // IMPORTAZIONE INVENTARIO CON MERGE
        if (data.inventory && Array.isArray(data.inventory)) {
             setInventory(prev => {
                // Creiamo una mappa degli oggetti attuali basata sul NOME normalizzato
                const itemMap = new Map(prev.map(i => [i.name.trim().toLowerCase(), i]));
                
                data.inventory.forEach((importedItem: InventoryItem) => {
                    const key = importedItem.name.trim().toLowerCase();
                    const existing = itemMap.get(key);
                    
                    if (existing) {
                        // MERGE: Aggiorniamo l'oggetto esistente con i dati importati.
                        // IMPORTANTE: Manteniamo l'ID esistente per non rompere i collegamenti nelle liste attuali.
                        // Assumiamo che il file importato sia "più aggiornato" come richiesto.
                        itemMap.set(key, { ...importedItem, id: existing.id });
                    } else {
                        // CREATE: Nuovo oggetto
                        // Se l'oggetto non esiste, lo aggiungiamo.
                        itemMap.set(key, { ...importedItem, id: importedItem.id || crypto.randomUUID() });
                    }
                });
                
                // Ritorniamo l'array dei valori aggiornati
                const newInventory = Array.from(itemMap.values());
                importedItems = newInventory.length - prev.length; // Calcolo approssimativo dei nuovi
                if (importedItems < 0) importedItems = 0; // Se merge, non aumentano i nuovi
                return newInventory;
             });
        }

        // IMPORTAZIONE KIT CON MERGE
        if (data.kits && Array.isArray(data.kits)) {
            setKits(prev => {
                const kitMap = new Map(prev.map(k => [k.name.trim().toLowerCase(), k]));

                data.kits.forEach((importedKit: Kit) => {
                    const key = importedKit.name.trim().toLowerCase();
                    const existing = kitMap.get(key);

                    if (existing) {
                         // Merge Kit: Aggiorna definizioni ma mantieni ID
                         kitMap.set(key, { ...importedKit, id: existing.id });
                    } else {
                         kitMap.set(key, { ...importedKit, id: importedKit.id || crypto.randomUUID() });
                    }
                });

                const newKits = Array.from(kitMap.values());
                importedKits = newKits.length - prev.length;
                if (importedKits < 0) importedKits = 0;
                return newKits;
            });
        }
        
        alert(`Importazione completata!\nCatalogo aggiornato (eventuali duplicati sono stati uniti).`);

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
                    <button onClick={() => setIsResetListsModalOpen(true)} className="w-full py-2 bg-rose-900/20 border border-rose-900/50 hover:bg-rose-900/40 text-rose-400 rounded-lg font-medium transition-colors">
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
                        <span className="block text-slate-400 text-xs mt-1">Nota: Gli oggetti con lo stesso nome verranno aggiornati.</span>
                    </p>
                    <input type="file" ref={catalogFileInputRef} onChange={handleCatalogFileChange} className="hidden" accept=".json" />
                    <button onClick={handleImportCatalogClick} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
                        Carica Catalogo
                    </button>
                </div>
            </div>
        </div>

        {/* Global Actions */}
        <div className="bg-rose-900/10 border border-rose-900/30 rounded-xl p-6 flex items-center justify-between">
             <div className="flex items-start gap-3">
                 <AlertCircle className="text-rose-500 shrink-0 mt-1" size={24} />
                 <div>
                     <h3 className="font-bold text-rose-200">Factory Reset (Cancellazione Totale)</h3>
                     <p className="text-sm text-rose-200/70">
                        Cancella tutta la memoria locale (Liste, Inventario e Kit modificati). 
                        L'app tornerà allo stato iniziale di installazione. 
                        <span className="font-bold"> Usa questa opzione solo se riscontri problemi gravi o vuoi ripartire da zero.</span>
                     </p>
                 </div>
             </div>
             <button 
                onClick={() => setIsFactoryResetModalOpen(true)}
                className="px-4 py-2 bg-rose-900/50 hover:bg-rose-900 text-rose-200 rounded-lg font-medium whitespace-nowrap border border-rose-700 transition-colors"
             >
                 <Trash2 size={16} className="inline mr-2" /> Reset Totale
             </button>
        </div>

        <div className="text-center text-xs text-slate-600 pb-8">
            CuePack Manager utilizza il LocalStorage del browser. I dati non vengono inviati a nessun server.
        </div>
      </div>

      <ConfirmationModal
        isOpen={isResetListsModalOpen}
        onClose={() => setIsResetListsModalOpen(false)}
        onConfirm={handleResetLists}
        title="Reset Liste Eventi"
        message="Sei sicuro di voler cancellare TUTTE le liste eventi attive? Questa azione non cancellerà l'inventario o i kit."
      />

      <ConfirmationModal
        isOpen={isFactoryResetModalOpen}
        onClose={() => setIsFactoryResetModalOpen(false)}
        onConfirm={handleFactoryReset}
        title="FACTORY RESET COMPLETO"
        message="ATTENZIONE: Stai per cancellare TUTTI i dati salvati (Liste, Modifiche Inventario, Kit personalizzati). L'app verrà riavviata allo stato iniziale. Sei assolutamente sicuro?"
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