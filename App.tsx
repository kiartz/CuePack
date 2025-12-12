import React, { useState, useEffect } from 'react';
import { Layers, Package, ClipboardList, Menu, Home } from 'lucide-react';
import { InventoryView } from './components/InventoryView';
import { KitsView } from './components/KitsView';
import { PackingListBuilder } from './components/PackingListBuilder';
import { HomeView } from './components/HomeView';
import { ChecklistView } from './components/ChecklistView'; // Now functions as the Sidebar Widget
import { INITIAL_INVENTORY, INITIAL_KITS } from './constants';
import { InventoryItem, Kit, PackingList } from './types';

type View = 'home' | 'inventory' | 'kits' | 'lists';

// Custom Hook for LocalStorage Persistence
function useStickyState<T>(defaultValue: T, key: string): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, value]);

  return [value, setValue];
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  
  // Global State with Persistence
  const [inventory, setInventory] = useStickyState<InventoryItem[]>(INITIAL_INVENTORY, 'cuepack_inventory');
  const [kits, setKits] = useStickyState<Kit[]>(INITIAL_KITS, 'cuepack_kits');
  
  // State for multiple Packing Lists (Events) with Persistence
  const [packingLists, setPackingLists] = useStickyState<PackingList[]>([
    {
      id: 'default-1',
      eventName: 'Nuovo Evento',
      eventDate: '',
      location: '',
      creationDate: new Date().toISOString(),
      sections: [
        { id: '1', name: 'Audio', components: [] },
        { id: '2', name: 'Luci', components: [] },
        { id: '3', name: 'Video', components: [] },
        { id: '4', name: 'Regia', components: [] },
      ],
      notes: ''
    }
  ], 'cuepack_lists');

  // Lifted state for the active list with Persistence
  const [activeListId, setActiveListId] = useStickyState<string>('default-1', 'cuepack_active_list_id');
  
  // --- CHECKLIST STATE ---
  // Default to empty array [] so everything is disabled initially
  const [checklistEnabledSectors, setChecklistEnabledSectors] = useStickyState<string[]>([], 'cuepack_checklist_sectors');
  const [checklistCheckedItems, setChecklistCheckedItems] = useStickyState<string[]>([], 'cuepack_checklist_checked');

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- ONE-TIME MERGE LOGIC ---
  useEffect(() => {
    const missingItems = INITIAL_INVENTORY.filter(
      initItem => !inventory.some(savedItem => savedItem.id === initItem.id)
    );

    if (missingItems.length > 0) {
      console.log("Merging new items from update:", missingItems.map(i => i.name));
      setInventory(prev => [...prev, ...missingItems]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'inventory', label: 'Inventario', icon: Layers },
    { id: 'kits', label: 'Kit Materiale', icon: Package },
    { id: 'lists', label: 'Crea Liste', icon: ClipboardList },
  ];

  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return <HomeView 
            inventory={inventory}
            setInventory={setInventory}
            kits={kits} 
            setKits={setKits}
            lists={packingLists} 
            setLists={setPackingLists} 
            setActiveListId={setActiveListId}
        />;
      case 'inventory':
        return <InventoryView 
            items={inventory} 
            setItems={setInventory} 
            lists={packingLists}
            setLists={setPackingLists}
            kits={kits}
            setKits={setKits}
        />;
      case 'kits':
        return <KitsView kits={kits} setKits={setKits} inventory={inventory} setInventory={setInventory} />;
      case 'lists':
        return <PackingListBuilder 
          inventory={inventory} 
          setInventory={setInventory} 
          kits={kits} 
          lists={packingLists}
          setLists={setPackingLists}
          activeListId={activeListId}
          setActiveListId={setActiveListId}
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
          <p className="text-xs text-slate-500 mt-1">Rental Management</p>
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
        <div className="flex-1 overflow-hidden flex flex-col border-t border-slate-800 bg-slate-950/30">
             <div className="p-3 bg-slate-900/50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 flex justify-between items-center">
                 <span>Checklist Carico</span>
                 <span className="bg-slate-800 px-1.5 rounded text-slate-400">{checklistCheckedItems.length} OK</span>
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                 <ChecklistView 
                    enabledSectors={checklistEnabledSectors}
                    setEnabledSectors={setChecklistEnabledSectors}
                    checkedItems={checklistCheckedItems}
                    setCheckedItems={setChecklistCheckedItems}
                 />
             </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-600 text-center flex flex-col gap-1 shrink-0 bg-slate-900">
           <span>© Roberto Chiartano</span>
           <span className="opacity-50">v0.3.0</span>
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