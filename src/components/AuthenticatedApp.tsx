import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { Layers, Package, ClipboardList, Menu, X, Home, Loader2, WifiOff, LogOut, Truck, Rocket, Copy, Blocks, ChevronDown, ChevronRight, Calendar, Users, Building, Wrench, Zap, Monitor, Map } from 'lucide-react';
import { InventoryView } from './InventoryView';
import { KitsView } from './KitsView';
import { TemplatesView } from './TemplatesView';
import { PackingListBuilder } from './PackingListBuilder';
import { HomeView } from './HomeView';
import { ChecklistView } from './ChecklistView';
import { ChecklistManager } from './ChecklistManager';
import { PrepMaterialView } from './PrepMaterialView';
import { CalendarView } from './CalendarView';
import { INITIAL_INVENTORY, INITIAL_KITS, MASTER_CHECKLIST as INITIAL_MASTER_CHECKLIST } from '../constants';
import { InventoryItem, Kit, Template, PackingList, ChecklistCategory } from '../types';
import { db, auth, COLL_INVENTORY, COLL_KITS, COLL_TEMPLATES, COLL_LISTS, COLL_CHECKLIST_CONFIG, batchWriteItems, addOrUpdateItem } from '../firebase';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

type View = 'home' | 'calendar' | 'inventory' | 'kits' | 'templates' | 'lists' | 'checklist-manager' | 'prep-material' | 'logistica-personale' | 'logistica-mezzi' | 'logistica-hotel' | 'utility-calcolo-elettrico' | 'utility-pixelmap' | 'utility-calcolo-ledwall' | 'utility-calcolo-stripled';

export default function AuthenticatedApp() {
  const [currentView, setCurrentView] = useState<View>('home');
  
  // --- REAL-TIME DATA STATE ---
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  
  // Desktop sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Auto-collapse sidebar when in builder
  useEffect(() => {
    if (currentView === 'lists' && activeListId) {
      setIsSidebarCollapsed(true);
    }
  }, [currentView, activeListId]);
  
  // State for cross-view navigation (e.g. duplicate from archive)
  const [listToOpenInBuilderId, setListToOpenInBuilderId] = useState<string | null>(null);
  const [listToAutoEditId, setListToAutoEditId] = useState<string | null>(null);

  // --- NEW PROJECT FROM ARCHIVE STATE ---
  const [isNewProjectFromArchiveOpen, setIsNewProjectFromArchiveOpen] = useState(false);
  const [listToCopyAsModel, setListToCopyAsModel] = useState<PackingList | null>(null);

  // --- FIRESTORE SUBSCRIPTIONS --- 
  const hasAttemptedSeeding = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    setLoading(true);

    // 1. Inventory Listener
    const unsubInventory = onSnapshot(collection(db, COLL_INVENTORY), (snapshot) => {
        const items: InventoryItem[] = [];
        snapshot.forEach(doc => items.push(doc.data() as InventoryItem));
        setInventory(items);
        
        // SEEDING: If DB is empty, load initial data (only once)
        if (snapshot.empty && !snapshot.metadata.fromCache && !hasAttemptedSeeding.current[COLL_INVENTORY]) {
             console.log("Seeding Database with Initial Inventory...");
             hasAttemptedSeeding.current[COLL_INVENTORY] = true;
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

        if (snapshot.empty && !snapshot.metadata.fromCache && !hasAttemptedSeeding.current[COLL_KITS]) {
             console.log("Seeding Database with Initial Kits...");
             hasAttemptedSeeding.current[COLL_KITS] = true;
             batchWriteItems(COLL_KITS, INITIAL_KITS);
        }
    }, (error) => console.error("Kits Sync Error:", error));

    // 2.5 Templates Listener
    const unsubTemplates = onSnapshot(collection(db, COLL_TEMPLATES), (snapshot) => {
        const items: Template[] = [];
        snapshot.forEach(doc => items.push(doc.data() as Template));
        setTemplates(items);
    }, (error) => console.error("Templates Sync Error:", error));

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
        unsubTemplates();
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
    { id: 'calendar', label: 'Calendario', icon: Calendar },
    { 
       id: 'inventory-group', 
       label: 'Inventario', 
       icon: Layers, 
       isGroup: true,
       subItems: [
           { id: 'inventory', label: 'Materiale', icon: Layers },
           { id: 'kits', label: 'Kit', icon: Package },
           { id: 'templates', label: 'Template', icon: Blocks }
       ]
    },
    { id: 'lists', label: 'Eventi', icon: ClipboardList },
    { id: 'prep-material', label: 'Preparazione Eventi', icon: Truck },
    { 
       id: 'logistica-group', 
       label: 'Logistica', 
       icon: Truck, 
       isGroup: true,
       subItems: [
           { id: 'logistica-personale', label: 'Personale', icon: Users },
           { id: 'logistica-mezzi', label: 'Mezzi', icon: Truck },
           { id: 'logistica-hotel', label: 'Hotel', icon: Building }
       ]
    },
    { 
       id: 'utility-group', 
       label: 'Utility', 
       icon: Wrench, 
       isGroup: true,
       subItems: [
           { id: 'utility-calcolo-elettrico', label: 'Calcolo Elettrico', icon: Zap },
           { id: 'utility-pixelmap', label: 'Pixelmap', icon: Map },
           { id: 'utility-calcolo-ledwall', label: 'Calcolo Ledwall', icon: Monitor },
           { id: 'utility-calcolo-stripled', label: 'Calcolo Stripled', icon: Zap }
       ]
    },
  ];

  const handleLogout = () => {
      signOut(auth).catch(err => console.error("Logout error", err));
  };

  // --- HANDLERS FOR NEW MISSION (ARCHIVE) ---
  const handleOpenNewProjectModal = (list: PackingList) => {
      setListToCopyAsModel(list);
      setIsNewProjectFromArchiveOpen(true);
  };

  const handleLaunchProject = async () => {
      if (!listToCopyAsModel) return;

      const sourceList = listToCopyAsModel;
      const sourceZones = sourceList.zones && sourceList.zones.length > 0 
        ? sourceList.zones 
        : [{ id: 'def', name: 'Zona Principale', sections: sourceList.sections || [] }];

      const newList: PackingList = {
        id: generateId(),
        eventName: `${sourceList.eventName || ''} (Copia)`,
        eventDate: sourceList.eventDate || '',
        setupDate: sourceList.setupDate || '',
        location: sourceList.location || '',
        customer: sourceList.customer || '',
        description: sourceList.description || '',
        notes: sourceList.notes || '',
        creationDate: new Date().toISOString(),
        
        // --- SANITIZATION & RESET ---
        isArchived: false,
        version: '0.1',
        isCompleted: false,
        isDraftVisible: false,
        snapshot: [],
        deletedItems: [],
        completedAt: '', 
        checklistCheckedItems: [], 
        checklistEnabledSectors: sourceList.checklistEnabledSectors || [],
        reminders: sourceList.reminders || [],

        zones: sourceZones.map(z => ({
            id: generateId(),
            name: z.name || '',
            sections: (z.sections || []).map(s => ({
                id: generateId(),
                name: s.name || '',
                components: (s.components || []).map(c => ({ 
                    uniqueId: generateId(),
                    type: c.type,
                    referenceId: c.referenceId,
                    name: c.name || '',
                    quantity: c.quantity || 0,
                    category: c.category || '',
                    notes: c.notes || '',
                    isTemporary: c.isTemporary || false,
                    warehouseState: { 
                        inDistinta: false, 
                        loaded: false, 
                        returned: false, 
                        isBroken: false, 
                        warehouseNote: '' 
                    },
                    contents: c.contents?.map(sub => ({
                        itemId: sub.itemId,
                        name: sub.name || '',
                        quantity: sub.quantity || 0,
                        category: sub.category || '',
                        warehouseState: { 
                            inDistinta: false, 
                            loaded: false, 
                            returned: false, 
                            isBroken: false, 
                            warehouseNote: '' 
                        },
                        prepNote: sub.prepNote || ''
                    })) || []
                }))
            }))
        }))
      };

      await addOrUpdateItem(COLL_LISTS, newList);
      
      // Navigate and open edit
      setActiveListId(newList.id);
      setListToAutoEditId(newList.id);
      setCurrentView('lists');
      
      // Cleanup
      setIsNewProjectFromArchiveOpen(false);
      setListToCopyAsModel(null);
  };

  if (loading) {
      return (
          <div className="h-screen h-[100dvh] bg-slate-950 flex items-center justify-center text-slate-400 flex-col gap-4">
              <Loader2 className="animate-spin" size={48} />
              <p>Connessione al database in corso...</p>
              <p className="text-xs text-slate-600">Assicurati di aver configurato le chiavi Firebase.</p>
          </div>
      );
  }

  if (dbError) {
      return (
          <div className="h-screen h-[100dvh] bg-slate-950 flex items-center justify-center text-rose-500 flex-col gap-4">
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
      case 'templates':
        return <TemplatesView 
            templates={templates} 
            inventory={inventory} 
            kits={kits} 
            lists={packingLists}
        />;
      case 'calendar':
        return <CalendarView 
            lists={packingLists}
            onOpenEvent={(id) => {
               setActiveListId(id);
               setCurrentView('lists');
            }}
        />;
      case 'lists':
        return <PackingListBuilder 
          inventory={inventory} 
          kits={kits} 
          templates={templates}
          lists={packingLists}
          masterChecklist={masterChecklist}
          activeListId={activeListId}
          setActiveListId={setActiveListId}
          listToOpenInBuilderId={listToOpenInBuilderId}
          onListOpenedInBuilder={() => setListToOpenInBuilderId(null)}
          listToAutoEditId={listToAutoEditId}
          onListAutoEdited={() => setListToAutoEditId(null)}
        />;
      case 'prep-material':
        return <PrepMaterialView 
            lists={packingLists} 
            onOpenTemplateModal={handleOpenNewProjectModal}
        />;
      case 'checklist-manager':
        return <ChecklistManager 
          checklist={masterChecklist}
          onBack={() => setCurrentView('home')}
        />;
      case 'logistica-personale':
      case 'logistica-mezzi':
      case 'logistica-hotel':
      case 'utility-calcolo-elettrico':
      case 'utility-pixelmap':
      case 'utility-calcolo-ledwall':
      case 'utility-calcolo-stripled':
        const title = navItems.flatMap(g => g.subItems || []).find(s => s.id === currentView)?.label || 'Pagina in costruzione';
        return (
             <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                 <Wrench size={48} className="opacity-20" />
                 <h2 className="text-xl font-bold">{title}</h2>
                 <p>Contenuto in arrivo...</p>
             </div>
        );
      default:
        return <div>Seleziona una voce dal menu</div>;
    }
  };

  return (
    <div className="flex h-screen h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
       {/* Sidebar (Desktop) */}
      <aside className={`hidden md:flex flex-col bg-slate-900 border-r border-slate-800 shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-72'}`}>
        {/* Header - NANO Compact */}
        <div className="p-2 px-3 border-b border-slate-800 shrink-0 bg-slate-950/50 flex items-center justify-between">
          {!isSidebarCollapsed && (
              <div className="flex items-center gap-1.5 overflow-hidden">
                 <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center font-bold text-white text-xs shrink-0">C</div>
                 <div className="flex flex-col min-w-0">
                     <h1 className="text-xs font-bold tracking-tight uppercase opacity-80 truncate">CuePack</h1>
                     <p className="text-[10px] text-slate-600 leading-none mt-0.5 truncate">Cloud Rental Management</p>
                 </div>
              </div>
          )}
          <button 
             onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
             className={`p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors ${isSidebarCollapsed ? 'mx-auto' : ''}`}
             title={isSidebarCollapsed ? "Espandi menu" : "Riduci menu"}
          >
             <Menu size={18} />
          </button>
        </div>
        
        {/* Navigation Menu */}
        <nav className={`p-4 space-y-2 shrink-0 flex-1 overflow-y-auto custom-scrollbar ${isSidebarCollapsed ? 'px-2' : ''}`}>
          {navItems.map(item => {
             if (item.isGroup) {
                 return (
                   <div key={item.id} className="w-full">
                     <button
                       onClick={() => {
                         if (isSidebarCollapsed) {
                           setIsSidebarCollapsed(false);
                           setOpenGroups(prev => ({ ...prev, [item.id]: true }));
                         } else {
                           setOpenGroups(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                         }
                       }}
                       className={`w-full flex items-center px-4 py-3 rounded-lg transition-all text-slate-400 hover:bg-slate-800 hover:text-white ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-between'}`}
                       title={isSidebarCollapsed ? item.label : undefined}
                     >
                       <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                         <item.icon size={20} />
                         {!isSidebarCollapsed && <span className="font-medium">{item.label}</span>}
                       </div>
                       {!isSidebarCollapsed && (openGroups[item.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                     </button>
                     {openGroups[item.id] && !isSidebarCollapsed && (
                       <div className="mt-1 ml-4 pl-4 border-l-2 border-slate-800 space-y-1">
                         {(item.subItems || []).map(sub => {
                           const SubIcon = sub.icon;
                           return (
                             <button
                               key={sub.id}
                               onClick={() => setCurrentView(sub.id as View)}
                               className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm
                                 ${currentView === sub.id 
                                   ? 'bg-blue-600/20 text-blue-400 font-bold' 
                                   : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
                             >
                               <SubIcon size={16} />
                               <span>{sub.label}</span>
                             </button>
                           )
                         })}
                       </div>
                     )}
                   </div>
                 )
             }

             const Icon = item.icon;
             return (
               <button
                 key={item.id}
                 onClick={() => setCurrentView(item.id as View)}
                 className={`w-full flex items-center px-4 py-3 rounded-lg transition-all ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3'}
                   ${currentView === item.id 
                     ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                     : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                 title={isSidebarCollapsed ? item.label : undefined}
               >
                 <Icon size={20} />
                 {!isSidebarCollapsed && <span className="font-medium">{item.label}</span>}
               </button>
             )
          })}
        </nav>

        {/* Footer */}
        <div className={`p-4 border-t border-slate-800 text-xs text-slate-600 shrink-0 bg-slate-900 flex items-center transition-all ${isSidebarCollapsed ? 'flex-col gap-3 justify-center' : 'justify-between'}`}>
           {!isSidebarCollapsed && (
               <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                  <span className="truncate">© R. Chiartano</span>
                  <span className="opacity-50 text-[10px] truncate">v0.5.3 (Skill Sync)</span>
               </div>
           )}
           <button onClick={handleLogout} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-rose-500 rounded transition-colors shrink-0" title="Esci">
             <LogOut size={16} />
           </button>
        </div>
      </aside>

      {/* Mobile Header & Menu Overlay */}
      <div className={`fixed inset-0 z-[60] bg-slate-900 md:hidden transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
         <div className="flex justify-between items-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] border-b border-slate-800">
            <h1 className="text-lg font-bold">Menu</h1>
            <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 p-1.5 hover:bg-slate-800 rounded-lg transition-colors"><X size={20} /></button>
         </div>
         <nav className="p-6 space-y-4 overflow-y-auto max-h-[calc(100dvh-5rem)] pb-24">
            {navItems.map(item => {
                if (item.isGroup) {
                     return (
                       <div key={item.id} className="w-full">
                         <button
                           onClick={() => setOpenGroups(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                           className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-lg font-medium text-slate-400 hover:bg-slate-800 transition-all`}
                         >
                           <span className="flex items-center gap-3"><item.icon size={20}/> {item.label}</span>
                           {openGroups[item.id] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                         </button>
                         {openGroups[item.id] && (
                           <div className="mt-2 ml-4 pl-4 border-l-2 border-slate-800 space-y-2">
                             {(item.subItems || []).map(sub => {
                               const SubIcon = sub.icon;
                               return (
                                 <button
                                   key={sub.id}
                                   onClick={() => { setCurrentView(sub.id as View); setIsMobileMenuOpen(false); }}
                                   className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium
                                     ${currentView === sub.id 
                                       ? 'bg-blue-600/20 text-blue-400' 
                                       : 'text-slate-400 hover:bg-slate-800/50'}`}
                                 >
                                   <SubIcon size={18} />
                                   <span>{sub.label}</span>
                                 </button>
                               )
                             })}
                           </div>
                         )}
                       </div>
                     )
                }
                
                return (
                    <button
                        key={item.id}
                        onClick={() => { setCurrentView(item.id as View); setIsMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-lg font-medium ${currentView === item.id ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                    >
                        <item.icon size={20} />
                        {item.label}
                    </button>
                )
            })}
            <div className="pt-8 border-t border-slate-800">
                <button onClick={handleLogout} className="w-full text-left px-4 py-3 rounded-lg text-lg font-medium text-rose-500 hover:bg-slate-800 flex items-center gap-2">
                    <LogOut size={20} /> Esci
                </button>
            </div>
            <div className="pt-8 text-center text-xs text-slate-600 uppercase tracking-[2px]">
                CuePack Manager ✨ v0.5.3
            </div>
         </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Mobile Header - COMPACT & SAFE */}
        <header className="md:hidden flex items-center justify-between px-4 bg-slate-900 border-b border-slate-800 shrink-0 z-50 h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
           <div className="flex items-center gap-2">
             <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center font-bold text-white text-xs shadow-lg ring-1 ring-white/20">C</div>
             <div className="flex flex-col leading-none">
                <h1 className="text-sm font-black tracking-tighter text-white uppercase">CuePack</h1>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Manager</span>
             </div>
           </div>
           <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg border border-slate-700 shadow-sm transition-all active:scale-95">
              <Menu size={20} />
           </button>
        </header>

        {/* View Content - Padded for Bottom Safe Area on mobile */}
        <div className="flex-1 overflow-hidden bg-slate-950 relative z-0 pb-[env(safe-area-inset-bottom)]">
          {renderContent()}
        </div>

        {/* --- DEDICATED NEW MISSION MODAL (ARCHIVE) --- */}
        {isNewProjectFromArchiveOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
                 <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-300 relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-600/20 blur-[80px] rounded-full" />
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/10 blur-[80px] rounded-full" />
                    
                    <div className="relative z-10">
                        <div className="bg-emerald-600/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-900/40">
                            <Rocket className="text-emerald-500" size={32} />
                        </div>
                        
                        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">🚀 Inizia Nuovo Progetto</h2>
                        <p className="text-slate-400 mb-8 leading-relaxed">
                            Stai usando l'archivio come base. Vuoi creare un nuovo evento attivo con questo materiale?
                        </p>
                        
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={handleLaunchProject}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all shadow-xl shadow-emerald-900/30 hover:shadow-emerald-900/50 flex items-center justify-center gap-3 transform active:scale-95"
                            >
                                <Rocket size={20} />
                                Lancia Progetto
                            </button>
                            <button 
                                onClick={() => { setIsNewProjectFromArchiveOpen(false); setListToCopyAsModel(null); }}
                                className="w-full bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white py-3 rounded-xl transition-all font-medium"
                            >
                                Annulla
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}
