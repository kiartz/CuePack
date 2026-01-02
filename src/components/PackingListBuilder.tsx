import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Trash2, FileDown, Settings2, Box, Package as PackageIcon, Calendar, MapPin, ClipboardList, StickyNote, Edit2, CheckSquare, Square, Scissors, Clipboard, ClipboardCopy, X, ArrowLeftRight, GripVertical, AlertTriangle } from 'lucide-react';
import { InventoryItem, Kit, PackingList, ListSection, ListComponent, Category, ListZone } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addOrUpdateItem, deleteItem, COLL_LISTS, COLL_INVENTORY } from '../firebase';

interface PackingListBuilderProps {
  inventory: InventoryItem[];
  kits: Kit[];
  lists: PackingList[];
  activeListId: string;
  setActiveListId: React.Dispatch<React.SetStateAction<string>>;
}

export const PackingListBuilder: React.FC<PackingListBuilderProps> = ({ 
  inventory, 
  kits, 
  lists, 
  activeListId, 
  setActiveListId 
}) => { // --- STATE ---
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [listFilter, setListFilter] = useState('');
  
  // Navigation
  const [activeZoneId, setActiveZoneId] = useState<string>('');
  const [activeSectionId, setActiveSectionId] = useState<string>('');

  // Search/Picker State
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // LIST LOCAL SEARCH STATE
  const [listSearch, setListSearch] = useState('');

  // Note Toggle State
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set());
  
  // Deletion States
  const [isDeleteListModalOpen, setIsDeleteListModalOpen] = useState(false);
  const [listToDeleteInfo, setListToDeleteInfo] = useState<{id: string, name: string} | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);

  // MULTI-SELECTION & CLIPBOARD STATE
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ListComponent[]>([]);
  const [clipboardPasted, setClipboardPasted] = useState(false);
  const [showPasteConfirm, setShowPasteConfirm] = useState(false);

  // REPLACEMENT STATE
  const [replacingComponentId, setReplacingComponentId] = useState<string | null>(null);

  // New Item Modal
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  
  // Section/Zone Management Modal State
  const [mgmtModal, setMgmtModal] = useState({
    isOpen: false,
    target: 'section' as 'section' | 'zone',
    type: 'create' as 'create' | 'rename',
    targetId: undefined as string | undefined,
    name: ''
  });

  // DRAG AND DROP STATE
  const dragItem = useRef<{ zoneId: string, sectionId: string, index: number, uniqueId: string } | null>(null);
  const dragOverItem = useRef<{ zoneId: string, sectionId: string, index: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-focus Refs
  const qtyInputRefs = useRef<{ [uniqueId: string]: HTMLInputElement | null }>({});
  const [lastAddedComponentId, setLastAddedComponentId] = useState<string | null>(null);

  // Picker Hover State
  const [isPickerHovered, setIsPickerHovered] = useState(false);

  // --- DERIVED STATE & MIGRATION ON THE FLY ---
  const activeList = useMemo(() => {
    const rawList = lists.find(l => l.id === activeListId);
    if (!rawList) return undefined;

    // Backward Compatibility / Migration Logic
    if (!rawList.zones || rawList.zones.length === 0) {
        const defaultSections = rawList.sections && rawList.sections.length > 0 
            ? rawList.sections 
            : [
                { id: crypto.randomUUID(), name: 'Audio', components: [] },
                { id: crypto.randomUUID(), name: 'Luci', components: [] },
                { id: crypto.randomUUID(), name: 'Video', components: [] },
                { id: crypto.randomUUID(), name: 'Regia', components: [] },
            ];
            
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

  const zones = activeList?.zones || [];
  const activeZone = zones.find(z => z.id === activeZoneId);
  const sections = activeZone?.sections || [];
  const activeSection = sections.find(s => s.id === activeSectionId);

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
      const searchTerms = (pickerSearch || '').toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
      
      // If no search, return inventory sorted by name (limited)
      if (searchTerms.length === 0) {
          return inventory
            .filter(i => selectedCategory === 'All' || i.category === selectedCategory)
            .sort((a, b) => a.name.localeCompare(b.name));
      }

      return inventory.map(item => {
            const name = (item.name || '').toLowerCase();
            const category = (item.category || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            
            // Create tokens from item name for exact matching
            // We split by spaces, dashes, slashes, parens. 
            // We intentionally keep '.' and ',' attached to numbers/words to treat "2.5mt" as a distinct token from "5mt"
            const nameTokens = name.split(/[\s\-_/()]+/); 

            // 1. Strict Filter: Must contain all search terms somewhere
            const combined = `${name} ${category} ${desc}`;
            if (!searchTerms.every(term => combined.includes(term))) {
                return { item, score: -1 };
            }
            
            if (selectedCategory !== 'All' && item.category !== selectedCategory) return { item, score: -1 };

            // 2. Scoring Logic
            let score = 0;
            
            searchTerms.forEach(term => {
                // A. Exact Name Match (The whole name is the search term)
                if (name === term) score += 10000;

                // B. Exact Token Match (e.g. "5mt" matches "5mt" but not "15mt")
                if (nameTokens.includes(term)) {
                    score += 1000;
                } 
                // C. Starts With Token (e.g. "mic" matches "microfono")
                else if (nameTokens.some(t => t.startsWith(term))) {
                    score += 500;
                }
                // D. Contained in Name (e.g. "5mt" inside "15mt")
                else if (name.includes(term)) {
                    score += 100;
                }
                
                // E. Category Match
                if (category.includes(term)) score += 50;
            });

            return { item, score };
        })
        .filter(x => x.score > -1)
        .sort((a, b) => {
            // Sort by Score descending
            if (b.score !== a.score) return b.score - a.score;
            // Then alphabetical
            return a.item.name.localeCompare(b.item.name);
        })
        .map(x => x.item);
  }, [inventory, pickerSearch, selectedCategory]);

  const filteredPickerKits = useMemo(() => {
      const searchTokens = (pickerSearch || '').toLowerCase().split(' ').filter(t => t.trim() !== '');
      return kits.map(kit => {
            const combined = `${(kit.name||'').toLowerCase()} ${(kit.category||'').toLowerCase()} ${(kit.description||'').toLowerCase()}`;
            if (!searchTokens.every(token => combined.includes(token))) return { kit, score: -1, nameMatches: 0 };
            if (selectedCategory !== 'All' && kit.category !== selectedCategory) return { kit, score: -1, nameMatches: 0 };
            return { kit, score: 1, nameMatches: 1 }; // simplified scoring for kits
        })
        .filter(x => x.score > -1)
        .map(x => x.kit);
  }, [kits, pickerSearch, selectedCategory]);


  // Switch to edit mode when activeListId changes
  useEffect(() => {
    if (activeListId && viewMode === 'list') {
      setViewMode('edit');
    }
  }, [activeListId, viewMode]);

  const filteredLists = useMemo(() => {
    const filtered = lists.filter(list => 
      list.eventName.toLowerCase().includes(listFilter.toLowerCase()) ||
      list.location.toLowerCase().includes(listFilter.toLowerCase())
    );
    return filtered.sort((a, b) => new Date(b.eventDate || 0).getTime() - new Date(a.eventDate || 0).getTime());
  }, [lists, listFilter]);

  const handleListSelect = (listId: string) => {
    setActiveListId(listId);
    setViewMode('edit');
  };

  const handleBackToList = () => {
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

  // --- FIRESTORE WRAPPER ---
  const updateActiveList = async (updates: Partial<PackingList>) => {
      if (!activeList) return;
      // We need to be careful: activeList here might contain the migration "default-zone".
      // We must ensure we save this migrated structure back to DB if we touch it.
      
      const updatedList = { ...activeList, ...updates };
      // Remove legacy 'sections' if we are saving 'zones'
      if (updatedList.zones && updatedList.zones.length > 0) {
          delete updatedList.sections; 
      }
      await addOrUpdateItem(COLL_LISTS, updatedList);
  };

  // Helper to update active zone
  const updateActiveZone = (zoneUpdates: Partial<ListZone>) => {
      if (!activeList || !activeZone) return;
      const newZones = activeList.zones!.map(z => z.id === activeZone.id ? { ...z, ...zoneUpdates } : z);
      updateActiveList({ zones: newZones });
  };
  
  // Helper to update active section (inside active zone)
  const updateActiveSection = (sectionUpdates: Partial<ListSection>) => {
      if (!activeList || !activeZone || !activeSection) return;
      const newSections = activeZone.sections.map(s => s.id === activeSection.id ? { ...s, ...sectionUpdates } : s);
      updateActiveZone({ sections: newSections });
  };


  // --- List CRUD ---
  const handleCreateList = async () => {
    const newList: PackingList = {
      id: crypto.randomUUID(),
      eventName: 'Nuovo Evento',
      eventDate: '',
      location: '',
      creationDate: new Date().toISOString(),
      notes: '',
      zones: [{
          id: crypto.randomUUID(),
          name: 'Zona Principale',
          sections: [
            { id: crypto.randomUUID(), name: 'Audio', components: [] },
            { id: crypto.randomUUID(), name: 'Luci', components: [] },
            { id: crypto.randomUUID(), name: 'Video', components: [] },
            { id: crypto.randomUUID(), name: 'Regia', components: [] },
          ]
      }]
    };
    await addOrUpdateItem(COLL_LISTS, newList);
    setActiveListId(newList.id);
  };

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

  const handleDuplicateList = async (list: PackingList, e: React.MouseEvent) => {
    e.stopPropagation();
    // Handles legacy structure during duplication too
    const sourceZones = list.zones && list.zones.length > 0 ? list.zones : [{ id: 'def', name: 'Zona Principale', sections: list.sections || [] }];
    
    const newList: PackingList = {
      ...list,
      id: crypto.randomUUID(),
      eventName: `${list.eventName} (Copia)`,
      creationDate: new Date().toISOString(),
      zones: sourceZones.map(z => ({
          ...z,
          id: crypto.randomUUID(),
          sections: z.sections.map(s => ({
              ...s,
              id: crypto.randomUUID(),
              components: s.components.map(c => ({ ...c, uniqueId: crypto.randomUUID() }))
          }))
      }))
    };
    if (newList.sections) delete newList.sections; // Cleanup legacy
    await addOrUpdateItem(COLL_LISTS, newList);
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
      clipboard.forEach(clipItem => {
          const existing = updatedComponents.find(c => c.type === clipItem.type && c.referenceId === clipItem.referenceId);
          if (existing) {
              updatedComponents = updatedComponents.map(c => c.uniqueId === existing.uniqueId ? { ...c, quantity: c.quantity + clipItem.quantity } : c);
          } else {
              updatedComponents.push({ ...clipItem, uniqueId: crypto.randomUUID() });
          }
      });
      updateActiveSection({ components: updatedComponents });
      setSelectedIds(new Set());
      setClipboardPasted(true);
  };
  const handleBulkDelete = () => {
      if (!activeList || !activeList.zones) return;
      // We need to iterate ALL sections in ALL zones because selection can be cross-section? 
      // Actually, selection currently resets when changing section. So we only delete from active section usually.
      // But let's be safe and filter from active section.
      if (activeSection) {
          const newComps = activeSection.components.filter(c => !selectedIds.has(c.uniqueId));
          updateActiveSection({ components: newComps });
          setSelectedIds(new Set());
      }
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
              const newId = crypto.randomUUID();
              const newZone: ListZone = { 
                  id: newId, 
                  name: mgmtModal.name.trim(), 
                  sections: [
                    { id: crypto.randomUUID(), name: 'Audio', components: [] },
                    { id: crypto.randomUUID(), name: 'Luci', components: [] }
                  ] 
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
              const newId = crypto.randomUUID();
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
  const generateComponentFromItem = (item: InventoryItem | Kit, type: 'item' | 'kit'): Omit<ListComponent, 'uniqueId' | 'quantity' | 'notes'> => {
      // (Implementation same as before, simplified for brevity in this replace block but logic retained)
      if (type === 'kit') {
        const k = item as Kit;
        return {
          type: 'kit', referenceId: k.id, name: k.name, category: 'Kit',
          contents: k.items.map(ki => {
              const i = inventory.find(inv => inv.id === ki.itemId);
              return { itemId: i?.id, name: i?.name || '?', quantity: ki.quantity, category: i?.category || 'Altro' };
          })
        };
      } else {
        const i = item as InventoryItem;
        return {
          type: 'item', referenceId: i.id, name: i.name, category: i.category,
          contents: (i.accessories || []).map(acc => {
              const i = inventory.find(inv => inv.id === acc.itemId);
              return { itemId: acc.itemId, name: i?.name || '?', quantity: acc.quantity, category: i?.category || 'Altro' };
          })
        };
      }
  };

  const addToSection = (item: InventoryItem | Kit, type: 'item' | 'kit') => {
      if (!activeSection) return;
      
      // Check for replacement
      if (replacingComponentId) {
          // Logic for replacement (swap item, keep qty)
           const newBase = generateComponentFromItem(item, type);
           const newComponents = activeSection.components.map(c => 
              c.uniqueId === replacingComponentId ? { ...c, ...newBase } : c
           );
           updateActiveSection({ components: newComponents });
           setReplacingComponentId(null);
           return;
      }

      const existing = activeSection.components.find(c => c.type === type && c.referenceId === item.id);
      if (existing) {
          const newComps = activeSection.components.map(c => c.uniqueId === existing.uniqueId ? { ...c, quantity: c.quantity + 1 } : c);
          updateActiveSection({ components: newComps });
          setLastAddedComponentId(existing.uniqueId);
      } else {
          const newComp: ListComponent = { uniqueId: crypto.randomUUID(), quantity: 1, notes: '', ...generateComponentFromItem(item, type) };
          updateActiveSection({ components: [...activeSection.components, newComp] });
          setLastAddedComponentId(newComp.uniqueId);
      }
  };

  const updateComponentQty = (uniqueId: string, qty: number) => {
      if (!activeSection || qty < 1) return;
      const newComps = activeSection.components.map(c => c.uniqueId === uniqueId ? { ...c, quantity: qty } : c);
      updateActiveSection({ components: newComps });
  };
  
  const updateComponentNote = (uniqueId: string, note: string) => {
      if (!activeSection) return;
      const newComps = activeSection.components.map(c => c.uniqueId === uniqueId ? { ...c, notes: note } : c);
      updateActiveSection({ components: newComps });
  };

  const removeComponent = (uniqueId: string) => {
      if (!activeSection) return;
      const newComps = activeSection.components.filter(c => c.uniqueId !== uniqueId);
      updateActiveSection({ components: newComps });
  };

  const handleDragStart = (e: React.DragEvent, sectionId: string, index: number, uniqueId: string) => {
      dragItem.current = { zoneId: activeZoneId, sectionId, index, uniqueId };
      setIsDragging(true);
  };
  const handleDragEnter = (e: React.DragEvent, sectionId: string, index: number) => {
      e.preventDefault(); 
      dragOverItem.current = { zoneId: activeZoneId, sectionId, index };
  };
  const handleDragEnd = () => {
      setIsDragging(false);
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
              if (insertionIndex === -1) insertionIndex = itemsToStay.length;

              const newComponents = [...itemsToStay.slice(0, insertionIndex), ...itemsToMove, ...itemsToStay.slice(insertionIndex)];
              updateActiveSection({ components: newComponents });
          }
      }
      dragItem.current = null; dragOverItem.current = null;
  };

  const handleCreateNewItem = async (itemData: Omit<InventoryItem, 'id'>) => {
      const newItem: InventoryItem = { ...itemData, id: crypto.randomUUID() };
      await addOrUpdateItem(COLL_INVENTORY, newItem);
      addToSection(newItem, 'item');
  };

  const handleCreateInventoryItemOnly = async (itemData: Omit<InventoryItem, 'id'> | InventoryItem) => {
    const itemWithId = (itemData as any).id ? (itemData as InventoryItem) : { ...itemData, id: crypto.randomUUID() };
    await addOrUpdateItem(COLL_INVENTORY, itemWithId);
  };


  // --- EXPORT ---
  const calculateZoneTotals = (zone: ListZone) => {
    const totalsMap = new Map<string, number>();
    zone.sections.forEach(s => s.components.forEach(c => {
        totalsMap.set(c.name, (totalsMap.get(c.name) || 0) + c.quantity);
        c.contents?.forEach(sub => totalsMap.set(sub.name, (totalsMap.get(sub.name) || 0) + (sub.quantity * c.quantity)));
    }));
    return totalsMap;
  };

  const exportPDF = () => {
    if (!activeList || !activeList.zones) return;
    
    const doc = new jsPDF();
    
    // Helper to print header on every page
    const printHeader = (zoneName: string, pageNumber: number) => {
        doc.setFontSize(8);
        doc.setTextColor(100);
        // Left: Event Info
        doc.text(`${activeList.eventName.toUpperCase()}  |  ${activeList.eventDate}`, 14, 10);
        
        // Right: Page Number (Global)
        const pageSize = doc.internal.pageSize;
        const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
        doc.text(`Pagina ${pageNumber}`, pageWidth - 14, 10, { align: 'right' });

        // Line 2: Zone Info (Smaller now)
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text(`ZONA: ${zoneName.toUpperCase()}`, 14, 16);
    };

    activeList.zones.forEach((zone, index) => {
        if (index > 0) doc.addPage(); // Explicit new page for new zone
        
        // Calculate totals just for this zone
        const zoneTotals = calculateZoneTotals(zone);

        // Prepare Table Body
        const tableBody: any[] = [];

        zone.sections.forEach(section => {
            if (section.components.length === 0) return;

            // Section Header Row
            tableBody.push([{ 
                content: section.name.toUpperCase(), 
                colSpan: 4, 
                styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] } 
            }]);

            // Items
            section.components.forEach(comp => {
                let nameContent = comp.name;
                if (comp.type === 'kit') nameContent = `[KIT] ${comp.name}`;
                if (comp.notes) nameContent += `\nNOTE: ${comp.notes}`;
                
                const zoneTotal = zoneTotals.get(comp.name) || 0;
                
                tableBody.push([nameContent, comp.quantity, zoneTotal, '']);
                
                // Sub-contents
                comp.contents?.forEach(sub => {
                    const subZoneTotal = zoneTotals.get(sub.name) || 0;
                    tableBody.push([{ 
                        content: `  - ${sub.name}`, 
                        styles: { fontSize: 9, textColor: [80, 80, 80] } 
                    }, sub.quantity * comp.quantity, subZoneTotal, '']);
                });
            });
        });

        // Generate Table
        autoTable(doc, {
            head: [['Materiale', 'Qta', 'Totale Zona', 'Check']],
            body: tableBody,
            startY: 25, 
            margin: { top: 25 }, // Critical: reserves space for header on ALL pages
            theme: 'grid',
            headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
            styles: { fontSize: 10, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
            columnStyles: { 
                0: { cellWidth: 'auto' }, 
                1: { cellWidth: 20, halign: 'center' }, 
                2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
                3: { cellWidth: 20 }
            },
            didDrawPage: (data) => {
                // Use the document's global page number
                printHeader(zone.name, doc.internal.getCurrentPageInfo().pageNumber);
            }
        });
    });
    
    // Notes page
    if (activeList.notes) {
        doc.addPage();
        printHeader("Note Generali", doc.internal.getCurrentPageInfo().pageNumber);
        doc.setFontSize(14);
        doc.text("Note Evento", 14, 30);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(activeList.notes, 14, 40);
    }

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
    doc.save(`${safeName}_${year}-${month}-${day}_${hours}-${minutes}.pdf`);
  };

  const exportTotalsPDF = () => {
    if (!activeList || !activeList.zones) return;
    
    const doc = new jsPDF();
    
    const printHeader = (title: string, pageNumber: number) => {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`${activeList.eventName.toUpperCase()}  |  RECAP TOTALI MATERIALE`, 14, 10);
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.text(`Pagina ${pageNumber}`, pageWidth - 14, 10, { align: 'right' });
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text(title.toUpperCase(), 14, 16);
    };

    activeList.zones.forEach((zone, index) => {
        if (index > 0) doc.addPage();
        
        const zoneTotals = calculateZoneTotals(zone);
        const sortedTotals = Array.from(zoneTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        const tableBody = sortedTotals.map(([name, qty]) => [name, qty, '']);

        autoTable(doc, {
            head: [['Materiale (Consolidato)', 'Quantità Totale Zona', 'Check']],
            body: tableBody,
            startY: 25,
            margin: { top: 25 },
            theme: 'grid',
            headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
            styles: { fontSize: 10, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
            columnStyles: { 
                0: { cellWidth: 'auto' }, 
                1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
                2: { cellWidth: 20 }
            },
            didDrawPage: (data) => {
                printHeader(`TOTALI ZONA: ${zone.name}`, doc.internal.getCurrentPageInfo().pageNumber);
            }
        });
    });

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
    doc.save(`TOTALI_${safeName}_${day}-${month}-${now.getFullYear()}.pdf`);
  };

  const exportCSV = () => {
    if (!activeList || !activeList.zones) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Zona,Sezione,Tipo,Nome,Quantità,Totale Zona,Note,Contenuto Kit/Accessori\n";
    
    activeList.zones.forEach(z => {
        const zoneTotals = calculateZoneTotals(z);
        
        z.sections.forEach(s => {
            s.components.forEach(c => {
                const note = c.notes ? c.notes.replace(/"/g, '""') : '';
                const typeLabel = c.type === 'kit' ? 'KIT' : 'Singolo';
                const zoneTotal = zoneTotals.get(c.name) || 0;
                
                csvContent += `"${z.name}","${s.name}",${typeLabel},"${c.name}",${c.quantity},${zoneTotal},"${note}",""\n`;
                
                c.contents?.forEach(sub => {
                    const subZoneTotal = zoneTotals.get(sub.name) || 0;
                    csvContent += `"${z.name}","${s.name}",${c.type === 'kit'?'Parte Kit':'Accessorio'},"${sub.name}",${sub.quantity*c.quantity},${subZoneTotal},"","Appartiene a: ${c.name}"\n`;
                });
            });
        });
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
    link.setAttribute("download", `${safeName}_${year}-${month}-${day}_${hours}-${minutes}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // --- VIEW RENDER ---
  if (viewMode === 'list') {
      // (Render List Grid - same as before essentially)
      return (
      <div className="h-full flex flex-col p-6 bg-slate-950">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Liste Eventi</h1>
          <p className="text-slate-400">Gestisci le tue liste di materiali per eventi</p>
        </div>
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input placeholder="Cerca evento..." className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg outline-none focus:border-emerald-500" value={listFilter} onChange={(e) => setListFilter(e.target.value)} />
          </div>
          <button onClick={() => { handleCreateList(); setViewMode('edit'); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"><Plus size={16} /> Nuovo Evento</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
            {filteredLists.map(list => {
              // Safe access for display
              const z = list.zones || (list.sections ? [{sections: list.sections}] : []);
              const totalItems = z.reduce((acc: number, zone: any) => acc + (zone.sections?.reduce((sAcc:number, s:any) => sAcc + s.components.length, 0)||0), 0);
              return (
                <div key={list.id} onClick={() => handleListSelect(list.id)} className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors cursor-pointer group relative">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-lg text-white group-hover:text-emerald-400 transition-colors truncate pr-16">{list.eventName}</h3>
                    <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleDuplicateList(list, e)} className="p-1.5 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white rounded transition-colors"> <ClipboardCopy size={14} /> </button>
                        <button onClick={(e) => { e.stopPropagation(); setListToDeleteInfo({ id: list.id, name: list.eventName }); }} className="p-1.5 bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white rounded transition-colors"> <Trash2 size={14} /> </button>
                    </div>
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded shrink-0">{totalItems} elementi</span>
                  </div>
                  <div className="space-y-2 text-sm text-slate-400">
                    <div className="flex items-center gap-2"><MapPin size={14} /><span>{list.location || '-'}</span></div>
                    <div className="flex items-center gap-2"><Calendar size={14} /><span>{list.eventDate || '-'}</span></div>
                  </div>
                  <div className="mt-4 text-xs text-slate-600">Clicca per modificare</div>
                </div>
            )})
            }
        </div>
        <ConfirmationModal isOpen={!!listToDeleteInfo} onClose={() => setListToDeleteInfo(null)} onConfirm={confirmDeleteList} title="Elimina Evento" message={`Eliminare "${listToDeleteInfo?.name}"?`} />
      </div>
    );
  }

  // BUILDER VIEW
  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <div className="flex-1 flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
        
        {/* TOP HEADER */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button onClick={handleBackToList} className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg transition-colors"><ArrowLeftRight size={16} className="rotate-180" /></button>
            <div className="flex flex-col flex-1">
               <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Modifica Evento</span>
               <div className="flex items-center gap-2"><span className="text-white font-medium">{activeList?.eventName}</span></div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateList} className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium transition-colors"><Plus size={16} /> Nuovo</button>
          </div>
        </div>

        {activeList && (
          <div className="p-3 bg-slate-800 border-b border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* List Details Inputs */}
             <input placeholder="Nome Evento" className="bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white" value={activeList.eventName} onChange={e => updateActiveList({ eventName: e.target.value })} />
             <input placeholder="Location" className="bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white" value={activeList.location} onChange={e => updateActiveList({ location: e.target.value })} />
             <DatePicker selected={activeList.eventDate ? new Date(activeList.eventDate) : null} onChange={(date) => updateActiveList({ eventDate: date ? date.toISOString().split('T')[0] : '' })} dateFormat="dd/MM/yyyy" className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-sm text-white" />
          </div>
        )}

        {/* --- ZONE TABS --- */}
        {activeList && zones.length > 0 && (
            <div className="flex items-center gap-1 px-4 pt-4 border-b border-slate-800 bg-slate-950/50 overflow-x-auto">
                {zones.map(z => (
                    <div 
                        key={z.id}
                        onClick={() => setActiveZoneId(z.id)}
                        className={`px-4 py-2 rounded-t-lg text-sm font-bold transition-colors cursor-pointer flex items-center gap-2 border-t border-x ${activeZoneId === z.id ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-950 text-slate-500 border-transparent hover:text-slate-300'}`}
                    >
                        {z.name}
                        {activeZoneId === z.id && (
                            <div className="flex items-center gap-1 ml-2 opacity-50 hover:opacity-100">
                                <Edit2 size={12} onClick={(e) => { e.stopPropagation(); openMgmtModal('zone', 'rename', z.id, z.name); }} className="hover:text-emerald-400" />
                                {zones.length > 1 && <Trash2 size={12} className="hover:text-rose-500" onClick={(e) => { e.stopPropagation(); setZoneToDelete(z.id); }} />}
                            </div>
                        )}
                    </div>
                ))}
                <button onClick={() => openMgmtModal('zone', 'create')} className="ml-2 p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-400"><Plus size={16} /></button>
            </div>
        )}

        {/* --- SECTION TABS (Inside Active Zone) --- */}
        {activeZone && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700 bg-slate-900 overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSectionId(s.id)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 group ${activeSectionId === s.id ? 'bg-slate-800 text-white border-t border-x border-slate-700' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              {s.name}
              <span className="bg-slate-950 px-1.5 py-0.5 rounded-full text-xs text-slate-500">{s.components.length}</span>
              {activeSectionId === s.id && (
                  <div className="flex items-center gap-1 ml-1">
                      <Edit2 size={12} onClick={(e) => { e.stopPropagation(); openMgmtModal('section', 'rename', s.id, s.name); }} className="hover:text-emerald-400" />
                      <Trash2 size={12} onClick={(e) => { e.stopPropagation(); setSectionToDelete(s.id); }} className="hover:text-rose-500" />
                  </div>
              )}
            </button>
          ))}
          <button onClick={() => openMgmtModal('section', 'create')} className="p-2 text-emerald-500 hover:bg-emerald-900/30 rounded-lg hover:text-emerald-400 transition-colors"><Plus size={18} /></button>
        </div>
        )}

        {/* --- TOOLBAR / SEARCH --- */}
        {activeSection && (
            <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-center gap-3">
                <div className="flex gap-2 w-full items-center">
                    <div 
                        className="relative flex-1 min-w-[200px]"
                        onMouseEnter={() => setIsPickerHovered(true)}
                        onMouseLeave={() => setIsPickerHovered(false)}
                    >
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                            ref={pickerInputRef}
                            placeholder={`Cerca materiale per ${activeSection.name}...`}
                            className="w-full bg-slate-950 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm outline-none focus:border-emerald-500"
                            value={pickerSearch}
                            onChange={e => setPickerSearch(e.target.value)}
                            onFocus={() => setIsPickerHovered(true)} 
                        />
                        {/* PICKER DROPDOWN */}
                        {pickerSearch && isPickerHovered && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                            
                            {/* Kit matches */}
                            {filteredPickerKits.length > 0 && (
                                <div className="px-4 py-1.5 bg-slate-800 text-[10px] font-bold text-purple-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-700">
                                    Kit & Set ({filteredPickerKits.length})
                                </div>
                            )}
                            {filteredPickerKits.map(kit => {
                              // Check qty in ENTIRE ZONE
                              const qtyInZone = activeZone?.sections.reduce((total, section) => 
                                total + section.components
                                  .filter(c => c.type === 'kit' && c.referenceId === kit.id)
                                  .reduce((subtotal, comp) => subtotal + comp.quantity, 0),
                                0
                              ) || 0;
                              
                              return (
                              <button key={kit.id} onClick={() => addToSection(kit, 'kit')} className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group">
                                <div>
                                    <div className="text-sm text-white flex items-center gap-2">
                                        <PackageIcon size={14} className="text-purple-400" />
                                        {kit.name}
                                        {qtyInZone > 0 && (
                                            <span className="text-[10px] bg-purple-950 text-purple-400 border border-purple-900 px-1.5 rounded font-bold">
                                                x{qtyInZone}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 pl-6">{kit.items.length} componenti</div>
                                </div>
                                <Plus size={16} className="text-slate-600 group-hover:text-emerald-500 transition-colors"/>
                              </button>
                            )})}

                            {/* Inventory matches */}
                            {filteredPickerItems.length > 0 && (
                                <div className="px-4 py-1.5 bg-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-700">
                                    Materiale Singolo
                                </div>
                            )}
                            {filteredPickerItems.slice(0, 50).map(item => {
                              // Check qty in ENTIRE ZONE
                              const qtyInZone = activeZone?.sections.reduce((total, section) => 
                                total + section.components
                                  .filter(c => c.type === 'item' && c.referenceId === item.id)
                                  .reduce((subtotal, comp) => subtotal + comp.quantity, 0),
                                0
                              ) || 0;
                              
                              return (
                              <button key={item.id} onClick={() => addToSection(item, 'item')} className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group">
                                <div>
                                    <div className="text-sm text-white flex items-center gap-2">
                                        {item.name}
                                        {qtyInZone > 0 && (
                                            <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 rounded font-bold">
                                                x{qtyInZone}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500">{item.category}</div>
                                </div>
                                <Plus size={16} className="text-slate-600 group-hover:text-emerald-500 transition-colors"/>
                              </button>
                            )})}
                            
                            {/* Create new */}
                            {filteredPickerItems.length === 0 && filteredPickerKits.length === 0 && <button onClick={() => setIsNewItemModalOpen(true)} className="w-full text-left px-4 py-3 hover:bg-slate-800 text-emerald-500 flex gap-2"><Plus/> Crea "{pickerSearch}"</button>}
                          </div>
                        )}
                    </div>
                    
                    <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="bg-slate-950 border border-slate-700 text-white px-2 py-2 rounded-lg text-sm w-32">
                        <option value="All">Tutte</option>
                        {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    
                    <button onClick={() => setIsNewItemModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg"><Plus size={16} /></button>

                    {/* INLINE BULK ACTIONS */}
                    {(selectedIds.size > 0 || clipboard.length > 0) && (
                        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-700 animate-in fade-in">
                             <div className="flex flex-col gap-0.5 mr-2">
                                <button onClick={selectAllInSection} className="text-[10px] uppercase font-bold text-slate-500 hover:text-white leading-none">Tutti</button>
                                <button onClick={deselectAll} className="text-[10px] uppercase font-bold text-slate-500 hover:text-white leading-none">Nessuno</button>
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
            </div>
        )}

        {/* --- MAIN LIST CONTENT --- */}
        <div className="flex-1 overflow-y-auto bg-slate-950/30">
          {!activeZone ? <div className="text-center py-20 text-slate-500">Crea una Zona per iniziare</div> :
           !activeSection ? <div className="text-center py-20 text-slate-500">Seleziona una Sezione</div> :
           activeSection.components.length === 0 ? <div className="text-center py-20 text-slate-600">Sezione vuota</div> : (
            <div className="space-y-2 p-4">
              {activeSection.components.map((comp, idx) => {
                  const isSelected = selectedIds.has(comp.uniqueId);
                  const isReplacing = replacingComponentId === comp.uniqueId;
                  
                  // Check existence
                  const isMissing = comp.type === 'item' 
                      ? !inventory.some(i => i.id === comp.referenceId)
                      : !kits.some(k => k.id === comp.referenceId);

                  console.log(`Checking item ${comp.name} (Ref: ${comp.referenceId}): isMissing=${isMissing}`);

                  return (
                      <div key={comp.uniqueId} 
                           draggable onDragStart={(e) => handleDragStart(e, activeSection.id, idx, comp.uniqueId)} onDragEnter={(e) => handleDragEnter(e, activeSection.id, idx)} onDragEnd={handleDragEnd} onDragOver={e => e.preventDefault()}
                           className={`group relative p-2 rounded-lg border transition-all ${isReplacing ? 'border-amber-500 bg-amber-900/10 ring-1 ring-amber-500' : isSelected ? 'bg-blue-900/20 border-blue-500/50' : comp.type === 'kit' ? 'bg-purple-900/10 border-purple-900/30 hover:border-purple-500/30' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                          <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2 overflow-hidden">
                                  <button onClick={(e) => { e.stopPropagation(); toggleSelection(comp.uniqueId); }} className={`text-slate-500 p-1 ${isSelected ? 'text-blue-500' : ''}`}>{isSelected ? <CheckSquare size={18}/> : <Square size={18}/>}</button>
                                  {comp.type === 'kit' ? <PackageIcon size={18} className="text-purple-400"/> : <Box size={18} className="text-slate-400"/>}
                                  <div className="flex items-center gap-2 min-w-0">
                                      {isMissing && (
                                          <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                alert("Questo oggetto è stato cancellato dall'inventario, devi sostituirlo con un oggetto esistente.");
                                            }}
                                            title="Oggetto cancellato dall'inventario"
                                            className="text-rose-500 hover:text-rose-400 shrink-0"
                                          >
                                              <AlertTriangle size={16} />
                                          </button>
                                      )}
                                      <div className="min-w-0">
                                          <div className="font-medium text-slate-200 text-sm truncate">{comp.name} {comp.type === 'kit' && <span className="ml-2 text-[10px] bg-purple-900 text-purple-200 px-1 rounded align-middle">KIT</span>}</div>
                                          <div className="text-xs text-slate-500">{comp.category}</div>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                   {/* Drag Handle - Only show if not filtering */}
                                   {!listSearch && (
                                   <div className="p-1.5 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300 mr-1" title="Trascina per spostare">
                                       <GripVertical size={16} />
                                   </div>
                                   )}

                                   {/* Replace Button */}
                                   <button onClick={() => setReplacingComponentId(comp.uniqueId)} className={`p-1.5 rounded ${isReplacing ? 'text-amber-500 bg-amber-900/30' : 'text-slate-500 hover:bg-slate-700 hover:text-white'}`} title="Sostituisci Oggetto">
                                      <ArrowLeftRight size={14} />
                                   </button>

                                   <button onClick={() => { const s = new Set(openNoteIds); s.has(comp.uniqueId)?s.delete(comp.uniqueId):s.add(comp.uniqueId); setOpenNoteIds(s); }} className={`p-1.5 rounded ${comp.notes ? 'text-yellow-400' : 'text-slate-500 hover:text-white'}`} title="Aggiungi/Modifica Nota">
                                      <StickyNote size={14} />
                                   </button>
                                   <input 
                                       ref={el => { qtyInputRefs.current[comp.uniqueId] = el }} 
                                       type="number" 
                                       min="1" 
                                       className="w-12 h-7 bg-slate-900 border border-slate-700 rounded px-1 text-center text-white text-sm focus:border-blue-500 outline-none" 
                                       value={comp.quantity} 
                                       onChange={(e) => updateComponentQty(comp.uniqueId, Number(e.target.value))}
                                       onKeyDown={(e) => {
                                           if (e.key === 'Enter') {
                                               pickerInputRef.current?.focus();
                                               pickerInputRef.current?.select();
                                           }
                                       }}
                                   />
                                   <button onClick={() => removeComponent(comp.uniqueId)} className="p-1.5 text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={14}/></button>
                              </div>
                          </div>
                          {(openNoteIds.has(comp.uniqueId) || comp.notes) && (
                              <div className="mt-1.5 pl-8 pr-16">
                                  <input type="text" placeholder="Aggiungi una nota..." className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-300" value={comp.notes||''} onChange={(e) => updateComponentNote(comp.uniqueId, e.target.value)} />
                              </div>
                          )}

                          {/* Contents */}
                          {comp.contents && comp.contents.length > 0 && (
                            <div className="mt-2 ml-7 pl-3 border-l-2 border-slate-700 space-y-0.5">
                                {comp.contents.map((c, i) => {
                                    // Check accessory existence
                                    const isAccMissing = c.itemId ? !inventory.some(inv => inv.id === c.itemId) : false;
                                    
                                    return (
                                        <div key={i} className="text-[10px] text-slate-400 flex justify-between w-full max-w-md leading-tight group/acc">
                                            <span className="flex items-center gap-1 min-w-0">
                                                {isAccMissing && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            alert("Questo accessorio è stato cancellato dall'inventario.");
                                                        }}
                                                        className="text-rose-500 hover:text-rose-400 shrink-0"
                                                        title="Accessorio eliminato dall'inventario"
                                                    >
                                                        <AlertTriangle size={10} />
                                                    </button>
                                                )}
                                                <span className={`${isAccMissing ? 'text-rose-900 line-through decoration-rose-500/50' : ''} truncate`}>{c.name}</span>
                                            </span>
                                            <span className="shrink-0 pl-2">x{c.quantity * comp.quantity}</span>
                                        </div>
                                    );
                                })}
                            </div>
                          )}
                      </div>
                  );
              })}
            </div>
           )
          }
        </div>

        {/* FOOTER */}
        {activeList && (
          <div className="p-4 border-t border-slate-700 bg-slate-800 flex flex-col md:flex-row gap-4 justify-between items-center z-10">
             <div className="w-full md:w-1/2"><input placeholder="Note per il magazzino..." className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white" value={activeList.notes} onChange={e => updateActiveList({ notes: e.target.value })} /></div>
             <div className="flex gap-2">
                 <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium"><FileDown size={16} /> CSV</button>
                 <button onClick={exportTotalsPDF} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg shadow-blue-900/20 font-medium"><FileDown size={16} /> PDF TOTALI</button>
                 <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow-lg shadow-emerald-900/20 font-medium"><FileDown size={16} /> PDF</button>
             </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      <Modal isOpen={mgmtModal.isOpen} onClose={() => setMgmtModal(p => ({...p, isOpen:false}))} title={mgmtModal.type==='create' ? `Nuova ${mgmtModal.target==='zone'?'Zona':'Sezione'}` : `Rinomina ${mgmtModal.target==='zone'?'Zona':'Sezione'}`}>
         <div className="space-y-4">
            <input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" value={mgmtModal.name} onChange={e => setMgmtModal(p => ({...p, name: e.target.value}))} autoFocus onKeyDown={e => e.key==='Enter' && handleMgmtModalSave()} />
            <div className="flex justify-end gap-2"><button onClick={() => setMgmtModal(p => ({...p, isOpen:false}))} className="px-4 py-2 text-slate-400">Annulla</button><button onClick={handleMgmtModalSave} className="px-6 py-2 bg-blue-600 text-white rounded">Salva</button></div>
         </div>
      </Modal>
      
      <ConfirmationModal isOpen={!!sectionToDelete} onClose={() => setSectionToDelete(null)} onConfirm={confirmRemoveSection} title="Elimina Sezione" message="Confermi l'eliminazione della sezione?" />
      <ConfirmationModal isOpen={!!zoneToDelete} onClose={() => setZoneToDelete(null)} onConfirm={confirmRemoveZone} title="Elimina Zona" message="Confermi l'eliminazione della ZONA e di tutto il suo contenuto?" />
      
      <ItemFormModal isOpen={isNewItemModalOpen} onClose={() => setIsNewItemModalOpen(false)} onSave={handleCreateNewItem} title="Nuovo Materiale" inventory={inventory} onCreateAccessory={handleCreateInventoryItemOnly} initialName={pickerSearch} />
      
      {/* Paste Confirm */}
      <Modal isOpen={showPasteConfirm} onClose={() => setShowPasteConfirm(false)} title="Incolla di nuovo">
        <div className="space-y-4"><p className="text-slate-300">Vuoi incollare di nuovo?</p><div className="flex justify-end gap-2"><button onClick={() => setShowPasteConfirm(false)} className="px-4 py-2 text-slate-400">Annulla</button><button onClick={() => { performPaste(); setShowPasteConfirm(false); }} className="bg-emerald-600 text-white px-4 py-2 rounded">Si</button></div></div>
      </Modal>

      {/* Replacement Banner */}
      {replacingComponentId && <div className="absolute inset-x-0 top-0 z-20 bg-amber-900/95 border-b border-amber-500/50 p-4 shadow-xl text-center text-amber-100 font-bold"><ArrowLeftRight className="inline mr-2"/> Modalità Sostituzione <button onClick={() => setReplacingComponentId(null)} className="ml-4 underline text-sm font-normal">Annulla</button></div>}
    </div>
  );
};