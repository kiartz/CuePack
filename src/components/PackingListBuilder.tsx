import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Trash2, FileDown, Settings2, Box, Package as PackageIcon, Calendar, MapPin, ClipboardList, StickyNote, Edit2, CheckSquare, Square, Scissors, Clipboard, ClipboardCopy, X, ArrowLeftRight, GripVertical, AlertTriangle, Lightbulb, List, CheckCircle } from 'lucide-react';
import { InventoryItem, Kit, PackingList, ListSection, ListComponent, Category, ListZone, Reminder } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import { RemindersModal } from './RemindersModal';
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
}) => { // --- HELPERS ---
  const createDefaultSections = (): ListSection[] => [
    { id: crypto.randomUUID(), name: 'Audio', components: [] },
    { id: crypto.randomUUID(), name: 'Luci', components: [] },
    { id: crypto.randomUUID(), name: 'Video', components: [] },
    { id: crypto.randomUUID(), name: 'Strutture', components: [] },
    { id: crypto.randomUUID(), name: 'Elettrico', components: [] },
    { id: crypto.randomUUID(), name: 'Regia', components: [] },
    { id: crypto.randomUUID(), name: 'Attrezzi', components: [] },
  ];

  // --- STATE ---
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

  // REMINDERS STATE
  const [activeRemindersListId, setActiveRemindersListId] = useState<string | null>(null);
  const [activeKitRemindersId, setActiveKitRemindersId] = useState<string | null>(null);

  // Note Toggle State
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set());
  
  // Deletion States
  const [isDeleteListModalOpen, setIsDeleteListModalOpen] = useState(false);
  const [listToDeleteInfo, setListToDeleteInfo] = useState<{id: string, name: string} | null>(null);
  const [listToDuplicate, setListToDuplicate] = useState<PackingList | null>(null);
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

  // Auto-focus Refs
  const qtyInputRefs = useRef<{ [uniqueId: string]: HTMLInputElement | null }>({});
  const [lastAddedComponentId, setLastAddedComponentId] = useState<string | null>(null);

  // HIGHLIGHT & WARNING STATE
  const [highlightedItemName, setHighlightedItemName] = useState<string | null>(null);

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

  // --- DERIVED STATE & MIGRATION ON THE FLY ---
  const activeList = useMemo(() => {
    const rawList = lists.find(l => l.id === activeListId);
    if (!rawList) return undefined;

    // Backward Compatibility / Migration Logic
    if (!rawList.zones || rawList.zones.length === 0) {
        const defaultSections = rawList.sections && rawList.sections.length > 0 
            ? rawList.sections 
            : createDefaultSections();
            
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

  // --- HIGHLIGHT & WARNING LOGIC (Placed here to access activeZone) ---
  const activeZoneStats = useMemo(() => {
    if (!activeZone) return null;
    const loose = new Set<string>();
    const inKits = new Map<string, Set<string>>(); // ItemName -> Set of KitNames containing it

    activeZone.sections.forEach(sec => {
        sec.components.forEach(comp => {
            if (comp.type === 'item') {
                loose.add(comp.name);
            } else if (comp.type === 'kit' && comp.contents) {
                comp.contents.forEach(sub => {
                    if (!inKits.has(sub.name)) inKits.set(sub.name, new Set());
                    inKits.get(sub.name)!.add(comp.name);
                });
            }
        });
    });
    return { loose, inKits };
  }, [activeZone]);

  const getItemWarning = (itemName: string, currentKitName: string) => {
    if (!activeZoneStats) return null;
    const inLoose = activeZoneStats.loose.has(itemName);
    const parentKits = activeZoneStats.inKits.get(itemName);
    // It is in "other" kits if the set has more than 1 parent, OR if it has 1 parent but it's not the current one (edge case)
    const inOtherKits = parentKits && (parentKits.size > 1 || (parentKits.size === 1 && !parentKits.has(currentKitName)));

    if (inOtherKits && inLoose) return "!!!ALTRI IN KIT E SFUSI!!!";
    if (inOtherKits) return "!!!ALTRI IN KIT!!!";
    if (inLoose) return "!!!ALTRI IN SFUSI!!!";
    return null;
  };

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

  // --- AUTO-SYNC KITS & ACCESSORIES ---
  useEffect(() => {
      if (!activeList || activeList.version || !activeList.zones) return;

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

                          // 2. Check Contents (Quantity and Item ID)
                          const masterItems = master.items.sort((a, b) => a.itemId.localeCompare(b.itemId));
                          const currentItems = (comp.contents || [])
                              .map(c => ({ itemId: c.itemId, quantity: c.quantity }))
                              .filter(c => c.itemId) // Ensure we have ID
                              .sort((a, b) => (a.itemId || '').localeCompare(b.itemId || ''));

                          const contentsChanged = JSON.stringify(masterItems) !== JSON.stringify(currentItems);

                          if (nameChanged || contentsChanged) {
                              hasChanges = true;
                              console.log(`[Sync] Updating Kit: ${comp.name} -> ${master.name} (Contents Changed: ${contentsChanged})`);
                              
                              // Re-generate contents from master to get fresh names and categories
                              const newContents = master.items.map(ki => {
                                  const inv = inventory.find(i => i.id === ki.itemId);
                                  return { 
                                      itemId: ki.itemId, 
                                      name: inv?.name || '?', 
                                      quantity: ki.quantity, 
                                      category: inv?.category || 'Altro' 
                                  };
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
                              .sort((a, b) => a.itemId.localeCompare(b.itemId));
                          
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
                                      prepNote: acc.prepNote
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
  // Event Modal State
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventFormData, setEventFormData] = useState<Partial<PackingList>>({});

  const openEventModal = (list?: PackingList, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (list) {
          setEventFormData({...list});
      } else {
          setEventFormData({
              eventName: '',
              location: '',
              eventDate: '',
              setupDate: '',
              creationDate: new Date().toISOString(),
              zones: [{
                  id: crypto.randomUUID(),
                  name: 'Zona Principale',
                  sections: createDefaultSections()
              }]
          });
      }
      setIsEventModalOpen(true);
  };

  const handleSaveEvent = async () => {
      if (!eventFormData.eventName) return;
      
      const listToSave = {
          ...eventFormData,
          id: eventFormData.id || crypto.randomUUID(),
          creationDate: eventFormData.creationDate || new Date().toISOString()
      } as PackingList;

      await addOrUpdateItem(COLL_LISTS, listToSave);
      setIsEventModalOpen(false);
      
      // If new list, switch to it
      if (!eventFormData.id) {
           setActiveListId(listToSave.id);
           setViewMode('edit');
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
      ...listToDuplicate,
      id: crypto.randomUUID(),
      eventName: `${listToDuplicate.eventName} (Copia)`,
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
    setListToDuplicate(null);
  };

  const handleDuplicateList = (list: PackingList, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // --- REMINDERS LOGIC ---
  const remindersList = useMemo(() => {
    return lists.find(l => l.id === activeRemindersListId);
  }, [lists, activeRemindersListId]);

  const handleUpdateReminders = async (newReminders: Reminder[]) => {
    if (!remindersList) return;
    await addOrUpdateItem(COLL_LISTS, { ...remindersList, reminders: newReminders });
  };
  
  // --- VERSIONING & COMPLETION ---
  const handleCompleteList = async () => {
      if (!activeList || !activeList.zones) return;
      
      let newVersion = '1.0';
      if (activeList.version) {
          const parts = activeList.version.split('.');
          const major = parseInt(parts[0]);
          const minor = parseInt(parts[1]);
          // Increment by 0.1
          newVersion = `${major}.${minor + 1}`;
      }

      // 1. Calculate Deleted Items
      const previousSnapshot = activeList.snapshot || [];
      const currentZones = activeList.zones;
      const newDeletedItems = [...(activeList.deletedItems || [])];

      previousSnapshot.forEach(prevZone => {
          prevZone.sections.forEach(prevSection => {
              prevSection.components.forEach(prevComp => {
                  // Find this specific component (by uniqueId) in current zones
                  let found = false;
                  currentZones.forEach(currZone => {
                      currZone.sections.forEach(currSection => {
                          if (currSection.components.some(c => c.uniqueId === prevComp.uniqueId)) {
                              found = true;
                          }
                      });
                  });

                  if (!found) {
                      // It was deleted! Add to deletedItems if not already there
                      if (!newDeletedItems.some(d => d.originalComponent.uniqueId === prevComp.uniqueId)) {
                          newDeletedItems.push({
                              originalComponent: prevComp,
                              zoneName: prevZone.name,
                              sectionName: prevSection.name,
                              deletedAt: new Date().toISOString()
                          });
                      }
                  }
              });
          });
      });

      // 2. Identify Changes & Update current components
      const updatedZones = currentZones.map(zone => ({
          ...zone,
          sections: zone.sections.map(section => ({
              ...section,
              components: section.components.map(comp => {
                  // Find previous version of this component
                  let prevComp: ListComponent | undefined;
                  previousSnapshot.forEach(pz => {
                      pz.sections.forEach(ps => {
                          const match = ps.components.find(c => c.uniqueId === comp.uniqueId);
                          if (match) prevComp = match;
                      });
                  });

                  if (prevComp) {
                      // Compare relevant fields (Quantity, Notes, etc.)
                      if (prevComp.quantity !== comp.quantity) {
                          // Reset contents checkboxes if quantity changed
                          const resetContents = comp.contents?.map(content => ({
                              ...content,
                              warehouseState: {
                                  ...content.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                                  inDistinta: false,
                                  loaded: false
                              }
                          }));

                          return {
                              ...comp,
                              contents: resetContents,
                              warehouseState: {
                                  ...comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                                  // Reset checks if quantity changed
                                  inDistinta: false,
                                  loaded: false,
                                  changeLog: {
                                      previousQuantity: prevComp.quantity,
                                      changedAt: new Date().toISOString()
                                  }
                              }
                          };
                      }
                  } else if (activeList.version) {
                      // New Item added after version 1.0
                      return {
                          ...comp,
                          warehouseState: {
                              ...comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                              inDistinta: false,
                              loaded: false,
                              changeLog: {
                                  previousQuantity: 0,
                                  changedAt: new Date().toISOString()
                              }
                          }
                      };
                  }
                  return comp;
              })
          }))
      }));

      // 3. Save everything
      await updateActiveList({
          version: newVersion,
          snapshot: updatedZones, // Snapshot is the state NOW
          zones: updatedZones,    // Zones updated with changeLogs
          deletedItems: newDeletedItems
      });
      
      alert(`Lista completata! Versione aggiornata a ${newVersion}`);
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
        const pageWidth = doc.internal.pageSize.getWidth();
        
        // Line 1: Event Name (Big & Bold)
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        const eventName = activeList.eventName.toUpperCase();
        doc.text(eventName, 14, 12);

        // Version Info
        const versionText = activeList.version ? `v${activeList.version}` : 'LISTA NON PRONTA';
        const titleWidth = doc.getTextWidth(eventName);
        doc.setFontSize(10);
        if (!activeList.version) doc.setTextColor(220, 0, 0);
        else doc.setTextColor(100);
        doc.text(versionText, 14 + titleWidth + 3, 12);
        
        // Top Right: Date & Page
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`${activeList.eventDate}  |  Pagina ${pageNumber}`, pageWidth - 14, 12, { align: 'right' });

        // Line 2: Zone Info (Smaller than event name, Bold)
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(`ZONA: ${zoneName.toUpperCase()}`, 14, 20);
    };

    activeList.zones.forEach((zone, index) => {
        if (index > 0) doc.addPage(); // Explicit new page for new zone
        
        let currentY = 25;
        if (zone.notes) {
            doc.setFontSize(10);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(50);
            
            // Handle multiline text
            const splitNotes = doc.splitTextToSize(`NOTE: ${zone.notes}`, 180);
            doc.text(splitNotes, 14, currentY);
            
            currentY += (splitNotes.length * 5) + 5;
        }

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
                        styles: { fontSize: 10, textColor: [80, 80, 80] } 
                    }, sub.quantity * comp.quantity, subZoneTotal, '']);
                });
            });
        });

        // Generate Table
        autoTable(doc, {
            head: [['Materiale', 'Qta', 'Totale Zona', 'Check']],
            body: tableBody,
            startY: currentY, 
            margin: { top: 25 }, // Critical: reserves space for header on ALL pages
            theme: 'grid',
            headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
            styles: { fontSize: 11, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
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
    
    const printHeader = (zoneName: string, pageNumber: number) => {
        const pageWidth = doc.internal.pageSize.getWidth();
        
        // Line 1: Event Name (Big & Bold)
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        const eventName = activeList.eventName.toUpperCase();
        doc.text(eventName, 14, 12);

        // Version Info
        const versionText = activeList.version ? `v${activeList.version}` : 'LISTA NON PRONTA';
        const titleWidth = doc.getTextWidth(eventName);
        doc.setFontSize(10);
        if (!activeList.version) doc.setTextColor(220, 0, 0);
        else doc.setTextColor(100);
        doc.text(versionText, 14 + titleWidth + 3, 12);
        
        // Top Right: Page
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Pagina ${pageNumber}`, pageWidth - 14, 12, { align: 'right' });

        // Line 2: Recap Materiale (Bold, smaller than title)
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80);
        doc.text("RECAP TOTALI MATERIALE", 14, 18);

        // Line 3: Zone (Smaller than event name, Bold)
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(`ZONA: ${zoneName.toUpperCase()}`, 14, 26);
    };

    activeList.zones.forEach((zone, index) => {
        if (index > 0) doc.addPage();
        
        // --- HYBRID NESTED LOGIC ---
        
        // Map for Section A: Kit & Assembled Machines (Parent -> Children)
        // Key: Item Name -> Value: { totalQty: number, children: Map<childName, { qty: number, prepNote: string }> }
        const complexItemsMap = new Map<string, { totalQty: number, children: Map<string, { qty: number, prepNote: string }> }>();

        // Map for Section B: Bulk/Loose Items
        // Key: Item Name -> Value: number (Quantity)
        const simpleItemsMap = new Map<string, number>();

        zone.sections.forEach(section => {
            section.components.forEach(comp => {
                const isComplex = comp.type === 'kit' || (comp.contents && comp.contents.length > 0);

                if (isComplex) {
                    // --- SECTION A AGGREGATION ---
                    const displayName = comp.type === 'kit' ? `KIT-${comp.name}` : comp.name;
                    
                    if (!complexItemsMap.has(displayName)) {
                        complexItemsMap.set(displayName, { totalQty: 0, children: new Map() });
                    }
                    const parent = complexItemsMap.get(displayName)!;
                    parent.totalQty += comp.quantity;

                    // Aggregate Children
                    comp.contents?.forEach(sub => {
                        if (!parent.children.has(sub.name)) {
                            parent.children.set(sub.name, { qty: 0, prepNote: sub.prepNote || '' });
                        }
                        const child = parent.children.get(sub.name)!;
                        child.qty += (sub.quantity * comp.quantity);
                        // Update note if present (last one wins or we could concat, simple overwrite for now)
                        if (sub.prepNote) child.prepNote = sub.prepNote;
                    });

                } else {
                    // --- SECTION B AGGREGATION ---
                    const currentQty = simpleItemsMap.get(comp.name) || 0;
                    simpleItemsMap.set(comp.name, currentQty + comp.quantity);
                }
            });
        });

        // --- MAP ITEMS TO PARENTS (To detect duplicates across kits/accessories) ---
        // Key: Child Item Name -> Value: Set of Parent Names containing it
        const itemKitParents = new Map<string, Set<string>>();
        const itemAccessoryParents = new Map<string, Set<string>>();
        
        complexItemsMap.forEach((data, parentName) => {
            const isKit = parentName.startsWith('KIT-');
            data.children.forEach((_, childName) => {
                const mapToUse = isKit ? itemKitParents : itemAccessoryParents;
                if (!mapToUse.has(childName)) {
                    mapToUse.set(childName, new Set());
                }
                mapToUse.get(childName)!.add(parentName);
            });
        });

        const tableBody: any[] = [];

        // --- RENDER SECTION A: KITS & ASSEMBLED ---
        const sortedComplex = Array.from(complexItemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        if (sortedComplex.length > 0) {
            tableBody.push([{ 
                content: 'KIT & MACCHINE (Assemblati)', 
                colSpan: 3,
                styles: { fontStyle: 'bold', fillColor: [220, 220, 240], textColor: [0, 0, 50], halign: 'left', fontSize: 10 } 
            }]);

            sortedComplex.forEach(([displayName, data]) => {
                // Check if Parent exists in Loose items
                // Note: displayName includes "KIT-" prefix for kits, but loose map uses raw name.
                // We need to strip prefix for check if it's a kit, or use name if it's a machine.
                const rawName = displayName.startsWith('KIT-') ? displayName.replace('KIT-', '') : displayName;
                const isParentInLoose = simpleItemsMap.has(rawName);
                
                // Parent Row
                tableBody.push([{ 
                    content: displayName, 
                    styles: { 
                        fontStyle: 'bold', // Keeping structural bold for Parent
                        textColor: [0, 0, 0] 
                    },
                    _warning: isParentInLoose ? "!!!ALTRI IN SFUSI!!!" : null
                }, data.totalQty, '']);

                // Children Rows (Indented)
                const sortedChildren = Array.from(data.children.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                sortedChildren.forEach(([childName, childData]) => {
                    let childLabel = `  - ${childName}`;
                    const isChildInLoose = simpleItemsMap.has(childName);
                    
                    // Check intersections
                    const kitSet = itemKitParents.get(childName);
                    const accSet = itemAccessoryParents.get(childName);
                    
                    // Logic:
                    // 1. Is it in OTHER kits? (If current context is Kit, count > 1. If context is Machine, count > 0)
                    // 2. Is it in ACCESSORIES? (If context is Machine, count > 1. If context is Kit, count > 0)
                    
                    const isCurrentContextKit = displayName.startsWith('KIT-');
                    
                    const inOtherKits = kitSet && (isCurrentContextKit ? (kitSet.size > 1 || !kitSet.has(displayName)) : kitSet.size > 0);
                    const inAccessories = accSet && (!isCurrentContextKit ? (accSet.size > 1 || !accSet.has(displayName)) : accSet.size > 0);
                    
                    const warningParts: string[] = [];
                    if (inOtherKits) warningParts.push("KIT");
                    if (inAccessories) warningParts.push("ACCESSORI");
                    if (isChildInLoose) warningParts.push("SFUSI");

                    let warningMsg: string | null = null;
                    if (warningParts.length > 0) {
                        const joined = warningParts.length === 1 
                            ? warningParts[0] 
                            : warningParts.slice(0, -1).join(', ') + ' E ' + warningParts.slice(-1);
                        warningMsg = `!!!ALTRI IN ${joined}!!!`;
                    }

                    // Add Prep Note column logic
                    if (childData.prepNote) {
                        childLabel += ` [${childData.prepNote.toUpperCase()}]`;
                    }
                    
                    tableBody.push([{ 
                        content: childLabel, 
                        styles: { 
                            fontSize: 10, 
                            textColor: [80, 80, 80],
                            fontStyle: 'normal'
                        },
                        _warning: warningMsg
                    }, childData.qty, '']);
                });
            });
        }

        // --- RENDER SECTION B: BULK / LOOSE ---
        const sortedSimple = Array.from(simpleItemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        if (sortedSimple.length > 0) {
            // Spacer row if needed
            if (sortedComplex.length > 0) {
                tableBody.push([{ content: '', colSpan: 3, styles: { cellPadding: 1, fillColor: [255, 255, 255] } }]); 
            }

            tableBody.push([{ 
                content: 'MATERIALE SFUSO (Totali Unificati)', 
                colSpan: 3,
                styles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: [50, 50, 50], halign: 'left', fontSize: 10 } 
            }]);

            sortedSimple.forEach(([name, qty]) => {
                tableBody.push([name, qty, '']);
            });
        }

        autoTable(doc, {
            head: [['Materiale', 'Qta', 'Check']],
            body: tableBody,
            startY: 32,
            margin: { top: 32 },
            theme: 'grid',
            headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
            styles: { fontSize: 11, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
            columnStyles: { 
                0: { cellWidth: 'auto' }, 
                1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
                2: { cellWidth: 20 }
            },
            didDrawPage: (data) => {
                printHeader(zone.name, doc.internal.getCurrentPageInfo().pageNumber);
            },
            didDrawCell: (data) => {
                if (data.column.index === 0 && data.cell.raw && (data.cell.raw as any)._warning) {
                    const doc = data.doc;
                    const originalFont = doc.getFont().fontName; // Save font
                    const originalStyle = doc.getFont().fontStyle; 

                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(9); 
                    doc.setTextColor(220, 0, 0); // Make it Red for visibility
                    
                    const warning = (data.cell.raw as any)._warning as string;
                    const textWidth = doc.getTextWidth(warning);
                    
                    // Align right in the cell with padding
                    const xPos = data.cell.x + data.cell.width - textWidth - 2; 
                    const yPos = data.cell.y + (data.cell.height / 2) + 1; // Vertically centered approx

                    doc.text(warning, xPos, yPos);
                    
                    // Restore might not be strictly needed if autotable resets, but good practice
                    doc.setFont(originalFont, originalStyle);
                }
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
        <div className="flex flex-col gap-2 overflow-y-auto">
            {filteredLists.map(list => {
              const z = list.zones || (list.sections ? [{sections: list.sections}] : []);
              const totalItems = z.reduce((acc: number, zone: any) => acc + (zone.sections?.reduce((sAcc:number, s:any) => sAcc + s.components.length, 0)||0), 0);
              return (
                <div key={list.id} onClick={() => handleListSelect(list.id)} className="bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-slate-600 transition-colors cursor-pointer group relative flex flex-col md:flex-row items-center gap-4">
                  
                  {/* Event Main Info */}
                  <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-emerald-900/20 flex items-center justify-center text-emerald-500 shrink-0 font-bold">
                            {list.eventName.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                             <div className="flex items-center gap-2">
                                <h3 className="font-bold text-base text-white group-hover:text-emerald-400 transition-colors truncate">{list.eventName}</h3>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setActiveRemindersListId(list.id); }}
                                  className={`p-1 rounded-full hover:bg-slate-700 transition-colors ${list.reminders?.some(r => !r.isCompleted) ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-300'}`}
                                  title="Note & Promemoria"
                                >
                                  <Lightbulb size={16} className={list.reminders?.some(r => !r.isCompleted) ? "fill-current" : ""} />
                                </button>
                                {list.version && <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">v{list.version}</span>}
                             </div>
                             <div className="flex items-center gap-4 text-xs text-slate-400 mt-0.5">
                                <div className="flex items-center gap-1"><MapPin size={12} /> <span className="truncate max-w-[150px]">{list.location || 'Nessuna location'}</span></div>
                                <div className="flex items-center gap-1"><Calendar size={12} /> <span>{list.eventDate ? new Date(list.eventDate).toLocaleDateString() : 'Nessuna data'}</span></div>
                             </div>
                        </div>
                      </div>
                  </div>

                  {/* Stats & Metadata */}
                  <div className="hidden sm:flex items-center gap-6 text-sm text-slate-500">
                      <div className="flex flex-col items-end">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-600">Elementi</span>
                          <span className="text-slate-300 font-medium">{totalItems}</span>
                      </div>
                      <div className="flex flex-col items-end w-24">
                           <span className="text-[10px] uppercase font-bold tracking-wider text-slate-600">Creato il</span>
                           <span className="text-xs">{new Date(list.creationDate || Date.now()).toLocaleDateString()}</span>
                      </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 border-l border-slate-700 pl-4 ml-2">
                        <button onClick={(e) => handleDuplicateList(list, e)} className="p-2 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white rounded transition-colors" title="Duplica Evento"> <ClipboardCopy size={16} /> </button>
                        <button onClick={(e) => openEventModal(list, e)} className="p-2 bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white rounded transition-colors" title="Modifica Dettagli"> <Edit2 size={16} /> </button>
                        <button onClick={(e) => { e.stopPropagation(); setListToDeleteInfo({ id: list.id, name: list.eventName }); }} className="p-2 bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white rounded transition-colors" title="Elimina Evento"> <Trash2 size={16} /> </button>
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
        />
        
        {/* Event Details Modal (Rendered here too so it opens from list view) */}
        <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title={eventFormData.id ? "Modifica Evento" : "Nuovo Evento"} size="lg">
          <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-full">
                      <label className="block text-sm font-medium text-slate-400 mb-1">Nome Evento</label>
                      <input 
                          type="text" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                          placeholder="Es. Concerto Estivo 2024"
                          value={eventFormData.eventName || ''}
                          onChange={e => setEventFormData(prev => ({ ...prev, eventName: e.target.value }))}
                      />
                  </div>
                  <div className="col-span-full">
                      <label className="block text-sm font-medium text-slate-400 mb-1">Location / Luogo</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 text-slate-500" size={18} />
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Es. Teatro Comunale, Roma"
                            value={eventFormData.location || ''}
                            onChange={e => setEventFormData(prev => ({ ...prev, location: e.target.value }))}
                        />
                      </div>
                  </div>
                  
                  <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Data Inizio Allestimento</label>
                      <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                          <DatePicker 
                              portalId="root"
                              selected={eventFormData.setupDate ? new Date(eventFormData.setupDate) : null} 
                              onChange={(date) => setEventFormData(prev => ({ ...prev, setupDate: date ? date.toISOString() : '' }))} 
                              dateFormat="dd/MM/yyyy"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                              placeholderText="Seleziona data..."
                          />
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Data Inizio Evento</label>
                      <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                          <DatePicker 
                              portalId="root"
                              selected={eventFormData.eventDate ? new Date(eventFormData.eventDate) : null} 
                              onChange={(date) => setEventFormData(prev => ({ ...prev, eventDate: date ? date.toISOString() : '' }))} 
                              dateFormat="dd/MM/yyyy"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                              placeholderText="Seleziona data..."
                          />
                      </div>
                  </div>

                  <div>
                       <label className="block text-sm font-medium text-slate-500 mb-1">Data Creazione Lista</label>
                       <DatePicker 
                          portalId="root"
                          selected={eventFormData.creationDate ? new Date(eventFormData.creationDate) : new Date()} 
                          onChange={(date) => setEventFormData(prev => ({ ...prev, creationDate: date ? date.toISOString() : '' }))} 
                          dateFormat="dd/MM/yyyy"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 text-sm focus:border-slate-600 outline-none"
                       />
                  </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-2">
                  <button onClick={() => setIsEventModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Annulla</button>
                  <button 
                    onClick={handleSaveEvent} 
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!eventFormData.eventName}
                  >
                    Salva Evento
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
      </div>
    );
  }

  // BUILDER VIEW
  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <div className="flex-1 flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
        
        {/* TOP HEADER */}
        <div className="p-2 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={handleBackToList} 
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-all border border-slate-700 hover:border-slate-500 group shadow-lg"
              title="Torna alla lista eventi"
            >
              <List size={18} className="text-emerald-500 group-hover:text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Eventi</span>
            </button>
            <div className="flex flex-col flex-1">
               <div className="flex items-center gap-2">
                   <span className="text-white font-bold text-lg">{activeList?.eventName}</span>
                   <button 
                      onClick={() => activeList && setActiveRemindersListId(activeList.id)}
                      className={`p-1 rounded-full hover:bg-slate-800 transition-colors ${activeList?.reminders?.some(r => !r.isCompleted) ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-300'}`}
                      title="Note & Promemoria"
                   >
                      <Lightbulb size={16} className={activeList?.reminders?.some(r => !r.isCompleted) ? "fill-current" : ""} />
                   </button>
                   <button onClick={() => openEventModal(activeList)} className="text-slate-500 hover:text-emerald-500"><Edit2 size={14} /></button>
                   {activeList?.version && <span className="text-xs bg-slate-800 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-900/50">v{activeList.version}</span>}
               </div>
               <div className="flex gap-3 text-xs text-slate-500">
                   <span>{activeList?.location}</span>
                   <span>•</span>
                   <span>{activeList?.eventDate ? new Date(activeList.eventDate).toLocaleDateString() : 'Nessuna data'}</span>
               </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
              <button 
                  onClick={handleCompleteList}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm shadow-lg shadow-blue-900/20 transition-all hover:scale-105 active:scale-95"
              >
                  <CheckCircle size={18} />
                  Lista Completata
              </button>
          </div>
        </div>

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
                                <StickyNote size={12} onClick={(e) => { e.stopPropagation(); setZoneNoteModal({ isOpen: true, zoneId: z.id, note: z.notes || '' }); }} className="hover:text-yellow-400" />
                                {zones.length > 1 && <Trash2 size={12} className="hover:text-rose-500" onClick={(e) => { e.stopPropagation(); setZoneToDelete(z.id); }} />}
                            </div>
                        )}
                    </div>
                ))}
                <button onClick={() => openMgmtModal('zone', 'create')} className="ml-2 p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-400"><Plus size={16} /></button>
            </div>
        )}

        {/* --- ZONE NOTE --- */}
        {activeZone && activeZone.notes && (
            <div className="bg-yellow-900/10 border-b border-slate-800 px-4 py-2 text-sm text-yellow-200/80 italic flex items-start gap-2">
                <StickyNote size={14} className="mt-1 shrink-0 text-yellow-500" />
                {activeZone.notes}
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
                        onMouseEnter={() => handlePickerEnter(true)}
                        onMouseLeave={() => handlePickerLeave(true)}
                    >
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                            ref={pickerInputRef}
                            placeholder={`Cerca materiale per ${activeSection.name}...`}
                            className="w-full bg-slate-950 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm outline-none focus:border-emerald-500"
                            value={pickerSearch}
                            onChange={e => setPickerSearch(e.target.value)}
                            onFocus={() => handlePickerEnter(false)}
                            onBlur={() => handlePickerLeave(false)}
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
        <div className="flex-1 overflow-y-auto bg-slate-950/30 relative flex flex-col">
          {highlightedItemName && (
              <div className="sticky top-0 left-0 right-0 z-20 bg-blue-600 text-white px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2">
                  <div className="font-bold text-sm flex items-center gap-2">
                      <Search size={16} /> EVIDENZIATO: <span className="underline">{highlightedItemName}</span>
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
                  const isMissing = comp.type === 'item' 
                      ? !inventory.some(i => i.id === comp.referenceId)
                      : !kits.some(k => k.id === comp.referenceId);

                  // Retrieve Kit Reminders if applicable
                  const originalKit = comp.type === 'kit' ? kits.find(k => k.id === comp.referenceId) : null;
                  const hasKitReminders = originalKit?.reminders && originalKit.reminders.length > 0;

                  // Highlight Logic
                  const isMainMatch = comp.name === highlightedItemName;
                  const isSubMatch = comp.contents?.some(c => c.name === highlightedItemName);
                  const isDimmed = highlightedItemName && !isMainMatch && !isSubMatch;

                  const hasAccessories = comp.contents && comp.contents.length > 0;

                  return (
                      <div key={comp.uniqueId} 
                           draggable onDragStart={(e) => handleDragStart(e, activeSection.id, idx, comp.uniqueId)} onDragEnter={(e) => handleDragEnter(e, activeSection.id, idx)} onDragEnd={handleDragEnd} onDragOver={e => e.preventDefault()}
                           className={`group relative p-2 rounded-lg border transition-all duration-300 ${isDimmed ? 'opacity-25 grayscale' : 'opacity-100'} ${isReplacing ? 'border-amber-500 bg-amber-900/10 ring-1 ring-amber-500' : isSelected ? 'bg-blue-900/20 border-blue-500/50' : comp.type === 'kit' ? 'bg-purple-900/10 border-purple-900/30 hover:border-purple-500/30' : hasAccessories ? 'bg-cyan-900/10 border-cyan-900/30 hover:border-cyan-500/30' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                          <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2 overflow-hidden">
                                  <button onClick={(e) => { e.stopPropagation(); toggleSelection(comp.uniqueId); }} className={`text-slate-500 p-1 ${isSelected ? 'text-blue-500' : ''}`}>{isSelected ? <CheckSquare size={18}/> : <Square size={18}/>}</button>
                                  {comp.type === 'kit' ? <PackageIcon size={18} className="text-purple-400"/> : <Box size={18} className={hasAccessories ? "text-cyan-400" : "text-slate-400"}/>}
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
                                          <div 
                                              className={`font-medium text-sm truncate flex items-center gap-2 cursor-pointer hover:underline ${isMainMatch ? 'text-blue-400 font-bold scale-105 origin-left' : 'text-slate-200'}`}
                                              onClick={(e) => { e.stopPropagation(); setHighlightedItemName(highlightedItemName === comp.name ? null : comp.name); }}
                                              title="Clicca per evidenziare ovunque"
                                          >
                                              {comp.name} 
                                              {comp.type === 'kit' && <span className="text-[10px] bg-purple-900 text-purple-200 px-1 rounded align-middle no-underline font-bold">KIT</span>}
                                              {comp.type === 'item' && hasAccessories && <span className="text-[10px] bg-cyan-900 text-cyan-200 px-1 rounded align-middle no-underline font-bold">MACCHINA</span>}
                                              {hasKitReminders && (
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveKitRemindersId(activeKitRemindersId === comp.uniqueId ? null : comp.uniqueId); }}
                                                    className={`p-0.5 rounded-full ${activeKitRemindersId === comp.uniqueId ? 'bg-yellow-500 text-black' : 'text-yellow-500 hover:bg-yellow-900/30'} transition-colors`}
                                                    title="Ci sono cose da ricordare per questo kit!"
                                                  >
                                                      <Lightbulb size={12} className={activeKitRemindersId === comp.uniqueId ? "fill-current" : ""} />
                                                  </button>
                                              )}
                                          </div>
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
                          
                          {/* KIT REMINDERS PANEL */}
                          {activeKitRemindersId === comp.uniqueId && hasKitReminders && (
                              <div className="mt-2 mx-2 bg-yellow-900/20 border border-yellow-700/30 rounded p-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                  <div className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                      <Lightbulb size={12} className="fill-current"/> Cose da ricordare per questo Kit:
                                  </div>
                                  <ul className="space-y-1">
                                      {originalKit?.reminders?.map((rem, ridx) => (
                                          <li key={ridx} className="text-xs text-yellow-100 flex items-start gap-2">
                                              <span className="mt-1 w-1 h-1 rounded-full bg-yellow-500 shrink-0"/>
                                              {rem}
                                          </li>
                                      ))}
                                  </ul>
                              </div>
                          )}

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
                                    const warning = comp.type === 'kit' ? getItemWarning(c.name, comp.name) : null;
                                    const isChildMatch = c.name === highlightedItemName;

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
                                                <span 
                                                    className={`truncate cursor-pointer hover:underline ${isAccMissing ? 'text-rose-900 line-through decoration-rose-500/50' : ''} ${isChildMatch ? 'text-blue-400 font-bold' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); setHighlightedItemName(highlightedItemName === c.name ? null : c.name); }}
                                                >
                                                    {c.name}
                                                </span>
                                                {warning && (
                                                    <span className="text-[9px] font-bold text-rose-500 ml-2 animate-pulse">
                                                        {warning}
                                                    </span>
                                                )}
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
          <div className="p-4 border-t border-slate-700 bg-slate-800 flex flex-col md:flex-row gap-4 justify-end items-center z-10">
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

      <RemindersModal 
        isOpen={!!activeRemindersListId}
        onClose={() => setActiveRemindersListId(null)}
        reminders={remindersList?.reminders || []}
        onUpdate={handleUpdateReminders}
        title={remindersList?.eventName || 'Note Evento'}
      />
      
      <ConfirmationModal isOpen={!!sectionToDelete} onClose={() => setSectionToDelete(null)} onConfirm={confirmRemoveSection} title="Elimina Sezione" message="Confermi l'eliminazione della sezione?" />
      <ConfirmationModal isOpen={!!zoneToDelete} onClose={() => setZoneToDelete(null)} onConfirm={confirmRemoveZone} title="Elimina Zona" message="Confermi l'eliminazione della ZONA e di tutto il suo contenuto?" />
      
      <ItemFormModal isOpen={isNewItemModalOpen} onClose={() => setIsNewItemModalOpen(false)} onSave={handleCreateNewItem} title="Nuovo Materiale" inventory={inventory} onCreateAccessory={handleCreateInventoryItemOnly} initialName={pickerSearch} />
      
      {/* Event Details Modal */}
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title={eventFormData.id ? "Modifica Evento" : "Nuovo Evento"} size="lg">
          <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-full">
                      <label className="block text-sm font-medium text-slate-400 mb-1">Nome Evento</label>
                      <input 
                          type="text" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                          placeholder="Es. Concerto Estivo 2024"
                          value={eventFormData.eventName || ''}
                          onChange={e => setEventFormData(prev => ({ ...prev, eventName: e.target.value }))}
                      />
                  </div>
                  <div className="col-span-full">
                      <label className="block text-sm font-medium text-slate-400 mb-1">Location / Luogo</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 text-slate-500" size={18} />
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Es. Teatro Comunale, Roma"
                            value={eventFormData.location || ''}
                            onChange={e => setEventFormData(prev => ({ ...prev, location: e.target.value }))}
                        />
                      </div>
                  </div>
                  
                  <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Data Inizio Allestimento</label>
                      <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                          <DatePicker 
                              portalId="root"
                              selected={eventFormData.setupDate ? new Date(eventFormData.setupDate) : null} 
                              onChange={(date) => setEventFormData(prev => ({ ...prev, setupDate: date ? date.toISOString() : '' }))} 
                              dateFormat="dd/MM/yyyy"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                              placeholderText="Seleziona data..."
                          />
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Data Inizio Evento</label>
                      <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                          <DatePicker 
                              portalId="root"
                              selected={eventFormData.eventDate ? new Date(eventFormData.eventDate) : null} 
                              onChange={(date) => setEventFormData(prev => ({ ...prev, eventDate: date ? date.toISOString() : '' }))} 
                              dateFormat="dd/MM/yyyy"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                              placeholderText="Seleziona data..."
                          />
                      </div>
                  </div>

                  <div>
                       <label className="block text-sm font-medium text-slate-500 mb-1">Data Creazione Lista</label>
                       <DatePicker 
                          portalId="root"
                          selected={eventFormData.creationDate ? new Date(eventFormData.creationDate) : new Date()} 
                          onChange={(date) => setEventFormData(prev => ({ ...prev, creationDate: date ? date.toISOString() : '' }))} 
                          dateFormat="dd/MM/yyyy"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 text-sm focus:border-slate-600 outline-none"
                       />
                  </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-2">
                  <button onClick={() => setIsEventModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Annulla</button>
                  <button 
                    onClick={handleSaveEvent} 
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!eventFormData.eventName}
                  >
                    Salva Evento
                  </button>
              </div>
          </div>
      </Modal>

      {/* Paste Confirm */}
      <Modal isOpen={showPasteConfirm} onClose={() => setShowPasteConfirm(false)} title="Incolla di nuovo">
        <div className="space-y-4"><p className="text-slate-300">Vuoi incollare di nuovo?</p><div className="flex justify-end gap-2"><button onClick={() => setShowPasteConfirm(false)} className="px-4 py-2 text-slate-400">Annulla</button><button onClick={() => { performPaste(); setShowPasteConfirm(false); }} className="bg-emerald-600 text-white px-4 py-2 rounded">Si</button></div></div>
      </Modal>

      {/* Replacement Banner */}
      {replacingComponentId && <div className="absolute inset-x-0 top-0 z-20 bg-amber-900/95 border-b border-amber-500/50 p-4 shadow-xl text-center text-amber-100 font-bold"><ArrowLeftRight className="inline mr-2"/> Modalità Sostituzione <button onClick={() => setReplacingComponentId(null)} className="ml-4 underline text-sm font-normal">Annulla</button></div>}
    </div>
  );
};