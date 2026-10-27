import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, MapPin, CornerDownRight, Calendar, ArrowLeft, Truck, CheckSquare, Square, Check, MessageSquare, AlertTriangle, ChevronRight, ChevronDown, AlertOctagon, X, Save, AlertCircle, LayoutList, Layers, Archive, RefreshCcw, Copy, Rocket, Trash2, Share, Share2, FileText, ClipboardList, ClipboardCheck, FileDown, Database, Filter, WifiOff, Eye, ArrowLeftRight, History, RotateCcw, Info, Edit2, Minus, Calculator } from 'lucide-react';
import { PackingList, ListComponent, WarehouseState, ListZone, ListSection, InventoryItem, InventoryDatabase, Kit, ItemReplacementInfo } from '../types';
import { reconcileZones } from '../services/syncReconciler';
import { addOrUpdateItem, deleteItem, updateItemFields, COLL_LISTS, db, DEFAULT_DATABASE_ID } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Modal } from './Modal';
import { ConfirmationModal } from './ConfirmationModal';
import { ShareEventModal } from './ShareEventModal';
import { ItemReplacementModal, ReplacementItemDraft, AccessoryDraft } from './ItemReplacementModal';
import { ZoneEditModal } from './ZoneEditModal';
import { ZoneInfoModal } from './ZoneInfoModal';
import { EventSummaryModal } from './EventSummaryModal';
import { EventGlobalTotalsView } from './EventGlobalTotalsView';
import { exportPDF, exportTotalsPDF, exportCSV, exportSectionPDF } from '../utils/export';
import { useNetworkStatus } from '../context/NetworkContext';
import { isTextMatch } from '../utils/searchUtils';

// --- MERGE REMOTE WAREHOUSE STATES HELPER ---
const mergeWarehouseStates = (currentList: PackingList, incomingList: PackingList): PackingList => {
  if (!incomingList.zones) return incomingList;
  const incomingWsMap = new Map<string, { ws?: WarehouseState; contents?: any[]; templateContents?: any[] }>();

  incomingList.zones.forEach(z => {
    z.sections.forEach(s => {
      s.components.forEach(c => {
        incomingWsMap.set(c.uniqueId, {
          ws: c.warehouseState,
          contents: c.contents,
          templateContents: c.templateContents
        });
      });
    });
  });

  const mergedZones = (currentList.zones || []).map(z => ({
    ...z,
    sections: z.sections.map(s => ({
      ...s,
      components: s.components.map(c => {
        const inc = incomingWsMap.get(c.uniqueId);
        if (!inc) return c;

        let mergedContents = c.contents;
        if (c.contents && inc.contents) {
          mergedContents = c.contents.map((sub, idx) => {
            const incSub = inc.contents?.[idx];
            return {
              ...sub,
              warehouseState: incSub?.warehouseState || sub.warehouseState
            };
          });
        }

        let mergedTemplateContents = c.templateContents;
        if (c.templateContents && inc.templateContents) {
          mergedTemplateContents = c.templateContents.map((tc, idx) => {
            const incTc = inc.templateContents?.[idx];
            return {
              ...tc,
              warehouseState: incTc?.warehouseState || tc.warehouseState
            };
          });
        }

        return {
          ...c,
          warehouseState: inc.ws || c.warehouseState,
          contents: mergedContents,
          templateContents: mergedTemplateContents
        };
      })
    }))
  }));

  return {
    ...incomingList,
    zones: mergedZones
  };
};

interface PrepMaterialViewProps {
  lists: PackingList[];
  onDuplicateFromArchive?: (list: PackingList) => void;
  onOpenTemplateModal?: (list: PackingList) => void;
  initialListId?: string | null;
  onListOpened?: () => void;
  onEventActiveChange?: (isActive: boolean) => void;
  inventory?: InventoryItem[];
  kits?: Kit[];
  databases?: InventoryDatabase[];
}

// Helper to format version string cleanly with a single lowercase 'v' (e.g. 'v1.1')
export const formatVersionLabel = (ver?: string): string => {
  if (!ver) return '';
  const cleaned = ver.toString().trim().replace(/^[vV]+/, '');
  return `v${cleaned}`;
};

// Helper to format version string cleanly with a single uppercase 'V' (e.g. 'V1.1')
export const formatVersionUpper = (ver?: string): string => {
  if (!ver) return '';
  const cleaned = ver.toString().trim().replace(/^[vV]+/, '');
  return `V${cleaned}`;
};

export const PrepMaterialView: React.FC<PrepMaterialViewProps> = ({ 
    lists, 
    onDuplicateFromArchive,
    onOpenTemplateModal,
    initialListId,
    onListOpened,
    onEventActiveChange,
    inventory = [],
    kits = [],
    databases = []
}) => {
  const { isOnline } = useNetworkStatus();
  const [activeListId, setActiveListId] = useState<string | null>(null);

  useEffect(() => {
    onEventActiveChange?.(!!activeListId);
    return () => {
      onEventActiveChange?.(false);
    };
  }, [activeListId, onEventActiveChange]);

  const [searchTerm, setSearchTerm] = useState('');
  const [prepDatabaseFilter, setPrepDatabaseFilter] = useState<string>('All');
  const [prepCategoryFilter, setPrepCategoryFilter] = useState<string>('All');
  const [prepStatusFilter, setPrepStatusFilter] = useState<'all' | 'spuntati' | 'non_spuntati' | 'modifiche_magazzino' | 'aggiornati_non_preparati'>('all');
  const [isPrepFilterModalOpen, setIsPrepFilterModalOpen] = useState(false);

  const activePrepFiltersCount = useMemo(() => {
    let count = 0;
    if (prepDatabaseFilter !== 'All') count++;
    if (prepCategoryFilter !== 'All') count++;
    if (prepStatusFilter !== 'all') count++;
    return count;
  }, [prepDatabaseFilter, prepCategoryFilter, prepStatusFilter]);

  const handleResetPrepFilters = () => {
    setPrepDatabaseFilter('All');
    setPrepCategoryFilter('All');
    setPrepStatusFilter('all');
  };

  const effectiveDatabases = useMemo(() => {
    return (databases && databases.length > 0)
      ? databases
      : [{ id: DEFAULT_DATABASE_ID, name: 'Database Principale', code: 'PRI', color: 'emerald', isDefault: true }];
  }, [databases]);
  const [activeListAction, setActiveListAction] = useState<'archive' | 'restore' | 'delete' | 'duplicate' | null>(null);
  const [activeWarehouseMode, setActiveWarehouseMode] = useState<'visualizza' | 'distinta' | 'carico' | 'rientro' | null>(null);
  const [listToShare, setListToShare] = useState<PackingList | null>(null);

  // Optimistic real-time active list state
  const rawActiveList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);
  const [localList, setLocalList] = useState<PackingList | null>(null);
  const localListRef = useRef<PackingList | null>(null);
  const rawActiveListRef = useRef<PackingList | null>(null);
  const isWritingRef = useRef<boolean>(false);
  const pendingCommitRef = useRef<{ listId: string; zones: ListZone[] } | null>(null);
  const debounceTimerRef = useRef<any>(null);
  const [activeWarningTooltipId, setActiveWarningTooltipId] = useState<string | null>(null);
  const [warningTooltipAnchor, setWarningTooltipAnchor] = useState<DOMRect | null>(null);

  // Multi-user concurrency delta trackers for warehouse preparation
  const warehouseDeltasRef = useRef<Map<string, Partial<WarehouseState>>>(new Map());
  const contentWarehouseDeltasRef = useRef<Map<string, Map<number, Partial<WarehouseState>>>>(new Map());

  useEffect(() => {
    rawActiveListRef.current = rawActiveList || null;
  }, [rawActiveList]);

  // Close floating warning tooltip on scroll or resize
  useEffect(() => {
    if (!activeWarningTooltipId) return;
    const handleClose = () => {
      setActiveWarningTooltipId(null);
      setWarningTooltipAnchor(null);
    };
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [activeWarningTooltipId]);




  // Direct Firestore real-time listener for the active list document
  useEffect(() => {
    if (!activeListId) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingCommitRef.current) {
        const task = pendingCommitRef.current;
        pendingCommitRef.current = null;
        updateItemFields(COLL_LISTS, task.listId, { zones: task.zones }).catch(err => {
          console.error("Flush on exit failed:", err);
        });
      }
      setLocalList(null);
      localListRef.current = null;
      return;
    }

    // Populate initial state from cached lists if available
    const initial = lists.find(l => l.id === activeListId) || null;
    if (!localListRef.current || localListRef.current.id !== activeListId) {
      setLocalList(initial);
      localListRef.current = initial;
    }

    // Direct Firestore real-time listener for active list document
    const unsubDoc = onSnapshot(doc(db, COLL_LISTS, activeListId), (snapshot) => {
      if (!snapshot.exists()) return;
      const incomingData = { id: snapshot.id, ...snapshot.data() } as PackingList;

      // Reconcile incoming server data with local state using the Reconciler
      if (localListRef.current) {
        const mergedZones = reconcileZones(localListRef.current.zones || [], incomingData.zones || [], {
          warehouseDeltas: warehouseDeltasRef.current,
          contentWarehouseDeltas: contentWarehouseDeltasRef.current,
          sourceContext: 'warehouse'
        });
        const merged: PackingList = { ...incomingData, zones: mergedZones };
        localListRef.current = merged;
        setLocalList(merged);
      } else {
        localListRef.current = incomingData;
        setLocalList(incomingData);
      }
    }, (error) => {
      console.error("PrepMaterial doc onSnapshot error:", error);
    });

    return () => {
      unsubDoc();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingCommitRef.current) {
        const task = pendingCommitRef.current;
        pendingCommitRef.current = null;
        updateItemFields(COLL_LISTS, task.listId, { zones: task.zones }).catch(err => {
          console.error("Flush on unmount failed:", err);
        });
      }
    };
  }, [activeListId]);

  const activeList = localList || rawActiveList;

  const availablePrepCategories = useMemo(() => {
    const cats = new Set<string>();
    activeList?.zones?.forEach(z => {
      z.sections.forEach(s => {
        s.components.forEach(c => {
          if (c.category) cats.add(c.category);
          c.contents?.forEach(cc => { if (cc.category) cats.add(cc.category); });
        });
      });
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [activeList]);

  // Handle initial list from deep link
  useEffect(() => {
    if (initialListId) {
      setActiveListId(initialListId);
      const target = lists.find(l => l.id === initialListId);
      if (target?.zones?.[0]?.id) {
        setActiveZoneId(target.zones[0].id);
      }
      onListOpened?.();
    }
  }, [initialListId, lists]);
  
  // Detail View State
  const [activeZoneId, setActiveZoneId] = useState<string>('');
  const [draggedZoneId, setDraggedZoneId] = useState<string | null>(null);
  const [dragOverZoneId, setDragOverZoneId] = useState<string | null>(null);

  const handleZoneDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData('text/plain', id);
      setDraggedZoneId(id);
  };

  const handleZoneDragOver = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
      }
      if (dragOverZoneId !== id) {
          setDragOverZoneId(id);
      }
  };

  const handleZoneDragLeave = () => {
      setDragOverZoneId(null);
  };

  const handleZoneDragEnd = () => {
      setDraggedZoneId(null);
      setDragOverZoneId(null);
  };

  const handleZoneDrop = async (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain') || draggedZoneId;
      setDraggedZoneId(null);
      setDragOverZoneId(null);
      
      if (!sourceId || sourceId === targetId || !activeList || !activeList.zones) return;
      
      const newZones = [...activeList.zones];
      const sourceIndex = newZones.findIndex(z => z.id === sourceId);
      const targetIndex = newZones.findIndex(z => z.id === targetId);
      
      if (sourceIndex === -1 || targetIndex === -1) return;
      
      const [removed] = newZones.splice(sourceIndex, 1);
      newZones.splice(targetIndex, 0, removed);
      
      const updatedList = { ...activeList, zones: newZones };
      setLocalList(updatedList);
      localListRef.current = updatedList;
      await updateItemFields(COLL_LISTS, activeList.id, { zones: newZones });
  };

  const getZoneDragIndicatorClass = (currentZoneId: string) => {
      if (!draggedZoneId || dragOverZoneId !== currentZoneId || draggedZoneId === currentZoneId || !activeList?.zones) return '';
      
      const draggedIndex = activeList.zones.findIndex(z => z.id === draggedZoneId);
      const currentIndex = activeList.zones.findIndex(z => z.id === currentZoneId);
      
      if (draggedIndex === -1 || currentIndex === -1) return '';
      
      if (draggedIndex < currentIndex) {
          return 'border-r-4 border-r-blue-500 pr-1 transition-all';
      } else {
          return 'border-l-4 border-l-blue-500 pl-1 transition-all';
      }
  };
  const [zoneForEdit, setZoneForEdit] = useState<ListZone | null>(null);
  const [zoneForInfo, setZoneForInfo] = useState<ListZone | null>(null);
  const [summaryEvent, setSummaryEvent] = useState<PackingList | null>(null);
  const [viewMode, setViewMode] = useState<'zones' | 'totals' | 'global-totals'>('zones');
  const [exportList, setExportList] = useState<PackingList | null>(null);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);

  // Auto-revert 'global-totals' to 'zones' on small screens (mobile < 768px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && viewMode === 'global-totals') {
        setViewMode('zones');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);
  
  // Highlight State (Totals View)
  const [highlightedItemName, setHighlightedItemName] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  
  // Archive Confirmation Modal State
  const [archiveConfirm, setArchiveConfirm] = useState<{ isOpen: boolean, listId: string, listName: string, action: 'archive' | 'restore' }>({
      isOpen: false, listId: '', listName: '', action: 'archive'
  });

  // Delete Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean, listId: string, listName: string }>({
      isOpen: false, listId: '', listName: ''
  });

  // Helper to handle search/highlight clearing
  const handleSetHighlight = (name: string | null) => {
      setHighlightedItemName(name);
      if (name) {
          setItemSearch('');
      }
  };

  const handleSearchChange = (val: string) => {
      setItemSearch(val);
      if (val) setHighlightedItemName(null);
  };

  // Note Modal State
  const [noteModal, setNoteModal] = useState<{ isOpen: boolean, targets: { uniqueId?: string, parentId?: string, childIdx?: number }[], text: string }>({
      isOpen: false, targets: [], text: ''
  });

  // Broken/Issue Modal State
  const [brokenModal, setBrokenModal] = useState<{ isOpen: boolean, targets: { uniqueId?: string, parentId?: string, childIdx?: number }[], text: string }>({
      isOpen: false, targets: [], text: ''
  });

  // Replacement Modal State
  const [replacementModal, setReplacementModal] = useState<{
      isOpen: boolean;
      targetComponent: ListComponent | null;
      targetZoneName: string;
      targetSectionName: string;
      targetAccessoryIndex?: number | null;
  }>({
      isOpen: false,
      targetComponent: null,
      targetZoneName: '',
      targetSectionName: '',
      targetAccessoryIndex: null
  });

  // Replacement History Viewer Modal State
  const [replacementHistoryModal, setReplacementHistoryModal] = useState<{
      isOpen: boolean;
      component: ListComponent | null;
      accessoryName?: string;
      accessoryQty?: number;
      accessoryIndex?: number | null;
      zoneName?: string;
      sectionName?: string;
      info?: ItemReplacementInfo;
  }>({
      isOpen: false,
      component: null
  });

  // Issues Summary Modal
  const [issuesModalList, setIssuesModalList] = useState<PackingList | null>(null);

  const isReadOnly = (activeList 
      ? (parseFloat(activeList.version || '0') < 1 && !activeList.isCompleted) 
      : false) || activeWarehouseMode === 'visualizza';
  
  // --- HELPERS ---

  const getIssues = (list: PackingList) => {
      const issues: { component: ListComponent, zoneName: string, sectionName: string }[] = [];
      if (!list.zones) return issues;
      
      list.zones.forEach(z => {
          z.sections.forEach(s => {
              s.components.forEach(c => {
                  const processComp = (comp: ListComponent) => {
                      if (comp.warehouseState?.isBroken || comp.warehouseState?.warehouseNote) {
                          issues.push({ component: comp, zoneName: z.name, sectionName: s.name });
                      }
                      if (comp.contents) {
                          comp.contents.forEach(sub => {
                              if (sub.warehouseState?.isBroken || sub.warehouseState?.warehouseNote) {
                                  issues.push({ component: { ...comp, name: `${comp.name} > ${sub.name}` }, zoneName: z.name, sectionName: s.name });
                              }
                          });
                      }
                  };
                  
                  if (c.type === 'template' && c.templateContents) {
                      c.templateContents.forEach(processComp);
                  } else {
                      processComp(c);
                  }
              });
          });
      });
      return issues;
  };

  const isWsCheckedForCurrentMode = (ws?: WarehouseState): boolean => {
      if (!ws) return false;
      if (activeWarehouseMode === 'distinta') return Boolean(ws.inDistinta);
      if (activeWarehouseMode === 'carico') return Boolean(ws.loaded);
      if (activeWarehouseMode === 'rientro') return Boolean(ws.returned);
      return Boolean(ws.loaded || ws.inDistinta);
  };

  const isComponentUnresolved = (c: ListComponent): boolean => {
      if (c.type === 'template' && c.templateContents) {
          return c.templateContents.some(isComponentUnresolved);
      }
      
      const ws = c.warehouseState;
      // If no change log on component and no change log on any children, it's not unresolved
      const hasAnyChangeLog = Boolean(ws?.changeLog || c.contents?.some(sub => sub.warehouseState?.changeLog));
      if (!hasAnyChangeLog) return false;

      // Check main component (only if not a kit, as kits don't have main checkboxes anymore)
      const mainUnresolved = c.type !== 'kit' && Boolean(ws?.changeLog) && !isWsCheckedForCurrentMode(ws);
      
      // Check contents
      let contentsUnresolved = false;
      if (c.contents && c.contents.length > 0) {
          contentsUnresolved = !c.contents.every(sub => {
              const isZero = sub.replacementInfo && sub.quantity === 0;
              return isZero || isWsCheckedForCurrentMode(sub.warehouseState);
          });
      }

      if (c.type === 'kit') return contentsUnresolved;
      return mainUnresolved || contentsUnresolved;
  };

  const isComponentPartiallyOrFullyChecked = (c: ListComponent): boolean => {
      if (c.type === 'template' && c.templateContents) {
          return c.templateContents.some(isComponentPartiallyOrFullyChecked);
      }
      if (c.type === 'kit') {
          return Boolean(c.contents && c.contents.some(sub => isWsCheckedForCurrentMode(sub.warehouseState)));
      }
      if (isWsCheckedForCurrentMode(c.warehouseState)) return true;
      if (c.contents && c.contents.some(sub => isWsCheckedForCurrentMode(sub.warehouseState))) return true;
      return false;
  };

  const isComponentFullyChecked = (c: ListComponent): boolean => {
      if (c.type === 'template' && c.templateContents) {
          return c.templateContents.length > 0 && c.templateContents.every(isComponentFullyChecked);
      }
      if (c.type === 'kit') {
          return Boolean(c.contents && c.contents.length > 0 && c.contents.every(sub => {
              const isZero = sub.replacementInfo && sub.quantity === 0;
              return isZero || isWsCheckedForCurrentMode(sub.warehouseState);
          }));
      }
      const mainChecked = isWsCheckedForCurrentMode(c.warehouseState);
      if (c.contents && c.contents.length > 0) {
          return mainChecked && c.contents.every(sub => isWsCheckedForCurrentMode(sub.warehouseState));
      }
      return mainChecked;
  };

  const isComponentWarehouseModified = (c: ListComponent, isGrouped?: boolean, repChildren?: ListComponent[]): boolean => {
      if (c.replacementInfo) return true;
      if (isGrouped) return true;
      if (repChildren && repChildren.length > 0) return true;
      if (c.contents && c.contents.some(sub => sub.replacementInfo)) return true;
      if (c.type === 'template' && c.templateContents) {
          return c.templateContents.some(sub => isComponentWarehouseModified(sub));
      }
      return false;
  };

  const matchesPrepStatusFilter = (
      comp: ListComponent,
      isGroupedReplacement?: boolean,
      replacementChildren?: ListComponent[]
  ): boolean => {
      if (prepStatusFilter === 'all') return true;

      if (prepStatusFilter === 'spuntati') {
          if (isComponentPartiallyOrFullyChecked(comp)) return true;
          if (replacementChildren && replacementChildren.some(rc => isComponentPartiallyOrFullyChecked(rc))) return true;
          return false;
      }

      if (prepStatusFilter === 'non_spuntati') {
          if (!isComponentFullyChecked(comp)) return true;
          if (replacementChildren && replacementChildren.some(rc => !isComponentFullyChecked(rc))) return true;
          return false;
      }

      if (prepStatusFilter === 'modifiche_magazzino') {
          return isComponentWarehouseModified(comp, isGroupedReplacement, replacementChildren);
      }

      if (prepStatusFilter === 'aggiornati_non_preparati') {
          if (isComponentUnresolved(comp)) return true;
          if (replacementChildren && replacementChildren.some(rc => isComponentUnresolved(rc))) return true;
          return false;
      }

      return true;
  };

  const filteredLists = useMemo(() => {
    return lists
      .filter(l => l.isArchived === showArchived || (!showArchived && !l.isArchived))
      .filter(l => l.isCompleted || l.isDraftVisible || (l.version && l.isCompleted !== false && l.isDraftVisible !== false))
      .filter(l => !searchTerm.trim() || isTextMatch(`${l.eventName || ''} ${l.location || ''}`, searchTerm))
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [lists, searchTerm, showArchived]);
  
  const getComponentDatabaseId = (comp: { databaseId?: string; referenceId?: string }): string => {
    if (comp.databaseId) return comp.databaseId;
    if (comp.referenceId && inventory && inventory.length > 0) {
      const inv = inventory.find(i => i.id === comp.referenceId);
      if (inv?.databaseId) return inv.databaseId;
    }
    return DEFAULT_DATABASE_ID;
  };
  
  // --- AGGREGATION LOGIC FOR TOTALS VIEW ---
  const aggregatedData = useMemo(() => {
      if (!activeList || !activeList.zones) return null;
      
      const zoneMap = new Map<string, {
          complex: Map<string, any>,
          simple: Map<string, any>
      }>();

      activeList.zones.forEach(zone => {
          // Complex: Kits & Assemblies within this zone
          const complexItems = new Map<string, {
              name: string,
              totalQty: number,
              originalTotalQty: number, // Added for change tracking
              hasChanged: boolean,
              changeLog?: WarehouseState['changeLog'],
              inDistintaQty: number,
              loadedQty: number,
              returnedQty: number,
              hasNote: boolean,
              hasIssue: boolean,
                instances: { uniqueId: string, note?: string, isBroken?: boolean }[],
                aggregatedNotes: { qty: number, text: string }[],
                children: Map<string, { 
                    name: string,
                    totalQty: number, 
                    originalTotalQty: number,
                    hasChanged: boolean,
                    changeLog?: WarehouseState['changeLog'],
                    inDistintaQty: number,
                    loadedQty: number,
                    returnedQty: number,
                    hasNote: boolean,
                    hasIssue: boolean,
                    instances: { parentId: string, childIdx: number, note?: string, isBroken?: boolean }[],
                    aggregatedNotes: { qty: number, text: string }[]
                }>
          }>();

            const simpleItems = new Map<string, {
                name: string,
                isTemporary: boolean,
                totalQty: number,
                originalTotalQty: number,
                hasChanged: boolean,
                changeLog?: WarehouseState['changeLog'],
                inDistintaQty: number,
                loadedQty: number,
                returnedQty: number,
                hasNote: boolean,
                hasIssue: boolean,
                instances: { uniqueId: string, note?: string, isBroken?: boolean }[],
                aggregatedNotes: { qty: number, text: string }[]
            }>();

            const addAggregatedNote = (notesArr: { qty: number, text: string }[], qty: number, text?: string) => {
                if (!text) return;
                const existing = notesArr.find(n => n.text === text);
                if (existing) {
                    existing.qty += qty;
                } else {
                    notesArr.push({ qty, text });
                }
            };

            const mergeChangeLog = (
                existing: WarehouseState['changeLog'] | undefined,
                incoming: WarehouseState['changeLog'] | undefined,
                multiplier: number
            ): WarehouseState['changeLog'] | undefined => {
                if (!incoming) return existing;
                const scaledHistory = incoming.history?.map(h => ({
                    ...h,
                    quantity: h.quantity * multiplier
                }));
                if (!existing) {
                    return {
                        ...incoming,
                        previousQuantity: (incoming.previousQuantity ?? 0) * multiplier,
                        history: scaledHistory
                    };
                }
                const mergedHistory = existing.history ? [...existing.history] : [];
                if (scaledHistory) {
                    scaledHistory.forEach(sh => {
                        const match = mergedHistory.find(mh => mh.version.toUpperCase() === sh.version.toUpperCase());
                        if (match) {
                            match.quantity += sh.quantity;
                            match.wasChecked = Boolean(match.wasChecked || sh.wasChecked);
                            if (!match.updatedAt && sh.updatedAt) match.updatedAt = sh.updatedAt;
                        } else {
                            mergedHistory.push({ ...sh });
                        }
                    });
                }
                return {
                    ...existing,
                    previousQuantity: (existing.previousQuantity ?? 0) + (incoming.previousQuantity ?? 0) * multiplier,
                    changedAt: incoming.changedAt || existing.changedAt,
                    previousName: existing.previousName || incoming.previousName,
                    previousVersion: existing.previousVersion || incoming.previousVersion,
                    wasChecked: Boolean(existing.wasChecked || incoming.wasChecked),
                    history: mergedHistory.length > 0 ? mergedHistory : undefined
                };
            };

          zone.sections.forEach(section => {
              const processComp = (comp: ListComponent, multiplier: number) => {
                  if (prepDatabaseFilter !== 'All') {
                      const compDbId = getComponentDatabaseId(comp);
                      if (compDbId !== prepDatabaseFilter) return;
                  }
                  if (prepCategoryFilter !== 'All' && (comp.category || '').toLowerCase() !== prepCategoryFilter.toLowerCase()) return;
                  const ws = comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                  const isComplex = comp.type === 'kit' || (comp.contents && comp.contents.length > 0);
                  
                  // Calculate Original Quantity based on changeLog
                  const baseOriginalQty = ws.changeLog !== undefined ? ws.changeLog.previousQuantity : comp.quantity;
                  const finalQty = comp.quantity * multiplier;
                  const finalOrigQty = baseOriginalQty * multiplier;

                  if (isComplex) {
                      const displayName = comp.type === 'kit' ? `KIT-${comp.name}` : comp.name;
                      if (!complexItems.has(displayName)) {
                          complexItems.set(displayName, { 
                              name: comp.name,
                              totalQty: 0, originalTotalQty: 0, 
                              hasChanged: false, changeLog: undefined,
                              inDistintaQty: 0, loadedQty: 0, returnedQty: 0, 
                              hasNote: false, hasIssue: false,
                              instances: [], aggregatedNotes: [], children: new Map() 
                          });
                      }
                      const parent = complexItems.get(displayName)!;
                      parent.totalQty += finalQty;
                      parent.originalTotalQty += finalOrigQty;
                      if (ws.changeLog !== undefined) {
                          parent.hasChanged = true;
                          parent.changeLog = mergeChangeLog(parent.changeLog, ws.changeLog, multiplier);
                      }
                      
                      if (comp.type !== 'kit') {
                          if (ws.inDistinta) parent.inDistintaQty += finalQty;
                          if (ws.loaded) parent.loadedQty += finalQty;
                          if (ws.returned) parent.returnedQty += finalQty;
                      }
                      if (comp.notes || ws.warehouseNote) parent.hasNote = true;
                      if (ws.isBroken) parent.hasIssue = true;
                      parent.instances.push({ uniqueId: comp.uniqueId, note: ws.warehouseNote, isBroken: ws.isBroken });
                      
                      // Aggrego sia le note di produzione che quelle di magazzino
                      if (comp.notes) addAggregatedNote(parent.aggregatedNotes, finalQty, comp.notes);
                      if (ws.warehouseNote) addAggregatedNote(parent.aggregatedNotes, finalQty, ws.warehouseNote);

                      comp.contents?.forEach((sub, subIdx) => {
                          const subWs = sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                          if (!parent.children.has(sub.name)) {
                              parent.children.set(sub.name, { 
                                  name: sub.name,
                                  totalQty: 0, originalTotalQty: 0,
                                  hasChanged: false, changeLog: undefined,
                                  inDistintaQty: 0, loadedQty: 0, returnedQty: 0, 
                                  hasNote: false, hasIssue: false,
                                  instances: [], aggregatedNotes: [] 
                              });
                          }
                          const child = parent.children.get(sub.name)!;
                          const q = sub.quantity * finalQty;
                          const qOriginal = subWs.changeLog?.previousQuantity !== undefined
                              ? subWs.changeLog.previousQuantity * multiplier
                              : sub.quantity * finalOrigQty;
                          
                          child.totalQty += q;
                          child.originalTotalQty += qOriginal;
                          if (subWs.changeLog !== undefined || ws.changeLog !== undefined) {
                              child.hasChanged = true;
                              const fallbackChildLog = ws.changeLog ? {
                                  ...ws.changeLog,
                                  previousQuantity: ws.changeLog.previousQuantity * sub.quantity,
                                  history: ws.changeLog.history?.map(h => ({ ...h, quantity: h.quantity * sub.quantity }))
                              } : undefined;
                              child.changeLog = mergeChangeLog(child.changeLog, subWs.changeLog || fallbackChildLog, multiplier);
                          }
                          
                          if (subWs.inDistinta) child.inDistintaQty += q;
                          if (subWs.loaded) child.loadedQty += q;
                          if (subWs.returned) child.returnedQty += q;
                          if (sub.prepNote || subWs.warehouseNote) child.hasNote = true;
                          if (subWs.isBroken) child.hasIssue = true;
                          child.instances.push({ parentId: comp.uniqueId, childIdx: subIdx, note: subWs.warehouseNote, isBroken: subWs.isBroken });
                          
                          // Aggrego sia le note di produzione (prepNote) che quelle di magazzino
                          if (sub.prepNote) addAggregatedNote(child.aggregatedNotes, q, sub.prepNote);
                          if (subWs.warehouseNote) addAggregatedNote(child.aggregatedNotes, q, subWs.warehouseNote);
                      });

                  } else {
                      if (!simpleItems.has(comp.name)) {
                          simpleItems.set(comp.name, { 
                              name: comp.name,
                              isTemporary: !!comp.isTemporary,
                              totalQty: 0, originalTotalQty: 0,
                              hasChanged: false, changeLog: undefined,
                              inDistintaQty: 0, loadedQty: 0, returnedQty: 0, 
                              hasNote: false, hasIssue: false,
                              instances: [], aggregatedNotes: [] 
                          });
                      }
                      const item = simpleItems.get(comp.name)!;
                      item.totalQty += finalQty;
                      item.originalTotalQty += finalOrigQty;
                      if (ws.changeLog !== undefined) {
                          item.hasChanged = true;
                          item.changeLog = mergeChangeLog(item.changeLog, ws.changeLog, multiplier);
                      }
                      
                      if (ws.inDistinta) item.inDistintaQty += finalQty;
                      if (ws.loaded) item.loadedQty += finalQty;
                      if (ws.returned) item.returnedQty += finalQty;
                      if (comp.notes || ws.warehouseNote) item.hasNote = true;
                      if (ws.isBroken) item.hasIssue = true;
                      item.instances.push({ uniqueId: comp.uniqueId, note: ws.warehouseNote, isBroken: ws.isBroken });
                      
                      // Aggrego sia le note di produzione che quelle di magazzino
                      if (comp.notes) addAggregatedNote(item.aggregatedNotes, finalQty, comp.notes);
                      if (ws.warehouseNote) addAggregatedNote(item.aggregatedNotes, finalQty, ws.warehouseNote);
                  }
              };

              section.components.forEach(comp => {
                  if (comp.type === 'template' && comp.templateContents) {
                      comp.templateContents.forEach(tc => processComp(tc, comp.quantity));
                  } else {
                      processComp(comp, 1);
                  }
              });
          });
          
          zoneMap.set(zone.id, { complex: complexItems, simple: simpleItems });
      });

      return zoneMap;
  }, [activeList, prepDatabaseFilter, prepCategoryFilter, inventory]);

  // Calculate Stats for Highlighted Item in Active Zone (Depends on aggregatedData)
  const highlightStats = useMemo(() => {
      if (!highlightedItemName || !activeZoneId || !aggregatedData) return null;
      const zoneData = aggregatedData.get(activeZoneId);
      if (!zoneData) return null;

      let stats = { kit: 0, accessories: 0, loose: 0 };

      // 1. Check Simple (Loose)
      if (zoneData.simple.has(highlightedItemName)) {
          stats.loose += zoneData.simple.get(highlightedItemName).totalQty;
      }

      // 2. Check Complex (Kits & Machines)
      zoneData.complex.forEach((data, key) => {
          const isKitWrapper = key.startsWith('KIT-');

          // Check Parent
          if (data.name === highlightedItemName) {
              if (isKitWrapper) stats.kit += data.totalQty;
              else stats.loose += data.totalQty; // Machines count as main/loose items
          }

          // Check Children
          if (data.children.has(highlightedItemName)) {
              const qty = data.children.get(highlightedItemName).totalQty;
              if (isKitWrapper) stats.kit += qty;
              else stats.accessories += qty;
          }
      });

      return stats;
  }, [highlightedItemName, activeZoneId, aggregatedData]);


  // --- COMMIT ZONES UPDATE HELPER (Optimistic + Fast Queued Firestore sync with Reconciler) ---
  const processPendingCommit = async () => {
    if (!pendingCommitRef.current || isWritingRef.current) return;
    
    const task = pendingCommitRef.current;
    pendingCommitRef.current = null;
    isWritingRef.current = true;

    try {
      const currentRemoteZones = rawActiveListRef.current?.zones || [];
      const reconciled = reconcileZones(task.zones, currentRemoteZones, {
        warehouseDeltas: warehouseDeltasRef.current,
        contentWarehouseDeltas: contentWarehouseDeltasRef.current,
        sourceContext: 'warehouse'
      });
      await updateItemFields(COLL_LISTS, task.listId, { zones: reconciled });
      warehouseDeltasRef.current.clear();
      contentWarehouseDeltasRef.current.clear();
    } catch (err) {
      console.error("Failed to commit zones update to Firestore:", err);
      // Re-queue task if write failed so changes are not lost
      if (!pendingCommitRef.current) {
        pendingCommitRef.current = task;
      }
    } finally {
      isWritingRef.current = false;
      // If new writes were queued while this network request was in flight, process immediately
      if (pendingCommitRef.current) {
        processPendingCommit();
      }
    }
  };

  const commitZonesUpdate = (newZones: ListZone[]) => {
    if (!activeListId) return;
    const current = localListRef.current || activeList;
    if (!current) return;

    // 1. Immediate 0ms local optimistic UI update
    const updatedList = { ...current, zones: newZones };
    localListRef.current = updatedList;
    setLocalList(updatedList);

    // 2. Queue latest zones for Firestore commit
    pendingCommitRef.current = { listId: activeListId, zones: newZones };

    // 3. Debounce commit (150ms) to bundle fast successive taps/scans, saving database writes
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      processPendingCommit();
    }, 150);
  };

  // --- ACTIONS ---
  
  const updateComponentState = async (componentId: string, updates: Partial<WarehouseState>) => {
      const current = localListRef.current || activeList;
      if (isReadOnly || !current?.zones) return;

      warehouseDeltasRef.current.set(componentId, {
          ...(warehouseDeltasRef.current.get(componentId) || {}),
          ...updates
      });

      const newZones = current.zones.map(z => ({
          ...z,
          sections: z.sections.map(s => ({
              ...s,
              components: s.components.map(c => {
                  if (c.uniqueId === componentId) {
                      return {
                          ...c,
                          warehouseState: {
                              ...c.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                              ...updates
                          }
                      };
                  }
                  if (c.type === 'template' && c.templateContents) {
                      const found = c.templateContents.some(tc => tc.uniqueId === componentId);
                      if (found) {
                          return {
                              ...c,
                              templateContents: c.templateContents.map(tc => 
                                  tc.uniqueId === componentId 
                                      ? { ...tc, warehouseState: { ...tc.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }, ...updates } }
                                      : tc
                              )
                          };
                      }
                  }
                  return c;
              })
          }))
      }));

      await commitZonesUpdate(newZones);
  };

  // --- REPLACEMENT ACTION ---
  const handleApplyReplacement = async (payload: {
    targetComponentId: string;
    targetGroupId?: string;
    originalUniqueId?: string;
    accessoryIndex?: number | null;
    originalQuantityRemaining: number;
    newReplacements: ReplacementItemDraft[];
    updatedAccessories?: AccessoryDraft[];
    reason?: string;
  }) => {
    const current = localListRef.current || activeList;
    if (isReadOnly || !current?.zones) return;

    const {
      targetComponentId,
      accessoryIndex,
      originalQuantityRemaining,
      newReplacements,
      updatedAccessories,
      reason
    } = payload;

    const nowIso = new Date().toISOString();

    const newZones = current.zones.map(z => ({
      ...z,
      sections: z.sections.map(s => {
        const targetGroupId = payload.targetGroupId;
        const originalUniqueId = payload.originalUniqueId;
        const compIdx = s.components.findIndex(c => 
          c.uniqueId === targetComponentId || 
          (targetGroupId && c.replacementInfo?.replacementGroupId === targetGroupId) ||
          (originalUniqueId && c.uniqueId === originalUniqueId) ||
          (originalUniqueId && c.replacementInfo?.originalUniqueId === originalUniqueId)
        );
        if (compIdx === -1) {
          // Check inside templateContents if any
          return {
            ...s,
            components: s.components.map(c => {
              if (c.type === 'template' && c.templateContents) {
                const tcIdx = c.templateContents.findIndex(tc => tc.uniqueId === targetComponentId);
                if (tcIdx !== -1) {
                  const targetTc = c.templateContents[tcIdx];
                  // If replacing accessory of template child
                  if (accessoryIndex !== null && accessoryIndex !== undefined && accessoryIndex >= 0 && targetTc.contents) {
                    const originalSub = targetTc.contents[accessoryIndex];
                    const newContents = [...targetTc.contents];
                    const replacementGroupId = `repgrp-tc-acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                    const replacementInfo: ItemReplacementInfo = {
                      originalName: originalSub.name,
                      originalQuantity: originalSub.quantity,
                      originalType: 'item',
                      originalReferenceId: originalSub.itemId,
                      originalCategory: originalSub.category,
                      originalWarehouseState: originalSub.warehouseState,
                      replacementGroupId,
                      replacedQuantity: originalSub.quantity - Math.max(0, originalQuantityRemaining),
                      replacedAt: nowIso,
                      reason: reason || undefined
                    };

                    const createdAccs = newReplacements.map(r => ({
                      itemId: r.referenceId,
                      name: r.name,
                      quantity: r.quantity,
                      category: r.category,
                      warehouseState: { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                      replacementInfo
                    }));

                    if (originalQuantityRemaining <= 0) {
                      newContents.splice(accessoryIndex, 1, ...createdAccs);
                    } else {
                      newContents[accessoryIndex] = {
                        ...originalSub,
                        quantity: originalQuantityRemaining
                      };
                      newContents.splice(accessoryIndex + 1, 0, ...createdAccs);
                    }

                    const updatedTc = { ...targetTc, contents: newContents };
                    const newTcs = [...c.templateContents];
                    newTcs[tcIdx] = updatedTc;
                    return { ...c, templateContents: newTcs };
                  }
                }
              }
              return c;
            })
          };
        }

        const target = s.components[compIdx];

        // CASE A: REPLACING AN ACCESSORY OF THE COMPONENT
        if (accessoryIndex !== null && accessoryIndex !== undefined && accessoryIndex >= 0 && target.contents) {
          const originalSub = target.contents[accessoryIndex];
          const newContents = [...target.contents];
          const existingInfo = originalSub.replacementInfo;

          const trueOriginalName = existingInfo?.originalName || originalSub.name;
          const trueUnitQuantity = (existingInfo as any)?.originalUnitQuantity ?? originalSub.quantity;
          const trueOriginalQuantity = existingInfo?.originalQuantity ?? (originalSub.quantity * (target.quantity || 1));
          const trueOriginalReferenceId = existingInfo?.originalReferenceId || originalSub.itemId;
          const trueOriginalCategory = existingInfo?.originalCategory || originalSub.category;
          const trueOriginalWarehouseState = existingInfo?.originalWarehouseState || originalSub.warehouseState;
          const replacementGroupId = existingInfo?.replacementGroupId || `repgrp-acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

          const isFullyRestored = (originalQuantityRemaining >= trueOriginalQuantity) && newReplacements.length === 0;

          if (isFullyRestored) {
            const restoredAcc = {
              itemId: trueOriginalReferenceId,
              name: trueOriginalName,
              quantity: trueUnitQuantity,
              category: trueOriginalCategory,
              warehouseState: trueOriginalWarehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
              replacementInfo: undefined
            };

            const cleaned = newContents.filter((sub, idx) => {
              if (idx === accessoryIndex) return false;
              if (existingInfo?.replacementGroupId && sub.replacementInfo?.replacementGroupId === existingInfo.replacementGroupId) return false;
              return true;
            });

            cleaned.splice(Math.min(accessoryIndex, cleaned.length), 0, restoredAcc);
            const updatedComp: ListComponent = { ...target, contents: cleaned };
            const newComponents = [...s.components];
            newComponents[compIdx] = updatedComp;
            return { ...s, components: newComponents };
          }

          const replacementInfo: ItemReplacementInfo = {
            originalName: trueOriginalName,
            originalQuantity: trueOriginalQuantity,
            originalUnitQuantity: trueUnitQuantity,
            originalType: 'item',
            originalReferenceId: trueOriginalReferenceId,
            originalCategory: trueOriginalCategory,
            originalWarehouseState: trueOriginalWarehouseState,
            replacementGroupId,
            replacedQuantity: trueOriginalQuantity - Math.max(0, originalQuantityRemaining),
            originalRemainingQuantity: originalQuantityRemaining,
            replacements: newReplacements,
            replacedAt: nowIso,
            reason: reason || existingInfo?.reason || undefined
          };

          const createdAccs = newReplacements.map(r => ({
            itemId: r.referenceId,
            name: r.name,
            quantity: r.quantity,
            category: r.category,
            warehouseState: { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
            replacementInfo
          }));

          const itemsToInsertAcc: any[] = [];
          if (originalQuantityRemaining > 0) {
            itemsToInsertAcc.push({
              ...originalSub,
              quantity: originalQuantityRemaining,
              replacementInfo
            });
          } else {
            itemsToInsertAcc.push({
              ...originalSub,
              quantity: 0,
              replacementInfo
            });
          }
          itemsToInsertAcc.push(...createdAccs);

          const firstAccIdx = newContents.findIndex((sub, idx) => 
            idx === accessoryIndex ||
            (existingInfo?.replacementGroupId && sub.replacementInfo?.replacementGroupId === existingInfo.replacementGroupId)
          );
          const insertAt = firstAccIdx !== -1 ? firstAccIdx : accessoryIndex;

          const cleaned = newContents.filter((sub, idx) => {
            if (idx === accessoryIndex) return false;
            if (existingInfo?.replacementGroupId && sub.replacementInfo?.replacementGroupId === existingInfo.replacementGroupId) return false;
            return true;
          });

          cleaned.splice(Math.min(insertAt, cleaned.length), 0, ...itemsToInsertAcc);

          const updatedComp: ListComponent = {
            ...target,
            contents: cleaned
          };

          const newComponents = [...s.components];
          newComponents[compIdx] = updatedComp;
          return { ...s, components: newComponents };
        }

        // CASE B: REPLACING THE MAIN COMPONENT (Item or Kit)
        const existingInfo = target.replacementInfo;
        const trueOriginalName = existingInfo?.originalName || target.name;
        const trueOriginalQuantity = existingInfo?.originalQuantity ?? target.quantity;
        const trueOriginalType = existingInfo?.originalType || target.type;
        const trueOriginalReferenceId = existingInfo?.originalReferenceId || target.referenceId;
        const trueOriginalCategory = existingInfo?.originalCategory || target.category;
        const trueOriginalDatabaseId = existingInfo?.originalDatabaseId || target.databaseId;
        const trueOriginalContents = existingInfo?.originalContents || target.contents?.map(c => ({
          itemId: c.itemId,
          name: c.name,
          quantity: c.quantity,
          category: c.category,
          warehouseState: c.warehouseState
        }));
        const trueOriginalWarehouseState = existingInfo?.originalWarehouseState || target.warehouseState;
        const trueOriginalUniqueId = existingInfo?.originalUniqueId || target.uniqueId;
        const replacementGroupId = existingInfo?.replacementGroupId || targetGroupId || `repgrp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        const isFullyRestored = (originalQuantityRemaining >= trueOriginalQuantity) && newReplacements.length === 0;

        const firstGroupIdx = s.components.findIndex(c => 
          c.uniqueId === targetComponentId || 
          (replacementGroupId && c.replacementInfo?.replacementGroupId === replacementGroupId) ||
          c.uniqueId === trueOriginalUniqueId ||
          (originalUniqueId && c.uniqueId === originalUniqueId)
        );
        const insertAt = firstGroupIdx !== -1 ? firstGroupIdx : compIdx;

        if (isFullyRestored) {
          const restoredOriginal: ListComponent = {
            uniqueId: trueOriginalUniqueId,
            type: trueOriginalType,
            referenceId: trueOriginalReferenceId,
            name: trueOriginalName,
            quantity: trueOriginalQuantity,
            category: trueOriginalCategory,
            databaseId: trueOriginalDatabaseId,
            contents: trueOriginalContents?.map(sub => ({
              itemId: sub.itemId,
              name: sub.name,
              quantity: sub.quantity,
              category: sub.category,
              warehouseState: sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }
            })),
            warehouseState: trueOriginalWarehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
            replacementInfo: undefined
          };

          const remainingComponents = s.components.filter(c => {
            if (c.uniqueId === targetComponentId) return false;
            if (c.uniqueId === trueOriginalUniqueId) return false;
            if (originalUniqueId && c.uniqueId === originalUniqueId) return false;
            if (replacementGroupId && c.replacementInfo?.replacementGroupId === replacementGroupId) return false;
            return true;
          });

          remainingComponents.splice(Math.min(insertAt, remainingComponents.length), 0, restoredOriginal);
          return { ...s, components: remainingComponents };
        }

        const replacementInfo: ItemReplacementInfo = {
          originalName: trueOriginalName,
          originalQuantity: trueOriginalQuantity,
          originalType: trueOriginalType,
          originalReferenceId: trueOriginalReferenceId,
          originalCategory: trueOriginalCategory,
          originalDatabaseId: trueOriginalDatabaseId,
          originalContents: trueOriginalContents,
          originalWarehouseState: trueOriginalWarehouseState,
          originalUniqueId: trueOriginalUniqueId,
          replacementGroupId,
          replacedQuantity: trueOriginalQuantity - Math.max(0, originalQuantityRemaining),
          originalRemainingQuantity: originalQuantityRemaining,
          replacements: newReplacements,
          replacedAt: nowIso,
          reason: reason || existingInfo?.reason || undefined
        };

        const updatedOriginalAccessories = updatedAccessories
          ? updatedAccessories.map(a => ({
              itemId: a.itemId,
              name: a.name,
              quantity: a.quantity,
              category: a.category,
              warehouseState: target.contents?.[a.index]?.warehouseState
            })).filter(a => a.quantity > 0)
          : target.contents;

        // Creazione nuovi articoli sostitutivi con risoluzione accessori se definiti in anagrafica
        const createdComps: ListComponent[] = newReplacements.map((r, i) => {
          const invItem = r.type === 'item' ? inventory.find(inv => String(inv.id) === String(r.referenceId)) : null;
          const resolvedContents = (r.contents && r.contents.length > 0)
            ? r.contents
            : (invItem?.accessories || []).map(a => {
                const invSub = inventory.find(inv => String(inv.id) === String(a.itemId));
                return {
                  itemId: a.itemId,
                  name: invSub?.name || 'Accessorio',
                  quantity: a.quantity,
                  category: invSub?.category || 'Altro'
                };
              });

          return {
            uniqueId: `rep-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            type: r.type,
            referenceId: r.referenceId,
            name: r.name,
            quantity: r.quantity,
            category: r.category,
            databaseId: r.databaseId || trueOriginalDatabaseId || DEFAULT_DATABASE_ID,
            contents: resolvedContents.map(c => ({
              itemId: c.itemId,
              name: c.name,
              quantity: c.quantity,
              category: c.category,
              warehouseState: { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }
            })),
            warehouseState: { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
            replacementInfo
          };
        });

        const itemsToInsert: ListComponent[] = [];

        // Inseriamo SEMPRE il materiale originale nella card, anche a 0 pz se azzerato, preservando i suoi accessori originali
        itemsToInsert.push({
          uniqueId: trueOriginalUniqueId,
          type: trueOriginalType,
          referenceId: trueOriginalReferenceId,
          name: trueOriginalName,
          quantity: originalQuantityRemaining,
          category: trueOriginalCategory,
          databaseId: trueOriginalDatabaseId,
          contents: updatedOriginalAccessories || trueOriginalContents?.map(sub => ({
            itemId: sub.itemId,
            name: sub.name,
            quantity: sub.quantity,
            category: sub.category,
            warehouseState: sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }
          })),
          warehouseState: trueOriginalWarehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
          replacementInfo
        });

        itemsToInsert.push(...createdComps);

        const remainingComponents = s.components.filter(c => {
          if (c.uniqueId === targetComponentId) return false;
          if (c.uniqueId === trueOriginalUniqueId) return false;
          if (originalUniqueId && c.uniqueId === originalUniqueId) return false;
          if (replacementGroupId && c.replacementInfo?.replacementGroupId === replacementGroupId) return false;
          return true;
        });

        remainingComponents.splice(Math.min(insertAt, remainingComponents.length), 0, ...itemsToInsert);

        return {
          ...s,
          components: remainingComponents
        };
      })
    }));

    await commitZonesUpdate(newZones);
  };

  const handleExecuteRevert = async (params: {
    component: ListComponent;
    info: ItemReplacementInfo;
    accessoryIndex?: number | null;
    zoneName?: string;
    sectionName?: string;
  }) => {
    const current = localListRef.current || activeList;
    if (isReadOnly || !current?.zones) return;

    const { component: comp, info, accessoryIndex, zoneName, sectionName } = params;

    const newZones = current.zones.map(z => {
      return {
        ...z,
        sections: z.sections.map(s => {
          // CASE 1: REVERTING ACCESSORY
          if (accessoryIndex !== null && accessoryIndex !== undefined && accessoryIndex >= 0) {
            return {
              ...s,
              components: s.components.map(c => {
                if (c.uniqueId !== comp.uniqueId || !c.contents) return c;

                const restoredUnitQty = (info as any)?.originalUnitQuantity ?? (c.type === 'kit' && c.quantity > 0 ? Math.round(info.originalQuantity / c.quantity) : info.originalQuantity);
                const restoredAcc = {
                  itemId: info.originalReferenceId,
                  name: info.originalName,
                  quantity: restoredUnitQty,
                  category: info.originalCategory || 'Accessori',
                  warehouseState: info.originalWarehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }
                };

                const firstAccIdx = c.contents.findIndex((sub, idx) => 
                  idx === accessoryIndex || 
                  (info.replacementGroupId && sub.replacementInfo?.replacementGroupId === info.replacementGroupId) ||
                  sub.name === info.originalName
                );

                const cleaned = c.contents.filter((sub, idx) => {
                  if (info.replacementGroupId && sub.replacementInfo?.replacementGroupId === info.replacementGroupId) {
                    return false;
                  }
                  if (idx === accessoryIndex) return false;
                  return true;
                });

                const insertAt = firstAccIdx !== -1 ? Math.min(firstAccIdx, cleaned.length) : 0;
                cleaned.splice(insertAt, 0, restoredAcc);

                return { ...c, contents: cleaned };
              })
            };
          }

          // CASE 2: REVERTING MAIN COMPONENT (Item or Kit)
          const firstGroupIdx = s.components.findIndex(c => 
            c.uniqueId === comp.uniqueId || 
            (info.originalUniqueId && c.uniqueId === info.originalUniqueId) ||
            (info.replacementGroupId && c.replacementInfo?.replacementGroupId === info.replacementGroupId) ||
            c.name === info.originalName
          );

          if (firstGroupIdx === -1) return s;

          const restoredComp: ListComponent = {
            uniqueId: info.originalUniqueId || comp.uniqueId || `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            type: info.originalType || 'item',
            referenceId: info.originalReferenceId || '',
            name: info.originalName,
            quantity: info.originalQuantity,
            category: info.originalCategory || 'Altro',
            databaseId: info.originalDatabaseId || DEFAULT_DATABASE_ID,
            contents: info.originalContents?.map(sub => ({
              itemId: sub.itemId,
              name: sub.name,
              quantity: sub.quantity,
              category: sub.category,
              warehouseState: sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }
            })),
            warehouseState: info.originalWarehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }
          };

          const cleanedComps = s.components.filter(c => {
            if (c.uniqueId === comp.uniqueId) return false;
            if (info.originalUniqueId && c.uniqueId === info.originalUniqueId) return false;
            if (info.replacementGroupId && c.replacementInfo?.replacementGroupId === info.replacementGroupId) {
              return false;
            }
            if (c.uniqueId.startsWith('rep-') && c.replacementInfo?.originalName === info.originalName) {
              return false;
            }
            return true;
          });

          cleanedComps.splice(Math.min(firstGroupIdx, cleanedComps.length), 0, restoredComp);
          return { ...s, components: cleanedComps };
        })
      };
    });

    await commitZonesUpdate(newZones);
  };

  const handleRevertReplacement = async () => {
    if (!replacementHistoryModal.component || !replacementHistoryModal.info) return;
    await handleExecuteRevert({
      component: replacementHistoryModal.component,
      info: replacementHistoryModal.info,
      accessoryIndex: replacementHistoryModal.accessoryIndex,
      zoneName: replacementHistoryModal.zoneName,
      sectionName: replacementHistoryModal.sectionName
    });
    setReplacementHistoryModal({ isOpen: false, component: null });
  };

  const handleRevertFromModal = async () => {
    if (!replacementModal.targetComponent) return;
    const comp = replacementModal.targetComponent;
    const isAcc = replacementModal.targetAccessoryIndex !== null && replacementModal.targetAccessoryIndex !== undefined && replacementModal.targetAccessoryIndex >= 0;
    let info = isAcc && comp.contents
      ? comp.contents[replacementModal.targetAccessoryIndex!].replacementInfo
      : comp.replacementInfo;

    if (!info) {
      const current = localListRef.current || activeList;
      for (const z of (current?.zones || [])) {
        for (const s of z.sections) {
          const match = s.components.find(c => 
            c.uniqueId === comp.uniqueId || 
            c.replacementInfo?.originalUniqueId === comp.uniqueId ||
            (c.replacementInfo?.replacementGroupId && c.replacementInfo.replacementGroupId === comp.replacementInfo?.replacementGroupId)
          );
          if (match?.replacementInfo) {
            info = match.replacementInfo;
            break;
          }
        }
        if (info) break;
      }
    }

    if (info) {
      await handleExecuteRevert({
        component: comp,
        info,
        accessoryIndex: replacementModal.targetAccessoryIndex,
        zoneName: replacementModal.targetZoneName,
        sectionName: replacementModal.targetSectionName
      });
    }
    setReplacementModal(prev => ({ ...prev, isOpen: false, targetComponent: null }));
  };

  const updateContentState = async (componentId: string, contentIdx: number, updates: Partial<WarehouseState>) => {
      const current = localListRef.current || activeList;
      if (isReadOnly || !current?.zones) return;

      if (!contentWarehouseDeltasRef.current.has(componentId)) {
          contentWarehouseDeltasRef.current.set(componentId, new Map());
      }
      const childMap = contentWarehouseDeltasRef.current.get(componentId)!;
      childMap.set(contentIdx, {
          ...(childMap.get(contentIdx) || {}),
          ...updates
      });

      const newZones = current.zones.map(z => ({
          ...z,
          sections: z.sections.map(s => ({
              ...s,
              components: s.components.map(c => {
                  if (c.uniqueId === componentId && c.contents) {
                      const newContents = [...c.contents];
                      const currentContent = newContents[contentIdx];
                      newContents[contentIdx] = {
                          ...currentContent,
                          warehouseState: {
                              ...currentContent.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                              ...updates
                          }
                      };
                      return { ...c, contents: newContents };
                  }
                  if (c.type === 'template' && c.templateContents) {
                      const found = c.templateContents.some(tc => tc.uniqueId === componentId);
                      if (found) {
                          return {
                              ...c,
                              templateContents: c.templateContents.map(tc => {
                                  if (tc.uniqueId === componentId && tc.contents) {
                                      const newContents = [...tc.contents];
                                      const currentContent = newContents[contentIdx];
                                      newContents[contentIdx] = {
                                          ...currentContent,
                                          warehouseState: {
                                              ...currentContent.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                                              ...updates
                                          }
                                      };
                                      return { ...tc, contents: newContents };
                                  }
                                  return tc;
                              })
                          };
                      }
                  }
                  return c;
              })
          }))
      }));

      await commitZonesUpdate(newZones);
  };

  const handleBatchUpdate = async (
      targets: { uniqueId?: string, parentId?: string, childIdx?: number }[], 
      updates: Partial<WarehouseState>
  ) => {
      const current = localListRef.current || activeList;
      if (isReadOnly || !current?.zones) return;

      targets.forEach(t => {
          if (t.uniqueId) {
              warehouseDeltasRef.current.set(t.uniqueId, {
                  ...(warehouseDeltasRef.current.get(t.uniqueId) || {}),
                  ...updates
              });
          } else if (t.parentId && t.childIdx !== undefined) {
              if (!contentWarehouseDeltasRef.current.has(t.parentId)) {
                  contentWarehouseDeltasRef.current.set(t.parentId, new Map());
              }
              contentWarehouseDeltasRef.current.get(t.parentId)!.set(t.childIdx, {
                  ...(contentWarehouseDeltasRef.current.get(t.parentId)!.get(t.childIdx) || {}),
                  ...updates
              });
          }
      });

      const newZones = current.zones.map(z => ({
          ...z,
          sections: z.sections.map(s => ({
              ...s,
              components: s.components.map(c => {
                  const processComp = (comp: ListComponent): ListComponent => {
                      const isDirectTarget = targets.some(t => t.uniqueId === comp.uniqueId);
                      let newContents = comp.contents;
                      
                      if (comp.contents) {
                          const childTargets = targets.filter(t => t.parentId === comp.uniqueId);
                          if (childTargets.length > 0) {
                              newContents = comp.contents.map((sub, idx) => {
                                  if (childTargets.some(t => t.childIdx === idx)) {
                                      return {
                                          ...sub,
                                          warehouseState: {
                                              ...sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                                              ...updates
                                          }
                                      };
                                  }
                                  return sub;
                              });
                          }
                      }
                      
                      if (isDirectTarget) {
                          return {
                              ...comp,
                              contents: newContents,
                              warehouseState: {
                                  ...comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                                  ...updates
                              }
                          };
                      } else if (newContents !== comp.contents) {
                          return { ...comp, contents: newContents };
                      }
                      
                      return comp;
                  };

                  if (c.type === 'template' && c.templateContents) {
                      const newTC = c.templateContents.map(processComp);
                      const templateChanged = newTC.some((tc, idx) => tc !== c.templateContents![idx]);
                      if (templateChanged) return { ...c, templateContents: newTC };
                      return c;
                  }

                  return processComp(c);
              })
          }))
      }));

      await commitZonesUpdate(newZones);
  };

  // --- MODIFIED WARNING BADGE & TOOLTIP RENDERER ---
  const formatHistoryDateTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderModifiedWarningBadge = (
    tooltipKey: string,
    changeLog?: { 
      previousQuantity: number; 
      changedAt: string; 
      previousName?: string;
      previousVersion?: string;
      wasChecked?: boolean;
      history?: { version: string; name: string; quantity: number; wasChecked?: boolean; updatedAt?: string }[];
    },
    currentQty?: number,
    materialName?: string,
    isCheckedNow?: boolean
  ) => {
    const isTooltipOpen = activeWarningTooltipId === tooltipKey;
    const isResolved = Boolean(isCheckedNow);

    return (
      <div className="relative inline-flex items-center shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (activeWarningTooltipId === tooltipKey) {
              setActiveWarningTooltipId(null);
              setWarningTooltipAnchor(null);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              setWarningTooltipAnchor(rect);
              setActiveWarningTooltipId(tooltipKey);
            }
          }}
          className={`p-1 rounded-full border shadow-md flex items-center justify-center shrink-0 cursor-pointer transition-all hover:scale-110 ${
            isResolved 
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-400 hover:bg-emerald-900' 
              : 'bg-rose-950 border-rose-500 text-rose-400 hover:bg-rose-900 animate-pulse'
          }`}
          title={isResolved ? "Materiale aggiornato e completato - Clicca per lo storico" : "Materiale modificato - Clicca per lo storico"}
        >
          <AlertTriangle size={14} className={isResolved ? "text-emerald-400 fill-emerald-500/20" : "text-rose-500 fill-rose-500/20"} />
        </button>

        {isTooltipOpen && warningTooltipAnchor && typeof document !== 'undefined' && createPortal(
          <>
            {/* Backdrop to close on touch / outside click */}
            <div 
              className="fixed inset-0 z-[190] bg-transparent cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                setActiveWarningTooltipId(null);
                setWarningTooltipAnchor(null);
              }}
            />
            {(() => {
              const tooltipWidth = Math.min(410, (typeof window !== 'undefined' ? window.innerWidth : 430) - 20);
              const margin = 10;
              const buttonCenterX = warningTooltipAnchor.left + warningTooltipAnchor.width / 2;
              
              // Horizontal position clamped inside viewport
              let left = buttonCenterX - tooltipWidth / 2;
              if (left < margin) left = margin;
              if (left + tooltipWidth > window.innerWidth - margin) {
                left = window.innerWidth - margin - tooltipWidth;
              }

              // Decide whether to render above or below based on space above
              const showBelow = warningTooltipAnchor.top < 200;
              const top = showBelow 
                ? warningTooltipAnchor.bottom + 8 
                : Math.max(margin, warningTooltipAnchor.top - 8);

              // Costruzione righe storico versioni per la tabella
              const historyRows: { version: string; name: string; quantity: number; wasChecked: boolean; updatedAt?: string }[] = [];
              const currVer = formatVersionUpper(activeList?.version || '1.0');
              const prevVer = formatVersionUpper(changeLog?.previousVersion || previousVersion);

              if (changeLog?.history && changeLog.history.length > 0) {
                changeLog.history.forEach((h, idx) => {
                  const normVer = formatVersionUpper(h.version);
                  const isLastRow = idx === changeLog.history!.length - 1;
                  const isCurrentOrLastPostChange = normVer.toUpperCase() === currVer.toUpperCase() || (isLastRow && changeLog.history!.length >= 2 && Boolean(h.updatedAt));
                  historyRows.push({
                    version: normVer,
                    name: h.name,
                    quantity: h.quantity,
                    wasChecked: isCurrentOrLastPostChange ? Boolean(isCheckedNow ?? h.wasChecked) : Boolean(h.wasChecked),
                    updatedAt: h.updatedAt || (isLastRow ? (changeLog.changedAt || activeList?.completedAt) : activeList?.creationDate)
                  });
                });

                const lastEntry = changeLog.history[changeLog.history.length - 1];
                const hasPostChangeRow =
                  historyRows.some(h => h.version.toUpperCase() === currVer.toUpperCase()) ||
                  (historyRows.length >= 2 && Boolean(lastEntry?.updatedAt));
                if (!hasPostChangeRow) {
                  historyRows.push({
                    version: currVer,
                    name: materialName || changeLog.previousName || 'Materiale',
                    quantity: currentQty ?? 0,
                    wasChecked: Boolean(isCheckedNow),
                    updatedAt: changeLog.changedAt || activeList?.completedAt
                  });
                }
              } else {
                if (changeLog?.previousQuantity !== undefined || changeLog?.previousName) {
                  historyRows.push({
                    version: prevVer,
                    name: changeLog.previousName || materialName || 'Materiale',
                    quantity: changeLog.previousQuantity ?? 0,
                    wasChecked: Boolean(changeLog.wasChecked),
                    updatedAt: activeList?.creationDate
                  });
                }
                historyRows.push({
                  version: currVer,
                  name: materialName || 'Materiale',
                  quantity: currentQty ?? 0,
                  wasChecked: Boolean(isCheckedNow),
                  updatedAt: changeLog?.changedAt || activeList?.completedAt
                });
              }

              return (
                <div 
                  className={`fixed z-[200] p-3 bg-slate-900 border-2 ${isResolved ? 'border-emerald-500/90' : 'border-rose-500/90'} rounded-xl shadow-2xl text-xs text-slate-200 pointer-events-auto animate-in zoom-in-95 duration-150 ${showBelow ? '' : '-translate-y-full'}`}
                  style={{ top: `${top}px`, left: `${left}px`, width: `${tooltipWidth}px` }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Intestazione: solo "Aggiornato" e pulsante X di chiusura */}
                  <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
                    <span className={`font-bold ${isResolved ? 'text-emerald-400' : 'text-amber-400'} text-xs uppercase tracking-wider`}>
                      Aggiornato
                    </span>
                    <button 
                      type="button"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setActiveWarningTooltipId(null); 
                        setWarningTooltipAnchor(null);
                      }}
                      className="text-slate-400 hover:text-white p-1 -mr-1 -mt-1 rounded hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Tabella storico versioni */}
                  <div className="w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800/80 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-700/60">
                          <th className="py-1.5 px-1.5 text-center w-11">Ver.</th>
                          <th className="py-1.5 px-1.5 text-center w-24">Data / Ora</th>
                          <th className="py-1.5 px-1.5">Materiale</th>
                          <th className="py-1.5 px-1.5 text-center w-11">Q.tà</th>
                          <th className="py-1.5 px-1.5 text-center w-11">Spunta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {historyRows.map((row, rIdx) => {
                          const isCurrent = row.version.toUpperCase() === currVer.toUpperCase() || rIdx === historyRows.length - 1;
                          return (
                            <tr key={rIdx} className={isCurrent ? 'bg-amber-500/10' : 'hover:bg-slate-900/40'}>
                              <td className="py-1.5 px-1.5 text-center font-mono font-bold text-[11px]">
                                <span className={isCurrent ? 'text-amber-400' : 'text-slate-400'}>
                                  {row.version}
                                </span>
                              </td>
                              <td className="py-1.5 px-1.5 text-center font-mono text-[10px] text-slate-400 whitespace-nowrap">
                                {formatHistoryDateTime(row.updatedAt)}
                              </td>
                              <td className="py-1.5 px-1.5 text-slate-200 text-[11px] truncate max-w-[125px]" title={row.name}>
                                {row.name}
                              </td>
                              <td className="py-1.5 px-1.5 text-center font-mono font-bold text-white text-[11px]">
                                {row.quantity}
                              </td>
                              <td className="py-1.5 px-1.5 text-center">
                                <div className="flex items-center justify-center">
                                  {row.wasChecked ? (
                                    <CheckSquare size={15} className="text-emerald-400" />
                                  ) : (
                                    <Square size={15} className="text-slate-600" />
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>,
          document.body
        )}
      </div>
    );
  };

  const saveNote = () => {
      if (isReadOnly) return;
      if (noteModal.targets.length > 0) {
          handleBatchUpdate(noteModal.targets, { warehouseNote: noteModal.text });
          setNoteModal({ isOpen: false, targets: [], text: '' });
      }
  };

  const saveBrokenReport = () => {
      if (isReadOnly) return;
      if (brokenModal.targets.length > 0) {
          handleBatchUpdate(brokenModal.targets, { isBroken: true, brokenNote: brokenModal.text });
          setBrokenModal({ isOpen: false, targets: [], text: '' });
      }
  };

  const resolveBrokenReport = () => {
      if (isReadOnly) return;
      if (brokenModal.targets.length > 0) {
          handleBatchUpdate(brokenModal.targets, { isBroken: false, brokenNote: '' });
          setBrokenModal({ isOpen: false, targets: [], text: '' });
      }
  };

  const clearDeletedItems = async (zoneName: string) => {
      if (isReadOnly) return;
      if (!activeList) return;
      const newDeletedItems = activeList.deletedItems?.filter(d => d.zoneName !== zoneName) || [];
      await updateItemFields(COLL_LISTS, activeList.id, { deletedItems: newDeletedItems });
  };

  const handleConfirmArchive = async () => {
      const { listId, action } = archiveConfirm;
      if (!listId) return;
      
      const targetList = lists.find(l => l.id === listId);
      if (targetList) {
          setArchiveConfirm(prev => ({ ...prev, isOpen: false }));
          await updateItemFields(COLL_LISTS, targetList.id, { isArchived: action === 'archive' });
      }
  };

  const handleConfirmDelete = async () => {
      const { listId } = deleteConfirm;
      if (!listId) return;
      
      try {
          await deleteItem(COLL_LISTS, listId);
          setDeleteConfirm({ isOpen: false, listId: '', listName: '' });
      } catch (error) {
          console.error("Errore durante l'eliminazione:", error);
      }
  };


  // --- RENDER: LIST VIEW ---
  if (!activeListId) {
    return (
      <div className="h-full flex flex-col p-2 sm:p-4 bg-slate-950 overflow-hidden">
        <div className="mb-3">
          <h1 className="text-lg font-bold text-white uppercase tracking-wider opacity-90 flex items-center gap-2">
              <ClipboardCheck className="text-blue-500" size={20} />
              Preparazione Eventi
          </h1>
          <p className="text-xs text-slate-500 leading-none">Gestione carichi, scarichi e segnalazioni</p>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 mb-6 items-start xl:items-center">
            <div className="relative flex-1 max-w-xl w-full">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
               <input 
                  placeholder="Cerca evento..." 
                  className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg outline-none focus:border-blue-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
               <button 
                   onClick={() => setActiveListAction(p => p === 'archive' ? null : 'archive')}
                   className={`p-2.5 sm:p-3 rounded-lg flex items-center justify-center transition-all ${activeListAction === 'archive' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40 ring-2 ring-amber-500/50' : 'bg-amber-600/10 text-amber-500 hover:bg-amber-600/20 border border-amber-900/30'}`}
                   title="Attiva modalità Archiviazione"
               >
                   <Archive size={20} />
               </button>
               {showArchived && (
                 <>
                   <button 
                       onClick={() => setActiveListAction(p => p === 'restore' ? null : 'restore')}
                       className={`px-3 py-2 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:flex-none gap-2 font-medium transition-colors whitespace-nowrap ${activeListAction === 'restore' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                   >
                       <RefreshCcw size={18} /> Ripristina
                   </button>
                   <button 
                       onClick={() => setActiveListAction(p => p === 'delete' ? null : 'delete')}
                       className={`px-3 py-2 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:flex-none gap-2 font-medium transition-colors whitespace-nowrap ${activeListAction === 'delete' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                   >
                       <Trash2 size={18} /> Elimina
                   </button>
                 </>
               )}
               <button 
                   onClick={() => { setShowArchived(!showArchived); setActiveListAction(null); }}
                   className={`flex items-center justify-center flex-1 md:flex-none gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${showArchived ? 'bg-slate-700 text-white border border-slate-600 shadow-xl' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'} xl:ml-auto w-full md:w-auto`}
               >
                   <div className={`w-2 h-2 rounded-full ${showArchived ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                   {showArchived ? 'VEDI ATTIVI' : 'VAI ALL\'ARCHIVIO'}
               </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
           {filteredLists.map(list => {
               const issues = getIssues(list);
               const hasIssues = issues.length > 0;
               
               // Status Colors
               const cleanVer = (list.version || '1.0').toString().trim().replace(/^[vV]+/, '');
               const hasUnresolvedChanges = list.zones?.some(z => 
                   z.sections.some(s => 
                       s.components.some(c => isComponentUnresolved(c))
                   )
               ) || (list.deletedItems && list.deletedItems.length > 0);
               const isModified = parseFloat(cleanVer) > 1.0 && hasUnresolvedChanges;
               
               // Check if Fully Loaded (Distinta & Loaded checked for ALL items) and if any check has been started
               let isFullyLoaded = true;
               let isReturned = true;
               let hasAnyCheck = false;

               if (list.zones && list.zones.length > 0) {
                   list.zones.forEach(z => {
                       z.sections.forEach(s => {
                           s.components.forEach(c => {
                               const checkComp = (comp: ListComponent) => {
                                   if (comp.contents && comp.contents.length > 0) {
                                       comp.contents.forEach(sub => {
                                           const ws = sub.warehouseState;
                                           if (ws?.inDistinta || ws?.loaded || ws?.returned) hasAnyCheck = true;
                                           if (!ws?.inDistinta || !ws?.loaded) isFullyLoaded = false;
                                           if (!ws?.returned) isReturned = false;
                                       });
                                   }
                                   
                                   if (comp.type !== 'kit') {
                                       const ws = comp.warehouseState;
                                       if (ws?.inDistinta || ws?.loaded || ws?.returned) hasAnyCheck = true;
                                       if (!ws?.inDistinta || !ws?.loaded) isFullyLoaded = false;
                                       if (!ws?.returned) isReturned = false;
                                   }
                               };

                               if (c.type === 'template' && c.templateContents) {
                                   c.templateContents.forEach(checkComp);
                               } else {
                                   checkComp(c);
                               }
                           });
                       });
                   });
               } else {
                   isFullyLoaded = false;
                   isReturned = false;
               }

               // If there are deleted items that haven't been cleared/hidden, it's not fully loaded (requires attention)
               if (list.deletedItems && list.deletedItems.length > 0) {
                   isFullyLoaded = false;
               }

               const isReadyPronto = cleanVer === '1.0' && !hasAnyCheck && (list.isCompleted || !list.isDraftVisible);
               const isInProgress = !list.isArchived && !(!list.isCompleted && list.isDraftVisible) && !isReturned && !isFullyLoaded && !isModified && !isReadyPronto;

               let borderColor = 'border-slate-800';
               let bgColor = 'bg-slate-900';
               
                if (list.isArchived) {
                    borderColor = 'border-slate-800';
                    bgColor = 'bg-slate-900/50 grayscale opacity-60';
                } else if (!list.isCompleted && list.isDraftVisible) {
                    borderColor = 'border-orange-500/40';
                    bgColor = 'bg-orange-900/10';
                } else if (isReturned) {
                    borderColor = 'border-purple-500/50';
                    bgColor = 'bg-purple-900/10';
                } else if (isFullyLoaded) {
                    borderColor = 'border-emerald-500/50';
                    bgColor = 'bg-emerald-900/10';
                } else if (isReadyPronto) {
                    borderColor = 'border-blue-500/50';
                    bgColor = 'bg-blue-900/10';
                } else if (isModified) {
                    borderColor = 'border-amber-500/50';
                    bgColor = 'bg-amber-900/10';
                }

               return (
                   <div key={list.id} 
                        onClick={(e) => {
                            if (activeListAction === 'archive') {
                                if (!list.isArchived) { setArchiveConfirm({ isOpen: true, listId: list.id, listName: list.eventName, action: 'archive' }); setActiveListAction(null); }
                            } else if (activeListAction === 'restore') {
                                if (list.isArchived) { setArchiveConfirm({ isOpen: true, listId: list.id, listName: list.eventName, action: 'restore' }); setActiveListAction(null); }
                            } else if (activeListAction === 'delete') {
                                if (list.isArchived) { setDeleteConfirm({ isOpen: true, listId: list.id, listName: list.eventName }); setActiveListAction(null); }
                            } else if (!activeListAction) {
                                setActiveListId(list.id); 
                                setActiveZoneId(list.zones?.[0]?.id || '');
                            }
                        }}
                        className={`border rounded-xl p-4 hover:border-slate-500 transition-all flex items-center gap-4 group cursor-pointer relative ${activeListAction ? 'ring-4 ring-transparent hover:ring-emerald-500/20' : ''} ${borderColor} ${bgColor}`}
                   >
                       <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-lg shrink-0 relative">
                           {list.eventName.charAt(0).toUpperCase()}
                           {list.version && <div className="absolute -bottom-2 -right-2 bg-slate-950 text-xs px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 font-mono">{formatVersionLabel(list.version)}</div>}
                       </div>
                       
                       <div className="flex-1 min-w-0">
                           <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors truncate flex items-center gap-3">
                                {list.eventName}
                                {list.isArchived && <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-bold uppercase">Archiviato</span>}
                                {!list.isArchived && !list.isCompleted && list.isDraftVisible && (
                                    <span className="text-xs bg-amber-600 text-white px-2.5 py-0.5 rounded font-black uppercase ring-2 ring-amber-500/30 animate-pulse tracking-wide">
                                        BOZZA ({formatVersionLabel(list.version || '0.1')})
                                    </span>
                                )}
                                {isReturned && <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded font-bold uppercase">Evento rientrato</span>}
                                {!isReturned && isFullyLoaded && <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded font-bold uppercase">Carico Completo</span>}
                                {!isReturned && !isFullyLoaded && isReadyPronto && <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded font-bold uppercase">Pronto</span>}
                                {!isReturned && !isFullyLoaded && isModified && <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded font-bold uppercase">Modificato</span>}
                                {isInProgress && <span className="text-xs bg-slate-700 text-slate-200 border border-slate-600 px-2 py-0.5 rounded font-bold uppercase">In lavorazione</span>}
                           </h3>
                           <div className="flex items-center gap-4 text-sm text-slate-500">
                               <span className="flex items-center gap-1"><MapPin size={14}/> {list.location}</span>
                               <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(list.eventDate).toLocaleDateString()}</span>
                               {list.completedAt && (
                                   <span className="hidden md:flex items-center gap-1 bg-slate-800/50 px-2 py-0.5 rounded text-xs font-bold text-slate-400 border border-slate-700/50">
                                       Lista del {new Date(list.completedAt).toLocaleString()}
                                   </span>
                               )}
                           </div>
                       </div>

                       <div className="hidden md:flex items-center gap-2">
                           {hasIssues && (
                               <button 
                                    onClick={(e) => { e.stopPropagation(); setIssuesModalList(list); }}
                                    className="w-10 h-10 rounded-full bg-amber-900/20 flex items-center justify-center text-amber-500 animate-pulse hover:bg-amber-900/40 transition-colors"
                                    title="Visualizza segnalazioni"
                               >
                                   <AlertTriangle size={20} className="fill-current" />
                               </button>
                           )}

                           {list.isArchived && (
                               <button 
                                    onClick={(e) => { e.stopPropagation(); onOpenTemplateModal?.(list); }}
                                    className="p-3 bg-slate-800 hover:bg-emerald-600 text-slate-400 hover:text-white rounded-lg transition-all shadow-lg hover:shadow-emerald-900/20 group/btn"
                                    title="Copia come nuovo progetto"
                               >
                                   <Rocket size={20} className="group-hover/btn:animate-bounce" />
                               </button>
                           )}

                            <button 
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     setListToShare(list);
                                 }}
                                 className="p-3 bg-slate-800 hover:bg-emerald-600 text-slate-400 hover:text-white rounded-lg transition-all shadow-lg hover:shadow-emerald-900/20 flex items-center justify-center gap-1.5"
                                 title="Condividi Evento"
                            >
                                <Share2 size={18} />
                                <span className="text-xs font-bold uppercase tracking-tight hidden lg:inline">Condividi</span>
                            </button>

                            <button 
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     setExportList(list);
                                 }}
                                 className="flex p-3 bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded-lg transition-all shadow-lg hover:shadow-blue-900/20 items-center justify-center gap-1.5"
                                 title="Export Lista"
                            >
                                <Share size={18} />
                                <span className="text-xs font-bold uppercase tracking-tight hidden lg:inline">Export</span>
                            </button>

                           <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setArchiveConfirm({
                                        isOpen: true,
                                        listId: list.id,
                                        listName: list.eventName,
                                        action: list.isArchived ? 'restore' : 'archive'
                                    });
                                }}
                                className={`p-2 rounded-full border transition-all ${list.isArchived ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500 hover:text-white' : 'bg-amber-900/20 border-amber-500/30 text-amber-500 hover:bg-amber-600 hover:text-white'}`}
                                title={list.isArchived ? "Ripristina" : "Archivia"}
                           >
                               {list.isArchived ? <RefreshCcw size={16} /> : <Archive size={16} />}
                           </button>

                           {list.isArchived && (
                                <button 
                                     onClick={(e) => {
                                         e.stopPropagation();
                                         setDeleteConfirm({
                                             isOpen: true,
                                             listId: list.id,
                                             listName: list.eventName
                                         });
                                     }}
                                     className="p-3 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg transition-all"
                                     title="Elimina definitivamente"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                       </div>
                   </div>
               );
           })}
        </div>

        {/* ISSUES SUMMARY MODAL */}
        <Modal isOpen={!!issuesModalList} onClose={() => setIssuesModalList(null)} title="Segnalazioni Evento" size="lg">
            <div className="space-y-4">
                {issuesModalList && getIssues(issuesModalList).length === 0 && <p className="text-slate-500">Nessuna segnalazione presente.</p>}
                {issuesModalList && getIssues(issuesModalList).map((issue, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-start gap-3">
                        {issue.component.warehouseState?.isBroken ? <AlertOctagon className="text-rose-500 shrink-0 mt-1" /> : <MessageSquare className="text-blue-500 shrink-0 mt-1" />}
                        <div>
                            <div className="font-bold text-white">{issue.component.name}</div>
                            <div className="text-xs text-slate-500 mb-1">{issue.zoneName} &gt; {issue.sectionName}</div>
                            {issue.component.warehouseState?.isBroken && (
                                <div className="mt-1">
                                    <div className="text-rose-400 text-sm font-medium uppercase">
                                        {issue.component.warehouseState.brokenNote || 'SEGNALATO ROTTO/MANCANTE'}
                                    </div>
                                </div>
                            )}
                            {issue.component.warehouseState?.warehouseNote && (
                                <div className="bg-slate-900 p-2 rounded text-sm text-slate-300 mt-1 italic">
                                    "{issue.component.warehouseState.warehouseNote}"
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div className="flex justify-end pt-4">
                    <button onClick={() => setIssuesModalList(null)} className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700">Chiudi</button>
                </div>
            </div>
        </Modal>

        <Modal 
            isOpen={archiveConfirm.isOpen} 
            onClose={() => setArchiveConfirm(prev => ({ ...prev, isOpen: false }))} 
            title={archiveConfirm.action === 'archive' ? 'Archiviando' : 'Ripristino'}
            size="sm"
        >
            <div className="space-y-4">
                <p className="text-slate-300">
                    {archiveConfirm.action === 'archive' 
                      ? `Vuoi archiviare l'evento "${archiveConfirm.listName}"? Non sarà più visibile nella sezione creazione.`
                      : `Vuoi ripristinare l'evento "${archiveConfirm.listName}"? Tornerà visibile nella sezione creazione.`
                    }
                </p>
                <div className="flex justify-end gap-2">
                    <button onClick={() => setArchiveConfirm(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
                    <button 
                      onClick={handleConfirmArchive} 
                      className={`px-6 py-2 rounded font-medium ${archiveConfirm.action === 'archive' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`}
                    >
                      {archiveConfirm.action === 'archive' ? 'Archivia' : 'Ripristina'}
                    </button>
                </div>
            </div>
        </Modal>

        <ConfirmationModal
            isOpen={deleteConfirm.isOpen}
            onClose={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}
            onConfirm={handleConfirmDelete}
            title="Eliminazione Definitiva"
            message={`Stai per eliminare l'evento "${deleteConfirm.listName}". Questa azione è irreversibile e rimuoverà tutti i dati associati dal database.`}
            confirmText="Elimina Ora"
            variant="danger"
        />

        {/* Export Options Modal for List View */}
        <Modal 
            isOpen={!!exportList} 
            onClose={() => setExportList(null)} 
            title="Export Lista Materiale"
            size="md"
        >
            <div className="space-y-4">
                <p className="text-sm text-slate-400">
                    Seleziona il formato in cui desideri esportare la lista per l'evento <strong>{exportList?.eventName}</strong>:
                </p>
                
                <div className="grid grid-cols-1 gap-3">
                    {/* OPTION 1: PDF LISTA */}
                    <button 
                        onClick={() => { if (exportList) { exportPDF(exportList); setExportList(null); } }}
                        className="flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-blue-500/50 rounded-xl text-left transition-all duration-200 group"
                    >
                        <div className="p-3 bg-blue-900/30 text-blue-400 rounded-lg group-hover:scale-110 transition-transform">
                            <FileText size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-white text-sm">Lista Materiale (PDF)</h4>
                            <p className="text-xs text-slate-400 mt-0.5">Ordinata per zone e reparti con caselle di spunta (check-list).</p>
                        </div>
                    </button>

                    {/* OPTION 2: PDF TOTALI */}
                    <button 
                        onClick={() => { if (exportList) { exportTotalsPDF(exportList); setExportList(null); } }}
                        className="flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-purple-500/50 rounded-xl text-left transition-all duration-200 group"
                    >
                        <div className="p-3 bg-purple-900/30 text-purple-400 rounded-lg group-hover:scale-110 transition-transform">
                            <ClipboardList size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-white text-sm">Riepilogo Totali (PDF)</h4>
                            <p className="text-xs text-slate-400 mt-0.5">Raggruppamento globale dei totali divisi tra Kit e materiale sfuso.</p>
                        </div>
                    </button>

                    {/* OPTION 3: CSV EXCEL */}
                    <button 
                        onClick={() => { if (exportList) { exportCSV(exportList); setExportList(null); } }}
                        className="flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-emerald-500/50 rounded-xl text-left transition-all duration-200 group"
                    >
                        <div className="p-3 bg-emerald-900/30 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform">
                            <FileDown size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-white text-sm">Export in CSV (Excel)</h4>
                            <p className="text-xs text-slate-400 mt-0.5">Scarica un file CSV tabellare compatibile con Excel o altri gestionali.</p>
                        </div>
                    </button>
                </div>

                {/* ALL OTHER DEPARTMENTS SELECTOR */}
                {exportList && exportList.zones && exportList.zones.length > 0 && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-4 text-left transition-all duration-200">
                            <div className="p-2.5 bg-slate-800 text-slate-400 rounded-lg border border-slate-700/50">
                                <Layers size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-white text-xs uppercase tracking-wider opacity-80">Seleziona un singolo Reparto</h4>
                                <p className="text-[11px] text-slate-500 mt-0.5">Esporta solo il PDF di uno dei reparti configurati:</p>
                            </div>
                        </div>
                        <div className="space-y-2.5 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {exportList.zones.map(zone => (
                                <div key={zone.id} className="space-y-1">
                                    <div className="text-[10px] uppercase font-extrabold text-slate-500 tracking-widest pl-1">{zone.name}</div>
                                    <div className="flex flex-wrap gap-1.5 pl-2 pb-1">
                                        {zone.sections?.map(section => (
                                            <button
                                                key={section.id}
                                                onClick={() => { exportSectionPDF(exportList, zone.id, section.id); setExportList(null); }}
                                                className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-[11px] font-bold rounded transition-colors"
                                            >
                                                {section.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-end pt-2 border-t border-slate-800">
                    <button 
                        onClick={() => setExportList(null)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                    >
                        Annulla
                    </button>
                </div>
            </div>
        </Modal>

        {/* SHARE EVENT MODAL (LIST VIEW) */}
        <ShareEventModal 
            isOpen={!!listToShare}
            onClose={() => setListToShare(null)}
            list={listToShare}
        />
      </div>
    );
  }

  // --- RENDER: DETAIL VIEW ---
  const activeZone = activeList?.zones?.find(z => z.id === activeZoneId);
  const zoneDeletedItems = activeList?.deletedItems?.filter(d => d.zoneName === activeZone?.name);

  // --- RENDER: MODE SELECTOR ---
  if (activeListId && activeList && !activeWarehouseMode) {
      return (
          <div className="h-full flex flex-col p-6 bg-slate-950 items-center justify-center animate-in zoom-in-95 duration-300">
              <div className="max-w-md w-full bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/20 blur-[80px] rounded-full" />
                  <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/10 blur-[80px] rounded-full" />
                  
                  <div className="relative z-10 flex flex-col items-center text-center">
                     <div className="bg-slate-800 p-4 rounded-3xl shadow-inner mb-6 ring-1 ring-slate-700">
                         <Truck className="text-blue-500" size={48} />
                     </div>
                     <h2 className="text-2xl font-bold text-white mb-2">Seleziona Fase Operativa</h2>
                     <p className="text-slate-400 mb-8 max-w-[280px]">Cosa vuoi eseguire oggi per l'evento <span className="text-white font-medium">"{activeList.eventName}"</span>?</p>
                     
                     <div className="flex flex-col gap-3 w-full">
                         <button onClick={() => setActiveWarehouseMode('visualizza')} className="group w-full bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 text-lg">
                             <Eye size={22} className="group-hover:scale-110 transition-transform" /> Visualizza
                         </button>
                         <button onClick={() => setActiveWarehouseMode('distinta')} className="group w-full bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/50 text-emerald-500 font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 text-lg">
                             <Square size={20} className="group-hover:scale-110 transition-transform" /> Spunta Distinta
                         </button>
                         <button onClick={() => setActiveWarehouseMode('carico')} className="group w-full bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/50 text-blue-500 font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 text-lg">
                             <Square size={20} className="group-hover:scale-110 transition-transform" /> Carico Camion
                         </button>
                         <button onClick={() => setActiveWarehouseMode('rientro')} className="group w-full bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/50 text-purple-500 font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 text-lg">
                             <Square size={20} className="group-hover:scale-110 transition-transform" /> Rientro Magazzino
                         </button>
                     </div>
                     <button onClick={() => setActiveListId(null)} className="mt-8 text-slate-500 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium">
                        <ArrowLeft size={16} /> Torna alle Liste
                     </button>
                  </div>
              </div>
          </div>
      );
  }

  // Calculate previous version for display
  const cleanActiveVer = (activeList?.version || '1.0').toString().replace(/^[vV]+/, '');
  const parsedVer = parseFloat(cleanActiveVer);
  const previousVersion = (isNaN(parsedVer) ? 1.0 : Math.max(1.0, parsedVer - 0.1)).toFixed(1);

  // Helper to render warehouse checkbox icon with ghost checkmark for modified items that were previously checked
  const renderWarehouseCheckboxIcon = (
      isChecked: boolean,
      showWarning: boolean,
      wasPreviouslyChecked: boolean,
      sizeDesktop: number = 34,
      sizeMobileClass: string = "sm:w-7 sm:h-7",
      checkSize: number = 22,
      checkSizeClass: string = "sm:w-5 sm:h-5"
  ) => {
      if (isChecked) {
          return <CheckSquare size={sizeDesktop} className={sizeMobileClass} />;
      }
      if (showWarning && wasPreviouslyChecked) {
          return (
              <div className="relative inline-flex items-center justify-center">
                  <Square size={sizeDesktop} className={`${sizeMobileClass} text-rose-500`} />
                  <Check 
                      size={checkSize} 
                      strokeWidth={3} 
                      className={`absolute text-slate-400 ${checkSizeClass} pointer-events-none drop-shadow-sm`} 
                  />
              </div>
          );
      }
      return (
          <Square size={sizeDesktop} className={`${sizeMobileClass} ${showWarning ? 'text-rose-500' : 'text-slate-600'}`} />
      );
  };

  const renderTotalButton = (
      type: 'distinta' | 'carico' | 'rientro',
      current: number,
      total: number,
      onClick: () => void,
      showWarning?: boolean,
      disabled?: boolean,
      warningTooltipKey?: string,
      originalTotal?: number,
      hasChanged?: boolean,
      changeLog?: WarehouseState['changeLog'],
      materialName?: string
  ) => {
      if (activeWarehouseMode !== type && !(activeWarehouseMode === 'visualizza' && (type === 'carico' || type === 'rientro'))) return null;
      const isReadOnlyMode = disabled || activeWarehouseMode === 'visualizza';

      let textColor = 'text-slate-600';
      const isComplete = current >= total;
      const isStarted = current > 0;
      
      const wasPreviouslyChecked = Boolean(
          changeLog?.wasChecked || 
          (changeLog?.history && changeLog.history.some(h => h.wasChecked))
      );
      const isWarningActive = Boolean(showWarning && !isComplete && (type === 'distinta' || type === 'carico'));

      let icon = (
          <Square size={32} className={`sm:w-7 sm:h-7 ${isWarningActive ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'}`} />
      );

      if (isWarningActive && wasPreviouslyChecked) {
          icon = (
              <div className="relative inline-flex items-center justify-center">
                  <Square size={32} className="sm:w-7 sm:h-7 text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse" />
                  <Check size={20} strokeWidth={3} className="absolute text-slate-400 sm:w-5 sm:h-5 pointer-events-none drop-shadow-sm" />
              </div>
          );
      }

      if (isComplete) {
          icon = <CheckSquare size={32} className="sm:w-7 sm:h-7" />;
          if (type === 'distinta') textColor = 'text-emerald-500';
          if (type === 'carico') textColor = 'text-blue-500';
          if (type === 'rientro') textColor = 'text-purple-500';
      } else if (isWarningActive) {
          textColor = 'text-rose-500';
      }

      return (
          <div className="flex items-center gap-1.5 shrink-0">
              {(hasChanged || showWarning) && warningTooltipKey && (
                  renderModifiedWarningBadge(
                      warningTooltipKey, 
                      changeLog || { previousQuantity: originalTotal ?? 0, changedAt: '' }, 
                      total,
                      materialName || warningTooltipKey.replace('total-parent-', '').replace('total-simple-', ''),
                      Boolean(isComplete)
                  )
              )}
              <div className="flex flex-col items-center">
                  <button 
                      type="button"
                      onClick={(e) => {
                          e.stopPropagation();
                          if (!isReadOnlyMode) onClick();
                      }}
                      disabled={isReadOnlyMode}
                      title={isWarningActive && wasPreviouslyChecked ? "Era già spuntato nella versione precedente - Clicca per confermare la nuova quantità" : undefined}
                      className={`p-2 sm:p-1 rounded-xl touch-manipulation min-w-[48px] min-h-[48px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center active:scale-95 transition-all ${isStarted && !isComplete ? 'bg-yellow-500 hover:bg-yellow-400 text-black px-2 py-1 rounded-lg text-sm sm:text-xs font-black min-w-[48px] h-[38px] sm:min-w-[28px] sm:h-[28px]' : textColor} ${isReadOnlyMode ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                  >
                      {isStarted && !isComplete ? (
                          `${current}/${total}`
                      ) : (
                          icon
                      )}
                  </button>
              </div>
          </div>
      );
  };
  return (
      <div className={`h-full flex flex-col bg-slate-950 overflow-hidden transition-all duration-300 ${isPrepFilterModalOpen ? 'lg:mr-[400px]' : ''}`}>
          {/* Header */}
          <div className="bg-slate-900 border-b border-slate-800 flex flex-col pt-[env(safe-area-inset-top)]">
              {/* Row 1: Title Bar */}
              <div className="px-2.5 py-1.5 sm:px-4 sm:py-2 flex items-center justify-between gap-2 border-b border-slate-800/60">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      {/* Back Button (Returns directly to events list) */}
                      <button 
                          onClick={() => { setActiveListId(null); setActiveWarehouseMode(null); setViewMode('zones'); }} 
                          className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center shrink-0 active:scale-95 transition-transform" 
                          title="Torna a Preparazione Magazzino"
                      >
                          <ArrowLeft size={18} />
                      </button>

                      {/* Title + Version + Mode + Location/Date */}
                      <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <h2 className="text-sm sm:text-xl font-bold text-white truncate leading-tight">
                                  {activeList?.eventName}
                              </h2>
                              {activeList?.version && (
                                  <span className="text-[10px] sm:text-xs bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono shrink-0">
                                      {formatVersionLabel(activeList.version)}
                                  </span>
                              )}
                              {activeList && !activeList.isCompleted && (activeList.isDraftVisible || parseFloat(activeList.version || '0') < 1) && (
                                  <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded uppercase font-black bg-amber-600 text-white border border-amber-400/50 shadow-sm shrink-0">
                                      BOZZA
                                  </span>
                              )}
                              <button
                                  type="button"
                                  onClick={() => setActiveWarehouseMode(null)}
                                  title="Clicca per cambiare fase operativa"
                                  className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded uppercase font-black border shrink-0 cursor-pointer hover:opacity-80 active:scale-95 transition-all ${activeWarehouseMode === 'visualizza' ? 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30' : activeWarehouseMode === 'distinta' ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30' : activeWarehouseMode === 'carico' ? 'bg-blue-900/40 text-blue-400 border-blue-500/30' : 'bg-purple-900/40 text-purple-400 border-purple-500/30'}`}
                              >
                                  {activeWarehouseMode}
                              </button>
                          </div>
                          <div className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
                              {activeList?.location && <span className="truncate">{activeList.location}</span>}
                              {activeList?.location && activeList?.eventDate && <span>•</span>}
                              {activeList?.eventDate && !isNaN(new Date(activeList.eventDate).getTime()) && (
                                  <span className="shrink-0">{new Date(activeList.eventDate).toLocaleDateString()}</span>
                              )}
                              {!isOnline && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 shrink-0">
                                      <WifiOff size={10} /> Offline
                                  </span>
                              )}
                          </div>
                      </div>
                  </div>
              </div>

              {/* Row 2: Dedicated Single-Line Toolbar (Between Title and Zones) */}
              <div className="px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-950/60 flex items-center justify-between gap-1.5 sm:gap-2 border-b border-slate-800/40 overflow-x-auto no-scrollbar">
                  {/* Left of Toolbar: Mode Switcher (Reparti / Totali) */}
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0">
                      <button 
                          onClick={() => setViewMode('zones')}
                          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold transition-colors ${viewMode === 'zones' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                          title="Vista Reparti"
                      >
                          <Layers size={14} /> <span>Reparti</span>
                      </button>
                      <button 
                          onClick={() => setViewMode('totals')}
                          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold transition-colors ${viewMode === 'totals' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                          title="Vista Totali"
                      >
                          <LayoutList size={14} /> <span>Totali</span>
                      </button>
                      <button 
                          onClick={() => setViewMode('global-totals')}
                          className={`hidden md:flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold transition-colors ${viewMode === 'global-totals' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                          title="Totali Generali Evento (Somma di tutte le zone - Solo Tablet/Desktop)"
                      >
                          <Calculator size={14} /> <span>Totali Evento</span>
                      </button>
                  </div>

                  {/* Right of Toolbar: Actions (Info, Filtri, Export, Condividi, Cerca) */}
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      {/* Event Summary Info Button */}
                      <button 
                          onClick={() => setSummaryEvent(activeList || null)} 
                          title="Riepilogo Evento" 
                          className="p-1.5 sm:p-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 rounded-lg transition-colors border border-slate-800 text-xs font-bold shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
                      >
                          <Info size={15}/> 
                          <span className="hidden xl:inline">Info</span>
                      </button>

                      {/* Filter Button */}
                      <button
                          onClick={() => setIsPrepFilterModalOpen(prev => !prev)}
                          className={`p-1.5 sm:p-2 rounded-lg transition-all border text-xs font-bold flex items-center gap-1.5 relative shrink-0 ${
                              activePrepFiltersCount > 0
                                  ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)] ring-2 ring-blue-400/50' 
                                  : isPrepFilterModalOpen
                                      ? 'bg-blue-600 text-white border-blue-500'
                                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                          }`}
                          title="Filtri"
                      >
                          <Filter size={15} />
                          <span className="hidden sm:inline">Filtri</span>
                          {activePrepFiltersCount > 0 && (
                              <span className="bg-blue-300 text-slate-950 text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                  {activePrepFiltersCount}
                              </span>
                          )}
                      </button>

                      {/* Export Button */}
                      <button 
                          onClick={() => setExportList(activeList || null)} 
                          title="Export Lista" 
                          className="p-1.5 sm:p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-800 text-xs font-bold shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
                      >
                          <Share size={15}/> 
                          <span className="hidden xl:inline">Export</span>
                      </button>

                      {/* Share Button */}
                      <button 
                          onClick={() => setListToShare(activeList || null)} 
                          title="Condividi Evento" 
                          className="p-1.5 sm:p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-800 text-xs font-bold shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
                      >
                          <Share2 size={15}/> 
                          <span className="hidden xl:inline">Condividi</span>
                      </button>

                      {/* Search Toggle (Mobile < md) */}
                      <button 
                          onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                          className={`md:hidden p-1.5 sm:p-2 rounded-lg transition-colors border text-xs font-bold shrink-0 ${isSearchExpanded || itemSearch ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'}`}
                          title="Cerca nel materiale"
                      >
                          <Search size={15} />
                      </button>

                      {/* Search Input (Tablet md & Desktop lg) */}
                      <div className="relative hidden md:block w-44 lg:w-64">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                          <input 
                              placeholder="Cerca materiale..." 
                              className="w-full bg-slate-900 border border-slate-800 text-white pl-8 pr-7 py-1.5 rounded-lg text-xs outline-none focus:border-blue-500 transition-all"
                              value={itemSearch}
                              onChange={e => handleSearchChange(e.target.value)}
                          />
                          {itemSearch && (
                              <button onClick={() => handleSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                  <X size={12} />
                              </button>
                          )}
                      </div>
                  </div>
              </div>

              {/* Mobile Expanded Search Bar (collapsible under toolbar) */}
              {isSearchExpanded && (
                  <div className="p-2 bg-slate-950 border-b border-slate-800 md:hidden w-full">
                      <div className="relative w-full">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                          <input 
                              placeholder="Cerca nel materiale..." 
                              className="w-full bg-slate-900 border border-slate-700 text-white pl-8 pr-7 py-2 rounded-lg text-xs outline-none focus:border-blue-500 transition-all"
                              value={itemSearch}
                              onChange={e => handleSearchChange(e.target.value)}
                              autoFocus
                          />
                          {itemSearch && (
                              <button onClick={() => handleSearchChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                  <X size={14} />
                              </button>
                          )}
                      </div>
                  </div>
              )}
          </div>

          {/* VIEW: ZONES (Standard) */}
          {viewMode === 'zones' && (
             <>
                {/* Zone Tabs */}
                <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto px-2 sm:px-4 gap-1 shrink-0">
                    {activeList?.zones?.map(zone => {
                        const hasZoneDeletions = activeList.deletedItems?.some(d => d.zoneName === zone.name);
                        const hasZoneChanges = zone.sections.some(s => s.components.some(c => isComponentUnresolved(c)));
                        const isModifiedZone = hasZoneDeletions || hasZoneChanges;

                        return (
                            <div
                                key={zone.id}
                                draggable={true}
                                onDragStart={(e) => handleZoneDragStart(e, zone.id)}
                                onDragOver={(e) => handleZoneDragOver(e, zone.id)}
                                onDragLeave={handleZoneDragLeave}
                                onDragEnd={handleZoneDragEnd}
                                onDrop={(e) => handleZoneDrop(e, zone.id)}
                                onClick={() => setActiveZoneId(zone.id)}
                                className={`px-3.5 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${draggedZoneId === zone.id ? 'opacity-30 scale-95 border-dashed border-slate-700' : ''} ${activeZoneId === zone.id ? 'border-blue-500 text-white bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'} ${getZoneDragIndicatorClass(zone.id)}`}
                            >
                                <span>{zone.name}</span>
                                {isModifiedZone && (
                                    <span 
                                        onClick={(e) => { e.stopPropagation(); setActiveZoneId(zone.id); setShowOnlyChanges(prev => !prev); }}
                                        className={`w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse hover:scale-150 transition-transform ${showOnlyChanges && activeZoneId === zone.id ? 'ring-2 ring-white scale-125' : ''}`} 
                                        title="Clicca per mostrare solo le modifiche" 
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setZoneForInfo(zone); }}
                                    className={`p-1 rounded transition-colors ${
                                        zone.notes && zone.notes.trim()
                                            ? 'text-yellow-400 hover:text-yellow-300 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]'
                                            : 'text-white hover:text-slate-200'
                                    }`}
                                    title={zone.notes && zone.notes.trim() ? "Info Zona (Presente Nota)" : "Info Zona"}
                                    aria-label="Info Zona"
                                >
                                    <Info size={13} />
                                </button>

                            </div>
                        );
                    })}
                </div>

                {/* Main Content (Zones) */}
                <div className="flex-1 overflow-y-auto p-2 sm:p-4 custom-scrollbar relative flex flex-col">
                    {showOnlyChanges && (
                        <div className="sticky top-0 left-0 right-0 z-20 bg-amber-600 text-black px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2 mb-4 shrink-0 rounded-lg">
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <AlertTriangle size={16} /> VISTA MODIFICHE ATTIVA: Mostrando solo gli oggetti aggiunti o variati
                            </div>
                            <button onClick={() => setShowOnlyChanges(false)} className="bg-black/20 hover:bg-black/30 px-3 py-1 rounded text-xs font-bold uppercase transition-colors">
                                MOSTRA TUTTO
                            </button>
                        </div>
                    )}

                    {highlightedItemName && (
                        <div className="sticky top-0 left-0 right-0 z-20 bg-blue-600 text-white px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2 mb-4 shrink-0 rounded-lg">
                            <div className="flex items-center gap-4">
                                <div className="font-bold text-sm flex items-center gap-2">
                                    <Search size={16} /> EVIDENZIATO: <span className="underline">{highlightedItemName}</span>
                                </div>
                                {highlightStats && (
                                    <div className="flex gap-3 text-xs border-l border-blue-400 pl-4">
                                        <div className="flex flex-col items-center leading-none" title="Quantità nei Kit">
                                            <span className="font-bold text-lg">{highlightStats.kit}</span>
                                            <span className="opacity-70 text-xs uppercase">Kit</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità negli Accessori">
                                            <span className="font-bold text-lg">{highlightStats.accessories}</span>
                                            <span className="opacity-70 text-xs uppercase">Acc.</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità Sfusi">
                                            <span className="font-bold text-lg">{highlightStats.loose}</span>
                                            <span className="opacity-70 text-xs uppercase">Sfusi</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setHighlightedItemName(null)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-bold uppercase transition-colors">
                                ESCI
                            </button>
                        </div>
                    )}

                    {activeZone ? (
                        <div className="space-y-3 sm:space-y-6">
                            
                            {/* DELETED ITEMS WARNING BLOCK */}
                            {zoneDeletedItems && zoneDeletedItems.length > 0 && (
                                <div className="bg-rose-500/10 dark:bg-rose-950/20 border border-rose-500/30 dark:border-rose-900/50 rounded-xl overflow-hidden mb-6">
                                    <div className="px-4 py-2 bg-rose-500/15 dark:bg-rose-900/20 border-b border-rose-500/20 dark:border-rose-900/30 text-rose-700 dark:text-rose-400 font-bold text-sm flex items-center justify-between">
                                        <div className="flex items-center gap-2"><AlertCircle size={16} /> MATERIALE RIMOSSO NELL'ULTIMA VERSIONE</div>
                                        <button 
                                            onClick={() => clearDeletedItems(activeZone.name)}
                                            className="text-xs bg-rose-600 text-white px-2.5 py-1 rounded-md font-bold hover:bg-rose-500 transition-colors shadow-sm"
                                        >
                                            NASCONDI SEGNALAZIONI
                                        </button>
                                    </div>
                                    <div className="divide-y divide-rose-500/15 dark:divide-rose-900/20">
                                        {zoneDeletedItems.map((del, idx) => {
                                            if (prepDatabaseFilter !== 'All') {
                                                const compDbId = getComponentDatabaseId(del.originalComponent);
                                                if (compDbId !== prepDatabaseFilter) return null;
                                            }
                                            if (prepCategoryFilter !== 'All' && (del.originalComponent.category || '').toLowerCase() !== prepCategoryFilter.toLowerCase()) return null;
                                            if (prepStatusFilter !== 'all' && prepStatusFilter !== 'aggiornati_non_preparati') return null;
                                            return (
                                                <div key={idx} className="p-3 flex flex-col gap-2 bg-rose-500/5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-800 dark:text-rose-300 font-bold text-xs shrink-0">0</div>
                                                        <div className="flex-1">
                                                            <div className="font-bold text-rose-950 dark:text-rose-200 line-through decoration-rose-600 text-sm">{del.originalComponent.name}</div>
                                                            <div className="text-xs text-rose-800 dark:text-rose-400 font-medium">Era in: {del.sectionName} • (Era: {del.originalComponent.quantity})</div>
                                                        </div>
                                                    </div>
                                                    {/* Deleted Contents/Accessories */}
                                                    {del.originalComponent.contents && del.originalComponent.contents.length > 0 && (
                                                        <div className="pl-12 space-y-1">
                                                            {del.originalComponent.contents.map((sub, subIdx) => (
                                                                <div key={subIdx} className="flex items-center gap-2 text-rose-800 dark:text-rose-400 text-xs font-medium">
                                                                    <span> - </span>
                                                                    <span className="line-through">{sub.name}</span>
                                                                    <span className="font-mono font-bold">x{sub.quantity * del.originalComponent.quantity}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {activeZone.sections.map(section => (
                                <div key={section.id} className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                                    <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-800/80 border-b border-slate-800 font-bold text-slate-400 text-xs sm:text-sm uppercase tracking-wider">
                                        {section.name}
                                    </div>
                                    <div className="divide-y divide-slate-800">
                                        {section.components.length === 0 && <div className="p-4 text-center text-slate-600 text-sm">Nessun materiale in questa sezione.</div>}
                                        {(() => {
                                            const rawComponents = section.components.flatMap(comp => {
                                                if (comp.type === 'template' && comp.templateContents) {
                                                    return comp.templateContents.map(tc => ({
                                                        ...tc,
                                                        quantity: tc.quantity * comp.quantity,
                                                    }));
                                                }
                                                return [comp];
                                            });

                                            // Raggruppamento per riquadro originario
                                            const groupedEntries: {
                                                comp: ListComponent;
                                                isGroupedReplacement: boolean;
                                                replacementChildren: ListComponent[];
                                                originalName?: string;
                                                originalQuantity?: number;
                                            }[] = [];

                                            const visitedGroupIds = new Set<string>();
                                            const handledUniqueIds = new Set<string>();

                                            for (const comp of rawComponents) {
                                                if (handledUniqueIds.has(comp.uniqueId)) continue;

                                                const groupId = comp.replacementInfo?.replacementGroupId;

                                                if (groupId && !visitedGroupIds.has(groupId)) {
                                                    visitedGroupIds.add(groupId);
                                                    const groupComps = rawComponents.filter(c => c.replacementInfo?.replacementGroupId === groupId);
                                                    groupComps.forEach(c => handledUniqueIds.add(c.uniqueId));

                                                    const originalItem = groupComps.find(c => 
                                                        c.name === c.replacementInfo?.originalName || 
                                                        c.uniqueId === c.replacementInfo?.originalUniqueId || 
                                                        !c.uniqueId.startsWith('rep-')
                                                    );

                                                    if (originalItem) {
                                                        const children = groupComps.filter(c => c.uniqueId !== originalItem.uniqueId);
                                                        groupedEntries.push({
                                                            comp: originalItem,
                                                            isGroupedReplacement: children.length > 0 || !!originalItem.replacementInfo,
                                                            replacementChildren: children,
                                                            originalName: originalItem.replacementInfo?.originalName || originalItem.name,
                                                            originalQuantity: originalItem.replacementInfo?.originalQuantity ?? originalItem.quantity
                                                        });
                                                    } else {
                                                        const repInfo = groupComps[0].replacementInfo!;
                                                        const virtualParent: ListComponent = {
                                                            uniqueId: repInfo.originalUniqueId || `orig-${groupId}`,
                                                            type: repInfo.originalType || 'item',
                                                            referenceId: repInfo.originalReferenceId || '',
                                                            name: repInfo.originalName,
                                                            quantity: 0,
                                                            category: repInfo.originalCategory || groupComps[0].category,
                                                            databaseId: repInfo.originalDatabaseId || groupComps[0].databaseId,
                                                            warehouseState: repInfo.originalWarehouseState,
                                                            contents: repInfo.originalContents?.map(sub => ({
                                                                itemId: sub.itemId,
                                                                name: sub.name,
                                                                quantity: sub.quantity,
                                                                category: sub.category,
                                                                warehouseState: sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' }
                                                            })),
                                                            replacementInfo: repInfo
                                                        };
                                                        groupedEntries.push({
                                                            comp: virtualParent,
                                                            isGroupedReplacement: true,
                                                            replacementChildren: groupComps,
                                                            originalName: repInfo.originalName,
                                                            originalQuantity: repInfo.originalQuantity
                                                        });
                                                    }
                                                } else if (!groupId) {
                                                    handledUniqueIds.add(comp.uniqueId);
                                                    groupedEntries.push({
                                                        comp,
                                                        isGroupedReplacement: false,
                                                        replacementChildren: []
                                                    });
                                                }
                                            }

                                            return groupedEntries.map(({ comp, isGroupedReplacement, replacementChildren, originalName, originalQuantity }, compIdx) => {
                                            if (prepDatabaseFilter !== 'All') {
                                                const compDbId = getComponentDatabaseId(comp);
                                                if (compDbId !== prepDatabaseFilter) return null;
                                            }
                                            if (prepCategoryFilter !== 'All' && (comp.category || '').toLowerCase() !== prepCategoryFilter.toLowerCase()) return null;
                                            if (!matchesPrepStatusFilter(comp, isGroupedReplacement, replacementChildren)) return null;
                                            const isKit = comp.type === 'kit';
                                            const isGroupCard = isGroupedReplacement && (replacementChildren.length > 0 || !!comp.replacementInfo);

                                            // 1. UNIFIED GROUP CARD (SOSTITUZIONI / MODIFICHE: SIA ITEM CHE KIT)
                                            if (isGroupCard) {
                                                const ws = comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                const hasChanged = ws.changeLog !== undefined;
                                                const showChangeWarning = hasChanged && !isComponentUnresolved(comp) ? false : hasChanged;

                                                // Highlight & Search Logic
                                                const isFilterActive = !!highlightedItemName || !!itemSearch;
                                                const checkMatch = (name: string) => highlightedItemName ? name === highlightedItemName : (itemSearch ? isTextMatch(name, itemSearch) : false);

                                                const isMatch = checkMatch(comp.name);
                                                const hasSubMatch = comp.contents?.some(c => checkMatch(c.name));
                                                const hasRepMatch = replacementChildren.some(c => checkMatch(c.name) || c.contents?.some(sc => checkMatch(sc.name)));

                                                // Filter Logic: Search + Changes Filter
                                                if (isFilterActive && !isMatch && !hasSubMatch && !hasRepMatch) return null;
                                                if (showOnlyChanges && !hasChanged && !replacementChildren.some(c => c.warehouseState?.changeLog !== undefined)) return null;

                                                const isContainerOfMatch = isFilterActive && (hasSubMatch || hasRepMatch);

                                                return (
                                                    <div key={comp.uniqueId} className="my-2 sm:my-2.5 mx-0.5 sm:mx-1 rounded-xl !border !border-amber-500/40 ring-1 ring-amber-500/20 bg-gradient-to-b from-amber-950/20 via-slate-900/90 to-slate-900/90 shadow-[0_0_15px_rgba(245,158,11,0.06)] overflow-hidden divide-y divide-slate-800/80 transition-all">
                                                        {/* TESTATA: OGGETTO O KIT ORIGINARIO DI RIFERIMENTO */}
                                                        <div className={`py-1.5 px-2.5 sm:px-3 flex flex-row items-center justify-between gap-2 transition-all duration-300 ${isContainerOfMatch ? 'opacity-70' : 'opacity-100'} ${ws.isBroken ? 'bg-rose-900/15' : 'bg-amber-500/[0.05] hover:bg-amber-500/[0.09]'}`}>
                                                            {/* Info Oggetto Originario */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                                    {isKit && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                                                                            KIT
                                                                        </span>
                                                                    )}
                                                                    <span 
                                                                        className={`font-bold text-sm cursor-pointer hover:underline truncate whitespace-normal ${isMatch ? 'text-blue-400' : 'text-white'} ${comp.quantity === 0 ? 'line-through text-slate-400' : ''}`}
                                                                        onClick={() => handleSetHighlight(highlightedItemName === comp.name ? null : comp.name)}
                                                                    >
                                                                        {comp.name}
                                                                        {comp.isTemporary && <span className="bg-yellow-400 text-black text-xs font-bold px-1.5 py-0.5 rounded ml-2 shrink-0">TEMP</span>}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setReplacementModal({
                                                                                isOpen: true,
                                                                                targetComponent: comp,
                                                                                targetZoneName: activeZone.name,
                                                                                targetSectionName: section.name,
                                                                                targetAccessoryIndex: null
                                                                            });
                                                                        }}
                                                                        className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50 hover:bg-amber-500/40 flex items-center gap-0.5 sm:gap-1 transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                                                                        title="Materiale Modificato: Clicca per visualizzare le modifiche o ripristinare"
                                                                    >
                                                                        <ArrowLeftRight size={10} className="text-amber-400" />
                                                                        <span className="sm:hidden">Mod.</span>
                                                                        <span className="hidden sm:inline">MODIFICATO</span>
                                                                    </button>
                                                                    {comp.quantity > 0 ? (
                                                                        <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0 bg-amber-500 text-black shadow-sm">
                                                                            x{comp.quantity}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0 bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                                                            0x (Sostituito)
                                                                        </span>
                                                                    )}
                                                                    {originalQuantity !== undefined && originalQuantity !== comp.quantity && (
                                                                        <span className="text-xs font-semibold text-slate-400">
                                                                            (Era: {originalQuantity} pz)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {comp.notes && <div className="text-xs text-amber-500 font-bold mt-0.5 truncate">• Nota Prod: {comp.notes}</div>}
                                                                
                                                                {ws.warehouseNote && (
                                                                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                                                                        <span className="font-normal">Note Magazzino: </span><span className="font-bold">{ws.warehouseNote}</span>
                                                                    </div>
                                                                )}
                                                                {ws.isBroken && (
                                                                    <div className="mt-0.5">
                                                                        <div className="text-rose-500 text-xs font-bold flex items-center gap-1 uppercase">
                                                                            <AlertOctagon size={12}/> {ws.brokenNote || 'SEGNALATO ROTTO / MANCANTE'}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Controlli Testata */}
                                                            <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                                <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                                    <button 
                                                                        type="button"
                                                                        onClick={(e) => { 
                                                                            e.stopPropagation(); 
                                                                            setReplacementModal({
                                                                                isOpen: true,
                                                                                targetComponent: comp,
                                                                                targetZoneName: activeZone.name,
                                                                                targetSectionName: section.name,
                                                                                targetAccessoryIndex: null
                                                                            }); 
                                                                        }}
                                                                        disabled={isReadOnly}
                                                                        className={`p-1 sm:p-1.5 rounded-lg border transition-colors bg-amber-500/30 text-amber-300 border-amber-500 shadow-sm hover:bg-amber-500/40 ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                        title="Modifica o ripristina la sostituzione"
                                                                    >
                                                                        <ArrowLeftRight size={16} />
                                                                    </button>
                                                                    <button 
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.warehouseNote || '' }); }}
                                                                        disabled={isReadOnly}
                                                                        className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${ws.warehouseNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                        title="Aggiungi Nota Magazzino"
                                                                    >
                                                                        <MessageSquare size={16} className={ws.warehouseNote ? 'fill-current' : ''} />
                                                                    </button>
                                                                    <button 
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.brokenNote || '' }); }}
                                                                        disabled={isReadOnly}
                                                                        className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${ws.isBroken ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                        title={ws.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                    >
                                                                        <AlertTriangle size={16} className={ws.isBroken ? 'fill-current' : ''} />
                                                                    </button>
                                                                </div>

                                                                {/* Checkbox Testata */}
                                                                <div className="flex items-center gap-1 sm:gap-2">
                                                                    {(() => {
                                                                        const isResolved = isWsCheckedForCurrentMode(ws);
                                                                        const showWarning = hasChanged && !isResolved;
                                                                        const isZero = comp.quantity === 0;

                                                                        const getMobileClass = (type: string) => {
                                                                            if (activeWarehouseMode === 'visualizza') {
                                                                                return (type === 'carico' || type === 'rientro') ? 'flex' : 'hidden';
                                                                            }
                                                                            if (activeWarehouseMode && activeWarehouseMode !== type) return 'hidden';
                                                                            return 'flex';
                                                                        };

                                                                        if (isZero) {
                                                                            const renderDisabledSlot = (type: string, label: string) => (
                                                                                <div key={type} className={`${getMobileClass(type)} flex-col items-center gap-0.5`}>
                                                                                    <span className="text-[10px] text-slate-600 font-bold uppercase hidden sm:block">{label}</span>
                                                                                    <div 
                                                                                        className="p-1 rounded-lg flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] cursor-not-allowed opacity-40"
                                                                                        title="Non da caricare (0 pz)"
                                                                                    >
                                                                                        <div className="w-[22px] h-[22px] sm:w-5 sm:h-5 rounded-md border border-slate-700/60 bg-slate-800/40 flex items-center justify-center text-slate-500">
                                                                                            <Minus size={13} strokeWidth={2.5} />
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );

                                                                            return (
                                                                                <>
                                                                                    {renderDisabledSlot('distinta', 'Dist.')}
                                                                                    {renderDisabledSlot('carico', 'Car.')}
                                                                                    {renderDisabledSlot('rientro', 'Rie.')}
                                                                                </>
                                                                            );
                                                                        }

                                                                        if (isKit) {
                                                                            return null;
                                                                        }

                                                                        return (
                                                                            <>
                                                                                {hasChanged && renderModifiedWarningBadge(`item-${comp.uniqueId}`, ws.changeLog, comp.quantity, comp.name, !showWarning)}
                                                                                <div className={`${getMobileClass('distinta')} flex-col items-center gap-0.5`}>
                                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Dist.</span>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateComponentState(comp.uniqueId, { inDistinta: !ws.inDistinta }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${ws.inDistinta ? 'text-emerald-500' : showWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {renderWarehouseCheckboxIcon(Boolean(ws.inDistinta), Boolean(showWarning), Boolean(ws.changeLog?.wasChecked), 26, 'sm:w-6 sm:h-6', 16, 'sm:w-4 sm:h-4')}
                                                                                    </button>
                                                                                </div>
                                                                                <div className={`${getMobileClass('carico')} flex-col items-center gap-0.5`}>
                                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Car.</span>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateComponentState(comp.uniqueId, { loaded: !ws.loaded }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${ws.loaded ? 'text-blue-500' : showWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {renderWarehouseCheckboxIcon(Boolean(ws.loaded), Boolean(showWarning), Boolean(ws.changeLog?.wasChecked), 26, 'sm:w-6 sm:h-6', 16, 'sm:w-4 sm:h-4')}
                                                                                    </button>
                                                                                </div>
                                                                                <div className={`${getMobileClass('rientro')} flex-col items-center gap-0.5`}>
                                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Rie.</span>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateComponentState(comp.uniqueId, { returned: !ws.returned }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${ws.returned ? 'text-purple-500' : showWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {renderWarehouseCheckboxIcon(Boolean(ws.returned), Boolean(showWarning), Boolean(ws.changeLog?.wasChecked), 26, 'sm:w-6 sm:h-6', 16, 'sm:w-4 sm:h-4')}
                                                                                    </button>
                                                                                </div>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Eventuali accessori/materiali dell'oggetto originario */}
                                                        {comp.contents?.map((sub, subIdx) => {
                                                            const subWs = sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                            const totalQty = comp.quantity === 0 ? 0 : (sub.replacementInfo ? sub.quantity : sub.quantity * comp.quantity);
                                                            const contentWarning = hasChanged && (!subWs.inDistinta || !subWs.loaded);
                                                            const isSubMatch = checkMatch(sub.name);

                                                            return (
                                                                <div key={`${comp.uniqueId}-orig-sub-${subIdx}`} className={`pl-5 sm:pl-8 pr-2 sm:pr-3 py-1 border-b border-slate-800/50 flex flex-row items-center justify-between gap-1.5 sm:gap-4 transition-all duration-300 ${subWs.isBroken ? 'bg-rose-900/10' : sub.replacementInfo ? 'bg-amber-950/20 border-l-2 border-amber-500' : contentWarning ? 'bg-amber-900/10' : 'hover:bg-slate-800/30'}`}>
                                                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                                                        {isKit ? (
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 shrink-0"></div>
                                                                        ) : (
                                                                            <div className="text-cyan-500/50 shrink-0"> - </div>
                                                                        )}
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span 
                                                                                className={`font-medium text-xs sm:text-sm cursor-pointer hover:underline truncate whitespace-normal ${isSubMatch ? 'text-blue-400 font-bold' : 'text-slate-400'} ${comp.quantity === 0 ? 'line-through text-slate-500' : ''}`}
                                                                                onClick={() => handleSetHighlight(highlightedItemName === sub.name ? null : sub.name)}
                                                                            >
                                                                                {sub.name}
                                                                            </span>
                                                                            {comp.quantity === 0 ? (
                                                                                <span className="text-[11px] sm:text-xs px-1.5 py-0.2 rounded font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40">0x (Sostituito)</span>
                                                                            ) : (
                                                                                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${contentWarning ? 'bg-amber-500 text-black font-bold' : 'bg-cyan-900/20 text-cyan-400'}`}>x{totalQty}</span>
                                                                            )}
                                                                            {sub.replacementInfo && (
                                                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50 flex items-center gap-1">
                                                                                    MODIFICATO
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                                        <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                                            <button 
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.warehouseNote || '' }); }}
                                                                                className={`p-1 rounded-lg hover:bg-slate-700 transition-colors ${subWs.warehouseNote ? 'text-blue-400' : 'text-slate-600'}`}
                                                                                title="Aggiungi Nota Magazzino"
                                                                            >
                                                                                <MessageSquare size={15} className={subWs.warehouseNote ? 'fill-current' : ''} />
                                                                            </button>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.brokenNote || '' }); }}
                                                                                disabled={isReadOnly}
                                                                                className={`p-1 rounded-lg hover:bg-slate-700 transition-colors ${subWs.isBroken ? 'text-rose-500' : 'text-slate-600'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                title={subWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                            >
                                                                                <AlertTriangle size={15} className={subWs.isBroken ? 'fill-current' : ''} />
                                                                            </button>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 sm:gap-2">
                                                                            {comp.quantity === 0 ? (
                                                                                ['distinta', 'carico', 'rientro'].map(type => {
                                                                                    const isVisible = activeWarehouseMode === 'visualizza' 
                                                                                        ? (type === 'carico' || type === 'rientro') 
                                                                                        : (!activeWarehouseMode || activeWarehouseMode === type);
                                                                                    return isVisible ? (
                                                                                        <div key={type} className="flex flex-col items-center">
                                                                                            <div className="p-1 min-w-[38px] min-h-[38px] sm:min-w-[30px] sm:min-h-[30px] flex items-center justify-center opacity-30 cursor-not-allowed" title="Non da caricare (0 pz)">
                                                                                                <Minus size={14} className="text-slate-500" />
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : null;
                                                                                })
                                                                            ) : (
                                                                                <>
                                                                                    <div className={`${activeWarehouseMode && activeWarehouseMode !== 'distinta' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                        <button 
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { inDistinta: !subWs.inDistinta }); }} 
                                                                                            disabled={isReadOnly} 
                                                                                            className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[30px] sm:min-h-[30px] active:scale-95 transition-all ${subWs.inDistinta ? 'text-emerald-500' : 'text-slate-600'}`}
                                                                                        >
                                                                                            {subWs.inDistinta ? <CheckSquare size={24} className="sm:w-5 sm:h-5" /> : <Square size={24} className="sm:w-5 sm:h-5" />}
                                                                                        </button>
                                                                                    </div>
                                                                                    <div className={`${activeWarehouseMode && activeWarehouseMode !== 'carico' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                        <button 
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { loaded: !subWs.loaded }); }} 
                                                                                            disabled={isReadOnly} 
                                                                                            className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[30px] sm:min-h-[30px] active:scale-95 transition-all ${subWs.loaded ? 'text-blue-500' : 'text-slate-600'}`}
                                                                                        >
                                                                                            {subWs.loaded ? <CheckSquare size={24} className="sm:w-5 sm:h-5" /> : <Square size={24} className="sm:w-5 sm:h-5" />}
                                                                                        </button>
                                                                                    </div>
                                                                                    <div className={`${activeWarehouseMode && activeWarehouseMode !== 'rientro' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                        <button 
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { returned: !subWs.returned }); }} 
                                                                                            disabled={isReadOnly} 
                                                                                            className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[30px] sm:min-h-[30px] active:scale-95 transition-all ${subWs.returned ? 'text-purple-500' : 'text-slate-600'}`}
                                                                                        >
                                                                                            {subWs.returned ? <CheckSquare size={24} className="sm:w-5 sm:h-5" /> : <Square size={24} className="sm:w-5 sm:h-5" />}
                                                                                        </button>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {/* RIGHE AGGIUNTE / SOSTITUZIONI ALL'INTERNO DEL RIQUADRO ORIGINARIO */}
                                                        {replacementChildren.map((repComp, repIdx) => {
                                                            const repWs = repComp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                            const repMatch = checkMatch(repComp.name);
                                                            const isRepKit = repComp.type === 'kit';

                                                            const getMobileClass = (type: string) => {
                                                                if (activeWarehouseMode === 'visualizza') {
                                                                    return (type === 'carico' || type === 'rientro') ? 'flex' : 'hidden';
                                                                }
                                                                if (activeWarehouseMode && activeWarehouseMode !== type) return 'hidden';
                                                                return 'flex';
                                                            };

                                                            if (isRepKit) {
                                                                return (
                                                                    <React.Fragment key={repComp.uniqueId || `rep-kit-${repIdx}`}>
                                                                        {/* Intestazione Kit Sostitutivo (No Checkboxes sul kit stesso) */}
                                                                        <div className={`py-1.5 px-2.5 sm:px-3 pl-3.5 sm:pl-6 flex flex-row items-center justify-between gap-2 bg-purple-950/20 border-t border-purple-500/20 ${repWs.isBroken ? 'bg-rose-900/10' : ''}`}>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                                                    <CornerDownRight size={14} className="text-amber-400 shrink-0" />
                                                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/25 text-purple-300 border border-purple-500/40 shrink-0">
                                                                                        KIT
                                                                                    </span>
                                                                                    <span 
                                                                                        className={`font-bold text-xs sm:text-sm cursor-pointer hover:underline truncate whitespace-normal ${repMatch ? 'text-blue-400 font-bold' : 'text-purple-100'}`}
                                                                                        onClick={() => handleSetHighlight(highlightedItemName === repComp.name ? null : repComp.name)}
                                                                                    >
                                                                                        {repComp.name}
                                                                                        {repComp.isTemporary && <span className="bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded ml-1 shrink-0">TEMP</span>}
                                                                                    </span>
                                                                                    <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0 bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                                                                        x{repComp.quantity}
                                                                                    </span>
                                                                                </div>
                                                                                {repComp.notes && <div className="text-xs text-amber-500 font-bold mt-0.5 pl-5 truncate">• Nota Prod: {repComp.notes}</div>}
                                                                                {repWs.warehouseNote && (
                                                                                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 pl-5">
                                                                                        <span className="font-normal">Note Magazzino: </span><span className="font-bold">{repWs.warehouseNote}</span>
                                                                                    </div>
                                                                                )}
                                                                                {repWs.isBroken && (
                                                                                    <div className="mt-0.5 pl-5">
                                                                                        <div className="text-rose-500 text-xs font-bold flex items-center gap-1 uppercase">
                                                                                            <AlertOctagon size={12}/> {repWs.brokenNote || 'SEGNALATO ROTTO / MANCANTE'}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ uniqueId: repComp.uniqueId }], text: repWs.warehouseNote || '' }); }}
                                                                                    disabled={isReadOnly}
                                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${repWs.warehouseNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                    title="Aggiungi Nota Magazzino"
                                                                                >
                                                                                    <MessageSquare size={16} className={repWs.warehouseNote ? 'fill-current' : ''} />
                                                                                </button>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ uniqueId: repComp.uniqueId }], text: repWs.brokenNote || '' }); }}
                                                                                    disabled={isReadOnly}
                                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${repWs.isBroken ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                    title={repWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                                >
                                                                                    <AlertTriangle size={16} className={repWs.isBroken ? 'fill-current' : ''} />
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {/* Articoli del Kit Sostitutivo */}
                                                                        {repComp.contents?.map((childSub, childSubIdx) => {
                                                                            const childSubWs = childSub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                                            const childTotalQty = childSub.quantity * repComp.quantity;
                                                                            const isChildMatch = checkMatch(childSub.name);

                                                                            return (
                                                                                <div key={`rep-kit-${repComp.uniqueId}-sub-${childSubIdx}`} className="pl-6 sm:pl-10 pr-2 sm:pr-3 py-1 bg-slate-950/60 border-t border-slate-800/40 flex flex-row items-center justify-between gap-1.5 sm:gap-4 hover:bg-slate-800/20 transition-colors">
                                                                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                                                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0"></div>
                                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                                            <span 
                                                                                                className={`font-medium text-xs sm:text-sm cursor-pointer hover:underline truncate whitespace-normal ${isChildMatch ? 'text-blue-400 font-bold' : 'text-slate-200'}`}
                                                                                                onClick={() => handleSetHighlight(highlightedItemName === childSub.name ? null : childSub.name)}
                                                                                            >
                                                                                                {childSub.name}
                                                                                            </span>
                                                                                            <span className="text-xs px-1.5 py-0.2 rounded font-mono bg-purple-900/30 text-purple-300 border border-purple-500/20 font-bold">
                                                                                                x{childTotalQty}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                                                        <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                                                            <button 
                                                                                                type="button"
                                                                                                onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ parentId: repComp.uniqueId, childIdx: childSubIdx }], text: childSubWs.warehouseNote || '' }); }}
                                                                                                className={`p-1 rounded-lg hover:bg-slate-700 transition-colors ${childSubWs.warehouseNote ? 'text-blue-400' : 'text-slate-600'}`}
                                                                                                title="Aggiungi Nota Magazzino"
                                                                                            >
                                                                                                <MessageSquare size={15} className={childSubWs.warehouseNote ? 'fill-current' : ''} />
                                                                                            </button>
                                                                                            <button 
                                                                                                type="button"
                                                                                                onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ parentId: repComp.uniqueId, childIdx: childSubIdx }], text: childSubWs.brokenNote || '' }); }}
                                                                                                disabled={isReadOnly}
                                                                                                className={`p-1 rounded-lg hover:bg-slate-700 transition-colors ${childSubWs.isBroken ? 'text-rose-500' : 'text-slate-600'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                                title={childSubWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                                            >
                                                                                                <AlertTriangle size={15} className={childSubWs.isBroken ? 'fill-current' : ''} />
                                                                                            </button>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1 sm:gap-2">
                                                                                            <div className={`${activeWarehouseMode && activeWarehouseMode !== 'distinta' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                                <button 
                                                                                                    type="button"
                                                                                                    onClick={(e) => { e.stopPropagation(); updateContentState(repComp.uniqueId, childSubIdx, { inDistinta: !childSubWs.inDistinta }); }} 
                                                                                                    disabled={isReadOnly} 
                                                                                                    className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[28px] sm:min-h-[28px] active:scale-95 transition-all ${childSubWs.inDistinta ? 'text-emerald-500' : 'text-slate-600'}`}
                                                                                                >
                                                                                                    {childSubWs.inDistinta ? <CheckSquare size={22} className="sm:w-5 sm:h-5" /> : <Square size={22} className="sm:w-5 sm:h-5 text-slate-600" />}
                                                                                                </button>
                                                                                            </div>
                                                                                            <div className={`${activeWarehouseMode && activeWarehouseMode !== 'carico' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                                <button 
                                                                                                    type="button"
                                                                                                    onClick={(e) => { e.stopPropagation(); updateContentState(repComp.uniqueId, childSubIdx, { loaded: !childSubWs.loaded }); }} 
                                                                                                    disabled={isReadOnly} 
                                                                                                    className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[28px] sm:min-h-[28px] active:scale-95 transition-all ${childSubWs.loaded ? 'text-blue-500' : 'text-slate-600'}`}
                                                                                                >
                                                                                                    {childSubWs.loaded ? <CheckSquare size={22} className="sm:w-5 sm:h-5" /> : <Square size={22} className="sm:w-5 sm:h-5 text-slate-600" />}
                                                                                                </button>
                                                                                            </div>
                                                                                            <div className={`${activeWarehouseMode && activeWarehouseMode !== 'rientro' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                                <button 
                                                                                                    type="button"
                                                                                                    onClick={(e) => { e.stopPropagation(); updateContentState(repComp.uniqueId, childSubIdx, { returned: !childSubWs.returned }); }} 
                                                                                                    disabled={isReadOnly} 
                                                                                                    className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[28px] sm:min-h-[28px] active:scale-95 transition-all ${childSubWs.returned ? 'text-purple-500' : 'text-slate-600'}`}
                                                                                                >
                                                                                                    {childSubWs.returned ? <CheckSquare size={22} className="sm:w-5 sm:h-5" /> : <Square size={22} className="sm:w-5 sm:h-5 text-slate-600" />}
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </React.Fragment>
                                                                );
                                                            }

                                                            // Standard item replacement
                                                            return (
                                                                <React.Fragment key={repComp.uniqueId || `rep-child-${repIdx}`}>
                                                                    <div className={`py-1.5 px-2.5 sm:px-3 pl-3.5 sm:pl-7 flex flex-row items-center justify-between gap-2 bg-slate-950/50 hover:bg-slate-800/40 transition-colors ${repWs.isBroken ? 'bg-rose-900/10' : ''}`}>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                                                <CornerDownRight size={14} className="text-amber-400 shrink-0" />
                                                                                <span 
                                                                                    className={`font-semibold text-xs sm:text-sm cursor-pointer hover:underline truncate whitespace-normal ${repMatch ? 'text-blue-400 font-bold' : 'text-slate-200'}`}
                                                                                    onClick={() => handleSetHighlight(highlightedItemName === repComp.name ? null : repComp.name)}
                                                                                >
                                                                                    {repComp.name}
                                                                                    {repComp.isTemporary && <span className="bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded ml-1 shrink-0">TEMP</span>}
                                                                                </span>
                                                                                <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0 bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                                                    x{repComp.quantity}
                                                                                </span>
                                                                            </div>
                                                                            {repComp.notes && <div className="text-xs text-amber-500 font-bold mt-0.5 pl-5 truncate">• Nota Prod: {repComp.notes}</div>}
                                                                            {repWs.warehouseNote && (
                                                                                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 pl-5">
                                                                                    <span className="font-normal">Note Magazzino: </span><span className="font-bold">{repWs.warehouseNote}</span>
                                                                                </div>
                                                                            )}
                                                                            {repWs.isBroken && (
                                                                                <div className="mt-0.5 pl-5">
                                                                                    <div className="text-rose-500 text-xs font-bold flex items-center gap-1 uppercase">
                                                                                        <AlertOctagon size={12}/> {repWs.brokenNote || 'SEGNALATO ROTTO / MANCANTE'}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                                            <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ uniqueId: repComp.uniqueId }], text: repWs.warehouseNote || '' }); }}
                                                                                    disabled={isReadOnly}
                                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${repWs.warehouseNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                    title="Aggiungi Nota Magazzino"
                                                                                >
                                                                                    <MessageSquare size={16} className={repWs.warehouseNote ? 'fill-current' : ''} />
                                                                                </button>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ uniqueId: repComp.uniqueId }], text: repWs.brokenNote || '' }); }}
                                                                                    disabled={isReadOnly}
                                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${repWs.isBroken ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                    title={repWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                                >
                                                                                    <AlertTriangle size={16} className={repWs.isBroken ? 'fill-current' : ''} />
                                                                                </button>
                                                                            </div>

                                                                            <div className="flex items-center gap-1 sm:gap-2">
                                                                                <div className={`${getMobileClass('distinta')} flex-col items-center gap-0.5`}>
                                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Dist.</span>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateComponentState(repComp.uniqueId, { inDistinta: !repWs.inDistinta }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${repWs.inDistinta ? 'text-emerald-500' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {repWs.inDistinta ? <CheckSquare size={26} className="sm:w-6 sm:h-6" /> : <Square size={26} className="sm:w-6 sm:h-6 text-slate-600" />}
                                                                                    </button>
                                                                                </div>
                                                                                <div className={`${getMobileClass('carico')} flex-col items-center gap-0.5`}>
                                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Car.</span>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateComponentState(repComp.uniqueId, { loaded: !repWs.loaded }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${repWs.loaded ? 'text-blue-500' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {repWs.loaded ? <CheckSquare size={26} className="sm:w-6 sm:h-6" /> : <Square size={26} className="sm:w-6 sm:h-6 text-slate-600" />}
                                                                                    </button>
                                                                                </div>
                                                                                <div className={`${getMobileClass('rientro')} flex-col items-center gap-0.5`}>
                                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Rie.</span>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateComponentState(repComp.uniqueId, { returned: !repWs.returned }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${repWs.returned ? 'text-purple-500' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {repWs.returned ? <CheckSquare size={26} className="sm:w-6 sm:h-6" /> : <Square size={26} className="sm:w-6 sm:h-6" />}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Accessori dell'oggetto aggiunto, se presenti */}
                                                                    {repComp.contents?.map((childSub, childSubIdx) => {
                                                                        const childSubWs = childSub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                                        const childTotalQty = childSub.quantity * repComp.quantity;
                                                                        return (
                                                                            <div key={`rep-${repComp.uniqueId}-acc-${childSubIdx}`} className="pl-6 sm:pl-12 pr-2 sm:pr-3 py-1 bg-slate-950/60 border-t border-slate-800/40 flex flex-row items-center justify-between gap-1.5 sm:gap-4">
                                                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                                                    <div className="text-cyan-500/50 shrink-0"> - </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="font-medium text-xs text-slate-400">{childSub.name}</span>
                                                                                        <span className="text-xs px-1 py-0.2 rounded font-mono bg-cyan-900/20 text-cyan-300">x{childTotalQty}</span>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                                                                    <div className={`${activeWarehouseMode && activeWarehouseMode !== 'distinta' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                        <button 
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); updateContentState(repComp.uniqueId, childSubIdx, { inDistinta: !childSubWs.inDistinta }); }} 
                                                                                            disabled={isReadOnly} 
                                                                                            className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[28px] sm:min-h-[28px] active:scale-95 transition-all ${childSubWs.inDistinta ? 'text-emerald-500' : 'text-slate-600'}`}
                                                                                        >
                                                                                            {childSubWs.inDistinta ? <CheckSquare size={22} className="sm:w-5 sm:h-5" /> : <Square size={22} className="sm:w-5 sm:h-5 text-slate-600" />}
                                                                                        </button>
                                                                                    </div>
                                                                                    <div className={`${activeWarehouseMode && activeWarehouseMode !== 'carico' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                        <button 
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); updateContentState(repComp.uniqueId, childSubIdx, { loaded: !childSubWs.loaded }); }} 
                                                                                            disabled={isReadOnly} 
                                                                                            className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[28px] sm:min-h-[28px] active:scale-95 transition-all ${childSubWs.loaded ? 'text-blue-500' : 'text-slate-600'}`}
                                                                                        >
                                                                                            {childSubWs.loaded ? <CheckSquare size={22} className="sm:w-5 sm:h-5" /> : <Square size={22} className="sm:w-5 sm:h-5 text-slate-600" />}
                                                                                        </button>
                                                                                    </div>
                                                                                    <div className={`${activeWarehouseMode && activeWarehouseMode !== 'rientro' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                        <button 
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); updateContentState(repComp.uniqueId, childSubIdx, { returned: !childSubWs.returned }); }} 
                                                                                            disabled={isReadOnly} 
                                                                                            className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[28px] sm:min-h-[28px] active:scale-95 transition-all ${childSubWs.returned ? 'text-purple-500' : 'text-slate-600'}`}
                                                                                        >
                                                                                            {childSubWs.returned ? <CheckSquare size={22} className="sm:w-5 sm:h-5" /> : <Square size={22} className="sm:w-5 sm:h-5" />}
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }

                                            // 2. IF KIT: Render Header + Contents
                                            if (isKit) {
                                                const ws = comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                const hasChanged = ws.changeLog !== undefined;
                                                const showChangeWarning = hasChanged && isComponentUnresolved({ ...comp, warehouseState: ws }); 
                                                
                                                // Highlight Logic
                                                const isFilterActive = !!highlightedItemName || !!itemSearch;
                                                const checkMatch = (name: string) => highlightedItemName ? name === highlightedItemName : (itemSearch ? isTextMatch(name, itemSearch) : false);

                                                const isMainMatch = checkMatch(comp.name);
                                                const hasSubMatch = comp.contents?.some(c => checkMatch(c.name));
                                                
                                                // Filter Logic: Search + Changes Filter
                                                if (isFilterActive && !isMainMatch && !hasSubMatch) return null;
                                                if (showOnlyChanges && !hasChanged) return null;

                                                const isContainerOfMatch = isFilterActive && hasSubMatch;

                                                return (
                                                    <React.Fragment key={comp.uniqueId}>
                                                        {/* Kit Header (No Checkboxes) */}
                                                        {(() => {
                                                            const isKitModified = !!comp.replacementInfo;
                                                            return (
                                                                <div className={`py-1 px-2.5 sm:px-3 border-l-4 flex flex-row items-center justify-between gap-2 transition-all duration-300 ${isContainerOfMatch ? 'opacity-70' : 'opacity-100'} ${isKitModified ? 'my-2 mx-0.5 sm:mx-1 rounded-xl !border !border-amber-500/40 ring-1 ring-amber-500/20 bg-gradient-to-b from-amber-950/20 to-slate-900/90 shadow-sm' : showChangeWarning ? 'border-l-4 bg-amber-900/5 border-amber-500' : 'border-l-4 bg-purple-900/10 border-purple-500/50'}`}>
                                                                    <div className={`flex-1 min-w-0 transition-opacity ${isFilterActive && !isMainMatch ? 'opacity-50' : 'opacity-100'}`}>
                                                                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                                                                                KIT
                                                                            </span>
                                                                            <span 
                                                                                className={`font-bold text-sm cursor-pointer hover:underline truncate whitespace-normal ${isMainMatch ? 'text-blue-400 scale-105 origin-left' : 'text-white'}`}
                                                                                onClick={() => handleSetHighlight(highlightedItemName === comp.name ? null : comp.name)}
                                                                            >
                                                                                {comp.name}
                                                                            </span>
                                                                            <span className={`${showChangeWarning ? 'bg-amber-500 text-black' : isKitModified ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-800 text-slate-400'} px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0`}>x{comp.quantity}</span>
                                                                            {hasChanged && (
                                                                                <span className="text-xs font-medium ml-1">
                                                                                    {ws.changeLog?.previousName
                                                                                        ? <span className={showChangeWarning ? "text-amber-400 font-bold" : "text-slate-400 font-normal"}>(Era: {ws.changeLog.previousQuantity ? `${ws.changeLog.previousQuantity}x ` : ''}{ws.changeLog.previousName} {formatVersionLabel(ws.changeLog?.previousVersion || previousVersion)})</span>
                                                                                        : ws.changeLog?.previousQuantity === undefined
                                                                                            ? <span className={showChangeWarning ? "text-emerald-400 font-bold uppercase tracking-wider text-xs" : "text-slate-400 font-normal uppercase tracking-wider text-xs"}> (NUOVO KIT)</span>
                                                                                            : <span className={showChangeWarning ? "text-amber-400 font-bold" : "text-slate-400 font-normal"}>(Era: {ws.changeLog?.previousQuantity} {formatVersionLabel(ws.changeLog?.previousVersion || previousVersion)})</span>
                                                                                    }
                                                                                </span>
                                                                            )}
                                                                            {isKitModified && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setReplacementModal({
                                                                                            isOpen: true,
                                                                                            targetComponent: comp,
                                                                                            targetZoneName: activeZone.name,
                                                                                            targetSectionName: section.name,
                                                                                            targetAccessoryIndex: null
                                                                                        });
                                                                                    }}
                                                                                    className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50 hover:bg-amber-500/40 flex items-center gap-1 transition-all shadow-sm active:scale-95 cursor-pointer"
                                                                                    title="Kit Modificato: Clicca per visualizzare le modifiche o ripristinare"
                                                                                >
                                                                                    <ArrowLeftRight size={10} className="text-amber-400" />
                                                                                    MODIFICATO
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        {comp.notes && (
                                                                            <div className="text-xs text-amber-500 font-bold mt-0.5 truncate">• Nota Prod: {comp.notes}</div>
                                                                        )}
                                                                        
                                                                        {ws.warehouseNote && (
                                                                            <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                                                                                <span className="font-normal">Note Magazzino: </span><span className="font-bold">{ws.warehouseNote}</span>
                                                                            </div>
                                                                        )}
                                                                        {ws.isBroken && (
                                                                            <div className="mt-0.5">
                                                                                <div className="text-rose-500 text-xs font-bold flex items-center gap-1 uppercase">
                                                                                    <AlertOctagon size={12}/> {ws.brokenNote || 'SEGNALATO ROTTO / MANCANTE'}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Kit Controls */}
                                                                    <div className={`flex items-center gap-1 sm:gap-1.5 transition-opacity shrink-0 ${isFilterActive && !isMainMatch ? 'opacity-25 grayscale' : 'opacity-100'}`}>
                                                                        {hasChanged && renderModifiedWarningBadge(`kit-${comp.uniqueId}`, ws.changeLog, comp.quantity, comp.name, !showChangeWarning)}
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => { 
                                                                                e.stopPropagation(); 
                                                                                setReplacementModal({
                                                                                    isOpen: true,
                                                                                    targetComponent: comp,
                                                                                    targetZoneName: activeZone.name,
                                                                                    targetSectionName: section.name,
                                                                                    targetAccessoryIndex: null
                                                                                }); 
                                                                            }}
                                                                            disabled={isReadOnly}
                                                                            className={`p-1 sm:p-1.5 rounded-lg border transition-colors ${isKitModified ? 'bg-amber-500/30 text-amber-300 border-amber-500 shadow-sm hover:bg-amber-500/40' : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                            title="Sostituisci questo Kit con altro materiale"
                                                                        >
                                                                            <ArrowLeftRight size={16} />
                                                                        </button>
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.warehouseNote || '' }); }}
                                                                            className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${ws.warehouseNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'}`}
                                                                            title="Aggiungi Nota Magazzino"
                                                                        >
                                                                            <MessageSquare size={16} className={ws.warehouseNote ? 'fill-current' : ''} />
                                                                        </button>
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.brokenNote || '' }); }}
                                                                            className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${ws.isBroken ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'}`}
                                                                            title={ws.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                        >
                                                                            <AlertTriangle size={16} className={ws.isBroken ? 'fill-current' : ''} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                        
                                                        {/* Kit Contents */}
                                                        {(() => {
                                                            if (!comp.contents || comp.contents.length === 0) return null;

                                                            // Raggruppa i materiali del kit:
                                                            // - Sub-oggetti modificati e relativi materiali sostitutivi aggiunti vengono racchiusi insieme nel bordino ambra
                                                            // - I normali componenti non modificati rimangono righe singole standard
                                                            const kitGroups: { type: 'single' | 'group'; groupId?: string; items: { sub: any; subIdx: number }[] }[] = [];
                                                            const handledIndices = new Set<number>();

                                                            for (let sIdx = 0; sIdx < comp.contents.length; sIdx++) {
                                                                if (handledIndices.has(sIdx)) continue;
                                                                const sub = comp.contents[sIdx];

                                                                if (sub.replacementInfo) {
                                                                    const gId = sub.replacementInfo.replacementGroupId || sub.replacementInfo.originalName || `kit-mod-${sIdx}`;
                                                                    const groupItems: { sub: any; subIdx: number }[] = [];
                                                                    comp.contents.forEach((otherSub, otherIdx) => {
                                                                        if (otherSub.replacementInfo) {
                                                                            const otherGId = otherSub.replacementInfo.replacementGroupId || otherSub.replacementInfo.originalName;
                                                                            if (otherGId === gId) {
                                                                                handledIndices.add(otherIdx);
                                                                                groupItems.push({ sub: otherSub, subIdx: otherIdx });
                                                                            }
                                                                        }
                                                                    });
                                                                    kitGroups.push({
                                                                        type: 'group',
                                                                        groupId: gId,
                                                                        items: groupItems
                                                                    });
                                                                } else {
                                                                    handledIndices.add(sIdx);
                                                                    kitGroups.push({
                                                                        type: 'single',
                                                                        items: [{ sub, subIdx: sIdx }]
                                                                    });
                                                                }
                                                            }

                                                            const renderKitSubRow = (sub: any, subIdx: number, isInGroup = false, itemInGroupIdx = 0) => {
                                                                const subWs = sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                                const totalQty = sub.replacementInfo ? sub.quantity : sub.quantity * comp.quantity;
                                                                const effectiveSubChangeLog = subWs.changeLog || (ws.changeLog ? {
                                                                    previousQuantity: ws.changeLog.previousQuantity === 0 ? 0 : sub.quantity * ws.changeLog.previousQuantity,
                                                                    previousVersion: ws.changeLog.previousVersion,
                                                                    changedAt: ws.changeLog.changedAt,
                                                                    previousName: undefined,
                                                                    wasChecked: Boolean(subWs.changeLog?.wasChecked ?? false),
                                                                    history: ws.changeLog.history?.map(h => ({ 
                                                                        ...h, 
                                                                        quantity: h.quantity * sub.quantity,
                                                                        wasChecked: Boolean(subWs.changeLog?.wasChecked ?? (subWs.inDistinta || subWs.loaded))
                                                                    }))
                                                                } : undefined);
                                                                const contentWarning = (hasChanged || !!effectiveSubChangeLog) && !isWsCheckedForCurrentMode(subWs);
                                                                const isChildModified = !!sub.replacementInfo;
                                                                
                                                                // Content Highlight Logic
                                                                const isChildMatch = checkMatch(sub.name);

                                                                if (isFilterActive && !isMainMatch && !isChildMatch) return null;

                                                                return (
                                                                    <div 
                                                                        key={`${comp.uniqueId}-sub-${subIdx}`} 
                                                                        className={`${
                                                                            isInGroup 
                                                                                ? `px-2.5 sm:px-4 py-1.5 flex flex-row items-center justify-between gap-1.5 sm:gap-4 transition-all duration-300 ${subWs.isBroken ? 'bg-rose-900/10' : itemInGroupIdx === 0 ? 'bg-amber-500/[0.05] hover:bg-amber-500/[0.08]' : 'bg-slate-950/40 hover:bg-slate-800/30'}`
                                                                                : `pl-5 sm:pl-8 pr-2 sm:pr-3 py-1 border-b border-slate-800/50 flex flex-row items-center justify-between gap-1.5 sm:gap-4 transition-all duration-300 ${subWs.isBroken ? 'bg-rose-900/10' : contentWarning ? 'bg-amber-900/10' : 'hover:bg-slate-800/30'}`
                                                                        }`}
                                                                    >
                                                                        {/* Content Info */}
                                                                        <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
                                                                            {isInGroup && itemInGroupIdx > 0 ? (
                                                                                <CornerDownRight size={14} className="text-amber-400 shrink-0 ml-0.5" />
                                                                            ) : (
                                                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isChildModified ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : contentWarning ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-purple-500/50'}`}></div>
                                                                            )}
                                                                            <div className="min-w-0">
                                                                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                                                    <span 
                                                                                        className={`font-medium text-xs sm:text-sm cursor-pointer hover:underline truncate ${isChildMatch ? 'text-blue-400 font-bold' : 'text-slate-300'}`}
                                                                                        onClick={() => handleSetHighlight(highlightedItemName === sub.name ? null : sub.name)}
                                                                                    >
                                                                                        {sub.name}
                                                                                    </span>
                                                                                    {totalQty > 0 ? (
                                                                                        <span className={`text-[11px] sm:text-xs px-1.5 py-0.2 rounded font-mono ${contentWarning ? 'bg-amber-500 text-black font-bold' : isChildModified ? 'bg-amber-500/30 text-amber-300 font-bold' : 'bg-slate-800 text-slate-400'}`}>x{totalQty}</span>
                                                                                    ) : (
                                                                                        <span className="text-[11px] sm:text-xs px-1.5 py-0.2 rounded font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40">0x (Sostituito)</span>
                                                                                    )}
                                                                                    {hasChanged && (
                                                                                        <span className={`text-[11px] sm:text-xs font-medium ml-1 ${contentWarning ? 'text-amber-400 font-bold' : 'text-slate-400 font-normal'}`}>
                                                                                            {effectiveSubChangeLog?.previousName
                                                                                                ? `(Era: ${effectiveSubChangeLog.previousQuantity ? `${effectiveSubChangeLog.previousQuantity}x ` : ''}${effectiveSubChangeLog.previousName} ${formatVersionLabel(effectiveSubChangeLog.previousVersion || ws.changeLog?.previousVersion || previousVersion)})`
                                                                                                : effectiveSubChangeLog?.previousQuantity === 0 
                                                                                                    ? "(NUOVO)" 
                                                                                                    : effectiveSubChangeLog?.previousQuantity !== undefined
                                                                                                        ? `(Era: ${effectiveSubChangeLog.previousQuantity} ${formatVersionLabel(effectiveSubChangeLog.previousVersion || ws.changeLog?.previousVersion || previousVersion)})`
                                                                                                        : ws.changeLog?.previousQuantity === 0
                                                                                                            ? "(NUOVO)"
                                                                                                            : `(Era: ${sub.quantity * (ws.changeLog?.previousQuantity ?? 1)} ${formatVersionLabel(ws.changeLog?.previousVersion || previousVersion)})`}
                                                                                        </span>
                                                                                    )}
                                                                                    {isChildModified && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setReplacementModal({
                                                                                                    isOpen: true,
                                                                                                    targetComponent: comp,
                                                                                                    targetZoneName: activeZone.name,
                                                                                                    targetSectionName: section.name,
                                                                                                    targetAccessoryIndex: subIdx
                                                                                                });
                                                                                            }}
                                                                                            className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50 hover:bg-amber-500/40 flex items-center gap-1 transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                                                                                            title="Componente Modificato: Clicca per visualizzare, modificare o ripristinare"
                                                                                        >
                                                                                            <ArrowLeftRight size={10} className="text-amber-400" />
                                                                                            {isInGroup && itemInGroupIdx > 0 ? 'NUOVO' : 'MODIFICATO'}
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                                {subWs.warehouseNote && <div className="text-[11px] sm:text-xs text-blue-600 dark:text-blue-400 mt-0.5"><span className="font-normal">Nota: </span><span className="font-bold">{subWs.warehouseNote}</span></div>}
                                                                                {subWs.isBroken && <div className="text-rose-500 text-[11px] sm:text-xs font-bold uppercase mt-0.5">{subWs.brokenNote || 'ROTTO'}</div>}
                                                                            </div>
                                                                        </div>

                                                                        {/* Content Controls */}
                                                                        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                                                                            {/* Actions */}
                                                                            <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { 
                                                                                        e.stopPropagation(); 
                                                                                        setReplacementModal({
                                                                                            isOpen: true,
                                                                                            targetComponent: comp,
                                                                                            targetZoneName: activeZone.name,
                                                                                            targetSectionName: section.name,
                                                                                            targetAccessoryIndex: subIdx
                                                                                        }); 
                                                                                    }}
                                                                                    disabled={isReadOnly}
                                                                                    className={`p-1 sm:p-1.5 rounded-lg border transition-colors ${isChildModified ? 'bg-amber-500/30 text-amber-300 border-amber-500 shadow-sm hover:bg-amber-500/40' : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                    title="Sostituisci questo accessorio del kit con altro materiale"
                                                                                >
                                                                                    <ArrowLeftRight size={15} />
                                                                                </button>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.warehouseNote || '' }); }}
                                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${subWs.warehouseNote ? 'text-blue-400' : 'text-slate-600'}`}
                                                                                    title="Aggiungi Nota Magazzino"
                                                                                >
                                                                                    <MessageSquare size={15} className={subWs.warehouseNote ? 'fill-current' : ''} />
                                                                                </button>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.brokenNote || '' }); }}
                                                                                    disabled={!activeList?.isCompleted}
                                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${subWs.isBroken ? 'text-rose-500' : 'text-slate-600'} ${!activeList?.isCompleted ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                    title={subWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                                >
                                                                                    <AlertTriangle size={15} className={subWs.isBroken ? 'fill-current' : ''} />
                                                                                </button>
                                                                            </div>
                                            
                                                                            {/* Content Checkboxes */}
                                                                            <div className="flex items-center gap-1.5 sm:gap-3">
                                                                                {(hasChanged || !!effectiveSubChangeLog) && renderModifiedWarningBadge(`kit-acc-${comp.uniqueId}-${subIdx}`, effectiveSubChangeLog, totalQty, sub.name, !contentWarning)}
                                                                                {totalQty === 0 ? (
                                                                                    ['distinta', 'carico', 'rientro'].map(type => {
                                                                                        const isVisible = activeWarehouseMode === 'visualizza' 
                                                                                            ? (type === 'carico' || type === 'rientro') 
                                                                                            : (!activeWarehouseMode || activeWarehouseMode === type);
                                                                                        return isVisible ? (
                                                                                            <div key={type} className="flex flex-col items-center">
                                                                                                <div className="p-1 min-w-[38px] min-h-[38px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center opacity-30 cursor-not-allowed" title="Non da caricare (0 pz)">
                                                                                                    <Minus size={14} className="text-slate-500" />
                                                                                                </div>
                                                                                            </div>
                                                                                        ) : null;
                                                                                    })
                                                                                ) : (
                                                                                    <>
                                                                                <div className={`${activeWarehouseMode && activeWarehouseMode !== 'distinta' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { inDistinta: !subWs.inDistinta }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-xl touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[32px] sm:min-h-[32px] active:scale-95 transition-all ${subWs.inDistinta ? 'text-emerald-500' : contentWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {renderWarehouseCheckboxIcon(Boolean(subWs.inDistinta), Boolean(contentWarning), Boolean(effectiveSubChangeLog?.wasChecked), 24, 'sm:w-5 sm:h-5', 15, 'sm:w-3.5 sm:h-3.5')}
                                                                                    </button>
                                                                                </div>
                                                                                <div className={`${activeWarehouseMode && activeWarehouseMode !== 'carico' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { loaded: !subWs.loaded }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-xl touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[32px] sm:min-h-[32px] active:scale-95 transition-all ${subWs.loaded ? 'text-blue-500' : contentWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {renderWarehouseCheckboxIcon(Boolean(subWs.loaded), Boolean(contentWarning), Boolean(effectiveSubChangeLog?.wasChecked), 24, 'sm:w-5 sm:h-5', 15, 'sm:w-3.5 sm:h-3.5')}
                                                                                    </button>
                                                                                </div>
                                                                                <div className={`${activeWarehouseMode && activeWarehouseMode !== 'rientro' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { returned: !subWs.returned }); }} 
                                                                                        disabled={isReadOnly} 
                                                                                        className={`p-1 rounded-xl touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[32px] sm:min-h-[32px] active:scale-95 transition-all ${subWs.returned ? 'text-purple-500' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                    >
                                                                                        {subWs.returned ? <CheckSquare size={24} className="sm:w-5 sm:h-5" /> : <Square size={24} className="sm:w-5 sm:h-5" />}
                                                                                    </button>
                                                                                </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            };

                                                            return kitGroups.map((entry, gIdx) => {
                                                                if (entry.type === 'single') {
                                                                    const { sub, subIdx } = entry.items[0];
                                                                    return renderKitSubRow(sub, subIdx, false, 0);
                                                                }

                                                                // Riquadro ambra solo per i materiali modificati/aggiunti del kit
                                                                return (
                                                                    <div 
                                                                        key={`kit-group-${entry.groupId || gIdx}`}
                                                                        className="my-1.5 mx-2 sm:mx-3.5 rounded-xl !border !border-amber-500/40 ring-1 ring-amber-500/20 bg-gradient-to-b from-amber-950/20 via-slate-900/90 to-slate-900/90 shadow-[0_0_12px_rgba(245,158,11,0.06)] overflow-hidden divide-y divide-slate-800/80 transition-all"
                                                                    >
                                                                        {entry.items.map(({ sub, subIdx }, itemInGroupIdx) => 
                                                                            renderKitSubRow(sub, subIdx, true, itemInGroupIdx)
                                                                        )}
                                                                    </div>
                                                                );
                                                            });
                                                        })()}
                                                    </React.Fragment>
                                                );
                                            }

                                            // IF ITEM: Render Standard Row
                                            const ws = comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                            const hasChanged = ws.changeLog !== undefined;
                                            const showChangeWarning = hasChanged && !isComponentUnresolved(comp) ? false : hasChanged; 
                                            
                                            // Highlight & Search Logic
                                            const isFilterActive = !!highlightedItemName || !!itemSearch;
                                            const checkMatch = (name: string) => highlightedItemName ? name === highlightedItemName : (itemSearch ? isTextMatch(name, itemSearch) : false);

                                            const isMatch = checkMatch(comp.name);
                                            const hasSubMatch = comp.contents?.some(c => checkMatch(c.name));
                                            const hasRepMatch = replacementChildren.some(c => checkMatch(c.name));

                                            // Filter Logic: Search + Changes Filter
                                            if (isFilterActive && !isMatch && !hasSubMatch && !hasRepMatch) return null;
                                            if (showOnlyChanges && !hasChanged && !replacementChildren.some(c => c.warehouseState?.changeLog !== undefined)) return null;

                                            const isContainerOfMatch = isFilterActive && (hasSubMatch || hasRepMatch);
                                            const hasAccessories = comp.contents && comp.contents.length > 0;

                                            // SE NON E UN GRUPPO: Riga Singola Standard
                                            return (
                                                <React.Fragment key={comp.uniqueId}>
                                                    <div className={`py-1 px-2.5 sm:px-3 flex flex-row items-center justify-between gap-2 transition-all duration-300 ${isContainerOfMatch ? 'opacity-70' : 'opacity-100'} ${ws.isBroken ? 'bg-rose-900/10' : comp.replacementInfo ? 'my-2 mx-0.5 sm:mx-1 rounded-xl !border !border-amber-500/40 ring-1 ring-amber-500/20 bg-gradient-to-b from-amber-950/20 to-slate-900/90 shadow-sm' : showChangeWarning ? 'bg-amber-900/10' : hasAccessories ? 'bg-cyan-900/10 border-l-4 border-cyan-500/50' : 'hover:bg-slate-800/50'}`}>
                                                        {/* Item Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span 
                                                                    className={`font-bold text-sm cursor-pointer hover:underline truncate whitespace-normal ${isMatch ? 'text-blue-400' : 'text-white'}`}
                                                                    onClick={() => handleSetHighlight(highlightedItemName === comp.name ? null : comp.name)}
                                                                >
                                                                    {comp.name}
                                                                    {comp.isTemporary && <span className="bg-yellow-400 text-black text-xs font-bold px-1.5 py-0.5 rounded ml-2 shrink-0">TEMP</span>}
                                                                </span>
                                                                {comp.replacementInfo && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setReplacementModal({
                                                                                isOpen: true,
                                                                                targetComponent: comp,
                                                                                targetZoneName: activeZone.name,
                                                                                targetSectionName: section.name,
                                                                                targetAccessoryIndex: null
                                                                            });
                                                                        }}
                                                                        className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50 hover:bg-amber-500/40 flex items-center gap-0.5 sm:gap-1 transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                                                                        title="Materiale Modificato: Clicca per visualizzare le modifiche o ripristinare"
                                                                    >
                                                                        <ArrowLeftRight size={10} className="text-amber-400" />
                                                                        <span className="sm:hidden">Mod.</span>
                                                                        <span className="hidden sm:inline">MODIFICATO</span>
                                                                    </button>
                                                                )}
                                                                <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${showChangeWarning ? 'bg-amber-500 text-black' : comp.replacementInfo ? 'bg-amber-500/30 text-amber-300' : hasAccessories ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-slate-300'}`}>
                                                                    x{comp.quantity}
                                                                </span>
                                                                {hasChanged && (
                                                                    <span className={`text-xs font-medium ${showChangeWarning ? 'text-amber-400 font-bold' : 'text-slate-400 font-normal'}`}>
                                                                        {ws.changeLog?.previousName
                                                                            ? ` (Era: ${ws.changeLog.previousQuantity && ws.changeLog.previousQuantity !== comp.quantity ? `${ws.changeLog.previousQuantity}x ` : ''}${ws.changeLog.previousName} ${formatVersionLabel(ws.changeLog?.previousVersion || previousVersion)})`
                                                                            : ws.changeLog?.previousQuantity === 0 
                                                                                ? <span className={showChangeWarning ? "text-emerald-400 font-bold uppercase tracking-wider text-xs ml-1" : "text-slate-400 font-normal uppercase tracking-wider text-xs ml-1"}> (NUOVO MATERIALE)</span>
                                                                                : ` (Era: ${ws.changeLog?.previousQuantity} ${formatVersionLabel(ws.changeLog?.previousVersion || previousVersion)})`
                                                                        }
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {comp.notes && <div className="text-xs text-amber-500 font-bold mt-0.5 truncate">• Nota Prod: {comp.notes}</div>}
                                                            
                                                            {ws.warehouseNote && (
                                                                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                                                                    <span className="font-normal">Note Magazzino: </span><span className="font-bold">{ws.warehouseNote}</span>
                                                                </div>
                                                            )}
                                                            {ws.isBroken && (
                                                                <div className="mt-0.5">
                                                                    <div className="text-rose-500 text-xs font-bold flex items-center gap-1 uppercase">
                                                                        <AlertOctagon size={12}/> {ws.brokenNote || 'SEGNALATO ROTTO / MANCANTE'}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Controls */}
                                                        <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                            {/* Actions */}
                                                            <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        setReplacementModal({
                                                                            isOpen: true,
                                                                            targetComponent: comp,
                                                                            targetZoneName: activeZone.name,
                                                                            targetSectionName: section.name,
                                                                            targetAccessoryIndex: null
                                                                        }); 
                                                                    }}
                                                                    disabled={isReadOnly}
                                                                    className={`p-1 sm:p-1.5 rounded-lg border transition-colors ${comp.replacementInfo ? 'bg-amber-500/30 text-amber-300 border-amber-500 shadow-sm hover:bg-amber-500/40' : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                    title="Sostituisci questo materiale con altro materiale"
                                                                >
                                                                    <ArrowLeftRight size={16} />
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.warehouseNote || '' }); }}
                                                                    disabled={isReadOnly}
                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${ws.warehouseNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                    title="Aggiungi Nota Magazzino"
                                                                >
                                                                    <MessageSquare size={16} className={ws.warehouseNote ? 'fill-current' : ''} />
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.brokenNote || '' }); }}
                                                                    disabled={isReadOnly}
                                                                    className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${ws.isBroken ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                    title={ws.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                >
                                                                    <AlertTriangle size={16} className={ws.isBroken ? 'fill-current' : ''} />
                                                                </button>
                                                            </div>
                                                            {/* Checkboxes */}
                                                            <div className="flex items-center gap-1 sm:gap-2">
                                                                {(() => {
                                                                    const isResolved = isWsCheckedForCurrentMode(ws);
                                                                    const showWarning = hasChanged && !isResolved;

                                                                    // Helper to determine if a checkbox label should be hidden on mobile
                                                                    const getMobileClass = (type: string) => {
                                                                        if (activeWarehouseMode === 'visualizza') {
                                                                            return (type === 'carico' || type === 'rientro') ? 'flex' : 'hidden';
                                                                        }
                                                                        if (activeWarehouseMode && activeWarehouseMode !== type) return 'hidden';
                                                                        return 'flex';
                                                                    };

                                                                    return (
                                                                        <>
                                                                            {hasChanged && renderModifiedWarningBadge(`item-${comp.uniqueId}`, ws.changeLog, comp.quantity, comp.name, !showWarning)}
                                                                            <div className={`${getMobileClass('distinta')} flex-col items-center gap-0.5`}>
                                                                                <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Dist.</span>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); updateComponentState(comp.uniqueId, { inDistinta: !ws.inDistinta }); }} 
                                                                                    disabled={isReadOnly} 
                                                                                    className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${ws.inDistinta ? 'text-emerald-500' : showWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                >
                                                                                    {renderWarehouseCheckboxIcon(Boolean(ws.inDistinta), Boolean(showWarning), Boolean(ws.changeLog?.wasChecked), 26, 'sm:w-6 sm:h-6', 16, 'sm:w-4 sm:h-4')}
                                                                                </button>
                                                                            </div>
                                                                            <div className={`${getMobileClass('carico')} flex-col items-center gap-0.5`}>
                                                                                <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Car.</span>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); updateComponentState(comp.uniqueId, { loaded: !ws.loaded }); }} 
                                                                                    disabled={isReadOnly} 
                                                                                    className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${ws.loaded ? 'text-blue-500' : showWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                >
                                                                                    {renderWarehouseCheckboxIcon(Boolean(ws.loaded), Boolean(showWarning), Boolean(ws.changeLog?.wasChecked), 26, 'sm:w-6 sm:h-6', 16, 'sm:w-4 sm:h-4')}
                                                                                </button>
                                                                            </div>
                                                                            <div className={`${getMobileClass('rientro')} flex-col items-center gap-0.5`}>
                                                                                <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:block">Rie.</span>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); updateComponentState(comp.uniqueId, { returned: !ws.returned }); }} 
                                                                                    disabled={isReadOnly} 
                                                                                    className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] active:scale-95 transition-all ${ws.returned ? 'text-purple-500' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                                >
                                                                                    {ws.returned ? <CheckSquare size={26} className="sm:w-6 sm:h-6" /> : <Square size={26} className="sm:w-6 sm:h-6" />}
                                                                                </button>
                                                                            </div>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Accessories (Contents) */}
                                                    {comp.contents?.map((sub, subIdx) => {
                                                        const subWs = sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                        const totalQty = sub.replacementInfo ? sub.quantity : sub.quantity * comp.quantity;
                                                        const effectiveSubChangeLog = subWs.changeLog || (ws.changeLog ? {
                                                            previousQuantity: ws.changeLog.previousQuantity === 0 ? 0 : sub.quantity * ws.changeLog.previousQuantity,
                                                            previousVersion: ws.changeLog.previousVersion,
                                                            changedAt: ws.changeLog.changedAt,
                                                            previousName: undefined,
                                                            wasChecked: Boolean(subWs.changeLog?.wasChecked ?? false),
                                                            history: ws.changeLog.history?.map(h => ({ 
                                                                ...h, 
                                                                quantity: h.quantity * sub.quantity,
                                                                wasChecked: Boolean(subWs.changeLog?.wasChecked ?? (subWs.inDistinta || subWs.loaded))
                                                            }))
                                                        } : undefined);
                                                        const contentWarning = (hasChanged || !!effectiveSubChangeLog) && !isWsCheckedForCurrentMode(subWs);
                                                        
                                                        // Highlight Logic
                                                        const isSubMatch = checkMatch(sub.name);
                                                        const isParentMatch = checkMatch(comp.name);

                                                        if (isFilterActive && !isSubMatch && !isParentMatch) return null;
                                                        
                                                        return (
                                                            <div key={`${comp.uniqueId}-acc-${subIdx}`} className={`pl-5 sm:pl-8 pr-2 sm:pr-3 py-1 border-b border-slate-800/50 flex flex-row items-center justify-between gap-1.5 sm:gap-4 transition-all duration-300 ${subWs.isBroken ? 'bg-rose-900/10' : sub.replacementInfo ? 'bg-amber-950/20 border-l-2 border-amber-500' : contentWarning ? 'bg-amber-900/10' : 'hover:bg-slate-800/30'}`}>
                                                                {/* Accessory Info */}
                                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                                    <div className={`${hasAccessories ? (contentWarning ? 'text-amber-500' : 'text-cyan-500/50') : 'text-slate-600'} shrink-0`}> - </div>
                                                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                                        <span 
                                                                            className={`font-medium text-xs sm:text-sm cursor-pointer hover:underline truncate whitespace-normal ${isSubMatch ? 'text-blue-400 font-bold' : 'text-slate-400'}`}
                                                                            onClick={() => handleSetHighlight(highlightedItemName === sub.name ? null : sub.name)}
                                                                        >
                                                                            {sub.name}
                                                                        </span>
                                                                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${contentWarning ? 'bg-amber-500 text-black font-bold' : hasAccessories ? 'bg-cyan-900/20 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}>x{totalQty}</span>
                                                                        {hasChanged && (
                                                                            <span className={`text-xs font-medium ml-2 ${contentWarning ? 'text-amber-400 font-bold' : 'text-slate-400 font-normal'}`}>
                                                                                {effectiveSubChangeLog?.previousName
                                                                                    ? `(Era: ${effectiveSubChangeLog.previousQuantity ? `${effectiveSubChangeLog.previousQuantity}x ` : ''}${effectiveSubChangeLog.previousName} ${formatVersionLabel(effectiveSubChangeLog.previousVersion || ws.changeLog?.previousVersion || previousVersion)})`
                                                                                    : effectiveSubChangeLog?.previousQuantity === 0 
                                                                                        ? "(NUOVO)" 
                                                                                        : effectiveSubChangeLog?.previousQuantity !== undefined
                                                                                            ? `(Era: ${effectiveSubChangeLog.previousQuantity} ${formatVersionLabel(effectiveSubChangeLog.previousVersion || ws.changeLog?.previousVersion || previousVersion)})`
                                                                                            : ws.changeLog?.previousQuantity === 0 
                                                                                                ? "(NUOVO)" 
                                                                                                : `(Era: ${sub.quantity * (ws.changeLog?.previousQuantity ?? 1)} ${formatVersionLabel(ws.changeLog?.previousVersion || previousVersion)})`}
                                                                            </span>
                                                                        )}
                                                                        {sub.replacementInfo && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setReplacementModal({
                                                                                        isOpen: true,
                                                                                        targetComponent: comp,
                                                                                        targetZoneName: activeZone.name,
                                                                                        targetSectionName: section.name,
                                                                                        targetAccessoryIndex: subIdx
                                                                                    });
                                                                                }}
                                                                                className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50 hover:bg-amber-500/40 flex items-center gap-1 transition-all shadow-sm active:scale-95 cursor-pointer"
                                                                                title="Accessorio Modificato: Clicca per visualizzare, modificare o ripristinare"
                                                                            >
                                                                                <ArrowLeftRight size={10} className="text-amber-400" />
                                                                                MODIFICATO
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Accessory Controls */}
                                                                <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                                    {/* Actions */}
                                                                    <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => { 
                                                                                e.stopPropagation(); 
                                                                                setReplacementModal({
                                                                                    isOpen: true,
                                                                                    targetComponent: comp,
                                                                                    targetZoneName: activeZone.name,
                                                                                    targetSectionName: section.name,
                                                                                    targetAccessoryIndex: subIdx
                                                                                }); 
                                                                            }}
                                                                            disabled={isReadOnly}
                                                                            className={`p-1 rounded-lg border transition-colors ${sub.replacementInfo ? 'bg-amber-500/30 text-amber-300 border-amber-500 shadow-sm hover:bg-amber-500/40' : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                            title="Sostituisci questo accessorio con altro materiale"
                                                                        >
                                                                            <ArrowLeftRight size={15} />
                                                                        </button>
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); setNoteModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.warehouseNote || '' }); }}
                                                                            className={`p-1 rounded-lg hover:bg-slate-700 transition-colors ${subWs.warehouseNote ? 'text-blue-400' : 'text-slate-600'}`}
                                                                            title="Aggiungi Nota Magazzino"
                                                                        >
                                                                            <MessageSquare size={15} className={subWs.warehouseNote ? 'fill-current' : ''} />
                                                                        </button>
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); setBrokenModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.brokenNote || '' }); }}
                                                                            disabled={isReadOnly}
                                                                            className={`p-1 rounded-lg hover:bg-slate-700 transition-colors ${subWs.isBroken ? 'text-rose-500' : 'text-slate-600'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                            title={subWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                        >
                                                                            <AlertTriangle size={15} className={subWs.isBroken ? 'fill-current' : ''} />
                                                                        </button>
                                                                    </div>
                                  
                                                                    <div className="flex items-center gap-1 sm:gap-2">
                                                                        {(hasChanged || !!effectiveSubChangeLog) && renderModifiedWarningBadge(`acc-${comp.uniqueId}-${subIdx}`, effectiveSubChangeLog, totalQty, sub.name, !contentWarning)}
                                                                        <div className={`${activeWarehouseMode && activeWarehouseMode !== 'distinta' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { inDistinta: !subWs.inDistinta }); }} 
                                                                                disabled={isReadOnly} 
                                                                                className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[30px] sm:min-h-[30px] active:scale-95 transition-all ${subWs.inDistinta ? 'text-emerald-500' : contentWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                            >
                                                                                {renderWarehouseCheckboxIcon(Boolean(subWs.inDistinta), Boolean(contentWarning), Boolean(effectiveSubChangeLog?.wasChecked), 24, 'sm:w-5 sm:h-5', 15, 'sm:w-3.5 sm:h-3.5')}
                                                                            </button>
                                                                        </div>
                                                                        <div className={`${activeWarehouseMode && activeWarehouseMode !== 'carico' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { loaded: !subWs.loaded }); }} 
                                                                                disabled={isReadOnly} 
                                                                                className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[30px] sm:min-h-[30px] active:scale-95 transition-all ${subWs.loaded ? 'text-blue-500' : contentWarning ? 'text-rose-500 ring-2 ring-rose-500/50 rounded animate-pulse' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                            >
                                                                                {renderWarehouseCheckboxIcon(Boolean(subWs.loaded), Boolean(contentWarning), Boolean(effectiveSubChangeLog?.wasChecked), 24, 'sm:w-5 sm:h-5', 15, 'sm:w-3.5 sm:h-3.5')}
                                                                            </button>
                                                                        </div>
                                                                        <div className={`${activeWarehouseMode && activeWarehouseMode !== 'rientro' && activeWarehouseMode !== 'visualizza' ? 'hidden' : 'flex'} flex-col items-center`}>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); updateContentState(comp.uniqueId, subIdx, { returned: !subWs.returned }); }} 
                                                                                disabled={isReadOnly} 
                                                                                className={`p-1 rounded-lg touch-manipulation flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[30px] sm:min-h-[30px] active:scale-95 transition-all ${subWs.returned ? 'text-purple-500' : 'text-slate-600'} ${isReadOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                                                            >
                                                                                {subWs.returned ? <CheckSquare size={24} className="sm:w-5 sm:h-5" /> : <Square size={24} className="sm:w-5 sm:h-5" />}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        });
                                    })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-500">Seleziona una zona per visualizzare il materiale.</div>
                    )}
                </div>
             </>
          )}

          {/* VIEW: TOTALS (Aggregated) */}
          {viewMode === 'totals' && aggregatedData && activeList?.zones && (
              <>
                {/* Zone Tabs (Same as Zones View) */}
                <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto px-2 sm:px-4 gap-1 shrink-0">
                    {activeList.zones.map(zone => {
                        const hasZoneDeletions = activeList.deletedItems?.some(d => d.zoneName === zone.name);
                        
                        let hasZoneChanges = false;
                        const zData = aggregatedData.get(zone.id);
                        if (zData) {
                            // Check Complex
                            if (!hasZoneChanges) {
                                for (const data of zData.complex.values()) {
                                    if (data.totalQty !== data.originalTotalQty) { hasZoneChanges = true; break; }
                                    for (const child of data.children.values()) {
                                         if (child.totalQty !== child.originalTotalQty) { hasZoneChanges = true; break; }
                                    }
                                    if (hasZoneChanges) break;
                                }
                            }
                            // Check Simple
                            if (!hasZoneChanges) {
                                for (const data of zData.simple.values()) {
                                    if (data.totalQty !== data.originalTotalQty) { hasZoneChanges = true; break; }
                                }
                            }
                        }

                        const isModifiedZone = hasZoneDeletions || hasZoneChanges;

                        return (
                            <div
                                key={zone.id}
                                draggable={true}
                                onDragStart={(e) => handleZoneDragStart(e, zone.id)}
                                onDragOver={(e) => handleZoneDragOver(e, zone.id)}
                                onDragLeave={handleZoneDragLeave}
                                onDragEnd={handleZoneDragEnd}
                                onDrop={(e) => handleZoneDrop(e, zone.id)}
                                onClick={() => setActiveZoneId(zone.id)}
                                className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${draggedZoneId === zone.id ? 'opacity-30 scale-95 border-dashed border-slate-700' : ''} ${activeZoneId === zone.id ? 'border-blue-500 text-white bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'} ${getZoneDragIndicatorClass(zone.id)}`}
                            >
                                <span>{zone.name}</span>
                                {isModifiedZone && (
                                    <span 
                                        onClick={(e) => { e.stopPropagation(); setActiveZoneId(zone.id); setShowOnlyChanges(prev => !prev); }}
                                        className={`w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse hover:scale-150 transition-transform ${showOnlyChanges && activeZoneId === zone.id ? 'ring-2 ring-white scale-125' : ''}`} 
                                        title="Clicca per mostrare solo le modifiche" 
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setZoneForInfo(zone); }}
                                    className={`p-1 rounded transition-colors ${
                                        zone.notes && zone.notes.trim()
                                            ? 'text-yellow-400 hover:text-yellow-300 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]'
                                            : 'text-white hover:text-slate-200'
                                    }`}
                                    title={zone.notes && zone.notes.trim() ? "Info Zona (Presente Nota)" : "Info Zona"}
                                    aria-label="Info Zona"
                                >
                                    <Info size={13} />
                                </button>

                            </div>
                        );
                    })}
                </div>

                {/* Main Content (Active Zone Totals) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
                    {showOnlyChanges && (
                        <div className="sticky top-0 left-0 right-0 z-20 bg-amber-600 text-black px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2 shrink-0">
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <AlertTriangle size={16} /> VISTA MODIFICHE ATTIVA: Mostrando solo le variazioni totali
                            </div>
                            <button onClick={() => setShowOnlyChanges(false)} className="bg-black/20 hover:bg-black/30 px-3 py-1 rounded text-xs font-bold uppercase transition-colors">
                                MOSTRA TUTTO
                            </button>
                        </div>
                    )}

                    {highlightedItemName && (
                        <div className="sticky top-0 left-0 right-0 z-20 bg-blue-600 text-white px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2 shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="font-bold text-sm flex items-center gap-2">
                                    <Search size={16} /> EVIDENZIATO: <span className="underline">{highlightedItemName}</span>
                                </div>
                                {highlightStats && (
                                    <div className="flex gap-3 text-xs border-l border-blue-400 pl-4">
                                        <div className="flex flex-col items-center leading-none" title="Quantità nei Kit">
                                            <span className="font-bold text-lg">{highlightStats.kit}</span>
                                            <span className="opacity-70 text-xs uppercase">Kit</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità negli Accessori">
                                            <span className="font-bold text-lg">{highlightStats.accessories}</span>
                                            <span className="opacity-70 text-xs uppercase">Acc.</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità Sfusi">
                                            <span className="font-bold text-lg">{highlightStats.loose}</span>
                                            <span className="opacity-70 text-xs uppercase">Sfusi</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setHighlightedItemName(null)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-bold uppercase transition-colors">
                                ESCI
                            </button>
                        </div>
                    )}

                    <div className="space-y-6 p-4">
                    {(() => {
                        const zoneData = aggregatedData.get(activeZoneId);
                        if (!zoneData) return <div className="text-center py-20 text-slate-500">Seleziona una zona per visualizzare i totali.</div>;
                        if (zoneData.complex.size === 0 && zoneData.simple.size === 0) return <div className="text-center py-20 text-slate-500">Nessun materiale in questa zona.</div>;

                        // --- CROSS-REFERENCE CALCULATION ---
                        const itemKitParents = new Map<string, Set<string>>();
                        const itemAccessoryParents = new Map<string, Set<string>>();
                        const simpleItemsSet = new Set<string>();

                        // Fill simple items set
                        zoneData.simple.forEach((_, name) => simpleItemsSet.add(name));

                        // Fill parents maps
                        zoneData.complex.forEach((parentData, parentKey) => {
                             const isKit = parentKey.startsWith('KIT-');
                             parentData.children.forEach((_, childName) => {
                                 const mapToUse = isKit ? itemKitParents : itemAccessoryParents;
                                 if (!mapToUse.has(childName)) mapToUse.set(childName, new Set());
                                 mapToUse.get(childName)!.add(parentKey);
                             });
                        });

                        const isTotalItemResolved = (d: { inDistintaQty: number; loadedQty: number; returnedQty: number; totalQty: number }): boolean => {
                            if (activeWarehouseMode === 'distinta') return d.inDistintaQty >= d.totalQty;
                            if (activeWarehouseMode === 'carico') return d.loadedQty >= d.totalQty;
                            if (activeWarehouseMode === 'rientro') return d.returnedQty >= d.totalQty;
                            return d.loadedQty >= d.totalQty || d.inDistintaQty >= d.totalQty;
                        };

                        return (
                          <div className="space-y-4">
                              {/* Section A: Complex (Kits/Machines) */}
                              {Array.from(zoneData.complex.entries()).map(([key, data]) => {
                                  // Highlight Check (Parent)
                                  const isFilterActive = !!highlightedItemName || !!itemSearch;
                                  const checkMatch = (name: string) => highlightedItemName ? name === highlightedItemName : (itemSearch ? isTextMatch(name, itemSearch) : false);

                                  const isMainMatch = checkMatch(data.name);
                                  const hasSubMatch = Array.from(data.children.keys()).some(k => checkMatch(k as string));
                                  const hasChanged = Boolean(data.hasChanged || data.totalQty !== data.originalTotalQty);
                                  const isActuallyKit = key.startsWith('KIT-');

                                  // Filter Logic: Search + Changes Filter
                                  if (isFilterActive && !isMainMatch && !hasSubMatch) return null;
                                  if (showOnlyChanges && !hasChanged) return null;

                                  if (prepStatusFilter !== 'all') {
                                      const modeQty = activeWarehouseMode === 'distinta' ? data.inDistintaQty : (activeWarehouseMode === 'carico' ? data.loadedQty : (activeWarehouseMode === 'rientro' ? data.returnedQty : data.inDistintaQty));
                                      const isPartiallyChecked = modeQty > 0 || Array.from(data.children.values()).some((c: any) => {
                                          const cQty = activeWarehouseMode === 'distinta' ? c.inDistintaQty : (activeWarehouseMode === 'carico' ? c.loadedQty : (activeWarehouseMode === 'rientro' ? c.returnedQty : c.inDistintaQty));
                                          return cQty > 0;
                                      });
                                      const isResolvedTotal = isActuallyKit
                                          ? Array.from(data.children.values()).every((c: any) => isTotalItemResolved(c))
                                          : isTotalItemResolved(data);

                                      if (prepStatusFilter === 'spuntati' && !isPartiallyChecked) return null;
                                      if (prepStatusFilter === 'non_spuntati' && isResolvedTotal) return null;
                                      if (prepStatusFilter === 'modifiche_magazzino') {
                                          const hasMod = data.instances?.some((inst: any) => {
                                              const cItem = activeZone?.sections?.flatMap(s => s.components).find(c => c.uniqueId === inst.uniqueId);
                                              return cItem && isComponentWarehouseModified(cItem);
                                          });
                                          if (!hasMod) return null;
                                      }
                                      if (prepStatusFilter === 'aggiornati_non_preparati' && (!hasChanged || isResolvedTotal)) return null;
                                  }

                                  const isContainerOfMatch = isFilterActive && hasSubMatch;
                                  
                                  // Warning logic: if changed and not resolved for current warehouse mode
                                  const isResolved = isActuallyKit 
                                    ? Array.from(data.children.values()).every((c: any) => isTotalItemResolved(c))
                                    : isTotalItemResolved(data);
                                  
                                  const showWarning = hasChanged && !isResolved;
                                  const parentPrevVer = data.changeLog?.previousVersion || previousVersion;

                                  return (
                                  <div key={key} className={`bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden transition-all duration-300 ${isContainerOfMatch ? 'opacity-70' : 'opacity-100'}`}>
                                      <div className={`py-1 px-2.5 sm:px-3 border-l-4 flex flex-row items-center justify-between gap-2 transition-all duration-300 ${isActuallyKit ? 'border-purple-500/50' : 'border-cyan-500/50'} ${showWarning ? 'bg-amber-900/10 border-amber-500' : (isActuallyKit ? 'bg-purple-900/10' : 'bg-cyan-900/10')} ${isContainerOfMatch ? 'opacity-70' : 'opacity-100'}`}>
                                          <div className={`flex-1 min-w-0 transition-opacity ${isFilterActive && !isMainMatch ? 'opacity-50' : 'opacity-100'}`}>
                                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                  <span 
                                                      className={`font-bold text-sm cursor-pointer hover:underline truncate whitespace-normal ${isMainMatch ? 'text-blue-400 scale-105' : 'text-white'}`}
                                                      onClick={() => handleSetHighlight(highlightedItemName === data.name ? null : data.name)}
                                                  >
                                                      {data.name}
                                                  </span>
                                                  <span className={`${showWarning ? 'bg-amber-500 text-black' : isActuallyKit ? 'bg-purple-900 text-purple-200' : 'bg-cyan-900 text-cyan-200'} px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0`}>x{data.totalQty}</span>
                                                  {hasChanged && (
                                                      <span className={`text-xs ${showWarning ? 'text-amber-400 font-bold' : 'text-slate-400 font-normal'}`}>
                                                          {data.changeLog?.previousName
                                                              ? `(Era: ${data.originalTotalQty ? `${data.originalTotalQty}x ` : ''}${data.changeLog.previousName} ${formatVersionLabel(parentPrevVer)})`
                                                              : data.originalTotalQty === 0
                                                                  ? '(NUOVO)'
                                                                  : `(Era: ${data.originalTotalQty} ${formatVersionLabel(parentPrevVer)})`}
                                                      </span>
                                                  )}
                                              </div>
                                              
                                              {/* Aggregated Notes */}
                                              {data.aggregatedNotes && data.aggregatedNotes.length > 0 && (
                                                  <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                                                      {data.aggregatedNotes.map((an: any, i: number) => (
                                                          <div key={i} className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                              ↳ <span className="text-slate-400">{an.qty}x</span> <span>Nota: </span><span className="font-bold">{an.text}</span>
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                          
                                          {/* Controls Container */}
                                          <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                              {/* Aggregated Actions for Parent (Notes/Issues + Kit Warning Badge) */}
                                              <div className={`flex items-center gap-1 ${!isActuallyKit ? 'pr-1.5 sm:pr-3 border-r border-slate-800' : ''} shrink-0`}>
                                                  {isActuallyKit && hasChanged && renderModifiedWarningBadge(
                                                      `total-kit-${key}`,
                                                      data.changeLog || { previousQuantity: data.originalTotalQty, changedAt: '' },
                                                      data.totalQty,
                                                      data.name,
                                                      isResolved
                                                  )}
                                                  <button 
                                                      onClick={() => setNoteModal({ isOpen: true, targets: data.instances, text: '' })}
                                                      disabled={isReadOnly}
                                                      className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${data.hasNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                  >
                                                      <MessageSquare size={16} className={data.hasNote ? 'fill-current' : ''} />
                                                  </button>
                                                  <button 
                                                      onClick={() => setBrokenModal({ isOpen: true, targets: data.instances, text: '' })}
                                                      disabled={isReadOnly}
                                                      className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${data.hasIssue ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                  >
                                                      <AlertTriangle size={16} className={data.hasIssue ? 'fill-current' : ''} />
                                                  </button>
                                              </div>

                                              {/* Parent Checkboxes (Only if NOT a Kit) */}
                                              {!isActuallyKit && (
                                                   <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                                        {renderTotalButton('distinta', data.inDistintaQty, data.totalQty, () => 
                                                            handleBatchUpdate(data.instances, { inDistinta: data.inDistintaQty < data.totalQty }),
                                                            showWarning,
                                                            isReadOnly,
                                                            `total-parent-${data.name}`,
                                                            data.originalTotalQty,
                                                            hasChanged,
                                                            data.changeLog,
                                                            data.name
                                                        )}
                                                        {renderTotalButton('carico', data.loadedQty, data.totalQty, () => 
                                                            handleBatchUpdate(data.instances, { loaded: data.loadedQty < data.totalQty }),
                                                            showWarning,
                                                            isReadOnly,
                                                            `total-parent-${data.name}`,
                                                            data.originalTotalQty,
                                                            hasChanged,
                                                            data.changeLog,
                                                            data.name
                                                        )}
                                                        {renderTotalButton('rientro', data.returnedQty, data.totalQty, () => 
                                                            handleBatchUpdate(data.instances, { returned: data.returnedQty < data.totalQty }),
                                                            false,
                                                            isReadOnly,
                                                            `total-parent-${data.name}`,
                                                            data.originalTotalQty,
                                                            hasChanged,
                                                            data.changeLog,
                                                            data.name
                                                        )}
                                                   </div>
                                              )}
                                          </div>
                                      </div>
                                      <div className="divide-y divide-slate-800">
                                          {Array.from((data.children as Map<string, any>).entries()).map(([childName, childData]) => {
                                              const isChildMatch = checkMatch(childName);
                                              
                                              if (isFilterActive && !isMainMatch && !isChildMatch) return null;
                                              
                                              const childHasChanged = Boolean(childData.hasChanged || childData.totalQty !== childData.originalTotalQty);
                                              const isChildResolved = isTotalItemResolved(childData);
                                              const showChildWarning = childHasChanged && !isChildResolved;
                                              const childPrevVer = childData.changeLog?.previousVersion || previousVersion;

                                              return (
                                              <div key={childName} className={`pl-5 sm:pl-8 pr-2 sm:pr-3 py-1 flex flex-row items-center justify-between gap-1.5 sm:gap-4 transition-all duration-300 opacity-100 ${showChildWarning ? 'bg-amber-900/10' : 'hover:bg-slate-800/30'}`}>
                                                  <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
                                                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActuallyKit ? 'bg-purple-500/50' : 'bg-cyan-500/50'} ${showChildWarning ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''}`}></div>
                                                      <div className="flex-1 min-w-0 flex flex-col">
                                                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                              <span 
                                                                  className={`font-medium text-xs sm:text-sm cursor-pointer hover:underline truncate whitespace-normal ${isChildMatch ? 'text-blue-400 font-bold' : 'text-slate-300'}`}
                                                                  onClick={() => handleSetHighlight(highlightedItemName === childName ? null : childName)}
                                                              >
                                                                  {childName}
                                                              </span>
                                                              <span className={`text-[11px] sm:text-xs px-1.5 py-0.5 rounded font-mono ${showChildWarning ? 'bg-amber-500 text-black font-bold' : isActuallyKit ? 'bg-slate-800 text-slate-400' : 'bg-cyan-900/20 text-cyan-400'}`}>x{childData.totalQty}</span>
                                                              {childHasChanged && (
                                                                  <span className={`text-xs ${showChildWarning ? 'text-amber-400 font-bold' : 'text-slate-400 font-normal'}`}>
                                                                      {childData.changeLog?.previousName
                                                                          ? `(Era: ${childData.originalTotalQty ? `${childData.originalTotalQty}x ` : ''}${childData.changeLog.previousName} ${formatVersionLabel(childPrevVer)})`
                                                                          : childData.originalTotalQty === 0
                                                                              ? '(NUOVO)'
                                                                              : `(Era: ${childData.originalTotalQty} ${formatVersionLabel(childPrevVer)})`}
                                                                  </span>
                                                              )}
                                                          </div>
                                                          {/* Aggregated Notes */}
                                                          {childData.aggregatedNotes && childData.aggregatedNotes.length > 0 && (
                                                              <div className="mt-0.5 flex flex-col gap-0.5 pl-2 sm:pl-4">
                                                                  {childData.aggregatedNotes.map((an: any, i: number) => (
                                                                      <div key={i} className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                                          ↳ <span className="text-slate-400">{an.qty}x</span> <span>Nota: </span><span className="font-bold">{an.text}</span>
                                                                      </div>
                                                                  ))}
                                                              </div>
                                                          )}
                                                      </div>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                      {/* Actions */}
                                                      <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                          <button 
                                                              onClick={() => setNoteModal({ isOpen: true, targets: childData.instances, text: '' })}
                                                              disabled={isReadOnly}
                                                              className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${childData.hasNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-600'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                          >
                                                              <MessageSquare size={16} className={childData.hasNote ? 'fill-current' : ''} />
                                                          </button>
                                                          <button 
                                                              onClick={() => setBrokenModal({ isOpen: true, targets: childData.instances, text: '' })}
                                                              disabled={isReadOnly}
                                                              className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${childData.hasIssue ? 'text-rose-500 bg-rose-900/20' : 'text-slate-600'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                          >
                                                              <AlertTriangle size={16} className={childData.hasIssue ? 'fill-current' : ''} />
                                                          </button>
                                                      </div>

                                                      <div className="flex items-center gap-1 sm:gap-2">
                                                          {renderTotalButton('distinta', childData.inDistintaQty, childData.totalQty, () => 
                                                              handleBatchUpdate(childData.instances, { inDistinta: childData.inDistintaQty < childData.totalQty }),
                                                              showChildWarning,
                                                              isReadOnly,
                                                              `total-child-${key}-${childName}`,
                                                              childData.originalTotalQty,
                                                              childHasChanged,
                                                              childData.changeLog,
                                                              childName
                                                          )}
                                                          {renderTotalButton('carico', childData.loadedQty, childData.totalQty, () => 
                                                              handleBatchUpdate(childData.instances, { loaded: childData.loadedQty < childData.totalQty }),
                                                              showChildWarning,
                                                              isReadOnly,
                                                              `total-child-${key}-${childName}`,
                                                              childData.originalTotalQty,
                                                              childHasChanged,
                                                              childData.changeLog,
                                                              childName
                                                          )}
                                                          {renderTotalButton('rientro', childData.returnedQty, childData.totalQty, () => 
                                                              handleBatchUpdate(childData.instances, { returned: childData.returnedQty < childData.totalQty }),
                                                              false,
                                                              isReadOnly,
                                                              `total-child-${key}-${childName}`,
                                                              childData.originalTotalQty,
                                                              childHasChanged,
                                                              childData.changeLog,
                                                              childName
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                          )})}
                                      </div>
                                  </div>
                              )})}

                              {zoneData.simple.size > 0 && (
                                  <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
                                      <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-slate-800/80 border-b border-slate-800 font-bold text-slate-400 text-xs uppercase tracking-wider">
                                          Materiale Sfuso (Totali Zona)
                                      </div>
                                      <div className="divide-y divide-slate-800">
                                          {Array.from((zoneData.simple as Map<string, any>).entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([name, data]) => {
                                              const isFilterActive = !!highlightedItemName || !!itemSearch;
                                              const checkMatch = (n: string) => highlightedItemName ? n === highlightedItemName : (itemSearch ? isTextMatch(n, itemSearch) : false);

                                              const isMatch = checkMatch(name);
                                              const hasChanged = Boolean(data.hasChanged || data.totalQty !== data.originalTotalQty);
                                              
                                              // Filter Logic: Search + Changes Filter
                                              if (isFilterActive && !isMatch) return null;
                                              if (showOnlyChanges && !hasChanged) return null;

                                              const isResolved = isTotalItemResolved(data);

                                              if (prepStatusFilter !== 'all') {
                                                  const modeQty = activeWarehouseMode === 'distinta' ? data.inDistintaQty : (activeWarehouseMode === 'carico' ? data.loadedQty : (activeWarehouseMode === 'rientro' ? data.returnedQty : data.inDistintaQty));
                                                  const isPartiallyChecked = modeQty > 0;

                                                  if (prepStatusFilter === 'spuntati' && !isPartiallyChecked) return null;
                                                  if (prepStatusFilter === 'non_spuntati' && isResolved) return null;
                                                  if (prepStatusFilter === 'modifiche_magazzino') {
                                                      const hasMod = data.instances?.some((inst: any) => {
                                                          const cItem = activeZone?.sections?.flatMap(s => s.components).find(c => c.uniqueId === inst.uniqueId);
                                                          return cItem && isComponentWarehouseModified(cItem);
                                                      });
                                                      if (!hasMod) return null;
                                                  }
                                                  if (prepStatusFilter === 'aggiornati_non_preparati' && (!hasChanged || isResolved)) return null;
                                              }
                                              const showWarning = hasChanged && !isResolved;
                                              const simplePrevVer = data.changeLog?.previousVersion || previousVersion;

                                              return (
                                              <div key={name} className={`py-1 px-2.5 sm:px-3 flex flex-row items-center justify-between gap-2 transition-colors duration-300 opacity-100 ${showWarning ? 'bg-amber-900/10 border-l-4 border-amber-500' : 'hover:bg-slate-800/50'}`}>
                                                  <div className="flex-1 min-w-0 flex flex-col">
                                                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                                          <span 
                                                              className={`font-bold text-sm cursor-pointer hover:underline truncate whitespace-normal ${isMatch ? 'text-blue-400' : 'text-white'}`}
                                                              onClick={() => handleSetHighlight(highlightedItemName === name ? null : name)}
                                                          >
                                                              {data.name}
                                                              {data.isTemporary && <span className="bg-yellow-400 text-black text-xs font-bold px-1.5 py-0.5 rounded ml-2">TEMP</span>}
                                                          </span>
                                                          <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${showWarning ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300'}`}>
                                                              x{data.totalQty}
                                                          </span>
                                                          {hasChanged && (
                                                              <span className={`text-xs ${showWarning ? 'text-amber-400 font-bold' : 'text-slate-400 font-normal'}`}>
                                                                  {data.changeLog?.previousName
                                                                      ? `(Era: ${data.originalTotalQty ? `${data.originalTotalQty}x ` : ''}${data.changeLog.previousName} ${formatVersionLabel(simplePrevVer)})`
                                                                      : data.originalTotalQty === 0
                                                                          ? '(NUOVO)'
                                                                          : `(Era: ${data.originalTotalQty} ${formatVersionLabel(simplePrevVer)})`}
                                                              </span>
                                                          )}
                                                      </div>
                                                      {/* Aggregated Notes */}
                                                      {data.aggregatedNotes && data.aggregatedNotes.length > 0 && (
                                                          <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                                                              {data.aggregatedNotes.map((an: any, i: number) => (
                                                                  <div key={i} className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                                      ↳ <span className="text-slate-400">{an.qty}x</span> <span>Nota: </span><span className="font-bold">{an.text}</span>
                                                                  </div>
                                                              ))}
                                                          </div>
                                                      )}
                                                  </div>
                                                  <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                                                      {/* Actions */}
                                                      <div className="flex gap-1 pr-1.5 sm:pr-3 border-r border-slate-800">
                                                          <button 
                                                              onClick={() => setNoteModal({ isOpen: true, targets: data.instances, text: '' })}
                                                              disabled={isReadOnly}
                                                              className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${data.hasNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                          >
                                                              <MessageSquare size={16} className={data.hasNote ? 'fill-current' : ''} />
                                                          </button>
                                                          <button 
                                                              onClick={() => setBrokenModal({ isOpen: true, targets: data.instances, text: '' })}
                                                              disabled={isReadOnly}
                                                              className={`p-1 sm:p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${data.hasIssue ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'} ${isReadOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                          >
                                                              <AlertTriangle size={16} className={data.hasIssue ? 'fill-current' : ''} />
                                                          </button>
                                                      </div>

                                                      <div className="flex items-center gap-1 sm:gap-2">
                                                          {renderTotalButton('distinta', data.inDistintaQty, data.totalQty, () => 
                                                              handleBatchUpdate(data.instances, { inDistinta: data.inDistintaQty < data.totalQty }),
                                                              showWarning,
                                                              isReadOnly,
                                                              `total-simple-${name}`,
                                                              data.originalTotalQty,
                                                              hasChanged,
                                                              data.changeLog,
                                                              name
                                                          )}
                                                          {renderTotalButton('carico', data.loadedQty, data.totalQty, () => 
                                                              handleBatchUpdate(data.instances, { loaded: data.loadedQty < data.totalQty }),
                                                              showWarning,
                                                              isReadOnly,
                                                              `total-simple-${name}`,
                                                              data.originalTotalQty,
                                                              hasChanged,
                                                              data.changeLog,
                                                              name
                                                          )}
                                                          {renderTotalButton('rientro', data.returnedQty, data.totalQty, () => 
                                                              handleBatchUpdate(data.instances, { returned: data.returnedQty < data.totalQty }),
                                                              false,
                                                              isReadOnly,
                                                              `total-simple-${name}`,
                                                              data.originalTotalQty,
                                                              hasChanged,
                                                              data.changeLog,
                                                              name
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                          )})}
                                      </div>
                                  </div>
                              )}
                          </div>
                        );
                    })()}
                    </div>
                </div>
              </>
          )}

          {/* Note Input Modal */}
          {/* VIEW: EVENT GLOBAL TOTALS (All Zones Summed - Desktop & Tablet Only) */}
          {viewMode === 'global-totals' && activeList && (
              <EventGlobalTotalsView
                  event={activeList}
                  databases={databases}
                  onBackToZones={() => setViewMode('zones')}
              />
          )}

          {/* Note Input Modal */}
          <Modal isOpen={noteModal.isOpen} onClose={() => setNoteModal(prev => ({ ...prev, isOpen: false }))} title="Nota Magazzino">
              <div className="space-y-4">
                  <textarea 
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white h-32 focus:border-blue-500 outline-none"
                      placeholder="Scrivi qui la nota per il magazzino..."
                      value={noteModal.text}
                      onChange={e => setNoteModal(prev => ({ ...prev, text: e.target.value }))}
                      autoFocus
                  />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setNoteModal(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
                      <button onClick={saveNote} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-2">
                          <Save size={16} /> Salva Nota
                      </button>
                  </div>
              </div>
          </Modal>

          {/* Broken Report Modal */}
          <Modal isOpen={brokenModal.isOpen} onClose={() => setBrokenModal(prev => ({ ...prev, isOpen: false }))} title="Segnalazione Problema">
              <div className="space-y-4">
                  <p className="text-slate-400 text-sm">Descrivi il problema riscontrato (rotto, mancante, danneggiato...)</p>
                  <textarea 
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white h-32 focus:border-rose-500 outline-none"
                      placeholder="Esempio: Cavo tranciato, Lampada bruciata..."
                      value={brokenModal.text}
                      onChange={e => setBrokenModal(prev => ({ ...prev, text: e.target.value }))}
                      autoFocus
                  />
                  <div className="flex justify-between">
                      <button onClick={resolveBrokenReport} className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded text-sm">
                          Risolto / Non Rotto
                      </button>
                      <div className="flex gap-2">
                          <button onClick={() => setBrokenModal(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
                          <button onClick={saveBrokenReport} className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded flex items-center gap-2">
                              <AlertTriangle size={16} /> Salva Segnalazione
                          </button>
                      </div>
                  </div>
              </div>
          </Modal>

          {/* Export Options Modal */}
          <Modal 
              isOpen={!!exportList} 
              onClose={() => setExportList(null)} 
              title="Export Lista Materiale"
              size="md"
          >
              <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                      Seleziona il formato in cui desideri esportare la lista per l'evento <strong>{exportList?.eventName}</strong>:
                  </p>
                  
                  <div className="grid grid-cols-1 gap-3">
                      {/* OPTION 1: PDF LISTA */}
                      <button 
                          onClick={() => { if (exportList) { exportPDF(exportList); setExportList(null); } }}
                          className="flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-blue-500/50 rounded-xl text-left transition-all duration-200 group"
                      >
                          <div className="p-3 bg-blue-900/30 text-blue-400 rounded-lg group-hover:scale-110 transition-transform">
                              <FileText size={24} />
                          </div>
                          <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-white text-sm">Lista Materiale (PDF)</h4>
                              <p className="text-xs text-slate-400 mt-0.5">Ordinata per zone e reparti con caselle di spunta (check-list).</p>
                          </div>
                      </button>

                      {/* OPTION 2: PDF TOTALI */}
                      <button 
                          onClick={() => { if (exportList) { exportTotalsPDF(exportList); setExportList(null); } }}
                          className="flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-purple-500/50 rounded-xl text-left transition-all duration-200 group"
                      >
                          <div className="p-3 bg-purple-900/30 text-purple-400 rounded-lg group-hover:scale-110 transition-transform">
                              <ClipboardList size={24} />
                          </div>
                          <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-white text-sm">Riepilogo Totali (PDF)</h4>
                              <p className="text-xs text-slate-400 mt-0.5">Raggruppamento globale dei totali divisi tra Kit e materiale sfuso.</p>
                          </div>
                      </button>

                      {/* OPTION 3: CSV EXCEL */}
                      <button 
                          onClick={() => { if (exportList) { exportCSV(exportList); setExportList(null); } }}
                          className="flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-emerald-500/50 rounded-xl text-left transition-all duration-200 group"
                      >
                          <div className="p-3 bg-emerald-900/30 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform">
                              <FileDown size={24} />
                          </div>
                          <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-white text-sm">Export in CSV (Excel)</h4>
                              <p className="text-xs text-slate-400 mt-0.5">Scarica un file CSV tabellare compatibile con Excel o altri gestionali.</p>
                          </div>
                      </button>
                  </div>

                  {/* ALL OTHER DEPARTMENTS SELECTOR */}
                  {exportList && exportList.zones && exportList.zones.length > 0 && (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-4 text-left transition-all duration-200">
                              <div className="p-2.5 bg-slate-800 text-slate-400 rounded-lg border border-slate-700/50">
                                  <Layers size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                  <h4 className="font-bold text-white text-xs uppercase tracking-wider opacity-80">Seleziona un singolo Reparto</h4>
                                  <p className="text-[11px] text-slate-500 mt-0.5">Esporta solo il PDF di uno dei reparti configurati:</p>
                              </div>
                          </div>
                          <div className="space-y-2.5 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                              {exportList.zones.map(zone => (
                                  <div key={zone.id} className="space-y-1">
                                      <div className="text-[10px] uppercase font-extrabold text-slate-500 tracking-widest pl-1">{zone.name}</div>
                                      <div className="flex flex-wrap gap-1.5 pl-2 pb-1">
                                          {zone.sections?.map(section => {
                                              const isActive = activeZoneId && zone.id === activeZoneId; // highlight if matching currently active zone
                                              return (
                                                  <button
                                                      key={section.id}
                                                      onClick={() => { exportSectionPDF(exportList, zone.id, section.id); setExportList(null); }}
                                                      className={`px-2 py-1 text-[11px] font-bold rounded border transition-all ${isActive ? 'bg-slate-950 hover:bg-slate-800 border-blue-500/50 text-blue-400 hover:text-white' : 'bg-slate-950 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'}`}
                                                  >
                                                      {section.name}
                                                  </button>
                                              );
                                          })}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-slate-800">
                      <button 
                          onClick={() => setExportList(null)}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                      >
                          Annulla
                      </button>
                  </div>
              </div>
          </Modal>

          {/* SHARE EVENT MODAL */}
          <ShareEventModal 
              isOpen={!!listToShare}
              onClose={() => setListToShare(null)}
              list={listToShare}
          />

          {/* ITEM REPLACEMENT MODAL */}
          <ItemReplacementModal 
              key={replacementModal.isOpen && replacementModal.targetComponent ? `${replacementModal.targetComponent.uniqueId}-${replacementModal.targetAccessoryIndex ?? 'main'}` : 'closed'}
              isOpen={replacementModal.isOpen}
              onClose={() => setReplacementModal(prev => ({ ...prev, isOpen: false, targetComponent: null }))}
              targetComponent={replacementModal.targetComponent}
              targetZoneName={replacementModal.targetZoneName}
              targetSectionName={replacementModal.targetSectionName}
              targetAccessoryIndex={replacementModal.targetAccessoryIndex}
              inventory={inventory}
              kits={kits}
              databases={effectiveDatabases}
              onConfirm={handleApplyReplacement}
              onRevert={handleRevertFromModal}
          />

          {/* REPLACEMENT HISTORY DETAIL POPUP */}
          <Modal
              isOpen={replacementHistoryModal.isOpen}
              onClose={() => setReplacementHistoryModal({ isOpen: false, component: null })}
              title="Dettaglio Materiale Sostituito"
              size="md"
          >
              <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider mb-2">
                          <History size={16} /> Materiale Originario Sostituito
                      </div>
                      <div className="text-sm font-bold text-white">
                          {replacementHistoryModal.info?.originalName || 'Materiale'}
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                          Quantità originaria: <strong className="text-amber-300">{replacementHistoryModal.info?.originalQuantity}x</strong>
                          {replacementHistoryModal.info?.originalType && (
                              <span className="ml-2 px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                                  {replacementHistoryModal.info.originalType}
                              </span>
                          )}
                      </div>
                      {replacementHistoryModal.info?.originalContents && replacementHistoryModal.info.originalContents.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-amber-500/20">
                              <span className="text-[11px] font-bold text-slate-400 block mb-1">Accessori originari:</span>
                              <div className="space-y-1">
                                  {replacementHistoryModal.info.originalContents.map((sub, sidx) => (
                                      <div key={sidx} className="text-xs text-slate-300 flex items-center justify-between">
                                          <span>- {sub.name}</span>
                                          <span className="font-mono text-slate-400">x{sub.quantity}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                      {replacementHistoryModal.info?.reason && (
                          <div className="mt-3 pt-2.5 border-t border-amber-500/20 text-xs">
                              <span className="font-bold text-slate-400">Motivazione magazzino: </span>
                              <span className="text-white italic">{replacementHistoryModal.info.reason}</span>
                          </div>
                      )}
                      {replacementHistoryModal.info?.replacedAt && (
                          <div className="mt-2 text-[10px] text-slate-500">
                              Data sostituzione: {new Date(replacementHistoryModal.info.replacedAt).toLocaleString('it-IT')}
                          </div>
                      )}
                  </div>

                  {/* Cosa è diventato adesso */}
                  {replacementHistoryModal.component && (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                              <ArrowLeftRight size={14} className="text-emerald-400" /> Attualmente in distinta
                          </div>
                          <div className="text-sm font-bold text-white flex items-center justify-between">
                              <span>
                                  {replacementHistoryModal.accessoryName 
                                      ? replacementHistoryModal.accessoryName 
                                      : replacementHistoryModal.component.name}
                              </span>
                              <span className="font-mono text-emerald-400 font-bold">
                                  x{replacementHistoryModal.accessoryQty !== undefined 
                                      ? replacementHistoryModal.accessoryQty 
                                      : replacementHistoryModal.component.quantity}
                              </span>
                          </div>
                      </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                      <button
                          type="button"
                          onClick={handleRevertReplacement}
                          disabled={isReadOnly}
                          className={`px-3.5 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 hover:border-rose-500 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${isReadOnly ? 'opacity-40 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}
                          title="Annulla la sostituzione e ripristina il materiale originario"
                      >
                          <RotateCcw size={14} className="text-rose-400" />
                          Ripristina Materiale Originale
                      </button>

                      <button
                          type="button"
                          onClick={() => setReplacementHistoryModal({ isOpen: false, component: null })}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                          Chiudi
                      </button>
                  </div>
              </div>
          </Modal>

          {/* PREPARATION FILTERS MODAL / DRAWER */}
          <Modal
              isOpen={isPrepFilterModalOpen}
              onClose={() => setIsPrepFilterModalOpen(false)}
              title="Filtri Preparazione"
              size="md"
              asDrawerOnDesktop={true}
          >
              <div className="flex flex-col h-full space-y-5">
                  <div className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                      {/* Stato Materiale / Preparazione Filter */}
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                              Stato Materiale
                          </label>
                          <div className="grid grid-cols-1 gap-1.5">
                              {[
                                  { id: 'all', label: 'Tutti i materiali', desc: 'Nessun filtro applicato' },
                                  { id: 'spuntati', label: 'Solo spuntati', desc: 'Materiali con spunta effettuata' },
                                  { id: 'non_spuntati', label: 'Solo non spuntati', desc: 'Materiali ancora da verificare' },
                                  { id: 'modifiche_magazzino', label: 'Modifiche magazzino', desc: 'Sostituzioni effettuate in preparazione' },
                                  { id: 'aggiornati_non_preparati', label: 'Aggiornati da Crea Liste', desc: 'Modificati di recente e non ancora preparati' }
                              ].map(option => {
                                  const isSelected = prepStatusFilter === option.id;
                                  return (
                                      <button
                                          key={option.id}
                                          type="button"
                                          onClick={() => setPrepStatusFilter(option.id as any)}
                                          className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between ${
                                              isSelected
                                                  ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                                                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                                          }`}
                                      >
                                          <div className="min-w-0 pr-2">
                                              <div className={`text-xs font-bold ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}>
                                                  {option.label}
                                              </div>
                                              <div className="text-[11px] text-slate-400 truncate">
                                                  {option.desc}
                                              </div>
                                          </div>
                                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                              isSelected ? 'border-blue-400 bg-blue-500' : 'border-slate-600 bg-slate-950'
                                          }`}>
                                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                          </div>
                                      </button>
                                  );
                              })}
                          </div>
                      </div>

                      {/* Database Filter */}
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                              Database Sorgente
                          </label>
                          <div className="relative">
                              <select
                                  value={prepDatabaseFilter}
                                  onChange={(e) => setPrepDatabaseFilter(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none font-medium cursor-pointer"
                              >
                                  <option value="All">Tutti i Database</option>
                                  {effectiveDatabases.map(db => (
                                      <option key={db.id} value={db.id}>
                                          [{db.code || db.name.slice(0, 3).toUpperCase()}] {db.name}
                                      </option>
                                  ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                  <ChevronDown size={14} />
                              </div>
                          </div>
                      </div>

                      {/* Categoria Filter */}
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                              Categoria Materiale
                          </label>
                          <div className="relative">
                              <select
                                  value={prepCategoryFilter}
                                  onChange={(e) => setPrepCategoryFilter(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none font-medium cursor-pointer"
                              >
                                  <option value="All">Tutte le Categorie</option>
                                  {availablePrepCategories.map(cat => (
                                      <option key={cat} value={cat}>
                                          {cat}
                                      </option>
                                  ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                  <ChevronDown size={14} />
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-auto shrink-0">
                      <button
                          onClick={handleResetPrepFilters}
                          className="text-xs text-slate-400 hover:text-white underline transition-colors"
                      >
                          Azzera Filtri
                      </button>
                      <button
                          onClick={() => setIsPrepFilterModalOpen(false)}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase px-5 py-2.5 rounded-lg transition-colors shadow-lg shadow-blue-600/30"
                      >
                          Applica Filtri
                      </button>
                  </div>
              </div>
          </Modal>

          {/* ZONE EDIT MODAL */}
          {zoneForEdit && (
              <ZoneEditModal
                  isOpen={!!zoneForEdit}
                  onClose={() => setZoneForEdit(null)}
                  zone={zoneForEdit}
                  event={activeList}
                  onSave={async (updatedFields) => {
                      if (!activeList || !zoneForEdit) return;
                      const targetId = zoneForEdit.id;
                      const targetName = zoneForEdit.name;
                      const newZones = (activeList.zones || []).map(z => 
                        (z.id && targetId ? z.id === targetId : z.name === targetName) ? { ...z, ...updatedFields } : z
                      );
                      let updatedSnapshot = activeList.snapshot;
                      if (updatedSnapshot && updatedSnapshot.length > 0) {
                        updatedSnapshot = updatedSnapshot.map(sz => 
                          (sz.id && targetId ? sz.id === targetId : sz.name === targetName) ? { ...sz, ...updatedFields } : sz
                        );
                      }
                      const updatedList = { ...activeList, zones: newZones, snapshot: updatedSnapshot };
                      setLocalList(updatedList);
                      localListRef.current = updatedList;
                      const payload: Partial<PackingList> = { zones: newZones };
                      if (updatedSnapshot) payload.snapshot = updatedSnapshot;
                      await updateItemFields(COLL_LISTS, activeList.id, payload);
                      setZoneForEdit(null);
                  }}
              />
          )}

          {/* ZONE INFO MODAL */}
          {zoneForInfo && (
              <ZoneInfoModal
                  isOpen={!!zoneForInfo}
                  onClose={() => setZoneForInfo(null)}
                  zone={zoneForInfo}
                  event={activeList}
                  onEdit={() => {
                      const z = zoneForInfo;
                      setZoneForInfo(null);
                      setZoneForEdit(z);
                  }}
              />
          )}

          {/* EVENT SUMMARY & ZONES SCHEMA MODAL */}
          {summaryEvent && (
              <EventSummaryModal
                  event={summaryEvent}
                  isOpen={!!summaryEvent}
                  onClose={() => setSummaryEvent(null)}
                  onEdit={() => setSummaryEvent(null)}
                  onOpenList={() => setSummaryEvent(null)}
                  onUpdateZone={async (zoneId, updatedFields) => {
                      if (activeList && activeList.id === summaryEvent.id) {
                          const newZones = (activeList.zones || []).map(z => 
                            (z.id && zoneId ? z.id === zoneId : z.name === zoneId) ? { ...z, ...updatedFields } : z
                          );
                          let updatedSnapshot = activeList.snapshot;
                          if (updatedSnapshot && updatedSnapshot.length > 0) {
                            updatedSnapshot = updatedSnapshot.map(sz => 
                              (sz.id && zoneId ? sz.id === zoneId : sz.name === zoneId) ? { ...sz, ...updatedFields } : sz
                            );
                          }
                          const updatedList = { ...activeList, zones: newZones, snapshot: updatedSnapshot };
                          setLocalList(updatedList);
                          localListRef.current = updatedList;
                          const payload: Partial<PackingList> = { zones: newZones };
                          if (updatedSnapshot) payload.snapshot = updatedSnapshot;
                          await updateItemFields(COLL_LISTS, activeList.id, payload);
                      }
                  }}
              />
          )}

      </div>
  );
};
