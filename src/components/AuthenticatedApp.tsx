import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { Layers, Package, ClipboardList, ClipboardCheck, Menu, X, Home, Loader2, WifiOff, LogOut, Truck, Rocket, Copy, Blocks, ChevronDown, ChevronRight, Calendar, Users, Building, Wrench, Zap, Monitor, Map, Database, Sun, Moon } from 'lucide-react';
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
import { InventoryItem, Kit, Template, PackingList, ChecklistCategory, InventoryDatabase } from '../types';
import { 
  db, auth, COLL_INVENTORY, COLL_KITS, COLL_TEMPLATES, COLL_LISTS, COLL_CHECKLIST_CONFIG, COLL_CATEGORIES_CONFIG,
  COLL_CONNECTORS_CONFIG, COLL_DATABASES, DEFAULT_DATABASE_ID, getInventoryCollection, getKitsCollection, getTemplatesCollection, 
  batchWriteItems, addOrUpdateItem, cleanData 
} from '../firebase';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { getShareUrlParams } from '../utils/share';
import { useTheme } from '../context/ThemeContext';
import { DEFAULT_CATEGORY_DEFINITIONS, CategoryDefinition } from '../utils/categories';
import { DEFAULT_CONNECTORS, getConnectorDefinitions, STORAGE_KEY_CONNECTORS } from '../utils/connectors';
import { ElectricalConnectorDefinition } from '../types';
import { useNetworkStatus } from '../context/NetworkContext';

type View = 'home' | 'calendar' | 'inventory' | 'kits' | 'templates' | 'lists' | 'checklist-manager' | 'prep-material' | 'logistica-personale' | 'logistica-mezzi' | 'logistica-hotel' | 'utility-calcolo-elettrico' | 'utility-pixelmap' | 'utility-calcolo-ledwall' | 'utility-calcolo-stripled';

export default function AuthenticatedApp() {
  const { theme, toggleTheme } = useTheme();
  const { isOnline, wasOffline, isCollapsed } = useNetworkStatus();
  const isBannerActive = !isOnline || wasOffline;
  const [currentView, setCurrentView] = useState<View>('home');
  
  // --- MULTI-DATABASE STATE ---
  const [databases, setDatabases] = useState<InventoryDatabase[]>([]);
  const [activeDatabaseId, setActiveDatabaseId] = useState<string>(() => {
      return localStorage.getItem('cuepack_active_db_id') || DEFAULT_DATABASE_ID;
  });

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

  // Persist Active Database Selection
  useEffect(() => {
    if (activeDatabaseId) {
      localStorage.setItem('cuepack_active_db_id', activeDatabaseId);
    }
  }, [activeDatabaseId]);

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
  
  // State for cross-view navigation (e.g. duplicate from archive, deep linking)
  const [listToOpenInBuilderId, setListToOpenInBuilderId] = useState<string | null>(null);
  const [listToAutoEditId, setListToAutoEditId] = useState<string | null>(null);
  const [prepMaterialListToOpenId, setPrepMaterialListToOpenId] = useState<string | null>(null);
  const hasProcessedDeepLink = useRef(false);

  // --- DEEP LINKING EFFECT ---
  useEffect(() => {
    if (hasProcessedDeepLink.current) return;
    const shareParams = getShareUrlParams();
    if (shareParams && shareParams.listId) {
      hasProcessedDeepLink.current = true;
      const targetId = shareParams.listId;
      const targetView = shareParams.view === 'prep-material' ? 'prep-material' : 'lists';
      
      setActiveListId(targetId);
      setCurrentView(targetView);
      if (targetView === 'prep-material') {
        setPrepMaterialListToOpenId(targetId);
      }
    }
  }, []);

  // Sync Database when active list changes (e.g. via deep link)
  useEffect(() => {
    if (activeListId && packingLists.length > 0) {
      const targetList = packingLists.find(l => l.id === activeListId);
      if (targetList && targetList.databaseId && targetList.databaseId !== activeDatabaseId) {
        setActiveDatabaseId(targetList.databaseId);
      }
    }
  }, [activeListId, packingLists]);

  // --- NEW PROJECT FROM ARCHIVE STATE ---
  const [isNewProjectFromArchiveOpen, setIsNewProjectFromArchiveOpen] = useState(false);
  const [listToCopyAsModel, setListToCopyAsModel] = useState<PackingList | null>(null);

  // --- FIRESTORE SUBSCRIPTIONS --- 
  const hasAttemptedSeeding = useRef<{ [key: string]: boolean }>({});

  // 1. Databases Metadata Listener
  useEffect(() => {
    const unsubDatabases = onSnapshot(collection(db, COLL_DATABASES), (snapshot) => {
      const dbs: InventoryDatabase[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as InventoryDatabase;
        const normalizedCode = data.code || (data.id === DEFAULT_DATABASE_ID ? 'PRI' : (data.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'DB'));
        const normalizedColor = data.color || (data.id === DEFAULT_DATABASE_ID ? 'emerald' : 'blue');

        // Auto-update if code or color was missing (only if confirmed from server)
        if ((!data.code || !data.color) && !snapshot.metadata.fromCache) {
          addOrUpdateItem(COLL_DATABASES, {
            ...data,
            code: normalizedCode,
            color: normalizedColor
          });
        }

        dbs.push({
          ...data,
          code: normalizedCode,
          color: normalizedColor
        });
      });

      if (dbs.length === 0) {
        if (!snapshot.metadata.fromCache && !hasAttemptedSeeding.current[COLL_DATABASES]) {
          hasAttemptedSeeding.current[COLL_DATABASES] = true;
          const defaultDbObj: InventoryDatabase = {
            id: DEFAULT_DATABASE_ID,
            name: 'Database Principale',
            code: 'PRI',
            color: 'emerald',
            description: 'Database predefinito di produzione',
            isDefault: true,
            createdAt: new Date().toISOString()
          };
          addOrUpdateItem(COLL_DATABASES, defaultDbObj);
          setDatabases([defaultDbObj]);
        }
      } else {
        if (!dbs.some(d => d.id === DEFAULT_DATABASE_ID)) {
          if (!snapshot.metadata.fromCache && !hasAttemptedSeeding.current[`${COLL_DATABASES}_default`]) {
            hasAttemptedSeeding.current[`${COLL_DATABASES}_default`] = true;
            const defaultDbObj: InventoryDatabase = {
              id: DEFAULT_DATABASE_ID,
              name: 'Database Principale',
              code: 'PRI',
              color: 'emerald',
              description: 'Database predefinito di produzione',
              isDefault: !dbs.some(d => d.isDefault),
              createdAt: new Date().toISOString()
            };
            addOrUpdateItem(COLL_DATABASES, defaultDbObj);
            dbs.unshift(defaultDbObj);
          }
        }
        setDatabases(dbs);
      }
    }, (error) => {
      console.error("Databases Sync Error:", error);
    });

    return () => unsubDatabases();
  }, []);

  // 2. Unified Inventory, Kits, Templates Listeners
  useEffect(() => {
    // 2.1 Inventory Listener (Always listens to unified COLL_INVENTORY)
    const unsubInventory = onSnapshot(collection(db, COLL_INVENTORY), (snapshot) => {
        const items: InventoryItem[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as InventoryItem;
          items.push({
            ...data,
            id: docSnap.id,
            databaseId: data.databaseId || DEFAULT_DATABASE_ID
          });
        });
        setInventory(items);
        
        // SEEDING: only if completely empty
        if (snapshot.empty && !snapshot.metadata.fromCache && !hasAttemptedSeeding.current[COLL_INVENTORY]) {
             console.log("Seeding Database with Initial Inventory...");
             hasAttemptedSeeding.current[COLL_INVENTORY] = true;
             batchWriteItems(COLL_INVENTORY, INITIAL_INVENTORY.map(i => ({ ...i, databaseId: DEFAULT_DATABASE_ID })));
        }
    }, (error) => {
        console.error(`Inventory Sync Error:`, error);
        setDbError("Errore di connessione al Database.");
    });

    // 2.2 Kits Listener
    const unsubKits = onSnapshot(collection(db, COLL_KITS), (snapshot) => {
        const items: Kit[] = [];
        snapshot.forEach(docSnap => items.push(docSnap.data() as Kit));
        setKits(items);

        if (snapshot.empty && !snapshot.metadata.fromCache && !hasAttemptedSeeding.current[COLL_KITS]) {
             console.log("Seeding Database with Initial Kits...");
             hasAttemptedSeeding.current[COLL_KITS] = true;
             batchWriteItems(COLL_KITS, INITIAL_KITS);
        }
    }, (error) => console.error(`Kits Sync Error:`, error));

    // 2.3 Templates Listener
    const unsubTemplates = onSnapshot(collection(db, COLL_TEMPLATES), (snapshot) => {
        const items: Template[] = [];
        snapshot.forEach(docSnap => items.push(docSnap.data() as Template));
        setTemplates(items);
    }, (error) => console.error(`Templates Sync Error:`, error));

    return () => {
        unsubInventory();
        unsubKits();
        unsubTemplates();
    };
  }, []);

  // 3. Lists and Master Checklist (Global)
  useEffect(() => {
    setLoading(true);

    // Lists Listener
    const unsubLists = onSnapshot(collection(db, COLL_LISTS), (snapshot) => {
        const items: PackingList[] = [];
        snapshot.forEach(doc => items.push(doc.data() as PackingList));
        setPackingLists(items);
    }, (error) => {
        console.error("Lists Sync Error:", error);
    });

    // Master Checklist Listener
    const unsubChecklist = onSnapshot(doc(db, COLL_CHECKLIST_CONFIG, 'master'), (docSnap) => {
        if (docSnap.exists()) {
            setMasterChecklist(docSnap.data().categories as ChecklistCategory[]);
        } else if (!docSnap.metadata.fromCache && !hasAttemptedSeeding.current[COLL_CHECKLIST_CONFIG]) {
            hasAttemptedSeeding.current[COLL_CHECKLIST_CONFIG] = true;
            console.log("Seeding Master Checklist...");
            setDoc(doc(db, COLL_CHECKLIST_CONFIG, 'master'), { categories: INITIAL_MASTER_CHECKLIST });
            setMasterChecklist(INITIAL_MASTER_CHECKLIST);
        }
        setLoading(false);
    }, (error) => {
         console.error("Checklist Sync Error:", error);
         setLoading(false);
    });

    // Global Categories Sync Listener
    const unsubCategories = onSnapshot(doc(db, COLL_CATEGORIES_CONFIG, 'master'), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.definitions && Array.isArray(data.definitions)) {
                const remoteDefs = data.definitions as CategoryDefinition[];
                const merged: CategoryDefinition[] = [];
                for (const def of DEFAULT_CATEGORY_DEFINITIONS) {
                    const found = remoteDefs.find(c => c.name.toLowerCase() === def.name.toLowerCase());
                    if (found) {
                        const subSet = new Set(def.subcategories);
                        (found.subcategories || []).forEach(s => subSet.add(s));
                        merged.push({
                            id: def.id,
                            name: def.name,
                            isSystem: true,
                            subcategories: Array.from(subSet)
                        });
                    } else {
                        merged.push({ ...def, isSystem: true });
                    }
                }
                for (const c of remoteDefs) {
                    if (!DEFAULT_CATEGORY_DEFINITIONS.some(d => d.name.toLowerCase() === c.name.toLowerCase())) {
                        merged.push({ ...c, isSystem: false });
                    }
                }
                localStorage.setItem('cuepack_custom_categories_v2', JSON.stringify(merged));
                window.dispatchEvent(new CustomEvent('cuepack_categories_updated', { detail: merged }));
            }
        }
    }, (error) => {
        console.warn("Categories Sync Notice:", error);
    });

    // Global Connectors Sync Listener
    const unsubConnectors = onSnapshot(doc(db, COLL_CONNECTORS_CONFIG, 'master'), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.definitions && Array.isArray(data.definitions)) {
                const remoteDefs = data.definitions as ElectricalConnectorDefinition[];
                const merged: ElectricalConnectorDefinition[] = [];
                const processedIds = new Set<string>();

                // 1. Process items in the exact order saved remotely
                for (const item of remoteDefs) {
                    const defaultItem = DEFAULT_CONNECTORS.find(
                        d => d.id.toLowerCase() === (item.id || '').toLowerCase() || d.name.toLowerCase() === (item.name || '').toLowerCase()
                    );
                    if (defaultItem) {
                        processedIds.add(defaultItem.id);
                        merged.push({ ...defaultItem, isSystem: true });
                    } else if (item.name && item.name.trim()) {
                        processedIds.add(item.id || item.name);
                        merged.push({
                            id: item.id || `custom-${Date.now()}`,
                            name: item.name.trim(),
                            amperage: item.amperage || '16A',
                            phase: item.phase || 'monofase',
                            voltage: item.voltage || '230V',
                            isSystem: false
                        });
                    }
                }

                // 2. Add any default connectors that were not present
                for (const def of DEFAULT_CONNECTORS) {
                    if (!processedIds.has(def.id)) {
                        merged.push({ ...def, isSystem: true });
                    }
                }

                // 3. Keep any custom connectors from local storage that remote hasn't seen yet
                const localSaved = localStorage.getItem(STORAGE_KEY_CONNECTORS) || localStorage.getItem('cuepack_electrical_connectors_v1');
                let hasLocalAdditions = false;
                if (localSaved) {
                    try {
                        const localDefs = JSON.parse(localSaved);
                        if (Array.isArray(localDefs)) {
                            for (const loc of localDefs) {
                                if (!loc.isSystem && loc.name && !merged.some(m => m.name.toLowerCase() === loc.name.toLowerCase())) {
                                    merged.push({
                                        id: loc.id || `custom-${Date.now()}`,
                                        name: loc.name.trim(),
                                        amperage: loc.amperage || '16A',
                                        phase: loc.phase || 'monofase',
                                        voltage: loc.voltage || '230V',
                                        isSystem: false
                                    });
                                    hasLocalAdditions = true;
                                }
                            }
                        }
                    } catch (e) {}
                }

                localStorage.setItem(STORAGE_KEY_CONNECTORS, JSON.stringify(merged));
                window.dispatchEvent(new CustomEvent('cuepack_connectors_updated', { detail: merged }));

                // If local storage had custom items that Firestore lacked, sync them back
                if (hasLocalAdditions) {
                    setDoc(doc(db, COLL_CONNECTORS_CONFIG, 'master'), { definitions: cleanData(merged) }, { merge: true }).catch(err => {
                        console.error("Back-sync connectors to Firestore failed:", err);
                    });
                }
            }
        } else if (!docSnap.metadata.fromCache && !hasAttemptedSeeding.current[COLL_CONNECTORS_CONFIG]) {
            hasAttemptedSeeding.current[COLL_CONNECTORS_CONFIG] = true;
            // Seed Master Connectors document if it doesn't exist in Firestore yet
            console.log("Seeding Master Connectors to Firestore...");
            const initialDefs = getConnectorDefinitions();
            setDoc(doc(db, COLL_CONNECTORS_CONFIG, 'master'), { definitions: cleanData(initialDefs) });
        }
    }, (error) => {
        console.warn("Connectors Sync Notice:", error);
    });

    return () => {
        unsubLists();
        unsubChecklist();
        unsubCategories();
        unsubConnectors();
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
    { id: 'lists', label: 'Crea Eventi', icon: ClipboardList },
    { id: 'prep-material', label: 'Preparazione Eventi', icon: ClipboardCheck },
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

  if (loading && isOnline) {
      return (
          <div className="h-screen h-[100dvh] bg-slate-950 flex items-center justify-center text-slate-400 flex-col gap-4">
              <Loader2 className="animate-spin" size={48} />
              <p>Connessione al database in corso...</p>
              <p className="text-xs text-slate-600">Assicurati di aver configurato le chiavi Firebase.</p>
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
            databases={databases}
            activeDatabaseId={activeDatabaseId}
            setActiveDatabaseId={setActiveDatabaseId}
        />;
      case 'inventory':
        return <InventoryView 
            items={inventory} 
            packingLists={packingLists}
            kits={kits}
            activeDatabaseId={activeDatabaseId}
            databases={databases}
            setActiveDatabaseId={setActiveDatabaseId}
        />;
      case 'kits':
        return <KitsView 
            kits={kits} 
            inventory={inventory} 
            activeDatabaseId={activeDatabaseId}
            databases={databases}
        />;
      case 'templates':
        return <TemplatesView 
            templates={templates} 
            inventory={inventory} 
            kits={kits} 
            lists={packingLists}
            activeDatabaseId={activeDatabaseId}
            databases={databases}
        />;
      case 'calendar':
        return <CalendarView 
            lists={packingLists}
            databases={databases}
            activeDatabaseId={activeDatabaseId}
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
          databases={databases}
          activeDatabaseId={activeDatabaseId}
          setActiveDatabaseId={setActiveDatabaseId}
        />;
      case 'prep-material':
        return <PrepMaterialView 
            lists={packingLists} 
            inventory={inventory}
            databases={databases}
            onOpenTemplateModal={handleOpenNewProjectModal}
            initialListId={prepMaterialListToOpenId}
            onListOpened={() => setPrepMaterialListToOpenId(null)}
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
    <div className={`flex h-screen h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden font-sans transition-all duration-300 ${
      isBannerActive ? (isCollapsed ? 'pt-9' : 'pt-28 md:pt-16') : ''
    }`}>
      
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
        <div className="p-3 border-t border-slate-800 shrink-0 bg-slate-900 flex flex-col gap-2 transition-all">
           {/* Day / Night Theme Switch */}
           <div className="flex items-center justify-center gap-3 py-1">
              {!isSidebarCollapsed && <Moon size={15} className={theme === 'dark' ? 'text-blue-400 fill-blue-400/20' : 'text-slate-500'} />}
              <button
                type="button"
                onClick={toggleTheme}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${theme === 'dark' ? 'bg-slate-700' : 'bg-amber-400'}`}
                title={theme === 'dark' ? "Passa a Modalità Giorno" : "Passa a Modalità Notte"}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center ${theme === 'dark' ? 'translate-x-0' : 'translate-x-5'}`}
                >
                  {theme === 'dark' ? <Moon size={10} className="text-slate-900" /> : <Sun size={10} className="text-amber-600" />}
                </span>
              </button>
              {!isSidebarCollapsed && <Sun size={15} className={theme === 'light' ? 'text-amber-500 fill-amber-500/20' : 'text-slate-500'} />}
           </div>

           <div className={`flex items-center ${isSidebarCollapsed ? 'flex-col gap-2 justify-center' : 'justify-between'} text-xs text-slate-600`}>
              {!isSidebarCollapsed && (
                  <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                     <span className="truncate">© R. Chiartano</span>
                     <span className="opacity-50 text-[10px] truncate">v0.5.8.2</span>
                  </div>
              )}
              <button onClick={handleLogout} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-rose-500 rounded transition-colors shrink-0" title="Esci">
                <LogOut size={16} />
              </button>
           </div>
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
            
            {/* Mobile Theme Switcher */}
            <div className="pt-6 border-t border-slate-800 flex items-center justify-center gap-4 py-2">
                <Moon size={20} className={theme === 'dark' ? 'text-blue-400 fill-blue-400/20' : 'text-slate-500'} />
                <button
                    type="button"
                    onClick={toggleTheme}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${theme === 'dark' ? 'bg-slate-700' : 'bg-amber-400'}`}
                    title={theme === 'dark' ? "Passa a Modalità Giorno" : "Passa a Modalità Notte"}
                >
                    <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ease-in-out flex items-center justify-center ${theme === 'dark' ? 'translate-x-0' : 'translate-x-5'}`}
                    >
                        {theme === 'dark' ? <Moon size={12} className="text-slate-900" /> : <Sun size={12} className="text-amber-600" />}
                    </span>
                </button>
                <Sun size={20} className={theme === 'light' ? 'text-amber-500 fill-amber-500/20' : 'text-slate-500'} />
            </div>

            <div className="pt-4">
                <button onClick={handleLogout} className="w-full text-left px-4 py-3 rounded-lg text-lg font-medium text-rose-500 hover:bg-slate-800 flex items-center gap-2">
                    <LogOut size={20} /> Esci
                </button>
            </div>
            <div className="pt-6 text-center text-xs text-slate-600 uppercase tracking-[2px]">
                 CuePack Manager ✨ v0.5.8.2
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
