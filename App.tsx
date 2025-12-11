import React, { useState } from 'react';
import { Layers, Package, ClipboardList, Menu, Home } from 'lucide-react';
import { InventoryView } from './components/InventoryView';
import { KitsView } from './components/KitsView';
import { PackingListBuilder } from './components/PackingListBuilder';
import { HomeView } from './components/HomeView';
import { INITIAL_INVENTORY, INITIAL_KITS } from './constants';
import { InventoryItem, Kit, PackingList } from './types';

type View = 'home' | 'inventory' | 'kits' | 'lists';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  
  // Global State
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [kits, setKits] = useState<Kit[]>(INITIAL_KITS);
  
  // State for multiple Packing Lists (Events)
  const [packingLists, setPackingLists] = useState<PackingList[]>([
    {
      id: 'default-1',
      eventName: 'Nuovo Evento', // Default name
      eventDate: '',
      location: '',
      creationDate: new Date().toISOString(),
      notes: '',
      sections: [
        { id: '1', name: 'Audio', components: [] },
        { id: '2', name: 'Luci', components: [] },
        { id: '3', name: 'Video', components: [] },
        { id: '4', name: 'Regia', components: [] },
      ]
    }
  ]);

  // Lifted state for the active list to persist selection when switching views
  const [activeListId, setActiveListId] = useState<string>('default-1');
  
  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        return <InventoryView items={inventory} setItems={setInventory} />;
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
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 border-r border-slate-800">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center font-bold text-white">C</div>
             <h1 className="text-xl font-bold tracking-tight">CuePack</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">Rental Management</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
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

        <div className="p-4 border-t border-slate-800 text-xs text-slate-600 text-center flex flex-col gap-1">
           <span className="font-mono opacity-50">v0.1.0</span>
           <span>© By Roberto Chiartano</span>
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