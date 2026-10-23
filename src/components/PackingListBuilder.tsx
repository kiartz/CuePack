import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { generateId } from '../utils';
import { Plus, Minus, Search, Trash2, FileDown, Settings2, Box, Package as PackageIcon, Calendar, MapPin, ClipboardList, StickyNote, Edit2, CheckSquare, Square, Scissors, Clipboard, ClipboardCopy, X, ArrowLeftRight, GripVertical, AlertTriangle, Lightbulb, List, CheckCircle, Undo2, Redo2, Share, Share2, Save, User, FileText, AlignLeft, Blocks, Layers, Factory, Truck, AlertCircle, ChevronLeft, ChevronRight, Database, Link, Eye, ExternalLink, Filter, WifiOff, Info } from 'lucide-react';
import { InventoryItem, Kit, PackingList, ListSection, ListComponent, Category, ListZone, Reminder, ChecklistCategory, Template, InventoryDatabase, WarehouseState, ItemReplacementInfo } from '../types';
import { useNetworkStatus } from '../context/NetworkContext';
import { ItemFormModal } from './ItemFormModal';
import { KitFormModal } from './KitFormModal';
import { ChecklistView } from './ChecklistView';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import { EventFormModal } from './EventFormModal';
import { RemindersModal } from './RemindersModal';
import { ShareEventModal } from './ShareEventModal';
import { ZoneEditModal } from './ZoneEditModal';
import { ZoneInfoModal } from './ZoneInfoModal';
import { EventSummaryModal } from './EventSummaryModal';
import { getCategoryDefinitions } from '../utils/categories';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addOrUpdateItem, deleteItem, updateItemFields, COLL_LISTS, COLL_INVENTORY, DEFAULT_DATABASE_ID, getInventoryCollection } from '../firebase';
import { exportPDF, exportTotalsPDF, exportCSV, exportSectionPDF, exportSelectivePDF, exportZonePDF } from '../utils/export';
import { getDbBadgeStyle } from '../utils/databaseColors';
import { calculateAvailableQuantity } from '../utils/availability';
import { openDocumentInBrowser } from '../utils/documentViewer';
import { searchAndSortItems, isTextMatch } from '../utils/searchUtils';

interface PackingListBuilderProps {
  inventory: InventoryItem[];
  kits: Kit[];
  templates: Template[];
  lists: PackingList[];
  masterChecklist: ChecklistCategory[];
  activeListId: string;
  setActiveListId: React.Dispatch<React.SetStateAction<string>>;
  listToOpenInBuilderId?: string | null;
  onListOpenedInBuilder?: () => void;
  listToAutoEditId?: string | null;
  onListAutoEdited?: () => void;
  databases?: InventoryDatabase[];
  activeDatabaseId?: string;
  setActiveDatabaseId?: (dbId: string) => void;
  onEventActiveChange?: (isActive: boolean) => void;
}

const InlineNoteInput: React.FC<{
    uniqueId: string;
    initialValue: string;
    onSave: (uniqueId: string, note: string) => void;
    autoFocus?: boolean;
}> = ({ uniqueId, initialValue, onSave, autoFocus }) => {
    const [val, setVal] = useState(initialValue);
    const isFocused = useRef(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync only when NOT focused to avoid cursor reset on async db update
    useEffect(() => {
        if (!isFocused.current) {
            setVal(initialValue);
        }
    }, [initialValue]);

    // Focus input and place cursor at the end when autoFocus is true
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
            const length = inputRef.current.value.length;
            inputRef.current.setSelectionRange(length, length);
        }
    }, [autoFocus]);

    // Clear timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleChange = (newVal: string) => {
        setVal(newVal);
        
        // Debounce database write (e.g. 400ms)
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            onSave(uniqueId, newVal);
        }, 400);
    };

    const handleBlur = () => {
        isFocused.current = false;
        // On blur, immediately save any pending changes
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        onSave(uniqueId, val);
    };

    return (
        <input 
            ref={inputRef}
            type="text" 
            placeholder="Aggiungi una nota..." 
            className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-300" 
            value={val} 
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => { isFocused.current = true; }}
            onBlur={handleBlur}
            draggable={false}
            onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onMouseDown={(e) => {
                e.stopPropagation();
            }}
        />
    );
};

export const PackingListBuilder: React.FC<PackingListBuilderProps> = ({ 
  inventory, 
  kits, 
  templates,
  lists, 
  masterChecklist,
  activeListId, 
  setActiveListId,
  listToOpenInBuilderId,
  onListOpenedInBuilder,
  listToAutoEditId,
  onListAutoEdited,
  databases = [],
  activeDatabaseId = DEFAULT_DATABASE_ID,
  setActiveDatabaseId,
  onEventActiveChange
}) => { // --- HELPERS ---
  const createDefaultSections = (): ListSection[] => [
    { id: generateId(), name: 'Audio', components: [] },
    { id: generateId(), name: 'Luci', components: [] },
    { id: generateId(), name: 'Video', components: [] },
    { id: generateId(), name: 'Strutture', components: [] },
    { id: generateId(), name: 'Elettrico', components: [] },
    { id: generateId(), name: 'Regia', components: [] },
    { id: generateId(), name: 'Attrezzi', components: [] },
  ];

  // --- STATE ---
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');

  useEffect(() => {
    const isEditingEvent = viewMode === 'edit' && !!activeListId;
    onEventActiveChange?.(isEditingEvent);
    return () => {
      onEventActiveChange?.(false);
    };
  }, [viewMode, activeListId, onEventActiveChange]);
  const [activeListAction, setActiveListAction] = useState<'duplicate' | 'delete' | null>(null);
  const [listFilter, setListFilter] = useState('');
  
  // Navigation
  const [activeZoneId, setActiveZoneId] = useState<string>('');
  const [activeSectionId, setActiveSectionId] = useState<string>('');

  // Search/Picker State
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const [isPickerFilterModalOpen, setIsPickerFilterModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [pickerDatabaseFilter, setPickerDatabaseFilter] = useState<string>('All');

  const availablePickerCategories = useMemo(() => {
    return Array.from(new Set([
      ...getCategoryDefinitions().map(c => c.name),
      ...Object.values(Category),
      ...inventory.map(i => i.category).filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b));
  }, [inventory]);

  const activePickerFiltersCount = useMemo(() => {
    let count = 0;
    if (pickerDatabaseFilter !== 'All') count++;
    if (selectedCategory !== 'All') count++;
    return count;
  }, [pickerDatabaseFilter, selectedCategory]);

  const handleResetPickerFilters = () => {
    setPickerDatabaseFilter('All');
    setSelectedCategory('All');
  };

  const effectiveDatabases = useMemo(() => {
    return (databases && databases.length > 0)
      ? databases
      : [{ id: DEFAULT_DATABASE_ID, name: 'Database Principale', code: 'PRI', color: 'emerald', isDefault: true }];
  }, [databases]);
  
  // LIST LOCAL SEARCH STATE
  const [listSearch, setListSearch] = useState('');
  
  // QTY EDITING STATE
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState<string>('');

  // REMINDERS STATE
  const [activeRemindersListId, setActiveRemindersListId] = useState<string | null>(null);
  
  // SHARE MODAL STATE
  const [listToShare, setListToShare] = useState<PackingList | null>(null);
  
  // Keep track of reminders that user has manually closed. 
  // By default, if an item has reminders, it is OPEN.
  const [closedRemindersIds, setClosedRemindersIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('closedRemindersIds');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem('closedRemindersIds', JSON.stringify(Array.from(closedRemindersIds)));
  }, [closedRemindersIds]);

  // --- DERIVED STATE & MIGRATION ON THE FLY ---
  const rawActiveList = useMemo(() => {
    const rawList = lists.find(l => l.id === activeListId);
    if (rawList && (!rawList.zones || rawList.zones.length === 0)) {
        // Backward compatibility: create a default zone if old format or empty
        const defaultSections: ListSection[] = [];
        if (rawList.sections && rawList.sections.length > 0) {
             rawList.sections.forEach((sec: any) => {
                 defaultSections.push({ ...sec, id: sec.id || generateId() });
             });
        } else {
             defaultSections.push(...createDefaultSections());
        }
        
        return {
            ...rawList,
            zones: [{
                id: 'default-zone',
                name: 'Zona Principale',
                sections: defaultSections
            }]
        } as PackingList;
    }
    return rawList;
  }, [lists, activeListId]);

  // Refs for tracking changes
  const { isOnline } = useNetworkStatus();
  const activeListRef = useRef<PackingList | null>(null);
  
  const [localList, setLocalList] = useState<PackingList | null>(null);
  const activeList = (localList && localList.id === activeListId) ? localList : rawActiveList;
  const pendingWritesRef = useRef(0);

  // History Stack for Undo/Redo (max 15 entries)
  const [historyPast, setHistoryPast] = useState<ListZone[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<ListZone[][]>([]);
  const isUndoRedoActionRef = useRef<boolean>(false);

  // Clear local optimistic cache & undo/redo history whenever activeListId changes to another list
  useEffect(() => {
    setLocalList(prev => (prev && prev.id === activeListId ? prev : null));
    activeListRef.current = null;
    setHistoryPast([]);
    setHistoryFuture([]);
  }, [activeListId]);

  // Synchronize localList when remote rawActiveList arrives and no local writes are in-flight
  useEffect(() => {
    if (rawActiveList && pendingWritesRef.current === 0) {
      setLocalList(rawActiveList);
      activeListRef.current = rawActiveList;
    }
  }, [rawActiveList]);

  // --- VERSION DIFF DETECTION, 10s REMINDER BANNER & HISTORY POPUP STATE ---
  const [activeHistoryTooltipId, setActiveHistoryTooltipId] = useState<string | null>(null);
  const [historyTooltipAnchor, setHistoryTooltipAnchor] = useState<DOMRect | null>(null);
  const [showUpdateReminderBanner, setShowUpdateReminderBanner] = useState<boolean>(false);
  const [dismissedWarehouseBannerListId, setDismissedWarehouseBannerListId] = useState<string | null>(null);
  const isWarehouseBannerDismissed = dismissedWarehouseBannerListId === activeList?.id;
  const [warehouseSubModal, setWarehouseSubModal] = useState<{
    isOpen: boolean;
    componentName: string;
    originalQuantity?: number;
    replacementInfo?: ItemReplacementInfo | null;
  }>({
    isOpen: false,
    componentName: '',
    originalQuantity: 0,
    replacementInfo: null
  });
  const lastNormalizedZonesRef = useRef<{ listId: string; norm: string } | null>(null);

  useEffect(() => {
    if (!activeHistoryTooltipId) return;
    const handleCloseTooltip = () => {
      setActiveHistoryTooltipId(null);
      setHistoryTooltipAnchor(null);
    };
    window.addEventListener('click', handleCloseTooltip);
    window.addEventListener('scroll', handleCloseTooltip, true);
    return () => {
      window.removeEventListener('click', handleCloseTooltip);
      window.removeEventListener('scroll', handleCloseTooltip, true);
    };
  }, [activeHistoryTooltipId]);

  const getDesignerZones = useCallback((zones?: ListZone[]): ListZone[] => {
    if (!zones) return [];

    const restoreContents = (contents?: Array<{ itemId?: string; name: string; quantity: number; category: string; warehouseState?: WarehouseState; replacementInfo?: ItemReplacementInfo; notes?: string }>) => {
      if (!contents) return contents;
      const result: typeof contents = [];
      const handledGroups = new Set<string>();

      for (let i = 0; i < contents.length; i++) {
        const sub = contents[i];
        const repInfo = sub.replacementInfo;
        const groupId = repInfo?.replacementGroupId;

        if (groupId) {
          if (handledGroups.has(groupId)) continue;
          handledGroups.add(groupId);

          const groupSubs = contents.filter(s => s.replacementInfo?.replacementGroupId === groupId);
          const repItemDrafts = repInfo.replacements || groupSubs.filter(s => s.name !== repInfo.originalName).map(s => ({
            referenceId: s.itemId,
            name: s.name,
            quantity: s.quantity,
            category: s.category
          }));

          result.push({
            itemId: repInfo.originalReferenceId || sub.itemId,
            name: repInfo.originalName,
            quantity: repInfo.originalQuantity,
            category: repInfo.originalCategory || sub.category,
            warehouseState: repInfo.originalWarehouseState || sub.warehouseState,
            notes: sub.notes,
            replacementInfo: {
              ...repInfo,
              replacements: repItemDrafts
            }
          });
        } else {
          result.push(sub);
        }
      }
      return result;
    };

    const restoreComponents = (components: ListComponent[]): ListComponent[] => {
      const result: ListComponent[] = [];
      const handledGroups = new Set<string>();

      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        const repInfo = comp.replacementInfo;
        const groupId = repInfo?.replacementGroupId;

        if (groupId) {
          if (handledGroups.has(groupId)) continue;
          handledGroups.add(groupId);

          const groupComps = components.filter(c => c.replacementInfo?.replacementGroupId === groupId);
          const repItemDrafts = repInfo.replacements || groupComps.filter(c => c.uniqueId.startsWith('rep-')).map(c => ({
            referenceId: c.referenceId,
            name: c.name,
            quantity: c.quantity,
            category: c.category
          }));

          const originalComp: ListComponent = {
            uniqueId: repInfo.originalUniqueId || comp.uniqueId,
            type: repInfo.originalType || comp.type,
            referenceId: repInfo.originalReferenceId || comp.referenceId,
            name: repInfo.originalName,
            quantity: repInfo.originalQuantity,
            category: repInfo.originalCategory || comp.category,
            databaseId: repInfo.originalDatabaseId || comp.databaseId,
            notes: comp.notes || '',
            isExternalRental: Boolean(comp.isExternalRental),
            rentalType: comp.rentalType,
            externalRentalVendor: comp.externalRentalVendor,
            contents: repInfo.originalContents ? repInfo.originalContents.map(sub => ({
              itemId: sub.itemId,
              name: sub.name,
              quantity: sub.quantity,
              category: sub.category,
              warehouseState: sub.warehouseState
            })) : restoreContents(comp.contents),
            warehouseState: repInfo.originalWarehouseState || comp.warehouseState,
            replacementInfo: {
              ...repInfo,
              replacements: repItemDrafts
            }
          };

          result.push(originalComp);
        } else {
          result.push({
            ...comp,
            contents: restoreContents(comp.contents),
            templateContents: comp.templateContents ? restoreComponents(comp.templateContents) : comp.templateContents
          });
        }
      }
      return result;
    };

    return zones.map(z => ({
      ...z,
      sections: (z.sections || []).map(s => ({
        ...s,
        components: restoreComponents(s.components || [])
      }))
    }));
  }, []);

  const mergeDesignerZonesWithWarehouseReplacements = useCallback((
    newDesignerZones: ListZone[],
    rawWarehouseZones?: ListZone[]
  ): ListZone[] => {
    if (!rawWarehouseZones || rawWarehouseZones.length === 0) return newDesignerZones;

    const rawGroupMap = new Map<string, ListComponent[]>();
    rawWarehouseZones.forEach(z => {
      (z.sections || []).forEach(s => {
        (s.components || []).forEach(c => {
          const gid = c.replacementInfo?.replacementGroupId;
          if (gid) {
            if (!rawGroupMap.has(gid)) rawGroupMap.set(gid, []);
            rawGroupMap.get(gid)!.push(c);
          }
        });
      });
    });

    if (rawGroupMap.size === 0) return newDesignerZones;

    return newDesignerZones.map(z => ({
      ...z,
      sections: (z.sections || []).map(s => {
        const mergedComponents: ListComponent[] = [];

        for (const comp of (s.components || [])) {
          const gid = comp.replacementInfo?.replacementGroupId;
          if (gid && rawGroupMap.has(gid)) {
            const rawGroup = rawGroupMap.get(gid)!;
            const repInfo = comp.replacementInfo!;
            const isUntouched = comp.name === repInfo.originalName && comp.quantity === repInfo.originalQuantity;
            if (isUntouched) {
              mergedComponents.push(...rawGroup);
              continue;
            }
          }
          mergedComponents.push(comp);
        }

        return {
          ...s,
          components: mergedComponents
        };
      })
    }));
  }, []);

  const normalizeZonesForVersionDiff = useCallback((zonesToNorm?: ListZone[]) => {
    if (!zonesToNorm) return '';
    const normComp = (c: ListComponent): any => ({
      uniqueId: c.uniqueId,
      type: c.type,
      referenceId: c.referenceId,
      name: c.name,
      quantity: c.quantity,
      notes: c.notes || '',
      isExternalRental: Boolean(c.isExternalRental),
      rentalType: c.rentalType || '',
      externalRentalVendor: c.externalRentalVendor || '',
      contents: (c.contents || []).map(sub => ({
        itemId: sub.itemId,
        name: sub.name,
        quantity: sub.quantity,
        notes: sub.notes || ''
      })),
      templateContents: (c.templateContents || []).map(normComp)
    });
    // Sort zones and sections by ID so reordering does NOT trigger version changes
    // Exclude zone notes, section notes, and zone metadata: version diff strictly tracks MATERIAL changes
    const sortedZones = [...zonesToNorm].sort((a, b) => (a.id || a.name || '').localeCompare(b.id || b.name || ''));

    return JSON.stringify(
      sortedZones.map(z => ({
        id: z.id,
        sections: [...(z.sections || [])]
          .sort((a, b) => (a.id || a.name || '').localeCompare(b.id || b.name || ''))
          .map(s => ({
            id: s.id,
            components: (s.components || []).map(normComp)
          }))
      }))
    );
  }, []);

  const designerZones = useMemo(() => getDesignerZones(activeList?.zones), [activeList?.zones, getDesignerZones]);
  const hasWarehouseReplacements = useMemo(() => {
    if (!activeList?.zones) return false;
    return activeList.zones.some(z => 
      z.sections.some(s => 
        s.components.some(c => 
          Boolean(c.replacementInfo || c.contents?.some(sub => sub.replacementInfo))
        )
      )
    );
  }, [activeList?.zones]);

  const currentZonesNormalized = useMemo(() => normalizeZonesForVersionDiff(designerZones), [designerZones, normalizeZonesForVersionDiff]);
  const snapshotZonesNormalized = useMemo(() => normalizeZonesForVersionDiff(activeList?.snapshot), [activeList?.snapshot, normalizeZonesForVersionDiff]);

  const hasUnsavedVersionChanges = useMemo(() => {
    if (!activeList || !activeList.isCompleted) return false;
    if (!activeList.snapshot || activeList.snapshot.length === 0) return false;
    return currentZonesNormalized !== snapshotZonesNormalized;
  }, [activeList, currentZonesNormalized, snapshotZonesNormalized]);

  useEffect(() => {
    if (!activeList || !activeList.isCompleted) {
      setShowUpdateReminderBanner(false);
      lastNormalizedZonesRef.current = activeList ? { listId: activeList.id, norm: currentZonesNormalized } : null;
      return;
    }

    if (!lastNormalizedZonesRef.current || lastNormalizedZonesRef.current.listId !== activeList.id) {
      lastNormalizedZonesRef.current = { listId: activeList.id, norm: currentZonesNormalized };
      if (!hasUnsavedVersionChanges) {
        setShowUpdateReminderBanner(false);
      }
      return;
    }

    if (lastNormalizedZonesRef.current.norm !== currentZonesNormalized) {
      lastNormalizedZonesRef.current = { listId: activeList.id, norm: currentZonesNormalized };
      if (hasUnsavedVersionChanges) {
        setShowUpdateReminderBanner(true);
      } else {
        setShowUpdateReminderBanner(false);
      }
    } else if (!hasUnsavedVersionChanges) {
      setShowUpdateReminderBanner(false);
    }
  }, [activeList, currentZonesNormalized, hasUnsavedVersionChanges]);

  useEffect(() => {
    if (!showUpdateReminderBanner) return;
    const timer = setTimeout(() => {
      setShowUpdateReminderBanner(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [showUpdateReminderBanner, currentZonesNormalized]);

  // Lookup map of components in activeList.snapshot to detect pending/draft modifications
  const snapshotComponentMap = useMemo(() => {
    const map = new Map<string, ListComponent>();
    if (!activeList?.snapshot || !activeList.isCompleted) return map;
    activeList.snapshot.forEach(z => {
      z.sections.forEach(s => {
        s.components.forEach(c => {
          map.set(c.uniqueId, c);
          if (c.type === 'template' && c.templateContents) {
            c.templateContents.forEach(tc => map.set(tc.uniqueId, tc));
          }
        });
      });
    });
    return map;
  }, [activeList?.snapshot, activeList?.isCompleted]);

  const [overbookedModal, setOverbookedModal] = useState<{
      isOpen: boolean;
      item: InventoryItem | Kit | Template;
      type: 'item' | 'kit' | 'template';
      avail: number;
      total: number;
  } | null>(null);
  const [externalRentalVendor, setExternalRentalVendor] = useState('');

  // Non-automatic Accessory Confirmation Modal
  const [accessoryPromptModal, setAccessoryPromptModal] = useState<{
      isOpen: boolean;
      item: InventoryItem;
      nonAutoAccessories: { itemId: string; name: string; quantity: number; selected: boolean }[];
      isExternalRental?: boolean;
      rentalType?: 'internal_shortage' | 'external_rental';
      vendor?: string;
  } | null>(null);

  // Note Toggle State
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set());
  
  // Deletion States
  const [isDeleteListModalOpen, setIsDeleteListModalOpen] = useState(false);
  const [listToDeleteInfo, setListToDeleteInfo] = useState<{id: string, name: string} | null>(null);
  const [listToDuplicate, setListToDuplicate] = useState<PackingList | null>(null);
  const [isTemplateMode, setIsTemplateMode] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);

  // MULTI-SELECTION & CLIPBOARD STATE
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ListComponent[]>([]);
  const [clipboardPasted, setClipboardPasted] = useState(false);
  const [showPasteConfirm, setShowPasteConfirm] = useState(false);

  // EDIT MASTER STATE
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<Kit | null>(null);
  const [viewDocsItem, setViewDocsItem] = useState<InventoryItem | null>(null);
  const [isEditKitModalOpen, setIsEditKitModalOpen] = useState(false);

  // REPLACEMENT STATE
  const [replacingComponentId, setReplacingComponentId] = useState<string | null>(null);

  // DRAG & DROP FOR SECTIONS & ZONES
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [draggedZoneId, setDraggedZoneId] = useState<string | null>(null);
  const [dragOverZoneId, setDragOverZoneId] = useState<string | null>(null);

  // New Item Modal
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  
  // Temporary Item Modal
  const [isTempItemModalOpen, setIsTempItemModalOpen] = useState(false);
  const [tempItemFormData, setTempItemFormData] = useState({
      name: '',
      quantity: 1,
      category: '',
      notes: ''
  });
  const [editingTempItemUniqueId, setEditingTempItemUniqueId] = useState<string | null>(null);

  // Mobile/Desktop Checklist View State
  const [isMobileChecklistOpen, setIsMobileChecklistOpen] = useState(false);
  const [isDesktopChecklistOpen, setIsDesktopChecklistOpen] = useState(false);


  // Section/Zone Management Modal State
  const [mgmtModal, setMgmtModal] = useState({
    isOpen: false,
    target: 'section' as 'section' | 'zone',
    type: 'create' as 'create' | 'rename',
    targetId: undefined as string | undefined,
    name: ''
  });

  const [zoneForEdit, setZoneForEdit] = useState<ListZone | null>(null);
  const [zoneForInfo, setZoneForInfo] = useState<ListZone | null>(null);
  const [summaryEvent, setSummaryEvent] = useState<PackingList | null>(null);

  const [zoneNoteModal, setZoneNoteModal] = useState({
    isOpen: false,
    zoneId: '',
    note: ''
  });

  const handleZoneNoteSave = () => {
      if (!activeList || !zoneNoteModal.zoneId) return;
      const newZones = activeList.zones!.map(z => z.id === zoneNoteModal.zoneId ? { ...z, notes: zoneNoteModal.note } : z);
      updateActiveList({ zones: newZones });
      setZoneNoteModal(prev => ({ ...prev, isOpen: false }));
  };


  // DRAG AND DROP STATE
  const dragItem = useRef<{ zoneId: string, sectionId: string, index: number, uniqueId: string } | null>(null);
  const dragOverItem = useRef<{ zoneId: string, sectionId: string, index: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragOverIdx, setActiveDragOverIdx] = useState<number | null>(null);
  const [activeDragOverSectionId, setActiveDragOverSectionId] = useState<string | null>(null);

  // Auto-focus Refs
  const qtyInputRefs = useRef<{ [uniqueId: string]: HTMLInputElement | null }>({});
  const [lastAddedComponentId, setLastAddedComponentId] = useState<string | null>(null);
  
  // Mobile Action Menu State
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // HIGHLIGHT & WARNING STATE
  const [highlightedItemName, setHighlightedItemName] = useState<string | null>(null);
  const [lastClickedComponentId, setLastClickedComponentId] = useState<string | null>(null);

  // Picker Hover State & Logic
  const [isPickerHovered, setIsPickerHovered] = useState(false);
  const pickerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMouseOverPicker = useRef(false);

  const handlePickerEnter = (isMouse = false) => {
    if (isMouse) isMouseOverPicker.current = true;
    if (pickerTimeoutRef.current) {
      clearTimeout(pickerTimeoutRef.current);
      pickerTimeoutRef.current = null;
    }
    setIsPickerHovered(true);
  };

  const handlePickerLeave = (isMouse = false) => {
    if (isMouse) {
        isMouseOverPicker.current = false;
        // If input is focused, don't close even if mouse leaves
        if (pickerInputRef.current === document.activeElement) return;
    }
    
    // If this is a blur event (not mouse leave) and mouse is still over, don't close
    if (!isMouse && isMouseOverPicker.current) return;

    if (pickerTimeoutRef.current) clearTimeout(pickerTimeoutRef.current);
    pickerTimeoutRef.current = setTimeout(() => {
      setIsPickerHovered(false);
    }, 600); // 600ms delay
  };

  // Versioning/Feedback Modal State
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSelectedZones, setExportSelectedZones] = useState<Set<string>>(new Set());
  const [exportSelectedSections, setExportSelectedSections] = useState<Set<string>>(new Set());

  const handleOpenExportModal = () => {
    setExportSelectedZones(new Set());
    setExportSelectedSections(new Set());
    setIsExportModalOpen(true);
  };

  const handleToggleZoneExport = (zoneId: string) => {
    const targetZone = activeList?.zones?.find(z => z.id === zoneId);
    if (!targetZone) return;

    const hasSections = targetZone.sections && targetZone.sections.length > 0;
    const isCurrentlyFull = hasSections
      ? targetZone.sections.every(s => exportSelectedSections.has(`${zoneId}__${s.id}`))
      : exportSelectedZones.has(zoneId);

    setExportSelectedZones(prev => {
      const next = new Set(prev);
      if (isCurrentlyFull) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });

    if (hasSections) {
      setExportSelectedSections(prev => {
        const next = new Set(prev);
        targetZone.sections.forEach(s => {
          const key = `${zoneId}__${s.id}`;
          if (isCurrentlyFull) {
            next.delete(key);
          } else {
            next.add(key);
          }
        });
        return next;
      });
    }
  };

  const handleToggleSectionExport = (zoneId: string, sectionId: string) => {
    const key = `${zoneId}__${sectionId}`;
    const targetZone = activeList?.zones?.find(z => z.id === zoneId);

    setExportSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      if (targetZone && targetZone.sections) {
        const allSelected = targetZone.sections.every(s =>
          s.id === sectionId ? !prev.has(key) : next.has(`${zoneId}__${s.id}`)
        );
        setExportSelectedZones(prevZones => {
          const nextZones = new Set(prevZones);
          if (allSelected) {
            nextZones.add(zoneId);
          } else {
            nextZones.delete(zoneId);
          }
          return nextZones;
        });
      }

      return next;
    });
  };

  const handleSelectAllExport = () => {
    if (!activeList?.zones) return;
    const allZones = new Set<string>();
    const allSections = new Set<string>();
    activeList.zones.forEach(z => {
      allZones.add(z.id);
      z.sections?.forEach(s => {
        allSections.add(`${z.id}__${s.id}`);
      });
    });
    setExportSelectedZones(allZones);
    setExportSelectedSections(allSections);
  };

  const handleClearExportSelection = () => {
    setExportSelectedZones(new Set());
    setExportSelectedSections(new Set());
  };

  const handleExportSelected = () => {
    if (!activeList || !activeList.zones) return;
    const targets: { zoneId: string; sectionIds?: string[] }[] = [];

    activeList.zones.forEach(zone => {
      if (!zone.sections || zone.sections.length === 0) {
        if (exportSelectedZones.has(zone.id)) {
          targets.push({ zoneId: zone.id });
        }
        return;
      }

      const selectedSecs = zone.sections.filter(s => exportSelectedSections.has(`${zone.id}__${s.id}`));
      if (selectedSecs.length === zone.sections.length || exportSelectedZones.has(zone.id)) {
        targets.push({ zoneId: zone.id });
      } else if (selectedSecs.length > 0) {
        targets.push({ zoneId: zone.id, sectionIds: selectedSecs.map(s => s.id) });
      }
    });

    if (targets.length === 0) return;
    exportSelectivePDF(activeList, targets);
    setIsExportModalOpen(false);
  };

  const exportCounts = useMemo(() => {
    if (!activeList?.zones) return { fullZones: 0, partialSections: 0, totalItems: 0 };
    let fullZones = 0;
    let partialSections = 0;

    activeList.zones.forEach(z => {
      const hasSections = z.sections && z.sections.length > 0;
      const isFull = hasSections
        ? z.sections.every(s => exportSelectedSections.has(`${z.id}__${s.id}`))
        : exportSelectedZones.has(z.id);

      if (isFull) {
        fullZones++;
      } else if (hasSections) {
        const count = z.sections.filter(s => exportSelectedSections.has(`${z.id}__${s.id}`)).length;
        partialSections += count;
      }
    });

    return {
      fullZones,
      partialSections,
      totalItems: fullZones + partialSections
    };
  }, [activeList, exportSelectedZones, exportSelectedSections]);

  const [draftVersionInput, setDraftVersionInput] = useState('');
  const [versionError, setVersionError] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean, title: string, message: string, type?: 'success' | 'info' | 'error' } | null>(null);
  const [genericConfirm, setGenericConfirm] = useState<{ 
      isOpen: boolean, 
      title: string, 
      message: string, 
      onConfirm: () => void,
      confirmText?: string,
      variant?: 'danger' | 'primary'
  } | null>(null);

  // --- HELPERS FOR MASTER EDITS ---
  const propagateMasterUpdates = async (updatedItem: InventoryItem) => {
    const updatedLists = lists.map(list => {
        let listModified = false;
        
        const processComponents = (components: ListComponent[]) => {
            return components.map(comp => {
                if (comp.type === 'item' && comp.referenceId === updatedItem.id) {
                    let compModified = false;
                    if (comp.name !== updatedItem.name) { comp.name = updatedItem.name; compModified = true; }
                    if (comp.category !== updatedItem.category) { comp.category = updatedItem.category; compModified = true; }
                    
                    const newContents = (updatedItem.accessories || []).map(acc => {
                        const accItem = inventory.find(i => i.id === acc.itemId);
                        return {
                            itemId: acc.itemId,
                            name: accItem?.name || '?',
                            quantity: acc.quantity,
                            category: accItem?.category || 'Altro'
                        };
                    });
                    
                    if (JSON.stringify(comp.contents) !== JSON.stringify(newContents)) {
                        comp.contents = newContents;
                        compModified = true;
                    }

                    if (compModified) listModified = true;
                    return { ...comp };
                }
                return comp;
            });
        };

        const newZones = list.zones?.map(zone => ({
            ...zone,
            sections: zone.sections.map(section => ({
                ...section,
                components: processComponents(section.components)
            }))
        }));

        if (listModified) return { ...list, zones: newZones };
        return list;
    });

    const modifiedLists = updatedLists.filter((l, i) => l !== lists[i]);
    if (modifiedLists.length > 0) {
        await Promise.all(modifiedLists.map(l => addOrUpdateItem(COLL_LISTS, l)));
    }
  };

  const propagateKitUpdates = async (updatedKit: Kit) => {
    // Generate fresh contents from the updated kit master
    const generateFreshKitContents = (k: Kit) => {
      return (k.items || []).flatMap(ki => {
        const inv = inventory.find(i => i.id === ki.itemId);
        const main = {
          itemId: ki.itemId,
          name: inv?.name || '?',
          quantity: ki.quantity,
          category: inv?.category || 'Altro'
        };
        const accs = (ki.accessories || []).map(acc => {
          const accItem = inventory.find(i => i.id === acc.itemId);
          return {
            itemId: acc.itemId,
            name: accItem?.name || '?',
            quantity: acc.quantity,
            category: accItem?.category || 'Altro'
          };
        });
        return [main, ...accs];
      });
    };

    const freshContents = generateFreshKitContents(updatedKit);

    const updatedLists = lists.map(list => {
        let listModified = false;
        const newZones = list.zones?.map(zone => ({
            ...zone,
            sections: zone.sections.map(section => ({
                ...section,
                components: section.components.map(comp => {
                    if (comp.type === 'kit' && comp.referenceId === updatedKit.id) {
                        const nameChanged = comp.name !== updatedKit.name;
                        const currentSimple = (comp.contents || []).map(c => ({ itemId: c.itemId, quantity: c.quantity }));
                        const masterSimple = freshContents.map(c => ({ itemId: c.itemId, quantity: c.quantity }));
                        const contentsChanged = JSON.stringify(currentSimple) !== JSON.stringify(masterSimple);

                        if (nameChanged || contentsChanged) {
                            listModified = true;
                            return { ...comp, name: updatedKit.name, contents: freshContents };
                        }
                    }
                    return comp;
                })
            }))
        }));
        if (listModified) return { ...list, zones: newZones };
        return list;
    });
    const modifiedLists = updatedLists.filter((l, i) => l !== lists[i]);
    if (modifiedLists.length > 0) {
        await Promise.all(modifiedLists.map(l => addOrUpdateItem(COLL_LISTS, l)));
        // Also update local activeList if it was modified
        if (activeList) {
          const updatedActive = updatedLists.find(l => l.id === activeList.id);
          if (updatedActive && updatedActive !== activeList) {
            updateActiveList({ zones: updatedActive.zones }, true);
          }
        }
    }
  };

  const handleOpenMasterEditor = (name: string) => {
      const item = inventory.find(i => i.name === name);
      if (item) {
          setEditingItem(item);
          setIsEditItemModalOpen(true);
          return;
      }
      const kit = kits.find(k => k.name === name);
      if (kit) {
          setEditingKit(kit);
          setIsEditKitModalOpen(true);
          return;
      }
      
      // Look for temporary item in active list
      if (activeList && activeList.zones) {
          const allComponents = activeList.zones.flatMap(z => z.sections.flatMap(s => s.components));
          const tempComp = allComponents.find(c => c.isTemporary && c.name === name);
          if (tempComp) {
              setTempItemFormData({
                  name: tempComp.name,
                  quantity: tempComp.quantity,
                  category: tempComp.category || '',
                  notes: tempComp.notes || ''
              });
              setEditingTempItemUniqueId(tempComp.uniqueId);
              setIsTempItemModalOpen(true);
          }
      }
  };



  useEffect(() => {
      // Clear the optimistic ref when switching lists to avoid cross-contamination
      activeListRef.current = null;
  }, [activeListId]);

  const zones = designerZones;
  const activeZone = zones.find(z => z.id === activeZoneId);
  const sections = activeZone?.sections || [];
  const activeSection = sections.find(s => s.id === activeSectionId);

  const highlightedTotal = useMemo(() => {
    if (!activeList || !highlightedItemName) return 0;
    let total = 0;
    (activeList.zones || []).forEach(zone => {
      (zone.sections || []).forEach(section => {
        (section.components || []).forEach(comp => {
          if (comp.name === highlightedItemName) {
            total += comp.quantity;
          }
          comp.contents?.forEach(sub => {
            if (sub.name === highlightedItemName) {
              total += (sub.quantity * comp.quantity);
            }
          });
          // Also check template contents if they are not flattened yet in the raw state
          if (comp.type === 'template' && comp.templateContents) {
            comp.templateContents.forEach(tc => {
              if (tc.name === highlightedItemName) {
                total += (tc.quantity * comp.quantity);
              }
            });
          }
        });
      });
    });
    return total;
  }, [activeList, highlightedItemName]);

  const getSectionHighlightedQty = useCallback((section: ListSection) => {
    if (!highlightedItemName) return 0;
    let total = 0;
    section.components.forEach(comp => {
      if (comp.name === highlightedItemName) {
        total += comp.quantity;
      }
      comp.contents?.forEach(sub => {
        if (sub.name === highlightedItemName) {
          total += (sub.quantity * comp.quantity);
        }
      });
      if (comp.type === 'template' && comp.templateContents) {
        comp.templateContents.forEach(tc => {
          if (tc.name === highlightedItemName) {
            total += (tc.quantity * comp.quantity);
          }
        });
      }
    });
    return total;
  }, [highlightedItemName]);

  const getZoneHighlightedQty = useCallback((zone: ListZone) => {
    if (!highlightedItemName) return 0;
    let total = 0;
    zone.sections.forEach(section => {
      total += getSectionHighlightedQty(section);
    });
    return total;
  }, [highlightedItemName, getSectionHighlightedQty]);

  // Effect to scroll the last highlighted item back into view when exiting highlight mode
  useEffect(() => {
    if (!highlightedItemName && lastClickedComponentId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`comp-row-${lastClickedComponentId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setLastClickedComponentId(null);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [highlightedItemName, lastClickedComponentId]);

  // --- HIGHLIGHT & WARNING LOGIC (Placed here to access activeZone) ---

  // --- Map of Quantities currently in the List (Global) ---
  const quantitiesInList = useMemo(() => {
    const map = new Map<string, number>();
    if (!activeList || !activeList.zones) return map;

    activeList.zones.forEach(zone => {
        zone.sections.forEach(section => {
            section.components.forEach(comp => {
                const current = map.get(comp.referenceId) || 0;
                map.set(comp.referenceId, current + comp.quantity);
            });
        });
    });
    return map;
  }, [activeList]);

  // --- FILTERED PICKER ITEMS (With Improved Scoring) ---
  const filteredPickerItems = useMemo(() => {
      const dbFilteredInventory = inventory.filter(item => {
          if (pickerDatabaseFilter === 'All') return true;
          const itemDb = item.databaseId || DEFAULT_DATABASE_ID;
          return itemDb === pickerDatabaseFilter;
      });

      const categoryFiltered = selectedCategory === 'All'
        ? dbFilteredInventory
        : dbFilteredInventory.filter(i => i.category === selectedCategory);

      if (!pickerSearch || !pickerSearch.trim()) {
          return [...categoryFiltered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }

      return searchAndSortItems(categoryFiltered, pickerSearch);
  }, [inventory, pickerSearch, selectedCategory, pickerDatabaseFilter]);

  const filteredPickerKits = useMemo(() => {
      const categoryFiltered = selectedCategory === 'All'
        ? kits
        : kits.filter(k => k.category === selectedCategory);

      if (!pickerSearch || !pickerSearch.trim()) return categoryFiltered;
      return searchAndSortItems(categoryFiltered, pickerSearch);
  }, [kits, pickerSearch, selectedCategory]);

  const filteredPickerTemplates = useMemo(() => {
      const categoryFiltered = selectedCategory === 'All'
        ? templates
        : templates.filter(t => t.category === selectedCategory);

      if (!pickerSearch || !pickerSearch.trim()) return categoryFiltered;
      return searchAndSortItems(categoryFiltered, pickerSearch);
  }, [templates, pickerSearch, selectedCategory]);


  // Switch to edit mode when activeListId changes
  useEffect(() => {
    if (activeListId && viewMode === 'list') {
      setViewMode('edit');
    }
  }, [activeListId, viewMode]);

  const filteredLists = useMemo(() => {
    const filtered = lists.filter(list => 
      !list.isArchived && (
        !listFilter.trim() ||
        isTextMatch(`${list.eventName || ''} ${list.location || ''}`, listFilter)
      )
    );
    return filtered.sort((a, b) => new Date(b.eventDate || 0).getTime() - new Date(a.eventDate || 0).getTime());
  }, [lists, listFilter]);

  // Database Mismatch State (Disabled in unified multi-database mode where DBs can be mixed)
  const [dbMismatchList, setDbMismatchList] = useState<{ list: PackingList; targetDbId: string; targetDbName: string } | null>(null);

  useEffect(() => {
    setDbMismatchList(null);
  }, [activeListId]);

  const handleConfirmDbSwitch = () => {
    if (dbMismatchList && setActiveDatabaseId) {
      setLocalList(null);
      activeListRef.current = null;
      setActiveDatabaseId(dbMismatchList.targetDbId);
      setDbMismatchList(null);
    }
  };

  const handleCancelDbSwitch = () => {
    setDbMismatchList(null);
    handleBackToList();
  };

  const handleListSelect = (listId: string) => {
    setLocalList(null);
    activeListRef.current = null;
    setActiveZoneId('');
    setActiveSectionId('');
    setActiveListId(listId);
    setViewMode('edit');
  };

  const handleBackToList = () => {
    setLocalList(null);
    activeListRef.current = null;
    setActiveZoneId('');
    setActiveSectionId('');
    setViewMode('list');
    setActiveListId('');
  };
  
  // Set initial active ZONE and SECTION
  useEffect(() => {
    if (activeList && activeList.zones && activeList.zones.length > 0) {
        // ZONE Selection
        let targetZoneId = activeZoneId;

        // If no active zone (e.g. mount), try to restore from storage
        if (!targetZoneId) {
             const saved = localStorage.getItem(`cuepack_active_zone_${activeList.id}`);
             if (saved && activeList.zones.find(z => z.id === saved)) {
                 targetZoneId = saved;
             }
        }

        // Fallback to first if still invalid
        if (!targetZoneId || !activeList.zones.find(z => z.id === targetZoneId)) {
             targetZoneId = activeList.zones[0].id;
        }

        if (targetZoneId !== activeZoneId) {
            setActiveZoneId(targetZoneId);
        }
    }
  }, [activeList]);

  useEffect(() => {
      if (activeZone && activeZone.sections.length > 0) {
          // SECTION Selection within Zone
          let targetSectionId = activeSectionId;

          // Check validity of current section for this zone
          const isValid = targetSectionId && activeZone.sections.find(s => s.id === targetSectionId);

          if (!isValid) {
              // Try restore from storage for this zone
              const saved = localStorage.getItem(`cuepack_active_section_${activeZone.id}`);
              if (saved && activeZone.sections.find(s => s.id === saved)) {
                  targetSectionId = saved;
              } else {
                  targetSectionId = activeZone.sections[0].id;
              }
          }
          
          if (targetSectionId !== activeSectionId) {
              setActiveSectionId(targetSectionId);
          }
      } else {
          setActiveSectionId('');
      }
  }, [activeZoneId, activeZone]);

  // Persist Selection State
  useEffect(() => {
      if (activeListId && activeZoneId) {
          localStorage.setItem(`cuepack_active_zone_${activeListId}`, activeZoneId);
      }
  }, [activeListId, activeZoneId]);

  useEffect(() => {
      if (activeZoneId && activeSectionId) {
          localStorage.setItem(`cuepack_active_section_${activeZoneId}`, activeSectionId);
      }
  }, [activeZoneId, activeSectionId]);

  // Reset selection when switching contexts
  useEffect(() => {
      setSelectedIds(new Set());
      setReplacingComponentId(null);
      setListSearch(''); 
  }, [activeListId, activeZoneId, activeSectionId]);

  useEffect(() => {
    if (listToAutoEditId) {
        const listToEdit = lists.find(l => l.id === listToAutoEditId);
        if (listToEdit) {
            console.log("[Archive -> Edit] Opening metadata modal for:", listToEdit.eventName);
            openEventModal(listToEdit);
        }
        onListAutoEdited?.();
    }
  }, [listToAutoEditId, lists]);
  
  useEffect(() => {
    if (listToOpenInBuilderId) {
        const sourceList = lists.find(l => l.id === listToOpenInBuilderId);
        if (sourceList) {
            console.log("[Archive -> Copy] Triggering duplication for:", sourceList.eventName);
            // Ensure we are in list view mode before triggering duplication
            // so that the switch logic in confirmDuplicateList works as expected
            setViewMode('list'); 
            setIsTemplateMode(true);
            setListToDuplicate(sourceList);
        }
        onListOpenedInBuilder?.();
    }
  }, [listToOpenInBuilderId, lists]);

  // Auto-focus quantity
  useEffect(() => {
    if (lastAddedComponentId && qtyInputRefs.current[lastAddedComponentId]) {
      const input = qtyInputRefs.current[lastAddedComponentId];
      if (input) {
        // Use a brief timeout to ensure the browser has processed the render
        // and is ready to accept focus and select commands reliably.
        setTimeout(() => {
          input.focus();
          input.select();
        }, 10); 
      }
      setLastAddedComponentId(null);
    }
  }, [sections, lastAddedComponentId]);

  // --- AUTO-SYNC KITS & ACCESSORIES ---
  useEffect(() => {
      if (!activeList || !activeList.zones) return;

      let hasChanges = false;
      const updatedZones = activeList.zones.map(zone => ({
          ...zone,
          sections: zone.sections.map(section => ({
              ...section,
              components: section.components.map(comp => {
                  if (comp.type === 'kit') {
                      const master = kits.find(k => k.id === comp.referenceId);
                      if (master) {
                          // 1. Check Name
                          const nameChanged = comp.name !== master.name;

                          const masterItems: { itemId: string; quantity: number }[] = [];
                          (master.items || []).forEach(ki => {
                              masterItems.push({ itemId: ki.itemId, quantity: ki.quantity });
                              (ki.accessories || []).forEach(acc => {
                                  masterItems.push({ itemId: acc.itemId, quantity: acc.quantity });
                              });
                          });
                          masterItems.sort((a, b) => (a.itemId || '').localeCompare(b.itemId || ''));
                          const currentItems = (comp.contents || [])
                              .map(c => ({ itemId: c.itemId, quantity: c.quantity }))
                              .filter(c => c.itemId) // Ensure we have ID
                              .sort((a, b) => (a.itemId || '').localeCompare(b.itemId || ''));

                          const contentsChanged = JSON.stringify(masterItems) !== JSON.stringify(currentItems);

                          if (nameChanged || contentsChanged) {
                              hasChanges = true;
                              console.log(`[Sync] Updating Kit: ${comp.name} -> ${master.name} (Contents Changed: ${contentsChanged})`);
                              
                              // Re-generate contents from master to get fresh names and categories
                              const newContents = master.items.flatMap(ki => {
                                  const inv = inventory.find(i => i.id === ki.itemId);
                                  const main = { 
                                      itemId: ki.itemId, 
                                      name: inv?.name || '?', 
                                      quantity: ki.quantity, 
                                      category: inv?.category || 'Altro' 
                                  };
                                  const accs = (ki.accessories || []).map(acc => {
                                      const accItem = inventory.find(i => i.id === acc.itemId);
                                      return {
                                          itemId: acc.itemId,
                                          name: accItem?.name || '?',
                                          quantity: acc.quantity,
                                          category: accItem?.category || 'Altro'
                                      };
                                  });
                                  return [main, ...accs];
                              });

                              return { ...comp, name: master.name, contents: newContents };
                          }
                      }
                  } else {
                      // Logic for items with accessories
                      const master = inventory.find(i => i.id === comp.referenceId);
                      if (master) {
                          const nameChanged = comp.name !== master.name;
                          
                          const masterAcc = (master.accessories || [])
                              .map(a => ({ itemId: a.itemId, quantity: a.quantity, prepNote: a.prepNote || '' }))
                              .sort((a, b) => (a.itemId || '').localeCompare(b.itemId || ''));
                          
                          const currentAcc = (comp.contents || [])
                              .map(c => ({ itemId: c.itemId, quantity: c.quantity, prepNote: c.prepNote || '' }))
                              .filter(c => c.itemId)
                              .sort((a, b) => (a.itemId || '').localeCompare(b.itemId || ''));

                          const contentsChanged = JSON.stringify(masterAcc) !== JSON.stringify(currentAcc);

                          if (nameChanged || contentsChanged) {
                              hasChanges = true;
                              console.log(`[Sync] Updating Item: ${comp.name} -> ${master.name} (Accessories Changed: ${contentsChanged})`);

                              const newContents = (master.accessories || []).map(acc => {
                                  const inv = inventory.find(i => i.id === acc.itemId);
                                  return {
                                      itemId: acc.itemId,
                                      name: inv?.name || '?',
                                      quantity: acc.quantity,
                                      category: inv?.category || 'Altro',
                                      prepNote: acc.prepNote || ''
                                  };
                              });

                              return { ...comp, name: master.name, contents: newContents };
                          }
                      }
                  }
                  return comp;
              })
          }))
      }));

      if (hasChanges) {
          updateActiveList({ zones: updatedZones });
      }
  }, [activeListId, kits, inventory, activeList]); // Trigger when any relevant data changes

  // --- FIRESTORE WRAPPER (Coalescing Debounced Writes for Firestore Token/Quota Economy) ---
  const pendingUpdatesRef = useRef<{ listId: string; updates: Partial<PackingList> } | null>(null);
  const debounceCommitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCommittingRef = useRef(false);

  const flushPendingListUpdates = useCallback(async (): Promise<void> => {
    if (debounceCommitTimerRef.current) {
      clearTimeout(debounceCommitTimerRef.current);
      debounceCommitTimerRef.current = null;
    }

    if (!pendingUpdatesRef.current || isCommittingRef.current) return;

    const task = pendingUpdatesRef.current;
    pendingUpdatesRef.current = null;
    isCommittingRef.current = true;

    try {
      await updateItemFields(COLL_LISTS, task.listId, task.updates);
    } catch (e) {
      console.error("Error in batched list update:", e);
    } finally {
      isCommittingRef.current = false;
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      if (pendingUpdatesRef.current) {
        await flushPendingListUpdates();
      }
    }
  }, []);

  // Flush any pending writes on component unmount
  useEffect(() => {
    return () => {
      flushPendingListUpdates();
    };
  }, [flushPendingListUpdates]);

  const updateActiveList = async (updates: Partial<PackingList>, immediate: boolean = false): Promise<void> => {
      const baseList = activeListRef.current || activeList;
      if (!baseList) return;
      
      const mergedZones = updates.zones
        ? mergeDesignerZonesWithWarehouseReplacements(updates.zones, rawActiveList?.zones)
        : undefined;
      const effectiveUpdates = mergedZones ? { ...updates, zones: mergedZones } : updates;

      // History tracking: if zones are modified and this is not an undo/redo execution, push previous zones to historyPast
      if (effectiveUpdates.zones && !isUndoRedoActionRef.current && baseList.zones) {
          const prevZones = baseList.zones;
          // Check if zones actually changed before pushing to history
          if (JSON.stringify(prevZones) !== JSON.stringify(effectiveUpdates.zones)) {
              setHistoryPast(past => [...past.slice(-14), prevZones]);
              setHistoryFuture([]); // clear redo stack on new user modification
          }
      }

      // If list is completed and has a snapshot, mirror zone metadata in the snapshot so it stays in sync
      if (baseList.snapshot && effectiveUpdates.zones) {
        const updatedSnapshot = baseList.snapshot.map(sz => {
          const matchingZone = effectiveUpdates.zones!.find(z => (z.id && sz.id ? z.id === sz.id : z.name === sz.name));
          if (!matchingZone) return sz;
          return {
            ...sz,
            name: matchingZone.name,
            notes: matchingZone.notes,
            location: matchingZone.location,
            setupCompany: matchingZone.setupCompany,
            setupDate: matchingZone.setupDate,
            showDate: matchingZone.showDate,
            showTimeStart: matchingZone.showTimeStart,
            showTimeEnd: matchingZone.showTimeEnd,
            teardownDate: matchingZone.teardownDate,
            returnDate: matchingZone.returnDate,
            personnel: matchingZone.personnel,
          };
        });
        effectiveUpdates.snapshot = updatedSnapshot;
      }

      const updatedList = { ...baseList, ...effectiveUpdates };
      activeListRef.current = updatedList as PackingList; // Optimistic sync
      setLocalList(updatedList as PackingList); // Update UI instantly

      if (!pendingUpdatesRef.current || pendingUpdatesRef.current.listId !== baseList.id) {
        if (pendingUpdatesRef.current) {
          await flushPendingListUpdates();
        }
        pendingUpdatesRef.current = { listId: baseList.id, updates: { ...effectiveUpdates } };
        pendingWritesRef.current++;
      } else {
        pendingUpdatesRef.current.updates = {
          ...pendingUpdatesRef.current.updates,
          ...effectiveUpdates
        };
      }

      if (debounceCommitTimerRef.current) {
        clearTimeout(debounceCommitTimerRef.current);
        debounceCommitTimerRef.current = null;
      }

      if (immediate) {
        return flushPendingListUpdates();
      } else {
        return new Promise<void>((resolve) => {
          debounceCommitTimerRef.current = setTimeout(async () => {
            await flushPendingListUpdates();
            resolve();
          }, 300); // 300ms coalescing debounce for fast multi-user propagation
        });
      }
  };

  const handleUndoList = async () => {
      if (historyPast.length === 0) return;
      const baseList = activeListRef.current || activeList;
      if (!baseList || !baseList.zones) return;

      const previousZones = historyPast[historyPast.length - 1];
      const newPast = historyPast.slice(0, -1);
      const currentZones = baseList.zones;

      setHistoryPast(newPast);
      setHistoryFuture(future => [...future.slice(-14), currentZones]);

      isUndoRedoActionRef.current = true;
      try {
          await updateActiveList({ zones: previousZones });
      } finally {
          isUndoRedoActionRef.current = false;
      }
  };

  const handleRedoList = async () => {
      if (historyFuture.length === 0) return;
      const baseList = activeListRef.current || activeList;
      if (!baseList || !baseList.zones) return;

      const nextZones = historyFuture[historyFuture.length - 1];
      const newFuture = historyFuture.slice(0, -1);
      const currentZones = baseList.zones;

      setHistoryFuture(newFuture);
      setHistoryPast(past => [...past.slice(-14), currentZones]);

      isUndoRedoActionRef.current = true;
      try {
          await updateActiveList({ zones: nextZones });
      } finally {
          isUndoRedoActionRef.current = false;
      }
  };

  // Helper to update active zone
  const updateActiveZone = (zoneUpdates: Partial<ListZone>) => {
      const baseList = activeListRef.current || activeList;
      if (!baseList || !baseList.zones || !activeZoneId) return;
      const zId = activeZone?.id || activeZoneId;
      const newZones = baseList.zones.map(z => z.id === zId ? { ...z, ...zoneUpdates } : z);
      updateActiveList({ zones: newZones });
  };
  
  // Helper to update active section (inside active zone)
   const updateActiveSection = (sectionUpdates: Partial<ListSection> | ((prev: ListSection) => Partial<ListSection>)) => {
      const baseList = activeListRef.current || activeList;
      if (!baseList || !baseList.zones || !activeZoneId || !activeSectionId) return;
      
      const zId = activeZone?.id || activeZoneId;
      const currentZone = baseList.zones.find(z => z.id === zId);
      if (!currentZone) return;

      const sId = activeSection?.id || activeSectionId;
      const currentSection = currentZone.sections.find(s => s.id === sId);
      if (!currentSection) return;

      const resolvedUpdates = typeof sectionUpdates === 'function' ? sectionUpdates(currentSection) : sectionUpdates;

      const newSections = currentZone.sections.map(s => s.id === sId ? { ...s, ...resolvedUpdates } : s);
      updateActiveZone({ sections: newSections });
  };

  // Helper to move a section (reparto) inside the active zone left or right
  const handleMoveSection = (sectionId: string, direction: 'left' | 'right') => {
      if (!activeList || !activeZone) return;
      const sectionIndex = activeZone.sections.findIndex(s => s.id === sectionId);
      if (sectionIndex === -1) return;
      
      const newIndex = direction === 'left' ? sectionIndex - 1 : sectionIndex + 1;
      if (newIndex < 0 || newIndex >= activeZone.sections.length) return;
      
      const newSections = [...activeZone.sections];
      // Swap
      const temp = newSections[sectionIndex];
      newSections[sectionIndex] = newSections[newIndex];
      newSections[newIndex] = temp;
      
      updateActiveZone({ sections: newSections });
  };

  // Drag & drop handlers for sections (reparti)
  const handleSectionDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData('text/plain', id);
      setDraggedSectionId(id);
  };

  const handleSectionDragOver = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
      }
      if (dragOverSectionId !== id) {
          setDragOverSectionId(id);
      }
  };

  const handleSectionDragLeave = () => {
      setDragOverSectionId(null);
  };

  const handleSectionDragEnd = () => {
      setDraggedSectionId(null);
      setDragOverSectionId(null);
  };

  const handleSectionDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain') || draggedSectionId;
      setDraggedSectionId(null);
      setDragOverSectionId(null);
      
      if (!sourceId || sourceId === targetId || !activeZone || !activeList) return;
      
      const newSections = [...activeZone.sections];
      const sourceIndex = newSections.findIndex(s => s.id === sourceId);
      const targetIndex = newSections.findIndex(s => s.id === targetId);
      
      if (sourceIndex === -1 || targetIndex === -1) return;
      
      // Move source to target position
      const [removed] = newSections.splice(sourceIndex, 1);
      newSections.splice(targetIndex, 0, removed);
      
      updateActiveZone({ sections: newSections });
  };

  // Helper to determine the drop indicator border class (left or right blue line)
  const getDragIndicatorClass = (currentSectionId: string) => {
      if (!draggedSectionId || dragOverSectionId !== currentSectionId || draggedSectionId === currentSectionId) return '';
      
      const draggedIndex = sections.findIndex(s => s.id === draggedSectionId);
      const currentIndex = sections.findIndex(s => s.id === currentSectionId);
      
      if (draggedIndex === -1 || currentIndex === -1) return '';
      
      if (draggedIndex < currentIndex) {
          return 'border-r-4 border-r-blue-500 pr-1 transition-all';
      } else {
          return 'border-l-4 border-l-blue-500 pl-1 transition-all';
      }
  };

  // Drag & drop handlers for zones
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

  const handleZoneDrop = (e: React.DragEvent, targetId: string) => {
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
      
      updateActiveList({ zones: newZones });
  };

  const getZoneDragIndicatorClass = (currentZoneId: string) => {
      if (!draggedZoneId || dragOverZoneId !== currentZoneId || draggedZoneId === currentZoneId) return '';
      
      const draggedIndex = zones.findIndex(z => z.id === draggedZoneId);
      const currentIndex = zones.findIndex(z => z.id === currentZoneId);
      
      if (draggedIndex === -1 || currentIndex === -1) return '';
      
      if (draggedIndex < currentIndex) {
          return 'border-r-4 border-r-blue-500 pr-1 transition-all';
      } else {
          return 'border-l-4 border-l-blue-500 pl-1 transition-all';
      }
  };


  // --- List CRUD ---
  // Event Modal State
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventFormData, setEventFormData] = useState<Partial<PackingList>>({});

  const openEventModal = (list?: PackingList, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (list) {
          setEventFormData({
            databaseId: list.databaseId || activeDatabaseId || DEFAULT_DATABASE_ID,
            ...list
          });
      } else {
          setEventFormData({
              databaseId: activeDatabaseId || DEFAULT_DATABASE_ID,
              eventName: '',
              location: '',
              eventDate: '',
              setupDate: '',
              creationDate: new Date().toISOString(),
              zones: [{
                  id: generateId(),
                  name: 'Zona Principale',
                  sections: createDefaultSections()
              }]
          });
      }
      setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (dataOverride?: Partial<PackingList>) => {
      const dataToSave = dataOverride?.eventName ? dataOverride : eventFormData;
      if (!dataToSave.eventName) return;
      
      const listToSave = {
          databaseId: dataToSave.databaseId || activeDatabaseId || DEFAULT_DATABASE_ID,
          ...dataToSave,
          id: dataToSave.id || generateId(),
          creationDate: dataToSave.creationDate || new Date().toISOString()
      } as PackingList;

      await addOrUpdateItem(COLL_LISTS, listToSave);
      setIsEventModalOpen(false);
      
      // If new list, switch to it
      if (!eventFormData.id) {
           setLocalList(listToSave);
           setActiveZoneId(listToSave.zones?.[0]?.id || '');
           setActiveSectionId(listToSave.zones?.[0]?.sections?.[0]?.id || '');
           setActiveListId(listToSave.id);
           setViewMode('edit');
      } else if (listToSave.id === activeListId) {
           setLocalList(listToSave);
      }
  };

  const handleCreateList = () => openEventModal();

  const confirmDeleteList = async () => {
    const idToDelete = listToDeleteInfo ? listToDeleteInfo.id : activeListId;
    if (!idToDelete) return;
    if (idToDelete === activeListId) {
        const otherLists = lists.filter(l => l.id !== idToDelete);
        setActiveListId(otherLists.length > 0 ? otherLists[0].id : '');
    }
    await deleteItem(COLL_LISTS, idToDelete);
    setListToDeleteInfo(null);
    setIsDeleteListModalOpen(false);
  };

  const confirmDuplicateList = async () => {
    if (!listToDuplicate) return;
    
    // Handles legacy structure during duplication too
    const sourceZones = listToDuplicate.zones && listToDuplicate.zones.length > 0 ? listToDuplicate.zones : [{ id: 'def', name: 'Zona Principale', sections: listToDuplicate.sections || [] }];
    
    const newList: PackingList = {
      id: generateId(),
      eventName: `${listToDuplicate.eventName || ''} (Copia)`,
      eventDate: listToDuplicate.eventDate || '',
      setupDate: listToDuplicate.setupDate || '',
      location: listToDuplicate.location || '',
      customer: listToDuplicate.customer || '',
      description: listToDuplicate.description || '',
      notes: listToDuplicate.notes || '',
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
      checklistEnabledSectors: listToDuplicate.checklistEnabledSectors || [],
      reminders: listToDuplicate.reminders || [],

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
    setListToDuplicate(null);
    
    // Automatically switch to the new list and open its metadata modal
    setActiveListId(newList.id);
    setViewMode('edit');
    openEventModal(newList);
  };

  const handleDuplicateList = (list: PackingList, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTemplateMode(false);
    setListToDuplicate(list);
  };

  // --- Multi-Selection & Clipboard ---
  const toggleSelection = (uniqueId: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(uniqueId)) newSet.delete(uniqueId); else newSet.add(uniqueId);
    setSelectedIds(newSet);
  };
  const selectAllInSection = () => {
      if (!activeSection) return;
      const newSet = new Set(selectedIds);
      activeSection.components.forEach(c => newSet.add(c.uniqueId));
      setSelectedIds(newSet);
  };
  const deselectAll = () => setSelectedIds(new Set());

  const getSelectedComponents = (): ListComponent[] => {
      if (!activeList || !activeList.zones) return [];
      const allComponents = activeList.zones.flatMap(z => z.sections.flatMap(s => s.components));
      return allComponents.filter(c => selectedIds.has(c.uniqueId));
  };

  const handleCopy = () => {
      const items = getSelectedComponents();
      if (items.length > 0) { setClipboard(items); setClipboardPasted(false); }
  };
  const handleCut = () => {
      const items = getSelectedComponents();
      if (items.length > 0) { setClipboard(items); setClipboardPasted(false); handleBulkDelete(); }
  };
  const handlePaste = () => {
      if (clipboardPasted) { setShowPasteConfirm(true); return; }
      performPaste();
  };
  const performPaste = () => {
      if (!activeSection || clipboard.length === 0) return;
      let updatedComponents = [...activeSection.components];
      
      // Calculate insertion index based on last selection
      let insertionIndex = -1;
      for (let i = updatedComponents.length - 1; i >= 0; i--) {
          if (selectedIds.has(updatedComponents[i].uniqueId)) {
              insertionIndex = i;
              break;
          }
      }

      clipboard.forEach((clipItem, offset) => {
          const existing = updatedComponents.find(c => c.type === clipItem.type && c.referenceId === clipItem.referenceId);
          if (existing) {
              updatedComponents = updatedComponents.map(c => c.uniqueId === existing.uniqueId ? { ...c, quantity: c.quantity + clipItem.quantity } : c);
          } else {
              const newComp = { ...clipItem, uniqueId: generateId() };
              if (insertionIndex !== -1) {
                  updatedComponents.splice(insertionIndex + 1 + offset, 0, newComp);
              } else {
                  updatedComponents.push(newComp);
              }
          }
      });
      updateActiveSection({ components: updatedComponents });
      setSelectedIds(new Set());
      setClipboardPasted(true);
  };
  const handleBulkDelete = () => {
      if (!activeList || !activeList.zones || selectedIds.size === 0) return;
      setGenericConfirm({
          isOpen: true,
          title: "Elimina Elementi Selezionati",
          message: `Confermi di voler eliminare ${selectedIds.size} elemento/i selezionato/i da "${activeSection?.name || 'questa sezione'}"?`,
          confirmText: "Elimina",
          variant: "danger",
          onConfirm: () => {
              if (activeSection) {
                  const newComps = activeSection.components.filter(c => !selectedIds.has(c.uniqueId));
                  updateActiveSection({ components: newComps });
                  setSelectedIds(new Set());
              }
              setGenericConfirm(null);
          }
      });
  };


  // --- Zone & Section Management ---
  const openMgmtModal = (target: 'section' | 'zone', type: 'create' | 'rename', id?: string, currentName?: string) => {
      setMgmtModal({ isOpen: true, target, type, targetId: id, name: currentName || '' });
  };

  const handleMgmtModalSave = () => {
      if (!activeList || !mgmtModal.name.trim()) return;
      
      if (mgmtModal.target === 'zone') {
          // ZONE Operations
          if (mgmtModal.type === 'create') {
              const newId = generateId();
              const newZone: ListZone = { 
                  id: newId, 
                  name: mgmtModal.name.trim(), 
                  sections: createDefaultSections() 
              };
              const newZones = [...(activeList.zones || []), newZone];
              updateActiveList({ zones: newZones });
              setActiveZoneId(newId);
          } else {
              // Rename Zone
              const newZones = activeList.zones!.map(z => z.id === mgmtModal.targetId ? { ...z, name: mgmtModal.name.trim() } : z);
              updateActiveList({ zones: newZones });
          }
      } else {
          // SECTION Operations
          if (!activeZone) return;
          if (mgmtModal.type === 'create') {
              const newId = generateId();
              const newSection: ListSection = { id: newId, name: mgmtModal.name.trim(), components: [] };
              const newSections = [...activeZone.sections, newSection];
              updateActiveZone({ sections: newSections });
              setActiveSectionId(newId);
          } else {
              // Rename Section
              const newSections = activeZone.sections.map(s => s.id === mgmtModal.targetId ? { ...s, name: mgmtModal.name.trim() } : s);
              updateActiveZone({ sections: newSections });
          }
      }
      setMgmtModal(prev => ({ ...prev, isOpen: false }));
  };

  const confirmRemoveSection = () => {
      if (!activeZone || !sectionToDelete) return;
      if (activeZone.sections.length <= 1) { setSectionToDelete(null); return; }
      const newSections = activeZone.sections.filter(s => s.id !== sectionToDelete);
      updateActiveZone({ sections: newSections });
      setSectionToDelete(null);
  };

  const confirmRemoveZone = () => {
      if (!activeList || !zoneToDelete) return;
      if ((activeList.zones || []).length <= 1) { setZoneToDelete(null); return; }
      const newZones = activeList.zones!.filter(z => z.id !== zoneToDelete);
      updateActiveList({ zones: newZones });
      // Reset active zone if deleted
      if (activeZoneId === zoneToDelete) {
          setActiveZoneId(newZones[0].id);
      }
      setZoneToDelete(null);
  };


  // --- Item Operations ---
  const handleSaveTempItem = async () => {
      if (!activeSection || !tempItemFormData.name) return;
      
      if (editingTempItemUniqueId) {
          // EDIT MODE
          const newComponents = activeSection.components.map(c => 
              c.uniqueId === editingTempItemUniqueId ? {
                  ...c,
                  name: tempItemFormData.name,
                  quantity: tempItemFormData.quantity,
                  category: tempItemFormData.category || Category.OTHER,
                  notes: tempItemFormData.notes
              } : c
          );
          updateActiveSection({ components: newComponents });
          setEditingTempItemUniqueId(null);
          setIsTempItemModalOpen(false);
          // Highlight again with updated name
          setHighlightedItemName(tempItemFormData.name);
          return;
      }
      
      // ADD MODE
      const newComponent: ListComponent = {
          uniqueId: Date.now().toString(),
          type: 'item',
          referenceId: 'temp-' + Date.now(), 
          name: tempItemFormData.name,
          quantity: tempItemFormData.quantity,
          category: tempItemFormData.category || Category.OTHER,
          notes: tempItemFormData.notes,
          isTemporary: true,
          warehouseState: {
              inDistinta: false,
              loaded: false,
              returned: false,
              isBroken: false,
              warehouseNote: ''
          }
      };
      
      let newComponents = [...activeSection.components];
      let lastSelectedIndex = -1;
      for (let i = activeSection.components.length - 1; i >= 0; i--) {
          if (selectedIds.has(activeSection.components[i].uniqueId)) {
              lastSelectedIndex = i;
              break;
          }
      }

      if (lastSelectedIndex !== -1) {
          newComponents.splice(lastSelectedIndex + 1, 0, newComponent);
      } else {
          newComponents.push(newComponent);
      }
      
      updateActiveSection({ components: newComponents });
      setLastAddedComponentId(newComponent.uniqueId);
      setIsTempItemModalOpen(false);
  };

  const generateComponentFromItem = (
      item: InventoryItem | Kit | Template, 
      type: 'item' | 'kit' | 'template',
      customAccessories?: { itemId: string; quantity: number }[]
  ): Omit<ListComponent, 'uniqueId' | 'quantity' | 'notes'> => {
      if (type === 'template') {
        const t = item as Template;
        const builtContents: ListComponent[] = t.items.map((tc, idx) => {
             const master = tc.type === 'kit' ? kits.find(k => k.id === tc.referenceId) : inventory.find(i => i.id === tc.referenceId);
             if (!master) return null;
             
             let contents: any[] = [];
             let name = 'Sconosciuto';
             let category = 'Altro';
             
             if (tc.type === 'kit') {
                 const k = master as Kit;
                 name = k.name;
                 category = 'Kit';
                 contents = k.items.map(ki => {
                     const invItem = inventory.find(inv => inv.id === ki.itemId);
                     return { itemId: invItem?.id, name: invItem?.name || '?', quantity: ki.quantity, category: invItem?.category || 'Altro' };
                 });
             } else {
                 const i = master as InventoryItem;
                 name = i.name;
                 category = i.category;
                 contents = (i.accessories || []).filter(acc => acc.automatic !== false).map(acc => {
                     const invItem = inventory.find(inv => inv.id === acc.itemId);
                     return { itemId: acc.itemId, name: invItem?.name || '?', quantity: acc.quantity, category: invItem?.category || 'Altro' };
                 });
             }
             
             return {
                 uniqueId: `tmpl-child-${Date.now()}-${idx}`,
                 type: tc.type,
                 referenceId: tc.referenceId,
                 name: name,
                 category: category,
                 quantity: tc.quantity,
                 contents: contents,
                 warehouseState: { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
             } as ListComponent;
        }).filter(Boolean) as ListComponent[];

        return {
          type: 'template', referenceId: t.id, name: t.name, category: 'Template',
          templateContents: builtContents
        };
      } else if (type === 'kit') {
        const k = item as Kit;
        return {
          type: 'kit', referenceId: k.id, name: k.name, category: 'Kit',
          contents: k.items.flatMap(ki => {
              const i = inventory.find(inv => inv.id === ki.itemId);
              const main = { itemId: i?.id, name: i?.name || '?', quantity: ki.quantity, category: i?.category || 'Altro' };
              const accs = (ki.accessories || []).map(acc => {
                const accItem = inventory.find(inv => inv.id === acc.itemId);
                return {
                  itemId: acc.itemId,
                  name: accItem?.name || '?',
                  quantity: acc.quantity,
                  category: accItem?.category || 'Altro'
                };
              });
              return [main, ...accs];
          })
        };
      } else {
        const i = item as InventoryItem;
        const rawAccessories = customAccessories !== undefined
          ? customAccessories
          : (i.accessories || []).filter(acc => acc.automatic !== false);

        return {
          type: 'item', referenceId: i.id, name: i.name, category: i.category,
          databaseId: i.databaseId || DEFAULT_DATABASE_ID,
          contents: rawAccessories.map(acc => {
              const invItem = inventory.find(inv => inv.id === acc.itemId);
              return { itemId: acc.itemId, name: invItem?.name || '?', quantity: acc.quantity, category: invItem?.category || 'Altro', prepNote: (acc as any).prepNote || '' };
          })
        };
      }
  };

  const addToSection = (
      item: InventoryItem | Kit | Template, 
      type: 'item' | 'kit' | 'template', 
      isExternalRental: boolean = false,
      rentalType?: 'internal_shortage' | 'external_rental',
      vendor?: string,
      customAccessories?: { itemId: string; quantity: number }[]
  ) => {
      updateActiveSection(currentSection => {
          // Check for replacement
          if (replacingComponentId) {
              const newBase = generateComponentFromItem(item, type, customAccessories);
              const newComponents = currentSection.components.map(c => 
                  c.uniqueId === replacingComponentId ? { 
                      ...c, 
                      ...newBase, 
                      warehouseState: c.warehouseState,
                      contents: newBase.contents?.map((acc, accIdx) => {
                          const oldSub = c.contents?.find(os => os.itemId === acc.itemId) || c.contents?.[accIdx];
                          return {
                              ...acc,
                              warehouseState: oldSub?.warehouseState
                          };
                      }),
                      replacementInfo: undefined,
                      isExternalRental,
                      rentalType,
                      externalRentalVendor: vendor
                  } : c
              );
              setReplacingComponentId(null);
              return { components: newComponents };
          }

          const existing = currentSection.components.find(c => c.type === type && c.referenceId === item.id);
          if (existing) {
              const newComps = currentSection.components.map(c => c.uniqueId === existing.uniqueId ? { 
                  ...c, 
                  quantity: c.quantity + 1, 
                  isExternalRental: c.isExternalRental || isExternalRental,
                  rentalType: c.rentalType || rentalType,
                  externalRentalVendor: c.externalRentalVendor || vendor
              } : c);
              setLastAddedComponentId(existing.uniqueId);
              return { components: newComps };
          } else {
              const newId = generateId();
              const newComp: ListComponent = { 
                  uniqueId: newId, 
                  quantity: 1, 
                  notes: '', 
                  isExternalRental, 
                  rentalType,
                  externalRentalVendor: vendor,
                  ...generateComponentFromItem(item, type, customAccessories) 
              };

              let newComponents = [...currentSection.components];
              let lastSelectedIndex = -1;
              for (let i = currentSection.components.length - 1; i >= 0; i--) {
                  if (selectedIds.has(currentSection.components[i].uniqueId)) {
                      lastSelectedIndex = i;
                      break;
                  }
              }

              if (lastSelectedIndex !== -1) {
                  newComponents.splice(lastSelectedIndex + 1, 0, newComp);
              } else {
                  newComponents.push(newComp);
              }

              setLastAddedComponentId(newId);
              return { components: newComponents };
          }
      });
  };

  const triggerAddItem = (
      item: InventoryItem, 
      isExternalRental = false, 
      rentalType?: 'internal_shortage' | 'external_rental', 
      vendor?: string
  ) => {
      const nonAutoAccs = (item.accessories || []).filter(a => a.automatic === false);
      if (nonAutoAccs.length > 0) {
          const itemsList = nonAutoAccs.map(acc => {
              const inv = inventory.find(i => i.id === acc.itemId);
              return {
                  itemId: acc.itemId,
                  name: inv?.name || 'Accessorio',
                  quantity: acc.quantity,
                  selected: true
              };
          });
          setAccessoryPromptModal({
              isOpen: true,
              item,
              nonAutoAccessories: itemsList,
              isExternalRental,
              rentalType,
              vendor
          });
      } else {
          addToSection(item, 'item', isExternalRental, rentalType, vendor);
      }
  };

  const handleConfirmAccessoryPrompt = (includeSelected: boolean) => {
      if (!accessoryPromptModal) return;
      const { item, nonAutoAccessories, isExternalRental, rentalType, vendor } = accessoryPromptModal;
      
      const autoAccs = (item.accessories || []).filter(a => a.automatic !== false);
      const chosenNonAuto = includeSelected 
          ? nonAutoAccessories.filter(a => a.selected).map(a => ({ itemId: a.itemId, quantity: a.quantity }))
          : [];
      
      const combined = [...autoAccs, ...chosenNonAuto];
      addToSection(item, 'item', isExternalRental, rentalType, vendor, combined);
      setAccessoryPromptModal(null);
  };

  const updateComponentQty = (uniqueId: string, qtyOrUpdater: number | ((prev: number) => number)) => {
      updateActiveSection(currentSection => ({
          components: currentSection.components.map(c => {
              if (c.uniqueId === uniqueId) {
                  const newQty = typeof qtyOrUpdater === 'function' ? qtyOrUpdater(c.quantity) : qtyOrUpdater;
                  if (newQty < 0) return c;
                  return { ...c, quantity: newQty };
              }
              return c;
          })
      }));
  };
  
  const updateComponentNote = (uniqueId: string, note: string) => {
      updateActiveSection(currentSection => ({
          components: currentSection.components.map(c => c.uniqueId === uniqueId ? { ...c, notes: note } : c)
      }));
  };

  const removeComponent = (uniqueId: string) => {
      const comp = activeSection?.components.find(c => c.uniqueId === uniqueId);
      const itemName = comp?.name || "questo elemento";
      setGenericConfirm({
          isOpen: true,
          title: "Elimina Elemento",
          message: `Confermi di voler rimuovere "${itemName}" dalla distinta?`,
          confirmText: "Elimina",
          variant: "danger",
          onConfirm: () => {
              updateActiveSection(currentSection => ({
                  components: currentSection.components.filter(c => c.uniqueId !== uniqueId)
              }));
              setGenericConfirm(null);
          }
      });
  };

  const handleDragStart = (e: React.DragEvent, sectionId: string, index: number, uniqueId: string) => {
      dragItem.current = { zoneId: activeZoneId, sectionId, index, uniqueId };
      setIsDragging(true);
  };
  const handleDragEnter = (e: React.DragEvent, sectionId: string, index: number) => {
      e.preventDefault(); 
      dragOverItem.current = { zoneId: activeZoneId, sectionId, index };
      setActiveDragOverIdx(index);
      setActiveDragOverSectionId(sectionId);
  };
  const handleDragEnd = () => {
      setIsDragging(false);
      setActiveDragOverIdx(null);
      setActiveDragOverSectionId(null);
      if (dragItem.current && dragOverItem.current && activeSection) {
          // Only same section drag supported for simplicity
          if (dragItem.current.sectionId === dragOverItem.current.sectionId) {
              const idsToMove = selectedIds.has(dragItem.current.uniqueId) ? selectedIds : new Set([dragItem.current.uniqueId]);
              const itemsToMove: ListComponent[] = [];
              const itemsToStay: ListComponent[] = [];
              
              activeSection.components.forEach(c => {
                  if (idsToMove.has(c.uniqueId)) itemsToMove.push(c); else itemsToStay.push(c);
              });

              // Calculate insertion index
              const targetIndex = dragOverItem.current.index;
              const targetComp = activeSection.components[targetIndex];
              // This is a rough estimation of index in the "Stay" array
              let insertionIndex = itemsToStay.findIndex(c => c.uniqueId === targetComp?.uniqueId);
              
              if (insertionIndex === -1) {
                  if (targetIndex === activeSection.components.length) {
                      insertionIndex = itemsToStay.length;
                  } else {
                      // We dropped on an item that is being moved (like itself), cancel the drop
                      dragItem.current = null; dragOverItem.current = null;
                      return;
                  }
              }

              const newComponents = [...itemsToStay.slice(0, insertionIndex), ...itemsToMove, ...itemsToStay.slice(insertionIndex)];
              updateActiveSection({ components: newComponents });
          }
      }
      dragItem.current = null; dragOverItem.current = null;
  };

  const handleCreateNewItem = async (itemData: Omit<InventoryItem, 'id'>) => {
      const newItem: InventoryItem = { ...itemData, id: generateId() };
      await addOrUpdateItem(COLL_INVENTORY, newItem);
      addToSection(newItem, 'item');
  };

  const handleCreateInventoryItemOnly = async (itemData: Omit<InventoryItem, 'id'> | InventoryItem) => {
    const itemWithId = (itemData as any).id ? (itemData as InventoryItem) : { ...itemData, id: generateId() };
    await addOrUpdateItem(COLL_INVENTORY, itemWithId);
  };

  // --- REMINDERS LOGIC ---
  const remindersList = useMemo(() => {
    return lists.find(l => l.id === activeRemindersListId);
  }, [lists, activeRemindersListId]);

  const handleUpdateReminders = async (newReminders: Reminder[]) => {
    if (!remindersList) return;
    await updateItemFields(COLL_LISTS, remindersList.id, { reminders: newReminders });
  };
  
  // --- VERSIONING & COMPLETION ---
  // --- COMPUTE VERSION SNAPSHOT DIFF HELPER ---
  const computeVersionSnapshotDiff = (
    currentZones: ListZone[],
    previousSnapshot?: ListZone[],
    isBump: boolean = true,
    newVersion: string = '1.0',
    nowIso: string = new Date().toISOString()
  ): { updatedZones: ListZone[]; newDeletedItems: any[] } => {
    const newDeletedItems: any[] = [...(activeList?.deletedItems || [])];

    const buildVersionHistory = (
      oldHistory: { version: string; name: string; quantity: number; wasChecked?: boolean; updatedAt?: string }[] | undefined,
      prevEntry: { version: string; name: string; quantity: number; wasChecked: boolean; updatedAt: string },
      newEntry: { version: string; name: string; quantity: number; wasChecked: boolean; updatedAt: string }
    ) => {
      const base = (oldHistory || []).map(h => {
        if (h.version.toLowerCase() === prevEntry.version.toLowerCase()) {
          return {
            ...h,
            wasChecked: prevEntry.wasChecked,
            updatedAt: h.updatedAt || prevEntry.updatedAt
          };
        }
        return h;
      });
      const hasPrev = base.some(h => h.version.toLowerCase() === prevEntry.version.toLowerCase());
      const withPrev = hasPrev ? base : [...base, prevEntry];
      const hasNew = withPrev.some(h => h.version.toLowerCase() === newEntry.version.toLowerCase());
      return hasNew
        ? withPrev.map(h => h.version.toLowerCase() === newEntry.version.toLowerCase() ? newEntry : h)
        : [...withPrev, newEntry];
    };

    const syncHistoryCheckState = (
      existingChangeLog: WarehouseState['changeLog'] | undefined,
      isChecked: boolean
    ): WarehouseState['changeLog'] | undefined => {
      if (!existingChangeLog) return undefined;
      if (!existingChangeLog.history || existingChangeLog.history.length === 0) {
        return existingChangeLog;
      }
      const updatedHistory = existingChangeLog.history.map((h, i, arr) =>
        i === arr.length - 1 ? { ...h, wasChecked: isChecked } : h
      );
      return {
        ...existingChangeLog,
        history: updatedHistory
      };
    };

    // 1. Identify deleted items from previous snapshot
    if (previousSnapshot && previousSnapshot.length > 0 && isBump) {
      previousSnapshot.forEach(prevZone => {
        prevZone.sections.forEach(prevSection => {
          prevSection.components.forEach(prevComp => {
            const findInCurrent = (comp: ListComponent): boolean => {
              for (const z of currentZones) {
                for (const s of z.sections) {
                  for (const c of s.components) {
                    if (c.uniqueId === comp.uniqueId) return true;
                    if (c.type === 'template' && c.templateContents) {
                      if (c.templateContents.some(tc => tc.uniqueId === comp.uniqueId)) return true;
                    }
                  }
                }
              }
              return false;
            };

            if (prevComp.type === 'template' && prevComp.templateContents) {
              prevComp.templateContents.forEach(tc => {
                if (!findInCurrent(tc) && !newDeletedItems.some(d => d.originalComponent.uniqueId === tc.uniqueId)) {
                  newDeletedItems.push({
                    originalComponent: tc,
                    zoneName: prevZone.name,
                    sectionName: prevSection.name,
                    deletedAt: nowIso
                  });
                }
              });
            } else {
              if (!findInCurrent(prevComp) && !newDeletedItems.some(d => d.originalComponent.uniqueId === prevComp.uniqueId)) {
                newDeletedItems.push({
                  originalComponent: prevComp,
                  zoneName: prevZone.name,
                  sectionName: prevSection.name,
                  deletedAt: nowIso
                });
              }
            }
          });
        });
      });
    }

    // 2. Helper to process and compare a single component
    const processComponentDiff = (comp: ListComponent): ListComponent => {
      let prevComp: ListComponent | undefined;
      if (previousSnapshot && previousSnapshot.length > 0) {
        for (const pz of previousSnapshot) {
          for (const ps of pz.sections) {
            for (const pc of ps.components) {
              if (pc.uniqueId === comp.uniqueId) {
                prevComp = pc;
                break;
              }
              if (pc.type === 'template' && pc.templateContents) {
                const innerMatch = pc.templateContents.find(tc => tc.uniqueId === comp.uniqueId);
                if (innerMatch) {
                  prevComp = innerMatch;
                  break;
                }
              }
            }
            if (prevComp) break;
          }
          if (prevComp) break;
        }
      }

      // Handle template component container
      if (comp.type === 'template' && comp.templateContents) {
        const updatedTemplateContents = comp.templateContents.map(tc => processComponentDiff(tc));
        return {
          ...comp,
          templateContents: updatedTemplateContents
        };
      }

      // If there was a previous snapshot and this is an actual version bump
      if (isBump && previousSnapshot && previousSnapshot.length > 0) {
        const cleanPrevVer = (activeList?.version || '1.0').toString().replace(/^[vV]+/, '');
        const prevVerLabel = `v${cleanPrevVer}`;
        const cleanNewVer = newVersion.toString().replace(/^[vV]+/, '');
        const newVerLabel = `v${cleanNewVer}`;
        const listPrevTimestamp = activeList?.completedAt || activeList?.creationDate || nowIso;

        // Case 3: Brand new item added in this updated version (prevComp not found)
        if (!prevComp) {
          const resetContents = comp.contents?.map(content => {
            const subTotalQty = content.quantity * comp.quantity;
            return {
              ...content,
              warehouseState: {
                ...content.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                inDistinta: false,
                loaded: false,
                changeLog: {
                  previousQuantity: 0,
                  previousVersion: prevVerLabel,
                  wasChecked: false,
                  history: [
                    {
                      version: prevVerLabel,
                      name: content.name,
                      quantity: 0,
                      wasChecked: false,
                      updatedAt: listPrevTimestamp
                    },
                    {
                      version: newVerLabel,
                      name: content.name,
                      quantity: subTotalQty,
                      wasChecked: false,
                      updatedAt: nowIso
                    }
                  ],
                  changedAt: nowIso
                }
              }
            };
          });

          return {
            ...comp,
            contents: resetContents,
            warehouseState: {
              ...comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
              inDistinta: false,
              loaded: false,
              changeLog: {
                previousQuantity: 0,
                previousVersion: prevVerLabel,
                wasChecked: false,
                history: [
                  {
                    version: prevVerLabel,
                    name: comp.name,
                    quantity: 0,
                    wasChecked: false,
                    updatedAt: listPrevTimestamp
                  },
                  {
                    version: newVerLabel,
                    name: comp.name,
                    quantity: comp.quantity,
                    wasChecked: false,
                    updatedAt: nowIso
                  }
                ],
                changedAt: nowIso
              }
            }
          };
        }

        // Case 1: Item was replaced by another material (different referenceId, name, or type)
        // Note: We compare directly against prevComp to avoid re-triggering from old changeLog.previousName!
        const isReplaced = Boolean(
          prevComp.referenceId !== comp.referenceId ||
          prevComp.name !== comp.name ||
          prevComp.type !== comp.type
        );

        // Case 2: Existing item with modified quantity
        const isQuantityModified = Boolean(prevComp.quantity !== comp.quantity);

        const prevCompTimestamp = prevComp.warehouseState?.changeLog?.changedAt || listPrevTimestamp;
        // Preserve wasChecked status checking live state first, fallback to snapshot
        const wasCompChecked = Boolean(
          comp.warehouseState?.loaded || comp.warehouseState?.inDistinta ||
          prevComp.warehouseState?.loaded || prevComp.warehouseState?.inDistinta
        );

        // Process sub-items/accessories for kit or items with contents
        let anySubChanged = false;
        const processedContents = comp.contents?.map((content, idx) => {
          const prevSub = prevComp.contents?.find(ps => (content.itemId && ps.itemId && ps.itemId === content.itemId) || ps.name === content.name)
            || prevComp.contents?.[idx];
          const prevSubTotalQty = prevSub ? prevSub.quantity * prevComp.quantity : 0;
          const currentSubTotalQty = content.quantity * comp.quantity;
          const prevSubName = (prevSub && prevSub.name !== content.name) ? prevSub.name : undefined;
          const wasSubChecked = Boolean(
            content.warehouseState?.loaded || content.warehouseState?.inDistinta ||
            prevSub?.warehouseState?.loaded || prevSub?.warehouseState?.inDistinta
          );

          const isSubReplaced = !prevSub || prevSub.itemId !== content.itemId || prevSub.name !== content.name;
          const isSubQtyChanged = prevSub ? prevSubTotalQty !== currentSubTotalQty : true;
          const subHasChanged = isReplaced || isQuantityModified || isSubReplaced || isSubQtyChanged;

          if (subHasChanged) {
            anySubChanged = true;
            const oldSubHistory = prevSub?.warehouseState?.changeLog?.history || content.warehouseState?.changeLog?.history;
            const prevSubTimestamp = prevSub?.warehouseState?.changeLog?.changedAt || prevCompTimestamp;
            const newSubHistory = buildVersionHistory(
              oldSubHistory,
              {
                version: prevVerLabel,
                name: prevSub ? prevSub.name : content.name,
                quantity: prevSubTotalQty,
                wasChecked: wasSubChecked,
                updatedAt: prevSubTimestamp
              },
              {
                version: newVerLabel,
                name: content.name,
                quantity: currentSubTotalQty,
                wasChecked: false,
                updatedAt: nowIso
              }
            );

            return {
              ...content,
              warehouseState: {
                ...content.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                inDistinta: false,
                loaded: false,
                changeLog: {
                  previousQuantity: prevSubTotalQty,
                  previousName: prevSubName || (isReplaced ? (prevSub ? prevSub.name : undefined) : undefined),
                  previousVersion: prevVerLabel,
                  wasChecked: wasSubChecked,
                  history: newSubHistory,
                  changedAt: nowIso
                }
              }
            };
          } else {
            // UNCHANGED ACCESSORY: preserve checkmarks, notes, AND prior version history if it was modified in an earlier version
            const baseSubWs = content.warehouseState || prevSub?.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
            const priorSubChangeLog = syncHistoryCheckState(
              prevSub?.warehouseState?.changeLog || content.warehouseState?.changeLog,
              wasSubChecked
            );
            const { changeLog: _subOldChangeLog, ...cleanSubWs } = baseSubWs;
            return {
              ...content,
              warehouseState: priorSubChangeLog
                ? { ...cleanSubWs, changeLog: priorSubChangeLog }
                : (cleanSubWs as any)
            };
          }
        });

        // If the item or its quantity or any of its contents changed:
        if (isReplaced || isQuantityModified || anySubChanged) {
          const oldCompHistory = prevComp.warehouseState?.changeLog?.history || comp.warehouseState?.changeLog?.history;
          const resetParentChecks = isReplaced || isQuantityModified;
          const newCompHistory = buildVersionHistory(
            oldCompHistory,
            {
              version: prevVerLabel,
              name: prevComp.name,
              quantity: prevComp.quantity,
              wasChecked: wasCompChecked,
              updatedAt: prevCompTimestamp
            },
            {
              version: newVerLabel,
              name: comp.name,
              quantity: comp.quantity,
              wasChecked: resetParentChecks ? false : wasCompChecked,
              updatedAt: nowIso
            }
          );

          const previousName = isReplaced ? prevComp.name : undefined;

          return {
            ...comp,
            contents: processedContents,
            warehouseState: {
              ...comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
              inDistinta: resetParentChecks ? false : (comp.warehouseState?.inDistinta || false),
              loaded: resetParentChecks ? false : (comp.warehouseState?.loaded || false),
              changeLog: { 
                previousQuantity: prevComp.quantity, 
                previousName,
                previousVersion: prevVerLabel,
                wasChecked: wasCompChecked,
                history: newCompHistory,
                changedAt: nowIso 
              }
            }
          };
        }

        // Case 4: Unchanged item in this version bump
        // Preserve current warehouse checkmarks, notes, AND any prior version changeLog so history is retained across v1.1 -> v1.2!
        const baseCompWs = comp.warehouseState || prevComp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
        const priorCompChangeLog = syncHistoryCheckState(
          prevComp.warehouseState?.changeLog || comp.warehouseState?.changeLog,
          wasCompChecked
        );
        const { changeLog: _oldChangeLog, ...cleanWs } = baseCompWs;
        const cleanContents = comp.contents?.map((content, idx) => {
          const prevSub = prevComp.contents?.find(ps => ps.itemId === content.itemId) || prevComp.contents?.[idx];
          const wasSubChecked = Boolean(
            content.warehouseState?.loaded || content.warehouseState?.inDistinta ||
            prevSub?.warehouseState?.loaded || prevSub?.warehouseState?.inDistinta
          );
          const baseSubWs = content.warehouseState || prevSub?.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
          const priorSubChangeLog = syncHistoryCheckState(
            prevSub?.warehouseState?.changeLog || content.warehouseState?.changeLog,
            wasSubChecked
          );
          const { changeLog: _subOldChangeLog, ...cleanSubWs } = baseSubWs;
          return {
            ...content,
            warehouseState: priorSubChangeLog
              ? { ...cleanSubWs, changeLog: priorSubChangeLog }
              : (cleanSubWs as any)
          };
        });

        return {
          ...comp,
          contents: cleanContents || comp.contents,
          warehouseState: priorCompChangeLog
            ? { ...cleanWs, changeLog: priorCompChangeLog }
            : (cleanWs as any)
        };
      }

      return comp;
    };

    const updatedZones = currentZones.map(zone => ({
      ...zone,
      sections: zone.sections.map(section => ({
        ...section,
        components: section.components.map(processComponentDiff)
      }))
    }));

    return { updatedZones, newDeletedItems };
  };

  const handleCompleteList = async (isUpdate: boolean = false) => {
    if (!activeList || !activeList.zones) return;
    if (isUpdate && !hasUnsavedVersionChanges) return;
    
    let newVersion = '1.0';
    if (activeList.version) {
        const cleanVer = activeList.version.toString().replace(/^[vV]+/, '');
        const parts = cleanVer.split('.');
        const major = parseInt(parts[0], 10) || 0;
        const minor = parseInt(parts[1] || '0', 10);

        if (isUpdate) {
            newVersion = `${major >= 1 ? major : 1}.${minor + 1}`;
        } else {
            if (major >= 1) newVersion = cleanVer;
            else newVersion = '1.0';
        }
    }

    const nowIso = new Date().toISOString();

    // Merge live warehouse states from remote rawActiveList into currentZones
    // so no technician checkmarks that arrived from Firestore are missed
    const remoteZones = rawActiveList?.zones;
    let baseZones = designerZones;
    if (remoteZones && remoteZones.length > 0) {
      const remoteMap = new Map<string, { ws?: WarehouseState; contents?: any[] }>();
      remoteZones.forEach(rz => rz.sections.forEach(rs => rs.components.forEach(rc => {
        remoteMap.set(rc.uniqueId, { ws: rc.warehouseState, contents: rc.contents });
      })));

      baseZones = designerZones.map(z => ({
        ...z,
        sections: z.sections.map(s => ({
          ...s,
          components: s.components.map(c => {
            const rem = remoteMap.get(c.uniqueId);
            if (!rem) return c;

            const remWs = rem.ws;
            const currentWs = c.warehouseState;
            const mergedWs = {
              ...currentWs,
              loaded: remWs?.loaded || currentWs?.loaded || false,
              inDistinta: remWs?.inDistinta || currentWs?.inDistinta || false,
              returned: remWs?.returned || currentWs?.returned || false,
              isBroken: remWs?.isBroken !== undefined ? remWs.isBroken : currentWs?.isBroken,
              warehouseNote: remWs?.warehouseNote || currentWs?.warehouseNote || ''
            };

            let mergedContents = c.contents;
            if (c.contents && rem.contents) {
              mergedContents = c.contents.map((sub, idx) => {
                const remSub = rem.contents?.find((rs: any) => (sub.itemId && rs.itemId && rs.itemId === sub.itemId) || rs.name === sub.name) || rem.contents?.[idx];
                if (!remSub?.warehouseState) return sub;
                return {
                  ...sub,
                  warehouseState: {
                    ...sub.warehouseState,
                    loaded: remSub.warehouseState.loaded || sub.warehouseState?.loaded || false,
                    inDistinta: remSub.warehouseState.inDistinta || sub.warehouseState?.inDistinta || false,
                    returned: remSub.warehouseState.returned || sub.warehouseState?.returned || false,
                    isBroken: remSub.warehouseState.isBroken !== undefined ? remSub.warehouseState.isBroken : sub.warehouseState?.isBroken,
                    warehouseNote: remSub.warehouseState.warehouseNote || sub.warehouseState?.warehouseNote || ''
                  }
                };
              });
            }

            return {
              ...c,
              warehouseState: mergedWs,
              contents: mergedContents
            };
          })
        }))
      }));
    }

    const { updatedZones, newDeletedItems } = computeVersionSnapshotDiff(
      baseZones,
      activeList.snapshot,
      isUpdate,
      newVersion,
      nowIso
    );

    setShowUpdateReminderBanner(false);

    const mergedWithWarehouse = mergeDesignerZonesWithWarehouseReplacements(updatedZones, rawActiveList?.zones);

    await updateActiveList({
        version: newVersion,
        snapshot: updatedZones,
        zones: mergedWithWarehouse,
        deletedItems: newDeletedItems,
        completedAt: nowIso,
        isCompleted: true,
        isDraftVisible: false
    }, true);
    
    setFeedbackModal({ 
        isOpen: true, 
        title: isUpdate ? 'Versione Aggiornata' : 'Operazione Completata', 
        message: isUpdate 
            ? `Lista aggiornata alla versione v${newVersion}!`
            : `Lista completata con successo! Versione: ${newVersion}`,
        type: 'success'
    });
  };

  const handleUndoCompletion = async () => {
    if (!activeList) return;
    
    setGenericConfirm({
        isOpen: true,
        title: 'Torna a Bozza',
        message: 'Vuoi riportare questa lista in BOZZA? Il Magazzino non la vedrà più finché non la ricompleterai.',
        confirmText: 'Riporta in Bozza',
        variant: 'primary',
        onConfirm: async () => {
            await updateItemFields(COLL_LISTS, activeList.id, {
                isCompleted: false,
                isDraftVisible: false
            });
            setGenericConfirm(null);
            setFeedbackModal({ 
                isOpen: true, 
                title: 'Stato Aggiornato', 
                message: 'Lista riportata in Bozza.',
                type: 'info'
            });
        }
    });
  };

  const handleShowDraftInWarehouse = () => {
    if (!activeList) return;

    setGenericConfirm({
        isOpen: true,
        title: 'Rendi Visibile Bozza',
        message: 'Confermi di voler rendere visibile questa BOZZA di materiale in Preparazione Eventi (Magazzino)? Il magazzino potrà esclusivamente visualizzarla in sola lettura senza possibilità di modifica o spunta.',
        confirmText: 'Conferma Bozza',
        variant: 'primary',
        onConfirm: async () => {
            let newVersion = activeList.version || '0.1';
            if (activeList.version) {
                const cleanVer = activeList.version.toString().replace(/^[vV]+/, '');
                const parts = cleanVer.split('.');
                const minor = parseInt(parts[1] || '0', 10);
                newVersion = `0.${minor + 1}`;
            }

            const { updatedZones, newDeletedItems } = computeVersionSnapshotDiff(
              activeList.zones,
              activeList.snapshot,
              true
            );

            await updateActiveList({
                isDraftVisible: true,
                version: newVersion,
                snapshot: updatedZones,
                zones: updatedZones,
                deletedItems: newDeletedItems
            });
            
            setFeedbackModal({ 
                isOpen: true, 
                title: 'Bozza Inviata', 
                message: `Bozza resa visibile in Preparazione Eventi! (v${newVersion})`,
                type: 'success'
            });
        }
    });
  };

  const formatBuilderHistoryDateTime = (isoStr?: string) => {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const renderBuilderHistoryBadge = (
    tooltipKey: string,
    changeLog?: WarehouseState['changeLog'],
    materialName?: string,
    currentQty?: number,
    isCheckedNow?: boolean,
    pendingChange?: { isPending: boolean; prevName?: string; prevQuantity?: number }
  ) => {
    const isPending = Boolean(pendingChange?.isPending);
    const hasHistoryData = Boolean(
      changeLog && (
        (changeLog.history && changeLog.history.length > 0) ||
        changeLog.previousQuantity !== undefined ||
        Boolean(changeLog.previousName)
      )
    );
    if (!isPending && (!hasHistoryData || !changeLog)) return null;

    const isTooltipOpen = activeHistoryTooltipId === tooltipKey;
    const prevVerDefault = (() => {
      if (!activeList?.version) return '1.0';
      const parts = activeList.version.split('.');
      const major = parseInt(parts[0]) || 1;
      const minor = parseInt(parts[1] || '0');
      return minor > 0 ? `${major}.${minor - 1}` : '1.0';
    })();

    const nextVerLabel = (() => {
      if (!activeList?.version) return 'v1.1';
      const parts = activeList.version.split('.');
      const major = parseInt(parts[0]) || 1;
      const minor = parseInt(parts[1] || '0');
      return `v${major >= 1 ? major : 1}.${minor + 1}`;
    })();

    return (
      <div className="relative inline-flex items-center shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (activeHistoryTooltipId === tooltipKey) {
              setActiveHistoryTooltipId(null);
              setHistoryTooltipAnchor(null);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              setHistoryTooltipAnchor(rect);
              setActiveHistoryTooltipId(tooltipKey);
            }
          }}
          className={`p-1 rounded-full border shadow-md flex items-center justify-center shrink-0 cursor-pointer transition-all hover:scale-110 ${
            isPending
              ? 'bg-amber-950/80 border-amber-500 text-amber-400 hover:bg-amber-900 animate-pulse shadow-amber-900/30'
              : 'bg-emerald-950/80 border-emerald-500 text-emerald-400 hover:bg-emerald-900 shadow-emerald-900/30'
          }`}
          title={
            isPending
              ? "Modifica in attesa di aggiornamento (non ancora inviata al magazzino) - Clicca per visualizzare"
              : "Storico modifiche versioni - Clicca per visualizzare"
          }
        >
          <AlertTriangle
            size={13}
            className={
              isPending
                ? "text-amber-400 fill-amber-500/20"
                : "text-emerald-400 fill-emerald-500/20"
            }
          />
        </button>

        {isTooltipOpen && historyTooltipAnchor && typeof document !== 'undefined' && createPortal(
          <>
            <div
              className="fixed inset-0 z-[190] bg-transparent cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                setActiveHistoryTooltipId(null);
                setHistoryTooltipAnchor(null);
              }}
            />
            {(() => {
              const tooltipWidth = Math.min(420, (typeof window !== 'undefined' ? window.innerWidth : 440) - 20);
              const margin = 10;
              const buttonCenterX = historyTooltipAnchor.left + historyTooltipAnchor.width / 2;

              let left = buttonCenterX - tooltipWidth / 2;
              if (left < margin) left = margin;
              if (left + tooltipWidth > window.innerWidth - margin) {
                left = window.innerWidth - margin - tooltipWidth;
              }

              const showBelow = historyTooltipAnchor.top < 200;
              const top = showBelow
                ? historyTooltipAnchor.bottom + 8
                : Math.max(margin, historyTooltipAnchor.top - 8);

              const historyRows: { version: string; name: string; quantity: number; wasChecked: boolean; updatedAt?: string; isDraft?: boolean }[] = [];
              const currVer = `V${(activeList?.version || '1.0').toString().replace(/^[vV]+/, '')}`;
              const rawPrevVer = (changeLog?.previousVersion || prevVerDefault).toString().replace(/^[vV]+/, '');
              const prevVer = `V${rawPrevVer}`;

              if (isPending) {
                // If there were historical versions before this snapshot
                if (changeLog?.history && changeLog.history.length > 0) {
                  changeLog.history.forEach((h) => {
                    const normVer = `V${(h.version || '').toString().replace(/^[vV]+/, '')}`;
                    if (normVer.toUpperCase() !== currVer.toUpperCase()) {
                      historyRows.push({
                        version: normVer,
                        name: h.name,
                        quantity: h.quantity,
                        wasChecked: Boolean(h.wasChecked),
                        updatedAt: h.updatedAt || changeLog?.changedAt || activeList?.creationDate
                      });
                    }
                  });
                }

                // Add the snapshot/current confirmed version row
                const snapshotQty = pendingChange?.prevQuantity !== undefined
                  ? pendingChange.prevQuantity
                  : (changeLog?.previousQuantity ?? 0);
                const snapshotName = pendingChange?.prevName || changeLog?.previousName || materialName || 'Materiale';

                historyRows.push({
                  version: currVer,
                  name: snapshotName,
                  quantity: snapshotQty,
                  wasChecked: Boolean(isCheckedNow ?? changeLog?.wasChecked),
                  updatedAt: activeList?.completedAt || activeList?.creationDate
                });

                // Add the pending draft row
                historyRows.push({
                  version: `${nextVerLabel.toUpperCase()} (Bozza)`,
                  name: materialName || 'Materiale',
                  quantity: currentQty ?? 0,
                  wasChecked: false,
                  updatedAt: undefined,
                  isDraft: true
                });
              } else if (changeLog) {
                if (changeLog.history && changeLog.history.length > 0) {
                  changeLog.history.forEach((h, idx) => {
                    const normVer = h.version.toUpperCase().startsWith('V') ? h.version.toUpperCase() : `V${h.version}`;
                    const isLastRow = idx === changeLog.history!.length - 1;
                    const isCurrentOrLastPostChange = normVer === currVer.toUpperCase() || (isLastRow && changeLog.history!.length >= 2 && Boolean(h.updatedAt));
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
                  if (changeLog.previousQuantity !== undefined || changeLog.previousName) {
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
                    updatedAt: changeLog.changedAt || activeList?.completedAt
                  });
                }
              }

              return (
                <div
                  className={`fixed z-[200] p-3 bg-slate-900 border-2 ${
                    isPending ? 'border-amber-500/90 shadow-amber-950/50' : 'border-emerald-500/90 shadow-emerald-950/50'
                  } rounded-xl shadow-2xl text-xs text-slate-200 pointer-events-auto animate-in zoom-in-95 duration-150 ${showBelow ? '' : '-translate-y-full'}`}
                  style={{ top: `${top}px`, left: `${left}px`, width: `${tooltipWidth}px` }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${isPending ? 'text-amber-400' : 'text-emerald-400'} text-xs uppercase tracking-wider`}>
                        {isPending ? 'Modifica non inviata' : 'Aggiornato'}
                      </span>
                      {isPending && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded font-bold uppercase">
                          In attesa
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveHistoryTooltipId(null);
                        setHistoryTooltipAnchor(null);
                      }}
                      className="text-slate-500 hover:text-white p-0.5 rounded transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {isPending && (
                    <div className="mb-2 p-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-start gap-1.5 leading-snug">
                      <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Modifica non ancora inviata al magazzino. Premi <strong>Aggiorna {nextVerLabel}</strong> per confermarla!
                      </span>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="py-1 pr-1.5">Ver.</th>
                          <th className="py-1 px-1.5">Data / Ora</th>
                          <th className="py-1 px-1.5">Materiale</th>
                          <th className="py-1 px-1.5 text-center">Q.tà</th>
                          <th className="py-1 pl-1.5 text-center">Spunta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {historyRows.map((row, idx) => (
                          <tr key={idx} className={row.isDraft ? 'text-amber-200 bg-amber-500/5' : 'text-slate-200'}>
                            <td className={`py-1.5 pr-1.5 font-mono font-bold whitespace-nowrap ${row.isDraft ? 'text-amber-400 font-extrabold' : 'text-amber-400'}`}>
                              {row.version}
                            </td>
                            <td className="py-1.5 px-1.5 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                              {row.updatedAt ? formatBuilderHistoryDateTime(row.updatedAt) : (
                                <span className="text-amber-400/90 font-sans font-bold text-[10px]">In attesa</span>
                              )}
                            </td>
                            <td className="py-1.5 px-1.5 font-medium text-white max-w-[130px] truncate" title={row.name}>
                              {row.name}
                            </td>
                            <td className="py-1.5 px-1.5 font-mono font-bold text-center whitespace-nowrap text-amber-300">
                              x{row.quantity}
                            </td>
                            <td className="py-1.5 pl-1.5 text-center">
                              <div className="inline-flex items-center justify-center">
                                {row.wasChecked ? (
                                  <CheckSquare size={14} className="text-emerald-400" />
                                ) : (
                                  <Square size={14} className="text-slate-600" />
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
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

  const handleUpdateDraftVersion = async () => {
    if (!activeList) return;
    
    const currentVersion = activeList.version || '0.1';
    const parts = currentVersion.split('.');
    const minor = parseInt(parts[1] || '0');
    const suggestedVersion = `0.${minor + 1}`;
    
    setDraftVersionInput(suggestedVersion);
    setIsVersionModalOpen(true);
  };

  const confirmVersionUpdate = async () => {
      if (!activeList) return;
      
      const newVersion = parseFloat(draftVersionInput);
      
      if (isNaN(newVersion)) {
          setVersionError("Inserire un numero di versione valido (es. 0.2)");
          return;
      }
      
      if (newVersion >= 1.0) {
          setVersionError("Le bozze devono avere una versione inferiore a 1.0. Per pubblicare la lista definitiva, usa il tasto 'Lista Completata'.");
          return;
      }
      
      await updateActiveList({
          version: draftVersionInput,
          snapshot: activeList.zones
      });
      
      setIsVersionModalOpen(false);
      setVersionError(null);
      setFeedbackModal({ 
          isOpen: true, 
          title: 'Versione Aggiornata', 
          message: `Bozza aggiornata alla versione ${draftVersionInput}`,
          type: 'success'
      });
  };

  const handleWithdrawDraft = async () => {
    if (!activeList) return;
    
    setGenericConfirm({
        isOpen: true,
        title: 'Ritira Bozza',
        message: 'Vuoi RITIRARE la bozza dal Magazzino? Non sarà più visibile finché non la re-invierai.',
        confirmText: 'Ritira Bozza',
        variant: 'primary',
        onConfirm: async () => {
            await updateActiveList({ isDraftVisible: false });
            setGenericConfirm(null);
            setFeedbackModal({ 
                isOpen: true, 
                title: 'Bozza Ritirata', 
                message: 'Bozza ritirata dal Magazzino.',
                type: 'info'
            });
        }
    });
   // --- EXPORT (Extracted to utils/export.ts) ---
  };


  // --- VIEW RENDER ---
  if (viewMode === 'list') {
      // (Render List Grid - same as before essentially)
      return (
      <div className="h-full flex flex-col p-4 sm:p-6 bg-slate-950 overflow-x-hidden">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Crea Eventi</h1>
        </div>
        <div className="flex flex-col xl:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-xl w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input placeholder="Cerca evento..." className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg outline-none focus:border-emerald-500" value={listFilter} onChange={(e) => setListFilter(e.target.value)} />
          </div>
          
          <div className="flex items-center gap-2 w-full xl:w-auto">
             <button onClick={() => setActiveListAction(p => p === 'duplicate' ? null : 'duplicate')} className={`p-3 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:flex-none gap-2 font-medium transition-colors whitespace-nowrap ${activeListAction === 'duplicate' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`} title="Copia"><ClipboardCopy size={18}/> <span className="hidden sm:inline">Copia</span></button>
             <button onClick={() => setActiveListAction(p => p === 'delete' ? null : 'delete')} className={`p-3 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:flex-none gap-2 font-medium transition-colors whitespace-nowrap ${activeListAction === 'delete' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`} title="Elimina"><Trash2 size={18}/> <span className="hidden sm:inline">Elimina</span></button>
             <button onClick={() => { handleCreateList(); setActiveListAction(null); }} className="bg-purple-600 hover:bg-purple-500 text-white p-3 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:w-auto gap-2 font-medium transition-colors xl:ml-auto" title="Nuovo Evento"><Plus size={20} /> <span className="hidden sm:inline">Nuovo Evento</span></button>
          </div>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto">
            {filteredLists.map(list => {
              const z = list.zones || (list.sections ? [{sections: list.sections}] : []);
              const totalItems = (z as any[]).reduce((acc: number, zone: any) => acc + (zone.sections?.reduce((sAcc:number, s:any) => sAcc + s.components.length, 0)||0), 0);
              return (
                <div key={list.id} 
                     onClick={(e) => { 
                         if (activeListAction === 'duplicate') { handleDuplicateList(list, e as any); setActiveListAction(null); } 
                         else if (activeListAction === 'delete') { setListToDeleteInfo({ id: list.id, name: list.eventName || (list as any).name || 'Senza Nome' }); setActiveListAction(null); } 
                         else { handleListSelect(list.id); } 
                     }} 
                     className={`bg-slate-800 border rounded-lg p-3 sm:p-4 cursor-pointer transition-all relative flex flex-col md:flex-row items-start md:items-center gap-2 sm:gap-4 ${activeListAction ? 'hover:border-emerald-500 hover:bg-slate-700 ring-4 ring-transparent hover:ring-emerald-500/20' : 'border-slate-700 hover:border-slate-500 group'}`}
                >
                  
                  {/* Event Main Info */}
                  <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex w-12 h-12 rounded bg-emerald-900/20 items-center justify-center text-emerald-500 shrink-0 font-bold text-xl">
                            {(list.eventName || (list as any).name || 'E').substring(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                             <div className="flex flex-nowrap items-center justify-between gap-2 overflow-hidden">
                                <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-emerald-400 transition-colors truncate min-w-0 flex-1">{list.eventName || (list as any).name || 'Senza Nome'}</h3>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setActiveRemindersListId(list.id); }}
                                  className={`p-1.5 rounded-full hover:bg-slate-700 transition-colors shrink-0 ${list.reminders?.some(r => !r.isCompleted) ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-300'}`}
                                  title="Note & Promemoria"
                                >
                                  <Lightbulb size={20} className={list.reminders?.some(r => !r.isCompleted) ? "fill-current" : ""} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setSummaryEvent(list); }}
                                  className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition-colors shrink-0"
                                  title="Dettagli e Schema Zone"
                                >
                                  <Info size={18} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); openEventModal(list, e); }}
                                  className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors shrink-0"
                                  title="Modifica Evento"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setListToShare(list); }}
                                  className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors shrink-0"
                                  title="Condividi Evento"
                                >
                                  <Share2 size={18} />
                                </button>
                                {list.version && <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono shrink-0">v{list.version}</span>}
                             </div>
                             <div className="hidden md:flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-1 text-sm text-slate-400 mt-1">
                                <div className="flex items-center gap-1 min-w-0"><MapPin size={14} className="shrink-0" /> <span className="truncate">{list.location || 'Nessuna location'}</span></div>
                                <div className="flex items-center gap-1 shrink-0"><Calendar size={14} /> <span>{list.eventDate ? new Date(list.eventDate).toLocaleDateString() : 'Nessuna data'}</span></div>
                             </div>
                        </div>
                      </div>
                  </div>

                  {/* Stats & Metadata - Hidden on Mobile */}
                  <div className="hidden md:flex items-center gap-6 text-sm text-slate-500 mt-2 md:mt-0 border-t md:border-t-0 border-slate-700/50 pt-2 md:pt-0 w-full md:w-auto justify-between md:justify-end">
                      <div className="flex flex-col">
                          <span className="text-xs uppercase font-bold tracking-wider text-slate-600">Elementi</span>
                          <span className="text-slate-300 font-medium text-lg">{totalItems}</span>
                      </div>
                      <div className="flex flex-col items-end">
                           <span className="text-xs uppercase font-bold tracking-wider text-slate-600">Creato il</span>
                           <span className="text-sm">{new Date(list.creationDate || Date.now()).toLocaleDateString()}</span>
                      </div>
                  </div>
                </div>
            )})
            }
        </div>
        <ConfirmationModal isOpen={!!listToDeleteInfo} onClose={() => setListToDeleteInfo(null)} onConfirm={confirmDeleteList} title="Elimina Evento" message={`Eliminare "${listToDeleteInfo?.name}"?`} />
        
        <ConfirmationModal 
            isOpen={!!listToDuplicate} 
            onClose={() => setListToDuplicate(null)} 
            onConfirm={confirmDuplicateList} 
            title="Duplica Evento" 
            message={`Vuoi creare una copia di "${listToDuplicate?.eventName}"? Verranno copiati tutti i materiali e le zone.`} 
            confirmText="Duplica"
            variant="primary"
        />
        
        {/* Event Details Modal (Rendered here too so it opens from list view) */}
        <EventFormModal 
            isOpen={isEventModalOpen} 
            onClose={() => setIsEventModalOpen(false)} 
            initialData={eventFormData}
            databases={effectiveDatabases}
            activeDatabaseId={activeDatabaseId}
            onSave={(data) => {
                setEventFormData(data);
                setTimeout(() => handleSaveEvent(data), 0);
            }}
        />

        {/* Mobile-only Checklist Drawer/Modal */}
        <Modal 
            isOpen={isMobileChecklistOpen} 
            onClose={() => setIsMobileChecklistOpen(false)} 
            title={`Checklist: ${activeList?.eventName}`}
            size="full"
        >
            <div className="h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar pb-32">
                    {activeList && (
                        <ChecklistView 
                            activeList={activeList}
                            checklist={masterChecklist}
                        />
                    )}
                </div>
                {/* Bottom Action Bar for easy closing */}
                <div className="p-4 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 flex justify-center sticky bottom-0 z-10">
                    <button 
                        onClick={() => setIsMobileChecklistOpen(false)}
                        className="w-full max-w-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-xl shadow-emerald-900/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <List size={20} />
                        Chiudi e Torna alla Lista
                    </button>
                </div>
            </div>
        </Modal>

        <RemindersModal 
            isOpen={!!activeRemindersListId}
            onClose={() => setActiveRemindersListId(null)}
            reminders={remindersList?.reminders || []}
            onUpdate={handleUpdateReminders}
            title={remindersList?.eventName || 'Note Evento'}
        />

        {/* SHARE EVENT MODAL (LIST VIEW) */}
        <ShareEventModal 
            isOpen={!!listToShare}
            onClose={() => setListToShare(null)}
            list={listToShare}
        />
      </div>
    );
  }

  // BUILDER VIEW
  if (viewMode === 'edit' && !activeList) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 bg-slate-950 text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Caricamento evento in corso...</p>
        <button
          onClick={handleBackToList}
          className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"
        >
          Torna all'elenco eventi
        </button>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col p-0 sm:p-4 overflow-hidden transition-all duration-300 ${isPickerFilterModalOpen ? 'lg:mr-[400px]' : ''}`}>
      {/* MODALITÀ SOSTITUZIONE BANNER (Compact, non copre i bottoni del builder) */}
      {replacingComponentId && (
        <div className="shrink-0 z-40 bg-amber-900/95 border-b border-amber-500/60 px-3 py-1.5 sm:py-2 text-amber-100 flex items-center justify-between shadow-lg text-xs sm:text-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 font-bold min-w-0">
            <ArrowLeftRight className="shrink-0 text-amber-300 animate-pulse" size={16} />
            <span className="truncate">
              Sostituzione in corso: <span className="text-amber-200 underline font-semibold">{activeSection?.components?.find(c => c.uniqueId === replacingComponentId)?.name || 'Elemento selezionato'}</span>
            </span>
          </div>
          <button 
            onClick={() => setReplacingComponentId(null)} 
            className="ml-2 px-2.5 py-1 bg-amber-950/80 hover:bg-amber-800 text-amber-200 border border-amber-600/60 rounded-md text-xs font-bold shrink-0 transition-colors shadow-sm"
          >
            Annulla
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-0 bg-transparent sm:bg-slate-900 border-0 sm:border sm:border-slate-800 rounded-none sm:rounded-xl overflow-hidden shadow-none sm:shadow-2xl relative">
        
        {/* MOBILE BULK ACTIONS BAR (Appears above the list header on smartphone when items are selected or copied) */}
        {(selectedIds.size > 0 || clipboard.length > 0) && (
            <div className="md:hidden flex items-center justify-between gap-1 px-2 py-1.5 bg-slate-900 border-b border-slate-700/80 shadow-md animate-in slide-in-from-top-2 shrink-0 z-30">
                <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[11px] font-bold text-blue-400 bg-blue-950/80 border border-blue-800/60 px-1.5 py-0.5 rounded shrink-0">
                        {selectedIds.size} sel.
                    </span>
                    <button 
                        onClick={selectAllInSection} 
                        className="text-[10px] font-bold uppercase text-slate-400 hover:text-white px-1 py-0.5"
                    >
                        Tutti
                    </button>
                    <button 
                        onClick={deselectAll} 
                        className="text-[10px] font-bold uppercase text-slate-400 hover:text-white px-1 py-0.5"
                    >
                        Nessuno
                    </button>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {selectedIds.size > 0 && (
                        <>
                            {selectedIds.size === 1 && (
                                <button 
                                    onClick={() => setReplacingComponentId(Array.from(selectedIds)[0])} 
                                    className={`p-1.5 rounded-lg border transition-colors ${replacingComponentId === Array.from(selectedIds)[0] ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700'}`} 
                                    title="Sostituisci"
                                >
                                    <ArrowLeftRight size={15} />
                                </button>
                            )}
                            <button 
                                onClick={handleCut} 
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition-colors" 
                                title="Taglia"
                            >
                                <Scissors size={15} />
                            </button>
                            <button 
                                onClick={handleCopy} 
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg border border-slate-700 transition-colors" 
                                title="Copia"
                            >
                                <ClipboardCopy size={15} />
                            </button>
                            <button 
                                onClick={handleBulkDelete} 
                                className="p-1.5 bg-slate-800 hover:bg-rose-900/40 text-rose-400 rounded-lg border border-slate-700 transition-colors" 
                                title="Elimina"
                            >
                                <Trash2 size={15} />
                            </button>
                        </>
                    )}
                    {clipboard.length > 0 && (
                        <div className="flex items-center gap-0.5 ml-1 bg-slate-800 rounded-lg border border-slate-700 p-0.5">
                            <button 
                                onClick={handlePaste} 
                                className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${clipboardPasted ? 'bg-orange-600' : 'bg-emerald-600'} text-white transition-colors`}
                                title="Incolla"
                            >
                                <Clipboard size={13} /> Incolla ({clipboard.length})
                            </button>
                            <button 
                                onClick={() => { setClipboard([]); setClipboardPasted(false); }} 
                                className="p-1 text-slate-400 hover:text-rose-400" 
                                title="Annulla appunto"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* TOP HEADER (Seamless on mobile phones without dark box/border, styled container from md up) */}
        <div className="p-1 pt-[calc(0.25rem+env(safe-area-inset-top))] sm:p-3 sm:pt-3 bg-transparent md:bg-slate-950 md:border-b md:border-slate-800 flex flex-col gap-1.5 sm:gap-3">
          <div className="flex items-center justify-between gap-1.5 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                <button 
                  onClick={handleBackToList} 
                  className="p-1.5 xl:px-3 xl:py-2 bg-slate-800 hover:bg-slate-700 text-emerald-500 rounded-lg border border-slate-700 shadow-lg shrink-0 flex items-center gap-2"
                  title="Crea Eventi"
                >
                  <List size={18} />
                  <span className="hidden xl:inline text-xs font-bold uppercase tracking-wider text-white">Crea Eventi</span>
                </button>

                {/* Mobile-only Checklist Shortcut */}
                <button 
                onClick={() => setIsMobileChecklistOpen(true)} 
                className="md:hidden p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg border border-slate-700 shadow-lg shrink-0 flex items-center gap-1"
                title="Checklist"
                >
                <ClipboardList size={18} />
                <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight text-white">Check</span>
                {activeList && activeList.checklistCheckedItems && activeList.checklistCheckedItems.length > 0 && (
                    <span className="bg-blue-600 text-white px-1 rounded-full text-xs min-w-[14px] text-center font-bold">
                        {activeList.checklistCheckedItems.length}
                    </span>
                )}
                </button>

                {/* Desktop/Tablet Checklist Toggle */}
                <button 
                onClick={() => setIsDesktopChecklistOpen(!isDesktopChecklistOpen)} 
                className={`hidden md:flex p-1.5 xl:px-3 xl:py-2 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-lg shrink-0 items-center gap-1.5 transition-colors ${isDesktopChecklistOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                title="Checklist"
                >
                <ClipboardList size={18} className={isDesktopChecklistOpen ? '' : 'text-blue-400'} />
                <span className="hidden xl:inline text-xs font-bold uppercase tracking-wider text-white">Checklist</span>
                {activeList && activeList.checklistCheckedItems && activeList.checklistCheckedItems.length > 0 && (
                    <span className="bg-white/20 text-white px-1.5 rounded-full text-xs min-w-[16px] text-center font-bold">
                        {activeList.checklistCheckedItems.length}
                    </span>
                )}
                </button>
                
                {/* Reminders/Notes Shortcut */}
                <button 
                  onClick={() => setActiveRemindersListId(activeList?.id || null)} 
                  className={`p-1.5 xl:px-2.5 xl:py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-lg shrink-0 flex items-center justify-center transition-colors ${activeList?.reminders?.some(r => !r.isCompleted) ? 'text-yellow-400' : 'text-slate-400 hover:text-white'}`}
                  title="Note & Promemoria"
                  aria-label="Note & Promemoria"
                >
                  <Lightbulb size={18} className={activeList?.reminders?.some(r => !r.isCompleted) ? "fill-current" : ""} />
                </button>

                {/* Event Details & Zones Schema Info Button */}
                <button 
                  onClick={() => setSummaryEvent(activeList)} 
                  className="p-1.5 xl:px-2.5 xl:py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-lg shrink-0 flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-colors"
                  title="Dettagli Evento e Schema Zone"
                  aria-label="Dettagli Evento e Schema Zone"
                >
                  <Info size={18} />
                </button>
                
                <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-white font-bold text-xs sm:text-base lg:text-lg truncate" title={activeList?.eventName}>{activeList?.eventName}</span>
                        {activeList?.version && <span className="text-xs bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded font-bold shrink-0">v{activeList.version}</span>}
                        {!isOnline && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse shrink-0" title="Sei offline: tutte le modifiche sono protette e salvate in memoria sul dispositivo.">
                                <WifiOff size={11} />
                                <span className="hidden md:inline">Offline (Salvataggio locale)</span>
                                <span className="md:hidden">Offline</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* HEADER ACTIONS (Compact row) */}
            <div className="flex items-center gap-0.5 sm:gap-1.5 xl:gap-2 shrink-0">

                {/* SHARE BUTTON */}
                <button 
                    onClick={() => setListToShare(activeList || null)} 
                    title="Condividi Evento" 
                    className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-3 xl:py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-800/80 bg-slate-950/20 shadow-sm"
                >
                    <Share2 size={18}/> 
                    <span className="hidden xl:inline text-xs font-bold uppercase tracking-tight">Condividi</span>
                </button>

                {/* SINGLE EXPORT BUTTON */}
                <button 
                    onClick={handleOpenExportModal} 
                    title="Export Lista" 
                    className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-3 xl:py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-800/80 bg-slate-950/20 shadow-sm"
                >
                    <Share size={18}/> 
                    <span className="hidden xl:inline text-xs font-bold uppercase tracking-tight">Export</span>
                </button>

                <div className="w-[1px] h-6 bg-slate-800 mx-1 hidden sm:block"></div>

                {/* COMPLETION/DRAFT ACTIONS */}
                <div className="flex items-center gap-1 sm:gap-2">
                    {activeList?.isCompleted ? (
                        <div className="flex gap-1 sm:gap-2">
                            <button
                                onClick={() => handleCompleteList(true)}
                                disabled={!hasUnsavedVersionChanges}
                                className={`flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-4 xl:py-2 rounded-lg border transition-all font-bold ${
                                    hasUnsavedVersionChanges
                                        ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-emerald-500/40 shadow-sm cursor-pointer'
                                        : 'bg-slate-900/50 text-slate-600 border-slate-800/80 opacity-50 cursor-not-allowed'
                                }`}
                                title={
                                    hasUnsavedVersionChanges
                                        ? `Aggiorna Versione (v${activeList.version ? `${activeList.version.split('.')[0]}.${parseInt(activeList.version.split('.')[1] || '0') + 1}` : '1.1'})`
                                        : 'Nessuna modifica da aggiornare rispetto alla versione attuale'
                                }
                            >
                                <Save size={18} /> <span className="hidden xl:inline text-xs uppercase tracking-tight">Aggiorna v{
                                    activeList.version ? `${activeList.version.split('.')[0]}.${parseInt(activeList.version.split('.')[1] || '0') + 1}` : '1.1'
                                }</span>
                            </button>
                            <button onClick={handleUndoCompletion} className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-4 xl:py-2 bg-slate-800 text-amber-500 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors" title="Torna a Bozza">
                                <Undo2 size={18} /> <span className="hidden xl:inline text-xs font-bold uppercase tracking-tight">Bozza</span>
                            </button>
                        </div>
                    ) : activeList?.isDraftVisible ? (
                        <div className="flex gap-1 sm:gap-2">
                            <button onClick={handleWithdrawDraft} className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-4 xl:py-2 bg-rose-950/20 text-rose-500 hover:bg-rose-950/40 rounded-lg border border-rose-900/30 transition-colors" title="Ritira"><X size={18} /> <span className="hidden xl:inline text-xs font-bold uppercase tracking-tight">Ritira</span></button>
                            <button onClick={handleUpdateDraftVersion} className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-4 xl:py-2 bg-amber-900/20 text-amber-500 hover:bg-amber-900/40 rounded-lg border border-amber-900/30 transition-colors" title="Aggiorna Bozza"><Save size={18} /> <span className="hidden xl:inline text-xs font-bold uppercase tracking-tight">Salva</span></button>
                            <button onClick={() => handleCompleteList()} className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-4 xl:py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-lg shadow-lg font-bold transition-colors" title="Completa"><CheckCircle size={18} /> <span className="hidden xl:inline text-xs uppercase tracking-tight">Completa</span></button>
                        </div>
                    ) : (
                        <div className="flex gap-1 sm:gap-2">
                            <button onClick={handleShowDraftInWarehouse} className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-4 xl:py-2 bg-slate-800 text-amber-400 hover:text-amber-300 rounded-lg border border-slate-700 hover:border-amber-500/50 transition-colors" title="Rendi visibile bozza in Preparazione Eventi"><Share size={18} /> <span className="hidden xl:inline text-xs font-bold uppercase tracking-tight">BOZZA</span></button>
                            <button onClick={() => handleCompleteList()} className="flex items-center gap-1.5 p-1.5 sm:p-2 xl:px-4 xl:py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-lg shadow-lg font-bold transition-colors" title="Completa"><CheckCircle size={18} /> <span className="hidden xl:inline text-xs uppercase tracking-tight">Completa</span></button>
                        </div>
                    )}
                </div>
            </div>
          </div>

          {/* WAREHOUSE REPLACEMENT INFORMATIONAL NOTICE */}
          {hasWarehouseReplacements && !isWarehouseBannerDismissed && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-medium shadow-md animate-in slide-in-from-top-1 fade-in duration-200">
              <div className="flex items-center gap-2 min-w-0">
                <Info size={16} className="text-amber-400 shrink-0" />
                <span className="leading-snug">
                  <strong>Avviso Magazzino:</strong> Il personale di magazzino ha effettuato sostituzioni di materiale in <em>Preparazione Eventi</em>. I materiali originali di progetto restano invariati qui in <em>Crea Liste</em>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDismissedWarehouseBannerListId(activeList?.id || '')}
                className="p-1 text-amber-400 hover:text-white rounded hover:bg-amber-500/20 transition-colors shrink-0"
                title="Chiudi avviso"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* 10-SECOND UPDATE REMINDER BANNER */}
          {activeList?.isCompleted && showUpdateReminderBanner && hasUnsavedVersionChanges && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-medium shadow-md animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle size={15} className="text-amber-400 shrink-0 animate-bounce" />
                <span className="leading-snug">
                  Hai modificato la lista materiale. Ricordati di premere{' '}
                  <button
                    type="button"
                    onClick={() => handleCompleteList(true)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 font-bold underline decoration-emerald-400/60 cursor-pointer transition-colors"
                  >
                    Aggiorna v{activeList.version ? `${activeList.version.split('.')[0]}.${parseInt(activeList.version.split('.')[1] || '0') + 1}` : '1.1'}
                  </button>{' '}
                  dopo aver terminato le modifiche!
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowUpdateReminderBanner(false)}
                className="p-1 rounded-md text-amber-400 hover:text-white hover:bg-amber-500/20 transition-colors shrink-0"
                title="Chiudi avviso"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* MOBILE ZONE & SECTION SELECTOR */}
          <div className="md:hidden flex flex-col gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800/80 shadow-sm text-xs">
             {/* Row 1: Zona */}
             <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-950/70 border border-emerald-800/50 text-emerald-400 font-bold uppercase text-[10px] tracking-wider shrink-0">
                   <Box size={13} /> Zona
                </span>
                <select 
                   value={activeZoneId} 
                   onChange={(e) => setActiveZoneId(e.target.value)}
                   className="flex-1 bg-slate-900 text-emerald-300 font-bold rounded-lg border border-slate-700/80 px-2.5 py-1.5 text-xs outline-none min-w-0 truncate focus:border-emerald-500 shadow-inner"
                >
                   {zones.map(z => {
                       const label = highlightedItemName 
                           ? `${z.name} (${getZoneHighlightedQty(z)})` 
                           : z.name;
                       return <option key={z.id} value={z.id}>{label}</option>;
                   })}
                </select>
                {activeZone && (
                   <>
                      <button 
                         type="button"
                         onClick={() => setZoneForInfo(activeZone)} 
                         className={`p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/80 shrink-0 transition-colors active:scale-95 ${
                             activeZone.notes && activeZone.notes.trim()
                                 ? 'text-yellow-400 hover:text-yellow-300 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]'
                                 : 'text-white hover:text-slate-200'
                         }`}
                         title={activeZone.notes && activeZone.notes.trim() ? "Info Zona (Presente Nota)" : "Info Zona"}
                         aria-label="Info Zona"
                      >
                         <Info size={15} />
                      </button>
                      <button 
                         type="button"
                         onClick={() => setZoneForEdit(activeZone)} 
                         className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-emerald-400 border border-slate-700/80 shrink-0 transition-colors active:scale-95"
                         title="Modifica Zona"
                         aria-label="Modifica Zona"
                      >
                         <Edit2 size={15} />
                      </button>
                   </>
                )}
                <button 
                   onClick={() => openMgmtModal('zone', 'create')} 
                   className="p-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 rounded-lg text-emerald-400 border border-emerald-800/40 shrink-0 transition-colors active:scale-95"
                   title="Nuova Zona"
                   aria-label="Nuova Zona"
                >
                   <Plus size={15} />
                </button>
             </div>

             {/* Row 2: Settore */}
             <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-950/70 border border-blue-800/50 text-blue-400 font-bold uppercase text-[10px] tracking-wider shrink-0">
                   <AlignLeft size={13} /> Set.
                </span>
                <select 
                   value={activeSectionId} 
                   onChange={(e) => setActiveSectionId(e.target.value)}
                   className="flex-1 bg-slate-900 text-blue-300 font-bold rounded-lg border border-slate-700/80 px-2.5 py-1.5 text-xs outline-none min-w-0 truncate focus:border-blue-500 shadow-inner"
                >
                   {sections.map(s => {
                       const label = highlightedItemName 
                           ? `${s.name} (${getSectionHighlightedQty(s)})` 
                           : `${s.name} (${s.components.length})`;
                       return <option key={s.id} value={s.id}>{label}</option>;
                   })}
                </select>
                <button 
                   onClick={() => openMgmtModal('section', 'create')} 
                   className="p-1.5 bg-blue-900/30 hover:bg-blue-900/50 rounded-lg text-blue-400 border border-blue-800/40 shrink-0 transition-colors active:scale-95"
                   title="Nuovo Settore"
                   aria-label="Nuovo Settore"
                >
                   <Plus size={15} />
                </button>
             </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative">

            {/* DESKTOP CHECKLIST PANEL */}
            {isDesktopChecklistOpen && activeList && (
                <div className="hidden md:flex flex-col w-80 lg:w-96 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden relative shadow-2xl z-10 transition-all animate-in slide-in-from-left-8 duration-300">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shadow-sm">
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-wider text-sm">
                            <ClipboardList size={16} className="text-blue-500" /> Checklist
                        </h3>
                        <button onClick={() => setIsDesktopChecklistOpen(false)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                            <X size={16}/>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/50">
                        <ChecklistView activeList={activeList} checklist={masterChecklist} />
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        {/* --- ZONE TABS (Desktop Only) --- */}
        {activeList && zones.length > 0 && (
            <div className="hidden md:flex items-center gap-1 px-4 pt-1.5 border-b border-slate-800 bg-slate-950/50 overflow-x-auto">
                {zones.map(z => (
                    <div 
                        key={z.id}
                        draggable={true}
                        onDragStart={(e) => handleZoneDragStart(e, z.id)}
                        onDragOver={(e) => handleZoneDragOver(e, z.id)}
                        onDragLeave={handleZoneDragLeave}
                        onDragEnd={handleZoneDragEnd}
                        onDrop={(e) => handleZoneDrop(e, z.id)}
                        onClick={() => setActiveZoneId(z.id)}
                        className={`px-4 py-2 rounded-t-lg text-sm font-bold transition-colors cursor-pointer flex items-center gap-2 border-t border-x ${draggedZoneId === z.id ? 'opacity-30 scale-95 border-dashed border-slate-700' : ''} ${activeZoneId === z.id ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-950 text-slate-500 border-transparent hover:text-slate-300'} ${getZoneDragIndicatorClass(z.id)}`}
                    >
                        {z.name}
                        {highlightedItemName && (
                            <span className={`px-1.5 py-0.5 rounded-full text-xs transition-all duration-300 ${
                                getZoneHighlightedQty(z) > 0 
                                ? 'bg-blue-950 text-blue-400 border border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.3)] font-extrabold animate-pulse' 
                                : 'bg-slate-950 text-slate-600 border border-slate-900'
                            }`}>
                                {getZoneHighlightedQty(z)}
                            </span>
                        )}
                        {/* Info Button */}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setZoneForInfo(z); }}
                            className={`p-1 rounded transition-colors ${
                                z.notes && z.notes.trim()
                                    ? 'text-yellow-400 hover:text-yellow-300 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]'
                                    : 'text-white hover:text-slate-200'
                            }`}
                            title={z.notes && z.notes.trim() ? "Info Zona (Presente Nota)" : "Info Zona"}
                            aria-label="Info Zona"
                        >
                            <Info size={13} />
                        </button>

                        {/* Edit & Delete Buttons for active zone */}
                        {activeZoneId === z.id && (
                            <div className="flex items-center gap-1 ml-1 opacity-70 hover:opacity-100">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setZoneForEdit(z); }}
                                    className="p-1 text-slate-400 hover:text-emerald-400 rounded transition-colors"
                                    title="Modifica Zona"
                                    aria-label="Modifica Zona"
                                >
                                    <Edit2 size={13} />
                                </button>
                                {zones.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setZoneToDelete(z.id); }}
                                        className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                                        title="Elimina Zona"
                                        aria-label="Elimina Zona"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <button onClick={() => openMgmtModal('zone', 'create')} className="ml-2 p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-400"><Plus size={16} /></button>
            </div>
        )}



        {/* --- SECTION TABS (Inside Active Zone) (Desktop Only) --- */}
        {activeZone && (
        <div className="hidden md:flex items-center gap-2 px-4 py-2 border-b border-slate-700 bg-slate-900 overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSectionId(s.id)}
              draggable={true}
              onDragStart={(e) => handleSectionDragStart(e, s.id)}
              onDragOver={(e) => handleSectionDragOver(e, s.id)}
              onDragLeave={handleSectionDragLeave}
              onDragEnd={handleSectionDragEnd}
              onDrop={(e) => handleSectionDrop(e, s.id)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 group cursor-grab active:cursor-grabbing ${draggedSectionId === s.id ? 'opacity-30 scale-95 border-dashed border-slate-700' : ''} ${activeSectionId === s.id ? 'bg-slate-900 text-white border-t border-x border-slate-800' : 'bg-slate-950 text-slate-500 border-transparent hover:text-slate-300'} ${getDragIndicatorClass(s.id)}`}
            >
              {s.name}
              {highlightedItemName ? (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs transition-all duration-300 ${
                      getSectionHighlightedQty(s) > 0 
                      ? 'bg-blue-950 text-blue-400 border border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.3)] font-extrabold animate-pulse' 
                      : 'bg-slate-950 text-slate-600 border border-slate-900'
                  }`}>
                      {getSectionHighlightedQty(s)}
                  </span>
              ) : (
                  <span className="bg-slate-950 px-1.5 py-0.5 rounded-full text-xs text-slate-500">{s.components.length}</span>
              )}
              {activeSectionId === s.id && (
                  <div className="flex items-center gap-1 ml-1">
                      {sections.indexOf(s) > 0 && (
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleMoveSection(s.id, 'left'); }} 
                              className="text-slate-400 hover:text-blue-400 p-0.5 rounded transition-colors"
                              title="Sposta a sinistra"
                          >
                              <ChevronLeft size={12} />
                          </button>
                      )}
                      <Edit2 size={12} onClick={(e) => { e.stopPropagation(); openMgmtModal('section', 'rename', s.id, s.name); }} className="hover:text-emerald-400 cursor-pointer" />
                      <Trash2 size={12} onClick={(e) => { e.stopPropagation(); setSectionToDelete(s.id); }} className="hover:text-rose-500 cursor-pointer" />
                      {sections.indexOf(s) < sections.length - 1 && (
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleMoveSection(s.id, 'right'); }} 
                              className="text-slate-400 hover:text-blue-400 p-0.5 rounded transition-colors"
                              title="Sposta a destra"
                          >
                              <ChevronRight size={12} />
                          </button>
                      )}
                  </div>
              )}
            </button>
          ))}
          <button onClick={() => openMgmtModal('section', 'create')} className="p-2 text-emerald-500 hover:bg-emerald-900/30 rounded-lg hover:text-emerald-400 transition-colors"><Plus size={18} /></button>
        </div>
        )}

        {/* --- TOOLBAR / SEARCH --- */}
        {activeSection && (
            <div className="px-2 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center gap-1.5 sm:gap-2">
                {/* Search Input Row */}
                <div 
                    className="relative flex-1 min-w-0"
                    onMouseEnter={() => handlePickerEnter(true)}
                    onMouseLeave={() => handlePickerLeave(true)}
                >
                    <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input 
                        ref={pickerInputRef}
                        placeholder={`Cerca in ${activeSection.name}...`}
                        className="w-full bg-slate-950 border border-slate-700 text-white pl-8 sm:pl-9 pr-2 sm:pr-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm outline-none focus:border-emerald-500"
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        onFocus={() => handlePickerEnter(false)}
                        onBlur={() => handlePickerLeave(false)}
                    />
                    {/* PICKER DROPDOWN */}
                    {pickerSearch && isPickerHovered && (
                      <div className="fixed md:absolute inset-x-2 md:inset-x-auto md:left-0 md:right-0 top-auto md:top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 max-h-72 md:max-h-64 overflow-y-auto w-auto md:w-full min-w-0 md:min-w-[420px]">
                        
                        {/* Templates matches */}
                        {filteredPickerTemplates.length > 0 && (
                            <div className="px-4 py-1.5 bg-slate-800 text-xs font-bold text-emerald-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-700">
                                Template ({filteredPickerTemplates.length})
                            </div>
                        )}
                        {filteredPickerTemplates.map(template => {
                          const qtyInZone = activeZone?.sections.reduce((total, section) => 
                            total + section.components
                              .filter(c => c.type === 'template' && c.referenceId === template.id)
                              .reduce((subtotal, comp) => subtotal + comp.quantity, 0),
                            0
                          ) || 0;
                          
                          const avail = calculateAvailableQuantity(template.id, 'template', activeList?.truckLoadDate || activeList?.setupDate || activeList?.eventDate || '', activeList?.returnDate || activeList?.teardownDate || activeList?.endDate, activeListId, lists, inventory, kits);
                          const isOverbooked = avail.available <= 0;

                          return (
                          <div 
                            key={template.id} 
                            onClick={(e) => { e.preventDefault(); if (isOverbooked) { setOverbookedModal({ isOpen: true, item: template, type: 'template', avail: avail.available, total: avail.total }); } else { addToSection(template, 'template'); } }} 
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group cursor-pointer transition-colors"
                          >
                            <div className="flex-1 min-w-0 pr-2">
                                <div className="text-sm text-white flex items-center gap-2 truncate">
                                    <Blocks size={14} className="text-emerald-400 shrink-0" />
                                    <span className="truncate">{template.name}</span>
                                    {qtyInZone > 0 && (
                                        <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 rounded font-bold shrink-0">
                                            x{qtyInZone}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 pl-6 mt-0.5 truncate">
                                    {template.items.length} componenti base • <span className={isOverbooked ? 'text-rose-500 font-bold' : 'text-slate-400'}>Disponibili: {avail.available}</span> / {avail.total}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setHighlightedItemName(template.name);
                                  setPickerSearch('');
                                  setIsPickerHovered(false);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors"
                                title={`Cerca ed evidenzia "${template.name}" nella lista`}
                              >
                                <Search size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isOverbooked) {
                                    setOverbookedModal({ isOpen: true, item: template, type: 'template', avail: avail.available, total: avail.total });
                                  } else {
                                    addToSection(template, 'template');
                                  }
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${isOverbooked ? 'text-rose-500 hover:bg-rose-900/30' : 'text-slate-500 group-hover:text-emerald-400 hover:bg-emerald-900/30'}`}
                                title={`Aggiungi a ${activeSection.name}`}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                        )})}

                        {/* Kit matches */}
                        {filteredPickerKits.length > 0 && (
                            <div className="px-4 py-1.5 bg-slate-800 text-xs font-bold text-purple-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-700">
                                Kit & Set ({filteredPickerKits.length})
                            </div>
                        )}
                        {filteredPickerKits.map(kit => {
                          const qtyInZone = activeZone?.sections.reduce((total, section) => 
                            total + section.components
                              .filter(c => c.type === 'kit' && c.referenceId === kit.id)
                              .reduce((subtotal, comp) => subtotal + comp.quantity, 0),
                            0
                          ) || 0;
                          
                          const avail = calculateAvailableQuantity(kit.id, 'kit', activeList?.truckLoadDate || activeList?.setupDate || activeList?.eventDate || '', activeList?.returnDate || activeList?.teardownDate || activeList?.endDate, activeListId, lists, inventory, kits);
                          const isOverbooked = avail.available <= 0;

                          return (
                          <div 
                            key={kit.id} 
                            onClick={(e) => { e.preventDefault(); if (isOverbooked) { setOverbookedModal({ isOpen: true, item: kit, type: 'kit', avail: avail.available, total: avail.total }); } else { addToSection(kit, 'kit'); } }} 
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group cursor-pointer transition-colors"
                          >
                            <div className="flex-1 min-w-0 pr-2">
                                <div className="text-sm text-white flex items-center gap-2 truncate">
                                    <PackageIcon size={14} className="text-purple-400 shrink-0" />
                                    <span className="truncate">{kit.name}</span>
                                    {qtyInZone > 0 && (
                                        <span className="text-xs bg-purple-950 text-purple-400 border border-purple-900 px-1.5 rounded font-bold shrink-0">
                                            x{qtyInZone}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 pl-6 mt-0.5 truncate">
                                    {kit.items.length} componenti • <span className={isOverbooked ? 'text-rose-500 font-bold' : 'text-slate-400'}>Disponibili: {avail.available}</span> / {avail.total}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setHighlightedItemName(kit.name);
                                  setPickerSearch('');
                                  setIsPickerHovered(false);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors"
                                title={`Cerca ed evidenzia "${kit.name}" nella lista`}
                              >
                                <Search size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isOverbooked) {
                                    setOverbookedModal({ isOpen: true, item: kit, type: 'kit', avail: avail.available, total: avail.total });
                                  } else {
                                    addToSection(kit, 'kit');
                                  }
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${isOverbooked ? 'text-rose-500 hover:bg-rose-900/30' : 'text-slate-500 group-hover:text-emerald-400 hover:bg-emerald-900/30'}`}
                                title={`Aggiungi a ${activeSection.name}`}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                        )})}

                        {/* Inventory matches */}
                        {filteredPickerItems.length > 0 && (
                            <div className="px-4 py-1.5 bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-700">
                                Materiale Singolo
                            </div>
                        )}
                        {filteredPickerItems.slice(0, 50).map(item => {
                          const qtyInZone = activeZone?.sections.reduce((total, section) => 
                            total + section.components
                              .filter(c => c.type === 'item' && c.referenceId === item.id)
                              .reduce((subtotal, comp) => subtotal + comp.quantity, 0),
                            0
                          ) || 0;
                          
                          const avail = calculateAvailableQuantity(item.id, 'material', activeList?.truckLoadDate || activeList?.setupDate || activeList?.eventDate || '', activeList?.returnDate || activeList?.teardownDate || activeList?.endDate, activeListId, lists, inventory, kits);
                          const isOverbooked = avail.available <= 0;

                          return (
                          <div 
                            key={item.id} 
                            onClick={(e) => { e.preventDefault(); if (isOverbooked) { setOverbookedModal({ isOpen: true, item, type: 'item', avail: avail.available, total: avail.total }); } else { triggerAddItem(item); } }} 
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group cursor-pointer transition-colors"
                          >
                            <div className="flex-1 min-w-0 pr-2">
                                <div className="text-sm text-white flex items-center gap-1.5 truncate">
                                    {(() => {
                                        const itemDbId = item.databaseId || DEFAULT_DATABASE_ID;
                                        const itemDb = effectiveDatabases.find(d => d.id === itemDbId);
                                        if (!itemDb) return null;
                                        return (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border leading-none shrink-0 ${getDbBadgeStyle(itemDb.color)}`}>
                                                {itemDb.code || itemDb.name.slice(0, 3).toUpperCase()}
                                            </span>
                                        );
                                    })()}
                                    <span className="truncate">{item.name}</span>
                                    {qtyInZone > 0 && (
                                        <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 rounded font-bold shrink-0">
                                            x{qtyInZone}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 truncate">
                                    {item.category} • <span className={isOverbooked ? 'text-rose-500 font-bold' : 'text-slate-400'}>Disponibili: {avail.available}</span> / {avail.total}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setHighlightedItemName(item.name);
                                  setPickerSearch('');
                                  setIsPickerHovered(false);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors"
                                title={`Cerca ed evidenzia "${item.name}" nella lista`}
                              >
                                <Search size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isOverbooked) {
                                    setOverbookedModal({ isOpen: true, item, type: 'item', avail: avail.available, total: avail.total });
                                  } else {
                                    triggerAddItem(item);
                                  }
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${isOverbooked ? 'text-rose-500 hover:bg-rose-900/30' : 'text-slate-500 group-hover:text-emerald-400 hover:bg-emerald-900/30'}`}
                                title={`Aggiungi a ${activeSection.name}`}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                        )})}
                        
                        {/* Create new */}
                        {filteredPickerItems.length === 0 && filteredPickerKits.length === 0 && filteredPickerTemplates.length === 0 && <button onClick={() => setIsNewItemModalOpen(true)} className="w-full text-left px-4 py-3 hover:bg-slate-800 text-emerald-500 flex gap-2"><Plus/> Crea "{pickerSearch}"</button>}
                      </div>
                    )}
                </div>
                
                {/* Category & Action Buttons Row */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {/* UNDO / REDO BUTTONS (Max 15 levels) */}
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={handleUndoList}
                            disabled={historyPast.length === 0}
                            className={`p-1.5 sm:p-2 rounded-lg flex items-center justify-center transition-all ${
                                historyPast.length > 0
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 shadow-sm shadow-amber-900/30 cursor-pointer active:scale-95'
                                    : 'bg-slate-950 text-slate-600 border border-slate-800/80 opacity-40 cursor-not-allowed'
                            }`}
                            title={historyPast.length > 0 ? `Annulla operazione (${historyPast.length}/15 indietro)` : "Nessuna operazione da annullare"}
                            aria-label="Annulla"
                        >
                            <Undo2 size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={handleRedoList}
                            disabled={historyFuture.length === 0}
                            className={`p-1.5 sm:p-2 rounded-lg flex items-center justify-center transition-all ${
                                historyFuture.length > 0
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50 hover:bg-blue-500/30 shadow-sm shadow-blue-900/30 cursor-pointer active:scale-95'
                                    : 'bg-slate-950 text-slate-600 border border-slate-800/80 opacity-40 cursor-not-allowed'
                            }`}
                            title={historyFuture.length > 0 ? `Ripristina operazione (${historyFuture.length}/15 avanti)` : "Nessuna operazione da ripristinare"}
                            aria-label="Ripristina"
                        >
                            <Redo2 size={15} />
                        </button>
                    </div>

                    <div className="relative group/filter shrink-0">
                        <button
                            type="button"
                            onClick={() => setIsPickerFilterModalOpen(true)}
                            className={`p-1.5 sm:p-2 rounded-lg flex items-center justify-center gap-1 text-xs font-semibold transition-all shrink-0 ${
                                activePickerFiltersCount > 0
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50 hover:bg-blue-600/30 shadow-sm shadow-blue-900/30'
                                    : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-700'
                            }`}
                            title="Filtri"
                            aria-label="Filtri"
                        >
                            <Filter size={15} />
                            {activePickerFiltersCount > 0 && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded-full leading-none">
                                    {activePickerFiltersCount}
                                </span>
                            )}
                        </button>
                        {/* Hover Tooltip Popup */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900 border border-slate-700 text-white text-[11px] font-semibold rounded-md shadow-xl opacity-0 invisible group-hover/filter:opacity-100 group-hover/filter:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50">
                            Filtri
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-700" />
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => {
                            setTempItemFormData({ name: '', quantity: 1, category: activeSection?.name || '', notes: '' });
                            setIsTempItemModalOpen(true);
                        }}
                        className="bg-amber-600 hover:bg-amber-500 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg flex items-center gap-1 font-bold text-xs transition-all shrink-0 shadow-md shadow-amber-900/20 active:scale-95"
                        title="Articolo Temporaneo"
                    >
                        <Plus size={13} /> <span className="hidden sm:inline">Temp.</span><span className="sm:hidden">T</span>
                    </button>

                    <button 
                        onClick={() => setIsNewItemModalOpen(true)} 
                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 sm:p-2 rounded-lg shrink-0 shadow-md shadow-emerald-900/20 active:scale-95" 
                        title="Nuovo Articolo"
                        aria-label="Nuovo Articolo"
                    >
                        <Plus size={15} />
                    </button>
                </div>

                {/* INLINE BULK ACTIONS (Desktop) */}
                {(selectedIds.size > 0 || clipboard.length > 0) && (
                    <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l border-slate-700 animate-in fade-in">
                         <div className="flex flex-col gap-0.5 mr-2">
                            <button onClick={selectAllInSection} className="text-xs uppercase font-bold text-slate-500 hover:text-white leading-none">Tutti</button>
                            <button onClick={deselectAll} className="text-xs uppercase font-bold text-slate-500 hover:text-white leading-none">Nessuno</button>
                         </div>
                         {selectedIds.size > 0 && (
                            <>
                                <button onClick={handleCopy} className="p-2 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded"><ClipboardCopy size={16} /></button>
                                <button onClick={handleCut} className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded"><Scissors size={16} /></button>
                                <button onClick={handleBulkDelete} className="p-2 bg-slate-800 hover:bg-rose-900/30 text-rose-400 rounded"><Trash2 size={16} /></button>
                            </>
                         )}
                         {clipboard.length > 0 && (
                            <div className="flex items-center gap-1 ml-1 bg-slate-800 rounded p-0.5">
                                <button onClick={handlePaste} className={`px-3 py-1.5 rounded text-xs font-bold flex gap-1 ${clipboardPasted ? 'bg-orange-600' : 'bg-emerald-600'} text-white`}>{clipboardPasted && <X size={14}/>}<Clipboard size={14}/> {clipboard.length}</button>
                                <button onClick={() => { setClipboard([]); setClipboardPasted(false); }} className="p-1.5 text-slate-400 hover:text-rose-400"><X size={14} /></button>
                            </div>
                         )}
                    </div>
                )}
            </div>
        )}

        {/* --- MAIN LIST CONTENT --- */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col pb-24 md:pb-0">
          {highlightedItemName && (
              <div className="sticky top-0 left-0 right-0 z-20 bg-blue-600 text-white px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2">
                   <div className="font-bold text-sm flex items-center gap-2">
                      <Search size={16} /> EVIDENZIATO: 
                      <button 
                        onClick={() => handleOpenMasterEditor(highlightedItemName!)}
                        className="underline hover:text-white/80 transition-colors cursor-pointer text-left"
                        title="Clicca per modificare l'oggetto e i suoi accessori"
                      >
                        {highlightedItemName}
                      </button>
                      <span className="mx-2 opacity-50">|</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded text-xs">TOTALE IN LISTA: {highlightedTotal}</span>
                  </div>
                  <button onClick={() => setHighlightedItemName(null)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-bold uppercase transition-colors">
                      ESCI
                  </button>
              </div>
          )}

          {!activeZone ? <div className="text-center py-20 text-slate-500">Crea una Zona per iniziare</div> :
           !activeSection ? <div className="text-center py-20 text-slate-500">Seleziona una Sezione</div> :
           activeSection.components.length === 0 ? <div className="text-center py-20 text-slate-600">Sezione vuota</div> : (
            <div className="space-y-2 p-4">
              {activeSection.components.map((comp, idx) => {
                  const isSelected = selectedIds.has(comp.uniqueId);
                  const isReplacing = replacingComponentId === comp.uniqueId;
                  
                  // Check existence
                  const isMissing = !comp.isTemporary && (
                      comp.type === 'item' ? !inventory.some(i => i.id === comp.referenceId) :
                      comp.type === 'template' ? !templates.some(t => t.id === comp.referenceId) :
                      !kits.some(k => k.id === comp.referenceId)
                  );

                  // Retrieve Reminders if applicable
                  const originalKit = comp.type === 'kit' ? kits.find(k => k.id === comp.referenceId) : null;
                  const originalItem = comp.type === 'item' ? inventory.find(i => i.id === comp.referenceId) : null;
                  const itemReminders = originalKit?.reminders || originalItem?.reminders || [];
                  const hasReminders = itemReminders.length > 0;

                  // Highlight Logic
                  const isMainMatch = comp.name === highlightedItemName;
                  const isSubMatch = comp.contents?.some(c => c.name === highlightedItemName);
                  
                  // NEW LOGIC: if searching and not matched, hide completely
                  if (highlightedItemName && !isMainMatch && !isSubMatch) return null;

                  const isParentOfMatch = highlightedItemName && isSubMatch;

                  const hasAccessories = comp.contents && comp.contents.length > 0;
                  const isDragOver = isDragging && activeDragOverIdx === idx && activeDragOverSectionId === activeSection.id;

                  // Snapshot comparison for pending draft changes detection
                  const prevComp = snapshotComponentMap.get(comp.uniqueId);
                  const isListCompletedWithSnapshot = Boolean(activeList?.isCompleted && activeList?.snapshot && activeList.snapshot.length > 0);
                  const isCompBrandNew = Boolean(isListCompletedWithSnapshot && !prevComp);
                  const isCompReplaced = Boolean(isListCompletedWithSnapshot && prevComp && (prevComp.referenceId !== comp.referenceId || prevComp.name !== comp.name || prevComp.type !== comp.type));
                  const isCompQtyChanged = Boolean(isListCompletedWithSnapshot && prevComp && prevComp.quantity !== comp.quantity);
                  const isAnySubPending = Boolean(
                    isListCompletedWithSnapshot && comp.contents && comp.contents.some((c, i) => {
                      const prevSub = prevComp?.contents?.find(ps => ps.itemId === c.itemId) || prevComp?.contents?.[i];
                      const curQty = c.quantity * comp.quantity;
                      const prevQty = prevComp && prevSub ? prevSub.quantity * prevComp.quantity : 0;
                      return isCompBrandNew || !prevComp || !prevSub || prevSub.itemId !== c.itemId || prevSub.name !== c.name || prevQty !== curQty;
                    })
                  );
                  const isCompPending = isCompBrandNew || isCompReplaced || isCompQtyChanged || isAnySubPending;
                  const compPendingChange = isCompPending ? {
                    isPending: true,
                    prevName: isCompBrandNew ? undefined : prevComp?.name,
                    prevQuantity: isCompBrandNew ? 0 : prevComp?.quantity
                  } : undefined;

                  return (
                      <div 
                           key={comp.uniqueId} 
                           id={`comp-row-${comp.uniqueId}`}
                           className="relative py-1"
                           onDragEnter={(e) => handleDragEnter(e, activeSection.id, idx)}
                           onDragOver={e => e.preventDefault()}
                      >
                          {/* DROP INDICATOR LINE */}
                          {isDragOver && (
                              <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded-full z-10 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
                          )}
                      <div 
                           draggable onDragStart={(e) => handleDragStart(e, activeSection.id, idx, comp.uniqueId)} onDragEnd={handleDragEnd}
                           className={`group relative p-2 rounded-lg border transition-all duration-300 ${isParentOfMatch ? 'opacity-70' : 'opacity-100'} ${isReplacing ? 'border-amber-500 bg-amber-900/10 ring-1 ring-amber-500' : isSelected ? 'bg-blue-900/20 border-blue-500/50' : comp.type === 'template' ? 'bg-emerald-900/10 border-emerald-900/30 hover:border-emerald-500/30' : comp.type === 'kit' ? 'bg-purple-900/10 border-purple-900/30 hover:border-purple-500/30' : hasAccessories ? 'bg-cyan-900/10 border-cyan-900/30 hover:border-cyan-500/30' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                          <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2 overflow-hidden">
                                  <button onClick={(e) => { e.stopPropagation(); toggleSelection(comp.uniqueId); }} className={`text-slate-500 p-1 ${isSelected ? 'text-blue-500' : ''}`}>{isSelected ? <CheckSquare size={18}/> : <Square size={18}/>}</button>
                                  
                                  {/* Drag Handle - Moved between selection and icon */}
                                  {!listSearch && (
                                      <div className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300 hidden md:block" title="Trascina per spostare">
                                          <GripVertical size={16} />
                                      </div>
                                  )}

                                  {comp.type === 'template' ? <Blocks size={18} className="text-emerald-400"/> : comp.type === 'kit' ? <PackageIcon size={18} className="text-purple-400"/> : <Box size={18} className={hasAccessories ? "text-cyan-400" : "text-slate-400"}/>}
                                  <div className="flex items-center gap-2 min-w-0">
                                      {isMissing && (
                                          <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFeedbackModal({
                                                    isOpen: true,
                                                    title: 'Elemento Mancante',
                                                    message: "Questo elemento è stato cancellato dal database, devi sostituirlo con uno o più elementi esistenti.",
                                                    type: 'error'
                                                });
                                            }}
                                            title="Elemento cancellato dal database"
                                            className="text-rose-500 hover:text-rose-400 shrink-0"
                                          >
                                              <AlertTriangle size={16} />
                                          </button>
                                      )}
                                      <div className="min-w-0">
                                          <div 
                                              className={`font-medium text-sm truncate flex items-center gap-2 cursor-pointer hover:underline ${isMainMatch ? 'text-blue-400 font-bold scale-105 origin-left' : 'text-slate-200'}`}
                                              onClick={(e) => {
                                                   e.stopPropagation();
                                                   if (highlightedItemName === comp.name) {
                                                       setHighlightedItemName(null);
                                                   } else {
                                                       setHighlightedItemName(comp.name);
                                                       setLastClickedComponentId(comp.uniqueId);
                                                   }
                                               }}
                                              title="Clicca per evidenziare ovunque"
                                          >
                                              {comp.name} 
                                              {(() => {
                                                  const compDbId = comp.databaseId || inventory.find(i => i.id === comp.referenceId)?.databaseId || DEFAULT_DATABASE_ID;
                                                  const compDb = effectiveDatabases.find(d => d.id === compDbId);
                                                  if (!compDb) return null;
                                                  return (
                                                      <span 
                                                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border leading-none shrink-0 ${getDbBadgeStyle(compDb.color)}`}
                                                          title={`Database: ${compDb.name}`}
                                                      >
                                                          {compDb.code || compDb.name.slice(0, 3).toUpperCase()}
                                                      </span>
                                                  );
                                              })()}
                                              {(() => {
                                                  if (comp.type !== 'item') return null;
                                                  const d = calculateAvailableQuantity(
                                                      comp.referenceId,
                                                      'material',
                                                      activeList?.truckLoadDate || activeList?.setupDate || activeList?.eventDate || '',
                                                      activeList?.returnDate || activeList?.teardownDate || activeList?.endDate,
                                                      activeListId,
                                                      lists,
                                                      inventory,
                                                      kits
                                                  );
                                                  
                                                  const missing = d.available <= 0 ? comp.quantity : Math.max(0, comp.quantity - d.available);
                                                  
                                                  if (comp.isTemporary) return null;

                                                  if (missing > 0) {
                                                      const isInternalShortage = comp.isExternalRental && comp.rentalType === 'internal_shortage';
                                                      const isExternalRental = comp.isExternalRental && comp.rentalType === 'external_rental';
                                                      
                                                      if (isExternalRental) {
                                                          return (
                                                              <span className="flex items-center gap-1 text-cyan-400 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-800/30 text-[10px] font-bold ml-1" title={`Noleggiato da: ${comp.externalRentalVendor || 'N/A'}`}>
                                                                  <Truck size={10} /> {comp.quantity} Noleggiato {comp.externalRentalVendor ? `(${comp.externalRentalVendor})` : ''}
                                                              </span>
                                                          );
                                                      }

                                                      if (isInternalShortage) {
                                                          return (
                                                              <span className="flex items-center gap-1 text-orange-500 bg-orange-950/30 px-1.5 py-0.5 rounded border border-orange-800/30 text-[10px] font-bold ml-1" title="Scorta gestita internamente/Produzione">
                                                                  <AlertTriangle size={10} /> {missing} Mancanti
                                                              </span>
                                                          );
                                                      }

                                                      return (
                                                          <span className="flex items-center gap-1 text-rose-500 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-800/30 text-[10px] font-bold ml-1">
                                                              <AlertTriangle size={10} /> {missing} Mancanti
                                                          </span>
                                                      );
                                                  }
                                                  
                                                  return null;
                                              })()}
                                              {comp.isTemporary && <span className="bg-yellow-400 text-black text-xs font-bold px-1.5 py-0.5 rounded ml-2 shrink-0">Temp</span>}
                                              {comp.type === 'template' && <span className="text-xs bg-emerald-900 text-emerald-200 px-1 rounded align-middle no-underline font-bold">Tmpl</span>}
                                              {comp.type === 'kit' && <span className="text-xs bg-purple-900 text-purple-200 px-1 rounded align-middle no-underline font-bold">Kit</span>}
                                              {comp.type === 'item' && hasAccessories && <span className="text-xs bg-cyan-900 text-cyan-200 px-1 rounded align-middle no-underline font-bold">Con accessori</span>}
                                               {comp.replacementInfo && (
                                                   <button 
                                                       type="button"
                                                       onClick={(e) => {
                                                           e.stopPropagation();
                                                           setWarehouseSubModal({
                                                               isOpen: true,
                                                               componentName: comp.name,
                                                               originalQuantity: comp.quantity,
                                                               replacementInfo: comp.replacementInfo
                                                           });
                                                       }}
                                                       className="text-xs bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/50 px-1.5 py-0.5 rounded align-middle font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors active:scale-95 shadow-sm"
                                                       title="Clicca per visualizzare la sostituzione del magazzino"
                                                   >
                                                       <ArrowLeftRight size={11} className="text-amber-400 shrink-0" />
                                                       <span className="hidden sm:inline">Sostituito a magazzino</span>
                                                       <span className="sm:hidden text-[10px]">Sost. Mag.</span>
                                                   </button>
                                               )}
                                              {originalItem?.documents && originalItem.documents.length > 0 && (
                                                  <button 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        if (originalItem.documents && originalItem.documents.length === 1) {
                                                            openDocumentInBrowser(originalItem.documents[0].url);
                                                        } else if (originalItem.documents && originalItem.documents.length > 1) {
                                                            setViewDocsItem(originalItem);
                                                        }
                                                    }}
                                                    className="p-0.5 rounded-full text-blue-400 hover:bg-blue-900/40 transition-colors"
                                                    title={originalItem.documents.length === 1 ? `Visualizza documento: ${originalItem.documents[0].name || originalItem.documents[0].url}` : `${originalItem.documents.length} documenti (clicca per scegliere quale visualizzare)`}
                                                  >
                                                      <FileText size={13} />
                                                  </button>
                                              )}
                                              {hasReminders && (
                                                  <button 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        const newSet = new Set(closedRemindersIds);
                                                        if (newSet.has(comp.uniqueId)) newSet.delete(comp.uniqueId);
                                                        else newSet.add(comp.uniqueId);
                                                        setClosedRemindersIds(newSet);
                                                    }}
                                                    className={`p-0.5 rounded-full ${!closedRemindersIds.has(comp.uniqueId) ? 'bg-yellow-500 text-black' : 'text-yellow-500 hover:bg-yellow-900/30'} transition-colors`}
                                                    title={!closedRemindersIds.has(comp.uniqueId) ? "Chiudi promemoria" : "Ci sono cose da ricordare!"}
                                                  >
                                                      <Lightbulb size={12} className={!closedRemindersIds.has(comp.uniqueId) ? "fill-current" : ""} />
                                                  </button>
                                              )}
                                          </div>
                                          <div className="text-xs text-slate-500">{comp.category}</div>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    {renderBuilderHistoryBadge(
                                        `builder-comp-${comp.uniqueId}`,
                                        comp.warehouseState?.changeLog,
                                        comp.name,
                                        comp.quantity,
                                        Boolean(comp.warehouseState?.inDistinta || comp.warehouseState?.loaded),
                                        compPendingChange
                                    )}
                                    {/* DESKTOP ACTIONS (Always visible on md+) */}
                                    <div className="hidden md:flex items-center gap-1">

                                        <button onClick={() => setReplacingComponentId(comp.uniqueId)} className={`p-1.5 rounded ${isReplacing ? 'text-amber-500 bg-amber-900/30' : 'text-slate-500 hover:bg-slate-700 hover:text-white'}`} title="Sostituisci Oggetto">
                                            <ArrowLeftRight size={14} />
                                        </button>

                                        <button onClick={() => { const s = new Set(openNoteIds); s.has(comp.uniqueId)?s.delete(comp.uniqueId):s.add(comp.uniqueId); setOpenNoteIds(s); }} className={`p-1.5 rounded ${comp.notes ? 'text-yellow-400' : 'text-slate-500 hover:text-white'}`} title="Aggiungi/Modifica Nota">
                                            <StickyNote size={14} />
                                        </button>
                                        
                                        <button onClick={() => removeComponent(comp.uniqueId)} className="p-1.5 ml-1 text-slate-500 hover:text-rose-500 hover:bg-rose-950/40 rounded transition-colors" title="Elimina Oggetto"><Trash2 size={14} /></button>
                                    </div>

                                    {/* MOBILE TRASH BUTTON (Visible on screens < md) */}
                                    <button 
                                        onClick={() => removeComponent(comp.uniqueId)} 
                                        className="md:hidden p-1.5 text-slate-500 hover:text-rose-400 active:text-rose-500 transition-colors" 
                                        title="Elimina Oggetto"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                    
                                    {/* QTY CONTROLS - ULTRA COMPACT */}
                                    <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden ml-1 sm:ml-2">
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setEditingQtyId(null);
                                                updateComponentQty(comp.uniqueId, prev => Math.max(1, prev - 1)); 
                                            }} 
                                            className="p-1 px-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors border-r border-slate-800"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input 
                                            ref={el => { qtyInputRefs.current[comp.uniqueId] = el }} 
                                            type="text" 
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            className="w-12 h-7 bg-transparent text-center text-white text-xs outline-none appearance-none font-bold" 
                                            value={editingQtyId === comp.uniqueId ? editingQtyValue : comp.quantity} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEditingQtyId(comp.uniqueId);
                                                setEditingQtyValue(val);
                                                if (val.trim() !== '') {
                                                    const num = parseInt(val, 10);
                                                    if (!isNaN(num) && num > 0) {
                                                        updateComponentQty(comp.uniqueId, num);
                                                    }
                                                }
                                            }}
                                            onBlur={() => {
                                                setEditingQtyId(null);
                                                setEditingQtyValue('');
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur();
                                                    pickerInputRef.current?.focus();
                                                    pickerInputRef.current?.select();
                                                }
                                            }}
                                        />
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setEditingQtyId(null);
                                                updateComponentQty(comp.uniqueId, prev => prev + 1); 
                                            }} 
                                            className="p-1 px-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors border-l border-slate-800"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                               </div>
                          </div>
                          
                          {/* REMINDERS PANEL */}
                          {!closedRemindersIds.has(comp.uniqueId) && hasReminders && (
                              <div className="mt-2 mx-2 bg-amber-500/10 dark:bg-yellow-900/20 border border-amber-500/30 dark:border-yellow-700/30 rounded-lg p-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                  <div className="text-xs font-extrabold text-amber-800 dark:text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                      <Lightbulb size={13} className="fill-current text-amber-600 dark:text-yellow-400"/> Cose da ricordare:
                                  </div>
                                  <ul className="space-y-1.5">
                                      {itemReminders.map((rem, ridx) => (
                                          <li key={ridx} className="text-xs text-amber-950 dark:text-yellow-100 font-bold flex items-start gap-2">
                                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-yellow-400 shrink-0"/>
                                              <span className="leading-snug">{rem}</span>
                                          </li>
                                      ))}
                                  </ul>
                              </div>
                          )}

                          {(openNoteIds.has(comp.uniqueId) || comp.notes) && (
                              <div className="mt-1.5 pl-8 pr-16">
                                  <InlineNoteInput uniqueId={comp.uniqueId} initialValue={comp.notes || ''} onSave={updateComponentNote} autoFocus={openNoteIds.has(comp.uniqueId)} />
                              </div>
                          )}

                          {/* Contents (Kits, Machines, Templates) */}
                          {((comp.contents && comp.contents.length > 0) || (comp.templateContents && comp.templateContents.length > 0)) && (
                            <div className="mt-2 ml-7 pl-3 border-l-2 border-slate-700 space-y-1.5 animate-in fade-in duration-300">
                                {/* Standard Machine Contents / Kit Items */}
                                {comp.contents?.map((c, i) => {
                                    const isAccMissing = c.itemId ? !inventory.some(inv => inv.id === c.itemId) : false;
                                    const isChildMatch = highlightedItemName && c.name === highlightedItemName;
                                    const prevSub = prevComp?.contents?.find(ps => ps.itemId === c.itemId) || prevComp?.contents?.[i];
                                    const currentSubTotalQty = c.quantity * comp.quantity;
                                    const prevSubTotalQty = prevComp && prevSub ? prevSub.quantity * prevComp.quantity : 0;
                                    const isSubPending = Boolean(
                                        isListCompletedWithSnapshot && (
                                            isCompBrandNew ||
                                            !prevComp ||
                                            !prevSub ||
                                            prevSub.itemId !== c.itemId ||
                                            prevSub.name !== c.name ||
                                            prevSubTotalQty !== currentSubTotalQty
                                        )
                                    );
                                    const subPendingChange = isSubPending ? {
                                        isPending: true,
                                        prevName: (!prevComp || !prevSub) ? undefined : prevSub.name,
                                        prevQuantity: prevSubTotalQty
                                    } : undefined;

                                    const subEffectiveChangeLog = c.warehouseState?.changeLog || (comp.warehouseState?.changeLog ? {
                                        ...comp.warehouseState.changeLog,
                                        previousQuantity: comp.warehouseState.changeLog.previousQuantity !== undefined
                                            ? comp.warehouseState.changeLog.previousQuantity * c.quantity
                                            : undefined,
                                        previousName: undefined,
                                        history: comp.warehouseState.changeLog.history?.map(h => ({
                                            ...h,
                                            name: c.name,
                                            quantity: h.quantity * c.quantity
                                        }))
                                    } : undefined);

                                    return (
                                        <div key={`acc-${i}`} className={`text-xs flex justify-between items-center w-full max-w-md leading-tight group/acc ${isChildMatch ? 'text-blue-400' : 'text-slate-400'}`}>
                                            <span className="flex items-center gap-1 min-w-0">
                                                {isAccMissing && (
                                                    <AlertTriangle size={10} className="text-rose-500 shrink-0" />
                                                )}
                                                <span 
                                                    className={`truncate cursor-pointer hover:underline ${isAccMissing ? 'text-rose-900 line-through decoration-rose-500/50' : ''} ${isChildMatch ? 'font-bold underline' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (highlightedItemName === c.name) {
                                                            setHighlightedItemName(null);
                                                        } else {
                                                            setHighlightedItemName(c.name);
                                                            setLastClickedComponentId(comp.uniqueId);
                                                        }
                                                    }}
                                                >
                                                    {c.name}
                                                </span>
                                                {c.replacementInfo && (
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setWarehouseSubModal({
                                                                isOpen: true,
                                                                componentName: c.name,
                                                                originalQuantity: c.quantity * comp.quantity,
                                                                replacementInfo: c.replacementInfo
                                                            });
                                                        }}
                                                        className="text-[9px] bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/50 px-1 py-0.5 rounded font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors active:scale-95 shadow-sm"
                                                        title="Clicca per visualizzare la sostituzione del magazzino"
                                                    >
                                                        <ArrowLeftRight size={9} className="text-amber-400 shrink-0" />
                                                        <span className="hidden sm:inline">Sostituito</span>
                                                        <span className="sm:hidden text-[9px]">Sost.</span>
                                                    </button>
                                                )}
                                            </span>
                                            <span className="shrink-0 pl-2 flex items-center gap-1.5">
                                                <span className="opacity-60">x{c.quantity * comp.quantity}</span>
                                                {renderBuilderHistoryBadge(
                                                    `builder-sub-${comp.uniqueId}-${i}`,
                                                    subEffectiveChangeLog,
                                                    c.name,
                                                    c.quantity * comp.quantity,
                                                    Boolean(c.warehouseState?.inDistinta || c.warehouseState?.loaded || comp.warehouseState?.inDistinta || comp.warehouseState?.loaded),
                                                    subPendingChange
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}

                                {/* Expanded Template Contents */}
                                {comp.templateContents?.map((tc, i) => {
                                    const isChildMatch = highlightedItemName && tc.name === highlightedItemName;
                                    const hasSubContents = tc.contents && tc.contents.length > 0;
                                    const prevTc = snapshotComponentMap.get(tc.uniqueId);
                                    const isTcBrandNew = Boolean(isListCompletedWithSnapshot && !prevTc);
                                    const isTcReplaced = Boolean(isListCompletedWithSnapshot && prevTc && (prevTc.referenceId !== tc.referenceId || prevTc.name !== tc.name || prevTc.type !== tc.type));
                                    const isTcQtyChanged = Boolean(isListCompletedWithSnapshot && prevTc && prevTc.quantity * comp.quantity !== tc.quantity * comp.quantity);
                                    const isTcPending = isTcBrandNew || isTcReplaced || isTcQtyChanged;
                                    const tcPendingChange = isTcPending ? {
                                        isPending: true,
                                        prevName: isTcBrandNew ? undefined : prevTc?.name,
                                        prevQuantity: isTcBrandNew ? 0 : (prevTc?.quantity ? prevTc.quantity * (prevComp?.quantity || comp.quantity) : 0)
                                    } : undefined;
                                    
                                    return (
                                        <div key={`tmpl-child-${i}`} className="space-y-1">
                                            <div className={`text-xs flex justify-between items-center w-full max-w-md leading-tight group/tmpl ${isChildMatch ? 'text-blue-400' : 'text-emerald-400/90'}`}>
                                                <span className="flex items-center gap-1 min-w-0">
                                                    <span 
                                                        className={`truncate cursor-pointer hover:underline font-medium ${isChildMatch ? 'font-bold underline text-blue-400' : ''}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (highlightedItemName === tc.name) {
                                                                setHighlightedItemName(null);
                                                            } else {
                                                                setHighlightedItemName(tc.name);
                                                                setLastClickedComponentId(comp.uniqueId);
                                                            }
                                                        }}
                                                    >
                                                        {tc.name}
                                                    </span>
                                                    {tc.type === 'kit' && <span className="text-xs bg-emerald-900/40 text-emerald-300 px-1 rounded uppercase font-bold shrink-0">Kit</span>}
                                                </span>
                                                <span className="shrink-0 pl-2 flex items-center gap-1.5">
                                                    <span className="opacity-70">x{tc.quantity * comp.quantity}</span>
                                                    {renderBuilderHistoryBadge(
                                                        `builder-tmpl-${comp.uniqueId}-${tc.uniqueId || i}`,
                                                        tc.warehouseState?.changeLog,
                                                        tc.name,
                                                        tc.quantity * comp.quantity,
                                                        Boolean(tc.warehouseState?.inDistinta || tc.warehouseState?.loaded),
                                                        tcPendingChange
                                                    )}
                                                </span>
                                            </div>
                                            
                                            {/* Nested Kit Items or Machine Accessories inside Template */}
                                            {hasSubContents && (
                                                <div className="ml-3 border-l border-emerald-900/30 pl-2 space-y-0.5">
                                                    {tc.contents?.map((sub, si) => {
                                                        const isSubMatch = highlightedItemName && sub.name === highlightedItemName;
                                                        const prevTcSub = prevTc?.contents?.find(ps => ps.itemId === sub.itemId) || prevTc?.contents?.[si];
                                                        const currentTcSubTotalQty = sub.quantity * tc.quantity * comp.quantity;
                                                        const prevTcSubTotalQty = prevTc && prevTcSub ? prevTcSub.quantity * prevTc.quantity * (prevComp?.quantity || comp.quantity) : 0;
                                                        const isTcSubPending = Boolean(
                                                            isListCompletedWithSnapshot && (
                                                                isTcBrandNew ||
                                                                !prevTc ||
                                                                !prevTcSub ||
                                                                prevTcSub.itemId !== sub.itemId ||
                                                                prevTcSub.name !== sub.name ||
                                                                prevTcSubTotalQty !== currentTcSubTotalQty
                                                            )
                                                        );
                                                        const tmplSubPendingChange = isTcSubPending ? {
                                                            isPending: true,
                                                            prevName: (!prevTc || !prevTcSub) ? undefined : prevTcSub.name,
                                                            prevQuantity: prevTcSubTotalQty
                                                        } : undefined;

                                                        return (
                                                            <div key={si} className={`text-xs flex justify-between items-center w-full max-w-sm leading-tight ${isSubMatch ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                                                                <span 
                                                                    className="truncate cursor-pointer hover:underline"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (highlightedItemName === sub.name) {
                                                                            setHighlightedItemName(null);
                                                                        } else {
                                                                            setHighlightedItemName(sub.name);
                                                                            setLastClickedComponentId(comp.uniqueId);
                                                                        }
                                                                    }}
                                                                >
                                                                    - {sub.name}
                                                                </span>
                                                                <span className="shrink-0 pl-2 flex items-center gap-1.5">
                                                                    <span className="opacity-50">x{sub.quantity * tc.quantity * comp.quantity}</span>
                                                                    {renderBuilderHistoryBadge(
                                                                        `builder-tmpl-sub-${comp.uniqueId}-${tc.uniqueId || i}-${si}`,
                                                                        sub.warehouseState?.changeLog,
                                                                        sub.name,
                                                                        sub.quantity * tc.quantity * comp.quantity,
                                                                        Boolean(sub.warehouseState?.inDistinta || sub.warehouseState?.loaded || tc.warehouseState?.inDistinta || tc.warehouseState?.loaded),
                                                                        tmplSubPendingChange
                                                                    )}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                          )}
                      </div>
                   </div>
                  );
              })}

              {/* FINAL DROP ZONE (AT BOTTOM) */}
              {isDragging && (
                  <div 
                      onDragEnter={(e) => handleDragEnter(e, activeSection.id, activeSection.components.length)}
                      onDragOver={e => e.preventDefault()}
                      className={`h-6 border-2 border-dashed rounded-lg transition-all duration-300 flex items-center justify-center mt-2 group/endzone ${activeDragOverIdx === activeSection.components.length && activeDragOverSectionId === activeSection.id ? 'border-blue-500 bg-blue-900/20' : 'border-slate-800 bg-slate-900/5'}`}
                  >
                      <div className={`text-[10px] font-bold tracking-wider transition-colors ${activeDragOverIdx === activeSection.components.length && activeDragOverSectionId === activeSection.id ? 'text-blue-400' : 'text-slate-700'}`}>
                          Sposta alla fine
                      </div>
                  </div>
              )}
            </div>
           )
          }
        </div>
            </div>
        </div>

      </div>

      {/* MODALS */}
      <Modal isOpen={mgmtModal.isOpen} onClose={() => setMgmtModal(p => ({...p, isOpen:false}))} title={mgmtModal.type==='create' ? `Nuova ${mgmtModal.target==='zone'?'Zona':'Sezione'}` : `Rinomina ${mgmtModal.target==='zone'?'Zona':'Sezione'}`}>
         <div className="space-y-4">
            <input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" value={mgmtModal.name} onChange={e => setMgmtModal(p => ({...p, name: e.target.value}))} autoFocus onKeyDown={e => e.key==='Enter' && handleMgmtModalSave()} />
            <div className="flex justify-end gap-2"><button onClick={() => setMgmtModal(p => ({...p, isOpen:false}))} className="px-4 py-2 text-slate-400">Annulla</button><button onClick={handleMgmtModalSave} className="px-6 py-2 bg-blue-600 text-white rounded">Salva</button></div>
         </div>
      </Modal>

      <Modal isOpen={zoneNoteModal.isOpen} onClose={() => setZoneNoteModal(p => ({...p, isOpen:false}))} title="Nota Zona">
         <div className="space-y-4">
            <textarea 
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white h-32" 
                value={zoneNoteModal.note} 
                onChange={e => setZoneNoteModal(p => ({...p, note: e.target.value}))} 
                autoFocus 
                placeholder="Inserisci una nota per questa zona..."
            />
            <div className="flex justify-end gap-2">
                <button onClick={() => setZoneNoteModal(p => ({...p, isOpen:false}))} className="px-4 py-2 text-slate-400">Annulla</button>
                <button onClick={handleZoneNoteSave} className="px-6 py-2 bg-blue-600 text-white rounded">Salva</button>
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
            await updateActiveList({ zones: newZones }, true);
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
          onEdit={() => {
            const target = summaryEvent;
            setSummaryEvent(null);
            openEventModal(target);
          }}
          onOpenList={() => {
            if (summaryEvent) {
              handleOpenList(summaryEvent);
            }
            setSummaryEvent(null);
          }}
          onUpdateZone={async (zoneId, updatedFields) => {
            if (activeList && activeList.id === summaryEvent.id) {
              const newZones = (activeList.zones || []).map(z => 
                (z.id && zoneId ? z.id === zoneId : z.name === zoneId) ? { ...z, ...updatedFields } : z
              );
              await updateActiveList({ zones: newZones }, true);
            }
          }}
        />
      )}

      <RemindersModal 
        isOpen={!!activeRemindersListId}
        onClose={() => setActiveRemindersListId(null)}
        reminders={remindersList?.reminders || []}
        onUpdate={handleUpdateReminders}
        title={remindersList?.eventName || 'Note Evento'}
      />
      
      <ConfirmationModal isOpen={!!sectionToDelete} onClose={() => setSectionToDelete(null)} onConfirm={confirmRemoveSection} title="Elimina Sezione" message="Confermi l'eliminazione della sezione?" />
      <ConfirmationModal isOpen={!!zoneToDelete} onClose={() => setZoneToDelete(null)} onConfirm={confirmRemoveZone} title="Elimina Zona" message="Confermi l'eliminazione della ZONA e di tutto il suo contenuto?" />
      
      <ConfirmationModal 
          isOpen={!!listToDuplicate} 
          onClose={() => { setListToDuplicate(null); setIsTemplateMode(false); }} 
          onConfirm={confirmDuplicateList} 
          title={isTemplateMode ? "Crea Nuovo Progetto" : "Duplica Evento"} 
          message={isTemplateMode 
              ? "Vuoi creare un nuovo evento partendo da questo archivio?" 
              : `Vuoi creare una copia di "${listToDuplicate?.eventName}"?`}
          confirmText={isTemplateMode ? "Inizia Nuovo Progetto" : "Duplica"}
          variant={isTemplateMode ? "success" : "primary"}
      />
      
      {/* Dynamic Confirmation Modal */}
      <ConfirmationModal 
          isOpen={!!genericConfirm} 
          onClose={() => setGenericConfirm(null)} 
          onConfirm={genericConfirm?.onConfirm || (() => {})} 
          title={genericConfirm?.title || ''} 
          message={genericConfirm?.message || ''} 
          confirmText={genericConfirm?.confirmText}
          variant={genericConfirm?.variant}
      />

      {/* Export Options Modal */}
      <Modal 
          isOpen={isExportModalOpen} 
          onClose={() => setIsExportModalOpen(false)} 
          title="Export Lista Materiale"
          size="lg"
      >
          <div className="space-y-4">
              <p className="text-sm text-slate-400">
                  Seleziona il formato in cui desideri esportare la lista per l'evento <strong>{activeList?.eventName}</strong>:
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* OPTION 1: PDF LISTA */}
                  <button 
                      onClick={() => { exportPDF(activeList!); setIsExportModalOpen(false); }}
                      className="flex items-center gap-3.5 p-3.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-blue-500/50 rounded-xl text-left transition-all duration-200 group"
                  >
                      <div className="p-2.5 bg-blue-900/30 text-blue-400 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                          <FileText size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-white text-sm">Lista Materiale (PDF)</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Completa, per zone e reparti con checklist.</p>
                      </div>
                  </button>

                  {/* OPTION 2: PDF TOTALI */}
                  <button 
                      onClick={() => { exportTotalsPDF(activeList!); setIsExportModalOpen(false); }}
                      className="flex items-center gap-3.5 p-3.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-purple-500/50 rounded-xl text-left transition-all duration-200 group"
                  >
                      <div className="p-2.5 bg-purple-900/30 text-purple-400 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                          <ClipboardList size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-white text-sm">Riepilogo Totali (PDF)</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Totali globali divisi tra Kit e materiale sfuso.</p>
                      </div>
                  </button>

                  {/* OPTION 3: CSV EXCEL */}
                  <button 
                      onClick={() => { exportCSV(activeList!); setIsExportModalOpen(false); }}
                      className="flex items-center gap-3.5 p-3.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-emerald-500/50 rounded-xl text-left transition-all duration-200 group"
                  >
                      <div className="p-2.5 bg-emerald-900/30 text-emerald-400 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                          <FileDown size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-white text-sm">Export in CSV (Excel)</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">File CSV tabellare compatibile con Excel.</p>
                      </div>
                  </button>

                  {/* OPTION 4: PDF SINGOLO REPARTO (Active) */}
                  {activeZone && activeSection && (
                      <button 
                          onClick={() => { exportSectionPDF(activeList!, activeZone.id, activeSection.id); setIsExportModalOpen(false); }}
                          className="flex items-center gap-3.5 p-3.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-amber-500/50 rounded-xl text-left transition-all duration-200 group border-dashed"
                      >
                          <div className="p-2.5 bg-amber-900/30 text-amber-500 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                              <Layers size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-white text-sm">Reparto Attivo: "{activeSection.name}"</h4>
                              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Solo "{activeSection.name}" di "{activeZone.name}".</p>
                          </div>
                      </button>
                  )}
              </div>

              {/* ESPORTAZIONE SINGOLA / SELETTIVA */}
              {activeList && activeList.zones && activeList.zones.length > 0 && (
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
                      <div className="flex items-center justify-between gap-3 text-left">
                          <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2.5 bg-amber-900/30 text-amber-400 rounded-lg border border-amber-700/40 shrink-0">
                                  <Layers size={18} />
                              </div>
                              <div className="min-w-0">
                                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">Esportazione singola</h4>
                                  <p className="text-[11px] text-slate-400 mt-0.5">Seleziona una o più zone e reparti da esportare:</p>
                              </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                  type="button"
                                  onClick={handleSelectAllExport}
                                  className="text-[10px] font-bold uppercase text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                              >
                                  Tutti
                              </button>
                              <button
                                  type="button"
                                  onClick={handleClearExportSelection}
                                  className="text-[10px] font-bold uppercase text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                              >
                                  Nessuno
                              </button>
                          </div>
                      </div>

                      {/* LIST OF ZONES AND DEPARTMENTS */}
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1.5 custom-scrollbar">
                          {activeList.zones.map(zone => {
                              const hasSections = zone.sections && zone.sections.length > 0;
                              const isFullZone = hasSections
                                  ? zone.sections.every(s => exportSelectedSections.has(`${zone.id}__${s.id}`))
                                  : exportSelectedZones.has(zone.id);
                              const isPartialZone = !isFullZone && hasSections && zone.sections.some(s => exportSelectedSections.has(`${zone.id}__${s.id}`));

                              return (
                                  <div key={zone.id} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-2">
                                      {/* Zone Row */}
                                      <div className="flex items-center justify-between gap-2">
                                          <div className="text-[11px] uppercase font-bold text-slate-300 tracking-wider truncate flex items-center gap-1.5 min-w-0">
                                              <Box size={13} className="text-emerald-400 shrink-0" />
                                              <span className="truncate">{zone.name}</span>
                                          </div>
                                          <button
                                              type="button"
                                              onClick={() => handleToggleZoneExport(zone.id)}
                                              className={`px-2.5 py-1 text-[10px] font-bold rounded-md border transition-all shrink-0 flex items-center gap-1 ${
                                                  isFullZone
                                                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm shadow-emerald-900/40'
                                                      : isPartialZone
                                                      ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
                                                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                                              }`}
                                          >
                                              {isFullZone && <CheckCircle size={11} />}
                                              <span>{isFullZone ? 'Zona Selezionata' : 'Tutta la Zona'}</span>
                                          </button>
                                      </div>

                                      {/* Department buttons */}
                                      {hasSections && (
                                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                                              {zone.sections.map(section => {
                                                  const isSelected = exportSelectedSections.has(`${zone.id}__${section.id}`);
                                                  return (
                                                      <button
                                                          key={section.id}
                                                          type="button"
                                                          onClick={() => handleToggleSectionExport(zone.id, section.id)}
                                                          className={`px-2.5 py-1 text-[11px] font-bold rounded-md border transition-all flex items-center gap-1.5 ${
                                                              isSelected
                                                                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-900/40'
                                                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                                                          }`}
                                                      >
                                                          {isSelected && <span className="text-[10px]">✓</span>}
                                                          <span>{section.name}</span>
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                      )}
                                  </div>
                              );
                          })}
                      </div>

                      {/* Export Action Button */}
                      <button
                          type="button"
                          disabled={exportCounts.totalItems === 0}
                          onClick={handleExportSelected}
                          className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg ${
                              exportCounts.totalItems > 0
                                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/40 cursor-pointer active:scale-[0.98]'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                          }`}
                      >
                          <FileDown size={16} />
                          <span>
                              {exportCounts.totalItems > 0
                                  ? `Esporta (${
                                      exportCounts.fullZones > 0 && exportCounts.partialSections > 0
                                          ? `${exportCounts.fullZones} ${exportCounts.fullZones === 1 ? 'Zona' : 'Zone'}, ${exportCounts.partialSections} ${exportCounts.partialSections === 1 ? 'Reparto' : 'Reparti'}`
                                          : exportCounts.fullZones > 0
                                          ? `${exportCounts.fullZones} ${exportCounts.fullZones === 1 ? 'Zona' : 'Zone'}`
                                          : `${exportCounts.partialSections} ${exportCounts.partialSections === 1 ? 'Reparto' : 'Reparti'}`
                                  })`
                                  : 'Seleziona Zone o Reparti da esportare'}
                          </span>
                      </button>
                  </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button 
                      onClick={() => setIsExportModalOpen(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                  >
                      Annulla
                  </button>
              </div>
          </div>
      </Modal>

      {/* Versioning Modal */}
      <Modal 
        isOpen={isVersionModalOpen} 
        onClose={() => { setIsVersionModalOpen(false); setVersionError(null); }} 
        title="Aggiorna Versione Bozza"
      >
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1 text-xs uppercase tracking-wider font-bold">Nuova Versione (es. 0.2)</label>
                  <input 
                      type="text" 
                      className={`w-full bg-slate-950 border ${versionError ? 'border-rose-500 bg-rose-500/5' : 'border-slate-700'} rounded-lg p-3 text-white focus:border-blue-500 outline-none transition-all font-mono text-center text-xl`}
                      value={draftVersionInput}
                      onChange={(e) => {
                          setDraftVersionInput(e.target.value);
                          if (versionError) setVersionError(null);
                      }}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && confirmVersionUpdate()}
                  />
                  {versionError && <p className="mt-2 text-xs text-rose-500 font-bold uppercase tracking-tight animate-in fade-in slide-in-from-top-1">{versionError}</p>}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                  <button 
                      onClick={() => { setIsVersionModalOpen(false); setVersionError(null); }} 
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-bold"
                  >
                      Annulla
                  </button>
                  <button 
                      onClick={confirmVersionUpdate} 
                      className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg shadow-blue-900/40 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                  >
                      <Save size={18} />
                      Salva Versione
                  </button>
              </div>
          </div>
      </Modal>

      {/* Global Feedback Modal */}
      <Modal 
          isOpen={!!feedbackModal} 
          onClose={() => setFeedbackModal(null)} 
          title={feedbackModal?.title || 'Notifica'}
      >
          <div className="flex flex-col items-center text-center p-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${feedbackModal?.type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : feedbackModal?.type === 'error' ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/20 text-blue-500'}`}>
                  {feedbackModal?.type === 'success' ? <CheckCircle size={32} /> : feedbackModal?.type === 'error' ? <AlertTriangle size={32} /> : <Lightbulb size={32} />}
              </div>
              <p className="text-slate-300 mb-6">{feedbackModal?.message}</p>
              <button 
                  onClick={() => setFeedbackModal(null)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-all"
              >
                  OK
              </button>
          </div>
      </Modal>

      <ItemFormModal 
        isOpen={isNewItemModalOpen} 
        onClose={() => setIsNewItemModalOpen(false)} 
        onSave={handleCreateNewItem} 
        title="Nuovo Materiale" 
        inventory={inventory} 
        onCreateAccessory={handleCreateInventoryItemOnly} 
        initialName={pickerSearch} 
        databases={effectiveDatabases}
        activeDatabaseId={pickerDatabaseFilter !== 'All' ? pickerDatabaseFilter : (activeList?.databaseId || activeDatabaseId)}
        packingLists={lists}
        kits={kits}
      />

      {/* MASTER EDIT MODALS */}
      <ItemFormModal 
        isOpen={isEditItemModalOpen} 
        onClose={() => setIsEditItemModalOpen(false)} 
        onSave={async (d) => {
            if (!editingItem) return;
            const updated = { ...d, id: editingItem.id };
            await addOrUpdateItem(COLL_INVENTORY, updated);
            await propagateMasterUpdates(updated);
        }} 
        initialData={editingItem}
        inventory={inventory} 
        onCreateAccessory={handleCreateInventoryItemOnly}
        title="Modifica Materiale" 
        databases={effectiveDatabases}
        activeDatabaseId={activeList?.databaseId || activeDatabaseId}
        packingLists={lists}
        kits={kits}
      />

      <KitFormModal
        isOpen={isEditKitModalOpen}
        onClose={() => setIsEditKitModalOpen(false)}
        onSave={async (k) => {
            await addOrUpdateItem('kits', k);
            await propagateKitUpdates(k);
            setIsEditKitModalOpen(false);
        }}
        initialData={editingKit}
        inventory={inventory}
        title="Modifica Kit"
        databases={effectiveDatabases}
        activeDatabaseId={activeList?.databaseId || activeDatabaseId}
        kits={kits}
      />

      {/* Temporary Item Modal */}
      <Modal 
          isOpen={isTempItemModalOpen} 
          onClose={() => { setIsTempItemModalOpen(false); setEditingTempItemUniqueId(null); }} 
          title={editingTempItemUniqueId ? "Modifica Articolo Temporaneo" : "Aggiungi Articolo Temporaneo"}
      >
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Nome</label>
                  <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-amber-500 outline-none"
                      value={tempItemFormData.name}
                      onChange={e => setTempItemFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome articolo..."
                      autoFocus
                  />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Quantità</label>
                      <input 
                          type="number" 
                          min="1"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-amber-500 outline-none"
                          value={tempItemFormData.quantity}
                          onChange={e => setTempItemFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Categoria</label>
                      <select 
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-amber-500 outline-none"
                          value={tempItemFormData.category}
                          onChange={e => setTempItemFormData(prev => ({ ...prev, category: e.target.value }))}
                      >
                          <option value="">Seleziona...</option>
                          {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Note Produzione</label>
                  <textarea 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-amber-500 outline-none min-h-[80px]"
                      value={tempItemFormData.notes}
                      onChange={e => setTempItemFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Note per il magazzino..."
                  />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                  <button onClick={() => { setIsTempItemModalOpen(false); setEditingTempItemUniqueId(null); }} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Annulla</button>
                  <button 
                      onClick={handleSaveTempItem}
                      disabled={!tempItemFormData.name}
                      className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                      {editingTempItemUniqueId ? "Salva" : "Aggiungi"}
                  </button>
              </div>
          </div>
      </Modal>
      
      {/* Event Details Modal */}
      <EventFormModal 
          isOpen={isEventModalOpen} 
          onClose={() => setIsEventModalOpen(false)} 
          initialData={eventFormData}
          databases={effectiveDatabases}
          activeDatabaseId={activeDatabaseId}
          onSave={(data) => {
              setEventFormData(data);
              // Wait for React to apply state, then call save. Or modify handleSaveEvent to accept data.
              // We will just patch the internal state and trigger save.
              setTimeout(() => handleSaveEvent(data), 0);
          }}
      />

      {/* Database Mismatch Modal */}
      {dbMismatchList && (
        <Modal 
          isOpen={true} 
          onClose={handleCancelDbSwitch} 
          title="Cambio Database Richiesto" 
          size="md"
        >
          <div className="space-y-4">
            <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-start gap-3">
              <Database className="text-amber-400 shrink-0 mt-0.5" size={24} />
              <div className="text-sm text-slate-300 space-y-1">
                <p>
                  Questa lista (<strong className="text-white">{dbMismatchList.list.eventName}</strong>) è stata creata con il database <strong className="text-amber-300">{dbMismatchList.targetDbName}</strong>.
                </p>
                <p className="text-xs text-slate-400">
                  Attualmente è attivo il database <strong className="text-slate-200">{(databases || []).find(d => d.id === (activeDatabaseId || DEFAULT_DATABASE_ID))?.name || 'Database Principale'}</strong>, quindi l'elenco materiali potrebbe risultare vuoto o incompleto. Vuoi passare a <strong className="text-amber-300">{dbMismatchList.targetDbName}</strong>?
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button 
                type="button" 
                onClick={handleCancelDbSwitch}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
              >
                No, Torna agli Eventi
              </button>
              <button 
                type="button" 
                onClick={handleConfirmDbSwitch}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-900/30 transition-all"
              >
                Sì, Passa a {dbMismatchList.targetDbName}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Paste Confirm */}
      <Modal isOpen={showPasteConfirm} onClose={() => setShowPasteConfirm(false)} title="Incolla di nuovo">
        <div className="space-y-4"><p className="text-slate-300">Vuoi incollare di nuovo?</p><div className="flex justify-end gap-2"><button onClick={() => setShowPasteConfirm(false)} className="px-4 py-2 text-slate-400">Annulla</button><button onClick={() => { performPaste(); setShowPasteConfirm(false); }} className="bg-emerald-600 text-white px-4 py-2 rounded">Si</button></div></div>
      </Modal>
      
      {/* Mobile-only Checklist Drawer/Modal (Shared) */}
      <Modal 
          isOpen={isMobileChecklistOpen} 
          onClose={() => setIsMobileChecklistOpen(false)} 
          title={`Checklist: ${activeList?.eventName}`}
          size="full"
      >
          <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar pb-32">
                  {activeList && (
                      <ChecklistView 
                          activeList={activeList}
                          checklist={masterChecklist}
                      />
                  )}
              </div>
              <div className="p-4 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 flex justify-center sticky bottom-0 z-10">
                  <button 
                      onClick={() => setIsMobileChecklistOpen(false)}
                      className="w-full max-w-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-xl shadow-emerald-900/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                      <List size={20} />
                      Chiudi e Torna alla Lista
                  </button>
              </div>
          </div>
      </Modal>

      {/* Overbooked Selection Modal */}
      <Modal 
          isOpen={!!overbookedModal?.isOpen} 
          onClose={() => setOverbookedModal(null)} 
          title="Scorte Insufficienti"
      >
          <div className="space-y-6">
              <div className="flex items-start gap-4 p-4 bg-rose-900/20 border border-rose-500/30 rounded-xl">
                  <AlertCircle size={24} className="text-rose-500 shrink-0 mt-1" />
                  <div>
                      <h3 className="text-lg font-bold text-white mb-1">Attenzione: Scorte esaurite</h3>
                      <p className="text-sm text-slate-300">
                          Stai aggiungendo <span className="text-white font-bold">{overbookedModal?.item.name}</span>, ma la disponibilità per le date selezionate è di <span className="text-rose-400 font-bold">{overbookedModal?.avail}</span> su <span className="text-slate-400">{overbookedModal?.total}</span>.
                      </p>
                  </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Option 1: Internal Shortage */}
                  <button 
                      onClick={() => {
                          if (overbookedModal) {
                              addToSection(overbookedModal.item, overbookedModal.type, true, 'internal_shortage');
                              setOverbookedModal(null);
                          }
                      }}
                      className="flex flex-col items-center gap-3 p-5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl transition-all group w-full"
                  >
                      <Factory size={32} className="text-orange-500 group-hover:scale-110 transition-transform" />
                      <div className="text-center">
                          <div className="font-bold text-white">Continua lo stesso</div>
                          <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Carenza Interna</div>
                      </div>
                  </button>

                  {/* Option 2: External Rental */}
                  <div className="flex flex-col gap-3 p-5 bg-slate-800 border border-slate-700 rounded-xl">
                      <div className="flex flex-col items-center gap-3 group">
                        <Truck size={32} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                        <div className="text-center">
                            <div className="font-bold text-white">Noleggia Esternamente</div>
                            <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Fornitore Esterno</div>
                        </div>
                      </div>
                      
                      <div className="mt-2">
                        <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">Da chi noleggiamo?</label>
                        <div className="flex gap-2 mt-1">
                            <input 
                                type="text" 
                                placeholder="Nome fornitore..." 
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 w-full"
                                value={externalRentalVendor}
                                onChange={(e) => setExternalRentalVendor(e.target.value)}
                            />
                            <button 
                                onClick={() => {
                                    if (overbookedModal) {
                                        addToSection(overbookedModal.item, overbookedModal.type, true, 'external_rental', externalRentalVendor);
                                        setOverbookedModal(null);
                                        setExternalRentalVendor('');
                                    }
                                }}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded-lg transition-colors shrink-0"
                                title="Conferma noleggio"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                      </div>
                  </div>
              </div>

              <div className="flex justify-center pt-2">
                  <button onClick={() => setOverbookedModal(null)} className="text-sm text-slate-500 hover:text-white underline">Annulla e non aggiungere</button>
              </div>
          </div>
      </Modal>

      {/* ACCESSORY CONFIRMATION PROMPT MODAL */}
      <Modal 
          isOpen={!!accessoryPromptModal?.isOpen} 
          onClose={() => setAccessoryPromptModal(null)} 
          title="Accessori Opzionali" 
          size="md"
      >
          <div className="space-y-4">
              <div className="flex items-start gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <div className="p-2 bg-cyan-900/30 text-cyan-400 rounded-lg shrink-0">
                      <Link size={24} />
                  </div>
                  <div>
                      <h4 className="text-sm font-bold text-white">
                          {accessoryPromptModal?.item.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                          Questo articolo ha accessori non automatici. Seleziona quelli che desideri includere in questa distinta:
                      </p>
                  </div>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {accessoryPromptModal?.nonAutoAccessories.map((acc, idx) => (
                      <label 
                          key={acc.itemId} 
                          className="flex items-center justify-between p-2.5 bg-slate-900 hover:bg-slate-850 rounded-lg border border-slate-800 cursor-pointer transition-colors"
                      >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                              <input 
                                  type="checkbox" 
                                  checked={acc.selected} 
                                  onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      setAccessoryPromptModal(prev => prev ? ({
                                          ...prev,
                                          nonAutoAccessories: prev.nonAutoAccessories.map((a, i) => i === idx ? { ...a, selected: isChecked } : a)
                                      }) : null);
                                  }}
                                  className="w-4 h-4 rounded text-cyan-600 bg-slate-950 border-slate-700 focus:ring-cyan-500 focus:ring-offset-0"
                              />
                              <span className="text-xs font-semibold text-white truncate">{acc.name}</span>
                          </div>
                          <span className="px-2 py-0.5 bg-slate-800 text-cyan-300 rounded text-xs font-bold font-mono shrink-0">
                              Qtà: {acc.quantity}
                          </span>
                      </label>
                  ))}
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-800">
                  <button 
                      type="button" 
                      onClick={() => handleConfirmAccessoryPrompt(false)} 
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                      Aggiungi Senza Opzionali
                  </button>
                  <button 
                      type="button" 
                      onClick={() => handleConfirmAccessoryPrompt(true)} 
                      className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-cyan-900/30 active:scale-95"
                  >
                      Conferma & Aggiungi
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

      {/* ITEM DOCUMENTS PICKER MODAL */}
      <Modal isOpen={!!viewDocsItem} onClose={() => setViewDocsItem(null)} title={`Documenti di ${viewDocsItem?.name || ''}`} size="md">
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seleziona il documento da aprire e consultare nel browser:
          </p>
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
            {viewDocsItem?.documents?.map((doc) => {
              const displayName = doc.name && doc.name.trim() ? doc.name.trim() : doc.url;
              return (
                <div key={doc.id} className="flex justify-between items-center bg-white dark:bg-slate-800/80 p-3 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-slate-600 shadow-sm transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</div>
                      {doc.name && doc.name.trim() && (
                        <div className="text-[11px] text-slate-500 font-mono truncate">{doc.url}</div>
                      )}
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => openDocumentInBrowser(doc.url)} 
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-900/20 shrink-0 active:scale-95"
                    title="Apri e visualizza nel browser"
                  >
                    <Eye size={13} />
                    <span>Visualizza</span>
                    <ExternalLink size={11} className="opacity-70" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end pt-2">
            <button 
              type="button"
              onClick={() => setViewDocsItem(null)} 
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      </Modal>

      {/* PICKER FILTER MODAL (Side Drawer on Desktop, Popup on Mobile/Tablet) */}
      <Modal 
        isOpen={isPickerFilterModalOpen} 
        onClose={() => setIsPickerFilterModalOpen(false)} 
        title="Filtri Ricerca Materiale" 
        size="md"
        asDrawerOnDesktop
      >
        <div className="flex-1 flex flex-col justify-between space-y-4 h-full">
          <div className="space-y-4">
            {/* Database */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Database
              </label>
              <select
                value={pickerDatabaseFilter}
                onChange={(e) => setPickerDatabaseFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium"
              >
                <option value="All">Tutti i Database ({inventory.length})</option>
                {effectiveDatabases.map(db => {
                  const count = inventory.filter(i => (i.databaseId || DEFAULT_DATABASE_ID) === db.id).length;
                  return (
                    <option key={db.id} value={db.id}>
                      [{db.code || db.name.slice(0, 3).toUpperCase()}] {db.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Categoria
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium"
              >
                <option value="All">Tutte le Categorie ({inventory.length})</option>
                {availablePickerCategories.map(c => {
                  const count = inventory.filter(i => (i.category || '').toLowerCase() === c.toLowerCase()).length;
                  return <option key={c} value={c}>{c} ({count})</option>;
                })}
              </select>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-auto">
            <button
              type="button"
              onClick={handleResetPickerFilters}
              disabled={activePickerFiltersCount === 0}
              className="text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors py-2 px-1"
            >
              Azzera Filtri
            </button>
            <button
              type="button"
              onClick={() => setIsPickerFilterModalOpen(false)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-900/30 transition-all active:scale-95"
            >
              Applica Filtri
            </button>
          </div>
        </div>
      </Modal>

      {/* WAREHOUSE REPLACEMENT DETAILS MODAL */}
      <Modal
        isOpen={warehouseSubModal.isOpen}
        onClose={() => setWarehouseSubModal({ isOpen: false, componentName: '', originalQuantity: 0, replacementInfo: null })}
        title="Dettagli Sostituzione Magazzino"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-200 text-xs flex items-start gap-2.5">
            <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Questa modifica è stata effettuata durante la fase di preparazione in magazzino. La lista originale di progetto non è stata alterata.
            </p>
          </div>

          {/* Original Material */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Materiale Originale Previsto
            </span>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-white text-sm">
                {warehouseSubModal.replacementInfo?.originalName || warehouseSubModal.componentName}
              </span>
              <span className="text-xs font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 shrink-0">
                Qtà: {warehouseSubModal.replacementInfo?.originalQuantity ?? warehouseSubModal.originalQuantity ?? 1}
              </span>
            </div>
            {warehouseSubModal.replacementInfo?.originalRemainingQuantity !== undefined && warehouseSubModal.replacementInfo.originalRemainingQuantity > 0 && (
              <p className="text-xs text-slate-400">
                Pezzi originali mantenuti: <strong className="text-slate-200">{warehouseSubModal.replacementInfo.originalRemainingQuantity}</strong>
              </p>
            )}
          </div>

          {/* Warehouse Replacements */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
              <ArrowLeftRight size={13} />
              Materiale Inserito dal Magazzino
            </span>
            {warehouseSubModal.replacementInfo?.replacements && warehouseSubModal.replacementInfo.replacements.length > 0 ? (
              <div className="space-y-1.5">
                {warehouseSubModal.replacementInfo.replacements.map((rep: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-100">
                    <span className="font-medium truncate mr-2">{rep.name}</span>
                    <span className="font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded shrink-0">
                      x{rep.quantity}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">
                Nessun materiale alternativo specificato o materiale azzerato/rimosso.
              </div>
            )}
          </div>

          {/* Reason if available */}
          {warehouseSubModal.replacementInfo?.reason && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1 text-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Motivazione del magazziniere
              </span>
              <p className="text-slate-200 italic">
                "{warehouseSubModal.replacementInfo.reason}"
              </p>
            </div>
          )}

          {/* Date / Author */}
          {warehouseSubModal.replacementInfo?.replacedAt && (
            <div className="text-[11px] text-slate-500 text-right">
              Sostituito il: {new Date(warehouseSubModal.replacementInfo.replacedAt).toLocaleString('it-IT')}
              {warehouseSubModal.replacementInfo.replacedBy ? ` da ${warehouseSubModal.replacementInfo.replacedBy}` : ''}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setWarehouseSubModal({ isOpen: false, componentName: '', originalQuantity: 0, replacementInfo: null })}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      </Modal>
      </div>
  );
};
