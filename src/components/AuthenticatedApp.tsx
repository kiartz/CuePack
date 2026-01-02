import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Package, ClipboardList, Menu, Home, Loader2, WifiOff, LogOut } from 'lucide-react';
import { InventoryView } from './InventoryView';
import { KitsView } from './KitsView';
import { PackingListBuilder } from './PackingListBuilder';
import { HomeView } from './HomeView';
import { ChecklistView } from './ChecklistView';
import { ChecklistManager } from './ChecklistManager';
import { INITIAL_INVENTORY, INITIAL_KITS, MASTER_CHECKLIST as INITIAL_MASTER_CHECKLIST } from '../constants';
import { InventoryItem, Kit, PackingList, ChecklistCategory } from '../types';
import { db, auth, COLL_INVENTORY, COLL_KITS, COLL_LISTS, COLL_CHECKLIST_CONFIG, batchWriteItems } from '../firebase';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

type View = 'home' | 'inventory' | 'kits' | 'lists' | 'checklist-manager';

export default function AuthenticatedApp() {
  const [currentView, setCurrentView] = useState<View>('home');
  
  // --- REAL-TIME DATA STATE ---
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [packingLists, setPackingLists] = useState<PackingList[]>([]);
  const [masterChecklist, setMasterChecklist] = useState<ChecklistCategory[]>([]);
  
  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // UI State (Persisted locally for convenience)
  const [activeListId, setActiveListId] = useState<string>(() => {
      return localStorage.getItem('cuepack_active_list_id') || '';
  });

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- FIRESTORE SUBSCRIPTIONS ---
  useEffect(() => {
    setLoading(true);

    // 1. Inventory Listener
    const unsubInventory = onSnapshot(collection(db, COLL_INVENTORY), (snapshot) => {
        const items: InventoryItem[] = [];
        snapshot.forEach(doc => items.push(doc.data() as InventoryItem));
        setInventory(items);
        
        // SEEDING: If DB is empty, load initial data
        if (snapshot.empty && !snapshot.metadata.fromCache) {
             console.log("Seeding Database with Initial Inventory...");
             batchWriteItems(COLL_INVENTORY, INITIAL_INVENTORY);
        }
    }, (error) => {
        console.error("Inventory Sync Error:", error);
        setDbError("Errore di connessione al Database.");
    });

    // 2. Kits Listener
    const unsubKits = onSnapshot(collection(db, COLL_KITS), (snapshot) => {
        const items: Kit[] = [];
        snapshot.forEach(doc => items.push(doc.data() as Kit));
        setKits(items);

        if (snapshot.empty && !snapshot.metadata.fromCache) {
             console.log("Seeding Database with Initial Kits...");
             batchWriteItems(COLL_KITS, INITIAL_KITS);
        }
    }, (error) => console.error("Kits Sync Error:", error));

    // 3. Lists Listener
    const unsubLists = onSnapshot(collection(db, COLL_LISTS), (snapshot) => {
        const items: PackingList[] = [];
        snapshot.forEach(doc => items.push(doc.data() as PackingList));
        setPackingLists(items);
    }, (error) => {
        console.error("Lists Sync Error:", error);
    });

    // 4. Master Checklist Listener
    const unsubChecklist = onSnapshot(doc(db, COLL_CHECKLIST_CONFIG, 'master'), (docSnap) => {
        if (docSnap.exists()) {
            setMasterChecklist(docSnap.data().categories as ChecklistCategory[]);
        } else {
            console.log("Seeding Master Checklist...");
            setDoc(doc(db, COLL_CHECKLIST_CONFIG, 'master'), { categories: INITIAL_MASTER_CHECKLIST });
            setMasterChecklist(INITIAL_MASTER_CHECKLIST);
        }
        setLoading(false);
    }, (error) => {
         console.error("Checklist Sync Error:", error);
         setLoading(false);
    });

    return () => {
        unsubInventory();
        unsubKits();
        unsubLists();
        unsubChecklist();
    };
  }, []);

  // Update localStorage when activeListId changes
  useEffect(() => {
      if (activeListId) localStorage.setItem('cuepack_active_list_id', activeListId);
  }, [activeListId]);

  // Derived active list
  const activeList = useMemo(() => 
    packingLists.find(l => l.id === activeListId), 
  [packingLists, activeListId]);


  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'inventory', label: 'Inventario', icon: Layers },
    { id: 'kits', label: 'Kit Materiale', icon: Package },
    { id: 'lists', label: 'Crea Liste', icon: ClipboardList },
  ];

  const handleLogout = () => {
      signOut(auth).catch(err => console.error("Logout error", err));
  };

  if (loading) {
      return (
          <div className="h-screen bg-slate-950 flex items-center justify-center text-slate-400 flex-col gap-4">
              <Loader2 className="animate-spin" size={48} />
              <p>Connessione al database in corso...</p>
              <p className="text-xs text-slate-600">Assicurati di aver configurato le chiavi Firebase.</p>
          </div>
      );
  }

  if (dbError) {
      return (
          <div className="h-screen bg-slate-950 flex items-center justify-center text-rose-500 flex-col gap-4">
              <WifiOff size={48} />
              <p className="font-bold text-xl">{dbError}</p>
              <p className="text-slate-400">Controlla la tua connessione internet o la configurazione .env</p>
          </div>
      );
  }

  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return <HomeView 
            inventory={inventory}
            kits={kits} 
            lists={packingLists} 
            setActiveListId={setActiveListId}
            onNavigateToChecklist={() => setCurrentView('checklist-manager')}
        />;
      case 'inventory':
        return <InventoryView 
            items={inventory} 
            packingLists={packingLists}
        />;
      case 'kits':
        return <KitsView 
            kits={kits} 
            inventory={inventory} 
        />;
      case 'lists':
        return <PackingListBuilder 
          inventory={inventory} 
          kits={kits} 
          lists={packingLists}
          activeListId={activeListId}
          setActiveListId={setActiveListId}
        />;
      case 'checklist-manager':
        return <ChecklistManager 
          checklist={masterChecklist}
          onBack={() => setCurrentView('home')}
        />;
      default:
        return <div>Seleziona una voce dal menu</div>;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-72 flex-col bg-slate-900 border-r border-slate-800 shrink-0">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center font-bold text-white">C</div>
             <h1 className="text-xl font-bold tracking-tight">CuePack</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">Cloud Rental Management</p>
        </div>
        
        {/* Navigation Menu */}
        <nav className="p-4 space-y-2 shrink-0">
          {navItems.map(item => {
             const Icon = item.icon;
             return (
               <button
                 key={item.id}
                 onClick={() => setCurrentView(item.id as View)}
                 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                   ${currentView === item.id 
                     ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                     : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
               >
                 <Icon size={20} />
                 <span className="font-medium">{item.label}</span>
               </button>
             )
          })}
        </nav>

        {/* CHECKLIST WIDGET (Scrollable Area) */}
        {activeList && (
            <div className="flex-1 overflow-hidden flex flex-col border-t border-slate-800 bg-slate-950/30">
                <div className="p-3 bg-slate-900/50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 flex justify-between items-center">
                    <span>Checklist: {activeList.eventName.substring(0, 12)}{activeList.eventName.length > 12 ? '...' : ''}</span>
                    <span className="bg-slate-800 px-1.5 rounded text-slate-400">
                        {activeList.checklistCheckedItems?.length || 0} OK
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                    <ChecklistView 
                        activeList={activeList}
                        checklist={masterChecklist}
                    />
                </div>
            </div>
        )}
        {!activeList && (
            <div className="flex-1 border-t border-slate-800 bg-slate-950/30 flex items-center justify-center text-slate-500 text-xs p-4 text-center">
                Seleziona un evento per vedere la Checklist
            </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-600 shrink-0 bg-slate-900 flex justify-between items-center">
           <div className="flex flex-col gap-1">
              <span>© R. Chiartano</span>
              <span className="opacity-50">v0.4.2 (Secured)</span>
           </div>
           <button onClick={handleLogout} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-rose-500 rounded transition-colors" title="Esci">
             <LogOut size={16} />
           </button>
        </div>
      </aside>

      {/* Mobile Header & Menu Overlay */}
      <div className={`fixed inset-0 z-50 bg-slate-900 md:hidden transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
         <div className="flex justify-between items-center p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold">Menu</h1>
            <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400"><Menu /></button>
         </div>
         <nav className="p-6 space-y-4">
            {navItems.map(item => (
                <button
                    key={item.id}
                    onClick={() => { setCurrentView(item.id as View); setIsMobileMenuOpen(false); }}
                    className={`w-full text-left px-4 py-3 rounded-lg text-lg font-medium ${currentView === item.id ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                >
                    {item.label}
                </button>
            ))}
            <div className="pt-8 border-t border-slate-800">
                <button onClick={handleLogout} className="w-full text-left px-4 py-3 rounded-lg text-lg font-medium text-rose-500 hover:bg-slate-800 flex items-center gap-2">
                    <LogOut size={20} /> Esci
                </button>
            </div>
         </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
            <div className="font-bold text-lg">CuePack</div>
            <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-300"><Menu /></button>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-hidden bg-slate-950 relative">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}