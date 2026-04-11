import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { Plus, Minus, Search, Trash2, FileDown, Settings2, Box, Package as PackageIcon, Calendar, MapPin, ClipboardList, StickyNote, Edit2, CheckSquare, Square, Scissors, Clipboard, ClipboardCopy, X, ArrowLeftRight, GripVertical, AlertTriangle, Lightbulb, List, CheckCircle, Undo2, Share, Save, User, FileText, AlignLeft, Blocks, Layers, Factory, Truck, AlertCircle } from 'lucide-react';
import { InventoryItem, Kit, PackingList, ListSection, ListComponent, Category, ListZone, Reminder, ChecklistCategory, Template } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { KitFormModal } from './KitFormModal';
import { ChecklistView } from './ChecklistView';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import { EventFormModal } from './EventFormModal';
import { RemindersModal } from './RemindersModal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addOrUpdateItem, deleteItem, updateItemFields, COLL_LISTS, COLL_INVENTORY } from '../firebase';
import { calculateAvailableQuantity } from '../utils/availability';

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
}

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
  onListAutoEdited
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
  const [activeListAction, setActiveListAction] = useState<'duplicate' | 'edit' | 'delete' | null>(null);
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
  const [openRemindersIds, setOpenRemindersIds] = useState<Set<string>>(new Set());
  const [overbookedModal, setOverbookedModal] = useState<{
      isOpen: boolean;
      item: InventoryItem | Kit | Template;
      type: 'item' | 'kit' | 'template';
      avail: number;
      total: number;
  } | null>(null);
  const [externalRentalVendor, setExternalRentalVendor] = useState('');

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
  const [isEditKitModalOpen, setIsEditKitModalOpen] = useState(false);

  // REPLACEMENT STATE
  const [replacingComponentId, setReplacingComponentId] = useState<string | null>(null);

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

  // Mobile Checklist View State
  const [isMobileChecklistOpen, setIsMobileChecklistOpen] = useState(false);
  const [isDesktopChecklistOpen, setIsDesktopChecklistOpen] = useState(true);


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
  const [activeDragOverIdx, setActiveDragOverIdx] = useState<number | null>(null);
  const [activeDragOverSectionId, setActiveDragOverSectionId] = useState<string | null>(null);

  // Auto-focus Refs
  const qtyInputRefs = useRef<{ [uniqueId: string]: HTMLInputElement | null }>({});
  const [lastAddedComponentId, setLastAddedComponentId] = useState<string | null>(null);
  
  // Mobile Action Menu State
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

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

  // Versioning/Feedback Modal State
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
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
    const updatedLists = lists.map(list => {
        let listModified = false;
        const newZones = list.zones?.map(zone => ({
            ...zone,
            sections: zone.sections.map(section => ({
                ...section,
                components: section.components.map(comp => {
                    if (comp.type === 'kit' && comp.referenceId === updatedKit.id) {
                        if (comp.name !== updatedKit.name) {
                            listModified = true;
                            return { ...comp, name: updatedKit.name };
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
      }
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

  const highlightedTotal = useMemo(() => {
    if (!activeList || !highlightedItemName) return 0;
    let total = 0;
    activeList.zones.forEach(zone => {
      zone.sections.forEach(section => {
        section.components.forEach(comp => {
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

  const filteredPickerTemplates = useMemo(() => {
      const searchTokens = (pickerSearch || '').toLowerCase().split(' ').filter(t => t.trim() !== '');
      return templates.map(template => {
            const combined = `${(template.name||'').toLowerCase()} ${(template.category||'').toLowerCase()} ${(template.description||'').toLowerCase()}`;
            if (!searchTokens.every(token => combined.includes(token))) return { template, score: -1, nameMatches: 0 };
            if (selectedCategory !== 'All' && template.category !== selectedCategory) return { template, score: -1, nameMatches: 0 };
            return { template, score: 1, nameMatches: 1 };
        })
        .filter(x => x.score > -1)
        .map(x => x.template);
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
        list.eventName.toLowerCase().includes(listFilter.toLowerCase()) ||
        list.location.toLowerCase().includes(listFilter.toLowerCase())
      )
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
          ...dataToSave,
          id: dataToSave.id || generateId(),
          creationDate: dataToSave.creationDate || new Date().toISOString()
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
      
      updateActiveSection({ components: [...activeSection.components, newComponent] });
      setIsTempItemModalOpen(false);
  };

  const generateComponentFromItem = (item: InventoryItem | Kit | Template, type: 'item' | 'kit' | 'template'): Omit<ListComponent, 'uniqueId' | 'quantity' | 'notes'> => {
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
                 contents = (i.accessories || []).map(acc => {
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
              const invItem = inventory.find(inv => inv.id === acc.itemId);
              return { itemId: acc.itemId, name: invItem?.name || '?', quantity: acc.quantity, category: invItem?.category || 'Altro' };
          })
        };
      }
  };

  const addToSection = (
      item: InventoryItem | Kit | Template, 
      type: 'item' | 'kit' | 'template', 
      isExternalRental: boolean = false,
      rentalType?: 'internal_shortage' | 'external_rental',
      vendor?: string
  ) => {
      if (!activeSection) return;
      
      // Check for replacement
      if (replacingComponentId) {
          // Logic for replacement (swap item, keep qty)
           const newBase = generateComponentFromItem(item, type);

           // Automatically open reminders for Kits during replacement
           if (type === 'kit') {
               const k = item as Kit;
               if (k.reminders && k.reminders.length > 0) {
                   setOpenRemindersIds(prev => new Set(prev).add(replacingComponentId));
               }
           }

           const newComponents = activeSection.components.map(c => 
              c.uniqueId === replacingComponentId ? { 
                  ...c, 
                  ...newBase, 
                  isExternalRental,
                  rentalType,
                  externalRentalVendor: vendor
              } : c
           );
           updateActiveSection({ components: newComponents });
           setReplacingComponentId(null);
           return;
      }

      const existing = activeSection.components.find(c => c.type === type && c.referenceId === item.id);
      if (existing) {
          const newComps = activeSection.components.map(c => c.uniqueId === existing.uniqueId ? { 
              ...c, 
              quantity: c.quantity + 1, 
              isExternalRental: c.isExternalRental || isExternalRental,
              rentalType: c.rentalType || rentalType,
              externalRentalVendor: c.externalRentalVendor || vendor
          } : c);
          updateActiveSection({ components: newComps });
          setLastAddedComponentId(existing.uniqueId);

          // If it's a kit, ensure reminders are open when re-adding
          if (type === 'kit') {
              const k = item as Kit;
              if (k.reminders && k.reminders.length > 0) {
                  setOpenRemindersIds(prev => new Set(prev).add(existing.uniqueId));
              }
          }
      } else {
          const newId = generateId();
          const newComp: ListComponent = { 
              uniqueId: newId, 
              quantity: 1, 
              notes: '', 
              isExternalRental, 
              rentalType,
              externalRentalVendor: vendor,
              ...generateComponentFromItem(item, type) 
          };
          
          // Automatically open reminders for Kits
          if (type === 'kit') {
              const k = item as Kit;
              if (k.reminders && k.reminders.length > 0) {
                  setOpenRemindersIds(prev => new Set(prev).add(newId));
              }
          }

          // INSERTION LOGIC: Add under the last selected item
          let newComponents = [...activeSection.components];
          let lastSelectedIndex = -1;
          for (let i = activeSection.components.length - 1; i >= 0; i--) {
              if (selectedIds.has(activeSection.components[i].uniqueId)) {
                  lastSelectedIndex = i;
                  break;
              }
          }

          if (lastSelectedIndex !== -1) {
              newComponents.splice(lastSelectedIndex + 1, 0, newComp);
          } else {
              newComponents.push(newComp);
          }

          updateActiveSection({ components: newComponents });
          setLastAddedComponentId(newId);
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
    await addOrUpdateItem(COLL_LISTS, { ...remindersList, reminders: newReminders });
  };
  
  // --- VERSIONING & COMPLETION ---
  const handleCompleteList = async (isUpdate = false) => {
    if (!activeList || !activeList.zones) return;
    
    let newVersion = '1.0';
    if (activeList.version) {
        const parts = activeList.version.split('.');
        const major = parseInt(parts[0]) || 0;
        const minor = parseInt(parts[1] || '0');

        if (isUpdate) {
            newVersion = `${major >= 1 ? major : 1}.${minor + 1}`;
        } else {
            if (major >= 1) newVersion = activeList.version;
            else newVersion = '1.0';
        }
    }

    const currentZones = activeList.zones;
    const newDeletedItems = [...(activeList.deletedItems || [])];

    // Identify deleted items
    activeList.snapshot?.forEach(prevZone => {
        prevZone.sections.forEach(prevSection => {
            prevSection.components.forEach(prevComp => {
                let found = false;
                currentZones.forEach(currZone => {
                    currZone.sections.forEach(currSection => {
                        if (currSection.components.some(c => c.uniqueId === prevComp.uniqueId)) found = true;
                    });
                });
                if (!found && !newDeletedItems.some(d => d.originalComponent.uniqueId === prevComp.uniqueId)) {
                    newDeletedItems.push({ originalComponent: prevComp, zoneName: prevZone.name, sectionName: prevSection.name, deletedAt: new Date().toISOString() });
                }
            });
        });
    });

    const updatedZones = currentZones.map(zone => ({
        ...zone,
        sections: zone.sections.map(section => ({
            ...section,
            components: section.components.map(comp => {
                let prevComp: ListComponent | undefined;
                activeList.snapshot?.forEach(pz => {
                    pz.sections.forEach(ps => {
                        const match = ps.components.find(c => c.uniqueId === comp.uniqueId);
                        if (match) prevComp = match;
                    });
                });

                if (prevComp && prevComp.quantity !== comp.quantity) {
                    const resetContents = comp.contents?.map(content => ({
                        ...content,
                        warehouseState: {
                            ...content.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                            inDistinta: false, loaded: false
                        }
                    }));

                    return {
                        ...comp,
                        contents: resetContents,
                        warehouseState: {
                            ...comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                            inDistinta: false, loaded: false,
                            changeLog: { previousQuantity: prevComp.quantity, changedAt: new Date().toISOString() }
                        }
                    };
                }
                return comp;
            })
        }))
    }));

    await updateActiveList({
        version: newVersion,
        snapshot: updatedZones,
        zones: updatedZones,
        deletedItems: newDeletedItems,
        completedAt: new Date().toISOString(),
        isCompleted: true,
        isDraftVisible: false
    });
    
    setFeedbackModal({ 
        isOpen: true, 
        title: 'Operazione Completata', 
        message: `Lista completata con successo! Versione: ${newVersion}`,
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

  const handleShowDraftInWarehouse = async () => {
    if (!activeList) return;
    
    let newVersion = activeList.version || '0.1';
    if (activeList.version) {
        const parts = activeList.version.split('.');
        const minor = parseInt(parts[1] || '0');
        newVersion = `0.${minor + 1}`;
    }

    await updateActiveList({
        isDraftVisible: true,
        version: newVersion,
        snapshot: activeList.zones
    });
    
    setFeedbackModal({ 
        isOpen: true, 
        title: 'Bozza Inviata', 
        message: `Bozza inviata al Magazzino! (v${newVersion})`,
        type: 'success'
    });
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
  };


  // --- EXPORT ---
  const flattenComponents = (components: ListComponent[]) => {
    const flat: ListComponent[] = [];
    components.forEach(c => {
      if (c.type === 'template' && c.templateContents) {
        c.templateContents.forEach(tc => {
          const existing = flat.find(f => f.type === tc.type && f.referenceId === tc.referenceId);
          if (existing) {
            existing.quantity += (tc.quantity * c.quantity);
          } else {
            flat.push({
              ...tc,
              uniqueId: generateId(),
              quantity: tc.quantity * c.quantity
            } as ListComponent);
          }
        });
      } else {
        const existing = flat.find(f => f.type === c.type && f.referenceId === c.referenceId);
        if (existing) {
          existing.quantity += c.quantity;
        } else {
          flat.push({ ...c });
        }
      }
    });
    return flat;
  };

  const calculateZoneTotals = (zone: ListZone) => {
    const totalsMap = new Map<string, number>();
    const flatComps = flattenComponents(zone.sections.flatMap(s => s.components));
    
    flatComps.forEach(c => {
        totalsMap.set(c.name, (totalsMap.get(c.name) || 0) + c.quantity);
        c.contents?.forEach(sub => totalsMap.set(sub.name, (totalsMap.get(sub.name) || 0) + (sub.quantity * c.quantity)));
    });
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
            const flatComponents = flattenComponents(section.components);
            if (flatComponents.length === 0) return;

            // Section Header Row
            tableBody.push([{ 
                content: section.name.toUpperCase(), 
                colSpan: 4, 
                styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0, 0, 0] } 
            }]);

            // Items
            flatComponents.forEach(comp => {
                let nameContent = comp.name;
                if (comp.isTemporary) nameContent += ' (TEMP)';
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
                printHeader(zone.name, data.pageNumber);
            }
        });
    });
    
    // Notes page
    if (activeList.notes) {
        doc.addPage();
        printHeader("Note Generali", doc.getNumberOfPages());
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
        // Key: Item Name -> Value: { totalQty: number, aggregatedNotes: { qty: number, text: string }[], children: Map<childName, { qty: number, prepNote: string, aggregatedNotes: { qty: number, text: string }[] }> }
        const complexItemsMap = new Map<string, { totalQty: number, aggregatedNotes: { qty: number, text: string }[], children: Map<string, { qty: number, prepNote: string, aggregatedNotes: { qty: number, text: string }[] }> }>();

        // Map for Section B: Bulk/Loose Items
        // Key: Item Name -> Value: { totalQty: number, isTemporary: boolean, aggregatedNotes: { qty: number, text: string }[] }
        const simpleItemsMap = new Map<string, { totalQty: number, isTemporary: boolean, aggregatedNotes: { qty: number, text: string }[] }>();

        const addAggregatedNote = (notesArr: { qty: number, text: string }[], qty: number, text?: string) => {
            if (!text) return;
            const existing = notesArr.find(n => n.text === text);
            if (existing) {
                existing.qty += qty;
            } else {
                notesArr.push({ qty, text });
            }
        };

        zone.sections.forEach(section => {
            const flatComponents = flattenComponents(section.components);
            flatComponents.forEach(comp => {
                const isComplex = comp.type === 'kit' || (comp.contents && comp.contents.length > 0);
                const note = comp.warehouseState?.warehouseNote;

                if (isComplex) {
                    // --- SECTION A AGGREGATION ---
                    const displayName = comp.type === 'kit' ? `KIT-${comp.name}` : comp.name;
                    
                    if (!complexItemsMap.has(displayName)) {
                        complexItemsMap.set(displayName, { totalQty: 0, aggregatedNotes: [], children: new Map() });
                    }
                    const parent = complexItemsMap.get(displayName)!;
                    parent.totalQty += comp.quantity;
                    
                    // Aggrego note di produzione e di magazzino
                    if (comp.notes) addAggregatedNote(parent.aggregatedNotes, comp.quantity, comp.notes);
                    if (comp.warehouseState?.warehouseNote) addAggregatedNote(parent.aggregatedNotes, comp.quantity, comp.warehouseState.warehouseNote);

                    // Aggregate Children
                    comp.contents?.forEach(sub => {
                        if (!parent.children.has(sub.name)) {
                            parent.children.set(sub.name, { qty: 0, prepNote: sub.prepNote || '', aggregatedNotes: [] });
                        }
                        const child = parent.children.get(sub.name)!;
                        child.qty += (sub.quantity * comp.quantity);
                        // Update note if present (last one wins or we could concat, simple overwrite for now)
                        if (sub.prepNote) child.prepNote = sub.prepNote;
                        
                        const subWs = sub.warehouseState;
                        // Aggrego note di produzione (prepNote) e di magazzino
                        if (sub.prepNote) addAggregatedNote(child.aggregatedNotes, sub.quantity * comp.quantity, sub.prepNote);
                        if (subWs?.warehouseNote) addAggregatedNote(child.aggregatedNotes, sub.quantity * comp.quantity, subWs.warehouseNote);
                    });

                } else {
                    // --- SECTION B AGGREGATION ---
                    if (!simpleItemsMap.has(comp.name)) {
                        simpleItemsMap.set(comp.name, { totalQty: 0, isTemporary: !!comp.isTemporary, aggregatedNotes: [] });
                    }
                    const item = simpleItemsMap.get(comp.name)!;
                    item.totalQty += comp.quantity;
                    
                    // Aggrego note di produzione e di magazzino
                    if (comp.notes) addAggregatedNote(item.aggregatedNotes, comp.quantity, comp.notes);
                    if (comp.warehouseState?.warehouseNote) addAggregatedNote(item.aggregatedNotes, comp.quantity, comp.warehouseState.warehouseNote);
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
                let parentLabel = displayName;
                if (data.aggregatedNotes.length > 0) {
                    parentLabel += '\n' + data.aggregatedNotes.map(n => `> x${n.qty} ${n.text}`).join('\n');
                }

                tableBody.push([{ 
                    content: parentLabel, 
                    styles: { 
                        fontStyle: 'bold', // Keeping structural bold for Parent
                        textColor: [0, 0, 0],
                        fontSize: data.aggregatedNotes.length > 0 ? 9 : 11
                    },
                    _warning: null
                }, data.totalQty, '']);

                // Children Rows (Indented)
                const sortedChildren = Array.from(data.children.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                sortedChildren.forEach(([childName, childData]) => {
                    let childLabel = `  - ${childName}`;
                    
                    // Add Prep Note column logic
                    if (childData.prepNote) {
                        childLabel += ` [${childData.prepNote.toUpperCase()}]`;
                    }

                    if (childData.aggregatedNotes.length > 0) {
                        childLabel += '\n    ' + childData.aggregatedNotes.map(n => `> x${n.qty} ${n.text}`).join('\n    ');
                    }
                    
                    tableBody.push([{ 
                        content: childLabel, 
                        styles: { 
                            fontSize: (childData.aggregatedNotes.length > 0) ? 8 : 10, 
                            textColor: [80, 80, 80],
                            fontStyle: 'normal'
                        },
                        _warning: null
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

            sortedSimple.forEach(([name, data]) => {
                let simpleLabel = data.isTemporary ? `${name} (TEMP)` : name;
                if (data.aggregatedNotes.length > 0) {
                    simpleLabel += '\n' + data.aggregatedNotes.map(n => `> x${n.qty} ${n.text}`).join('\n');
                }

                tableBody.push([{
                    content: simpleLabel,
                    styles: {
                        fontSize: data.aggregatedNotes.length > 0 ? 9 : 11
                    }
                }, data.totalQty, '']);
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
                printHeader(zone.name, data.pageNumber);
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
                const displayName = c.isTemporary ? `${c.name} (TEMP)` : c.name;
                
                csvContent += `"${z.name}","${s.name}",${typeLabel},"${displayName}",${c.quantity},${zoneTotal},"${note}",""\n`;
                
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
      <div className="h-full flex flex-col p-4 sm:p-6 bg-slate-950 overflow-x-hidden">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Liste Eventi</h1>
        </div>
        <div className="flex flex-col xl:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-xl w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input placeholder="Cerca evento..." className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-lg outline-none focus:border-emerald-500" value={listFilter} onChange={(e) => setListFilter(e.target.value)} />
          </div>
          
          <div className="flex items-center gap-2 w-full xl:w-auto">
             <button onClick={() => setActiveListAction(p => p === 'duplicate' ? null : 'duplicate')} className={`p-3 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:flex-none gap-2 font-medium transition-colors whitespace-nowrap ${activeListAction === 'duplicate' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`} title="Copia"><ClipboardCopy size={18}/> <span className="hidden sm:inline">Copia</span></button>
             <button onClick={() => setActiveListAction(p => p === 'edit' ? null : 'edit')} className={`p-3 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:flex-none gap-2 font-medium transition-colors whitespace-nowrap ${activeListAction === 'edit' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`} title="Modifica"><Edit2 size={18}/> <span className="hidden sm:inline">Modifica</span></button>
             <button onClick={() => setActiveListAction(p => p === 'delete' ? null : 'delete')} className={`p-3 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:flex-none gap-2 font-medium transition-colors whitespace-nowrap ${activeListAction === 'delete' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`} title="Elimina"><Trash2 size={18}/> <span className="hidden sm:inline">Elimina</span></button>
             <button onClick={() => { handleCreateList(); setViewMode('edit'); setActiveListAction(null); }} className="bg-purple-600 hover:bg-purple-500 text-white p-3 sm:px-4 sm:py-3 rounded-lg flex items-center justify-center flex-1 md:w-auto gap-2 font-medium transition-colors xl:ml-auto" title="Nuovo Evento"><Plus size={20} /> <span className="hidden sm:inline">Nuovo Evento</span></button>
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
                         else if (activeListAction === 'edit') { openEventModal(list, e as any); setActiveListAction(null); } 
                         else if (activeListAction === 'delete') { setListToDeleteInfo({ id: list.id, name: list.eventName }); setActiveListAction(null); } 
                         else { handleListSelect(list.id); } 
                     }} 
                     className={`bg-slate-800 border rounded-lg p-3 sm:p-4 cursor-pointer transition-all relative flex flex-col md:flex-row items-start md:items-center gap-2 sm:gap-4 ${activeListAction ? 'hover:border-emerald-500 hover:bg-slate-700 ring-4 ring-transparent hover:ring-emerald-500/20' : 'border-slate-700 hover:border-slate-500 group'}`}
                >
                  
                  {/* Event Main Info */}
                  <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex w-12 h-12 rounded bg-emerald-900/20 items-center justify-center text-emerald-500 shrink-0 font-bold text-xl">
                            {list.eventName.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                             <div className="flex flex-nowrap items-center justify-between gap-2 overflow-hidden">
                                <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-emerald-400 transition-colors truncate min-w-0 flex-1">{list.eventName}</h3>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setActiveRemindersListId(list.id); }}
                                  className={`p-1.5 rounded-full hover:bg-slate-700 transition-colors shrink-0 ${list.reminders?.some(r => !r.isCompleted) ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-300'}`}
                                  title="Note & Promemoria"
                                >
                                  <Lightbulb size={20} className={list.reminders?.some(r => !r.isCompleted) ? "fill-current" : ""} />
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
      </div>
    );
  }

  // BUILDER VIEW
  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <div className="flex-1 flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
        
        {/* TOP HEADER */}
        <div className="p-1.5 sm:p-3 bg-slate-950 border-b border-slate-800 flex flex-col gap-1.5 sm:gap-3">
          <div className="flex items-center justify-between gap-1.5 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                <button 
                  onClick={handleBackToList} 
                  className="p-1.5 sm:px-3 sm:py-2 bg-slate-800 hover:bg-slate-700 text-emerald-500 rounded-lg border border-slate-700 shadow-lg shrink-0 flex items-center gap-2"
                  title="Eventi"
                >
                  <List size={18} />
                  <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider text-white">Eventi</span>
                </button>

                {/* Mobile-only Checklist Shortcut */}
                <button 
                onClick={() => setIsMobileChecklistOpen(true)} 
                className="md:hidden p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg border border-slate-700 shadow-lg shrink-0 flex items-center gap-1"
                title="Checklist"
                >
                <ClipboardList size={18} />
                <span className="text-xs font-bold uppercase tracking-tight text-white">Check</span>
                {activeList && activeList.checklistCheckedItems && activeList.checklistCheckedItems.length > 0 && (
                    <span className="bg-blue-600 text-white px-1 rounded-full text-xs min-w-[14px] text-center font-bold">
                        {activeList.checklistCheckedItems.length}
                    </span>
                )}
                </button>

                {/* Desktop Checklist Toggle */}
                <button 
                onClick={() => setIsDesktopChecklistOpen(!isDesktopChecklistOpen)} 
                className={`hidden md:flex p-1.5 sm:px-3 sm:py-2 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-lg shrink-0 items-center gap-1.5 transition-colors ${isDesktopChecklistOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                title="Checklist"
                >
                <ClipboardList size={18} className={isDesktopChecklistOpen ? '' : 'text-blue-400'} />
                <span className="text-xs font-bold uppercase tracking-wider text-white">Checklist</span>
                {activeList && activeList.checklistCheckedItems && activeList.checklistCheckedItems.length > 0 && (
                    <span className="bg-white/20 text-white px-1.5 rounded-full text-xs min-w-[16px] text-center font-bold">
                        {activeList.checklistCheckedItems.length}
                    </span>
                )}
                </button>
                
                {/* Reminders/Notes Shortcut */}
                <button 
                  onClick={() => setActiveRemindersListId(activeList?.id || null)} 
                  className={`p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-lg shrink-0 flex items-center gap-1.5 transition-colors ${activeList?.reminders?.some(r => !r.isCompleted) ? 'text-yellow-400' : 'text-slate-400 hover:text-white'}`}
                  title="Note & Promemoria"
                >
                  <Lightbulb size={18} className={activeList?.reminders?.some(r => !r.isCompleted) ? "fill-current" : ""} />
                  <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight text-white">Note</span>
                </button>
                
                <div className="flex flex-col min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 min-w-0">
                        <span className="text-white font-bold text-xs sm:text-lg truncate">{activeList?.eventName}</span>
                        {activeList?.version && <span className="text-xs sm:text-xs bg-slate-800 text-emerald-400 px-1 rounded font-bold shrink-0">v{activeList.version}</span>}
                    </div>
                </div>
            </div>

            {/* HEADER ACTIONS (Compact row) */}
            <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
                {/* BULK ACTIONS (Mobile Overlay in Top bar) */}
                {(selectedIds.size > 0 || clipboard.length > 0) && (
                    <div className="flex md:hidden items-center gap-1 mr-1 pr-1 border-r border-slate-800">
                        {selectedIds.size > 0 && (
                            <>
                                {selectedIds.size === 1 && (
                                    <button 
                                        onClick={() => setReplacingComponentId(Array.from(selectedIds)[0])} 
                                        className="p-1.5 text-amber-500"
                                    >
                                        <ArrowLeftRight size={16} />
                                    </button>
                                )}
                                <button onClick={handleCopy} className="p-1.5 text-blue-400"><ClipboardCopy size={16} /></button>
                                <button onClick={handleBulkDelete} className="p-1.5 text-rose-500"><Trash2 size={16} /></button>
                            </>
                        )}
                        {clipboard.length > 0 && (
                            <button onClick={handlePaste} className={`p-1.5 rounded ${clipboardPasted ? 'text-orange-500' : 'text-emerald-500'}`}><Clipboard size={16} /></button>
                        )}
                    </div>
                )}

                {/* LOGO-TYPE EXPORT BUTTONS (Only Icons on Mobile) */}
                <div className="flex items-center gap-1">
                    <button onClick={exportPDF} title="Esporta PDF" className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><FileText size={18}/> <span className="hidden lg:inline text-xs font-bold uppercase tracking-tight">PDF</span></button>
                    <button onClick={exportTotalsPDF} title="PDF Totali" className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><ClipboardList size={18}/> <span className="hidden lg:inline text-xs font-bold uppercase tracking-tight">Totali</span></button>
                    <button onClick={exportCSV} title="Esporta CSV" className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><FileDown size={18}/> <span className="hidden lg:inline text-xs font-bold uppercase tracking-tight">CSV</span></button>
                </div>

                <div className="w-[1px] h-6 bg-slate-800 mx-1 hidden sm:block"></div>

                {/* COMPLETION/DRAFT ACTIONS */}
                <div className="flex items-center gap-1 sm:gap-2">
                    {activeList?.isCompleted ? (
                        <div className="flex gap-1 sm:gap-2">
                            <button onClick={() => handleCompleteList(true)} className="flex items-center gap-1.5 p-1.5 sm:px-4 sm:py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg border border-emerald-500/30 transition-all font-bold" title={`Aggiorna Versione (v${
                                activeList.version ? `${activeList.version.split('.')[0]}.${parseInt(activeList.version.split('.')[1] || '0') + 1}` : '1.1'
                            })`}>
                                <Save size={18} /> <span className="hidden sm:inline text-xs uppercase tracking-tight">Aggiorna v{
                                    activeList.version ? `${activeList.version.split('.')[0]}.${parseInt(activeList.version.split('.')[1] || '0') + 1}` : '1.1'
                                }</span>
                            </button>
                            <button onClick={handleUndoCompletion} className="flex items-center gap-1.5 p-1.5 sm:px-4 sm:py-2 bg-slate-800 text-amber-500 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors" title="Torna a Bozza">
                                <Undo2 size={18} /> <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight">Bozza</span>
                            </button>
                        </div>
                    ) : activeList?.isDraftVisible ? (
                        <div className="flex gap-1 sm:gap-2">
                            <button onClick={handleWithdrawDraft} className="flex items-center gap-1.5 p-1.5 sm:px-4 sm:py-2 bg-rose-950/20 text-rose-500 hover:bg-rose-950/40 rounded-lg border border-rose-900/30 transition-colors" title="Ritira"><X size={18} /> <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight">Ritira</span></button>
                            <button onClick={handleUpdateDraftVersion} className="flex items-center gap-1.5 p-1.5 sm:px-4 sm:py-2 bg-amber-900/20 text-amber-500 hover:bg-amber-900/40 rounded-lg border border-amber-900/30 transition-colors" title="Aggiorna Bozza"><Save size={18} /> <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight">Salva</span></button>
                            <button onClick={() => handleCompleteList()} className="flex items-center gap-1.5 p-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-lg shadow-lg font-bold transition-colors" title="Completa"><CheckCircle size={18} /> <span className="hidden sm:inline text-xs uppercase tracking-tight">Completa</span></button>
                        </div>
                    ) : (
                        <div className="flex gap-1 sm:gap-2">
                            <button onClick={handleShowDraftInWarehouse} className="flex items-center gap-1.5 p-1.5 sm:px-4 sm:py-2 bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg border border-slate-700 hover:border-emerald-500/50 transition-colors" title="Invia al Magazzino"><Share size={18} /> <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight">Invia</span></button>
                            <button onClick={() => handleCompleteList()} className="flex items-center gap-1.5 p-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-lg shadow-lg font-bold transition-colors" title="Completa"><CheckCircle size={18} /> <span className="hidden sm:inline text-xs uppercase tracking-tight">Completa</span></button>
                        </div>
                    )}
                </div>
            </div>
          </div>

          <div className="md:hidden flex flex-col gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-xs">
             <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="shrink-0 flex items-center gap-1 text-slate-500 font-bold uppercase">
                        <Box size={14} /> Zona
                    </div>
                    <select 
                        value={activeZoneId} 
                        onChange={(e) => setActiveZoneId(e.target.value)}
                        className="flex-1 bg-slate-900 text-emerald-400 font-bold rounded border border-slate-800 px-1 py-1 outline-none min-w-0"
                    >
                        {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                    <button onClick={() => openMgmtModal('zone', 'create')} className="p-1.5 bg-emerald-900/20 rounded text-emerald-500 border border-emerald-900/30"><Plus size={14} /></button>
                </div>
                
                <div className="w-[1px] h-4 bg-slate-800"></div>

                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="shrink-0 flex items-center gap-1 text-slate-500 font-bold uppercase">
                        <AlignLeft size={14} /> Set.
                    </div>
                    <select 
                        value={activeSectionId} 
                        onChange={(e) => setActiveSectionId(e.target.value)}
                        className="flex-1 bg-slate-900 text-blue-400 font-bold rounded border border-slate-800 px-1 py-1 outline-none min-w-0"
                    >
                        {sections.map(s => <option key={s.id} value={s.id}>{s.name} ({s.components.length})</option>)}
                    </select>
                    <button onClick={() => openMgmtModal('section', 'create')} className="p-1.5 bg-blue-900/20 rounded text-blue-500 border border-blue-900/30"><Plus size={14} /></button>
                </div>
             </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative">

            {/* DESKTOP CHECKLIST PANEL */}
            {isDesktopChecklistOpen && activeList && (
                <div className="hidden md:flex flex-col w-80 lg:w-96 shrink-0 border-r border-slate-800 bg-slate-900 overflow-hidden relative shadow-2xl z-10 transition-all animate-in slide-in-from-left-8 duration-300">
                    <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center shadow-md">
                        <h3 className="font-bold text-white flex items-center gap-2 uppercase tracking-wider text-sm">
                            <ClipboardList size={16} className="text-blue-500" /> Checklist
                        </h3>
                        <button onClick={() => setIsDesktopChecklistOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors">
                            <X size={16}/>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900/50">
                        <ChecklistView activeList={activeList} checklist={masterChecklist} />
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        {/* --- ZONE TABS (Desktop Only) --- */}
        {activeList && zones.length > 0 && (
            <div className="hidden md:flex items-center gap-1 px-4 pt-4 border-b border-slate-800 bg-slate-950/50 overflow-x-auto">
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

        {/* --- SECTION TABS (Inside Active Zone) (Desktop Only) --- */}
        {activeZone && (
        <div className="hidden md:flex items-center gap-2 px-4 py-2 border-b border-slate-700 bg-slate-900 overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSectionId(s.id)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 group ${activeSectionId === s.id ? 'bg-slate-900 text-white border-t border-x border-slate-800' : 'bg-slate-950 text-slate-500 border-transparent hover:text-slate-300'}`}
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
            <div className="px-2 py-1.5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search Input Row */}
                <div 
                    className="relative flex-1"
                    onMouseEnter={() => handlePickerEnter(true)}
                    onMouseLeave={() => handlePickerLeave(true)}
                >
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input 
                        ref={pickerInputRef}
                        placeholder={`Cerca in ${activeSection.name}...`}
                        className="w-full bg-slate-950 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm outline-none focus:border-emerald-500"
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        onFocus={() => handlePickerEnter(false)}
                        onBlur={() => handlePickerLeave(false)}
                    />
                    {/* PICKER DROPDOWN */}
                    {pickerSearch && isPickerHovered && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                        
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
                          <button key={template.id} onClick={(e) => { e.preventDefault(); if (isOverbooked) { setOverbookedModal({ isOpen: true, item: template, type: 'template', avail: avail.available, total: avail.total }); } else { addToSection(template, 'template'); } }} className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group">
                            <div>
                                <div className="text-sm text-white flex items-center gap-2">
                                    <Blocks size={14} className="text-emerald-400" />
                                    {template.name}
                                    {qtyInZone > 0 && (
                                        <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 rounded font-bold">
                                            x{qtyInZone}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 pl-6 mt-0.5">
                                    {template.items.length} componenti base • <span className={isOverbooked ? 'text-rose-500 font-bold' : 'text-slate-400'}>Disponibili: {avail.available}</span> / {avail.total}
                                </div>
                            </div>
                            <Plus size={16} className={`${isOverbooked ? 'text-rose-500' : 'text-slate-600 group-hover:text-emerald-500'} transition-colors`}/>
                          </button>
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
                          <button key={kit.id} onClick={(e) => { e.preventDefault(); if (isOverbooked) { setOverbookedModal({ isOpen: true, item: kit, type: 'kit', avail: avail.available, total: avail.total }); } else { addToSection(kit, 'kit'); } }} className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group">
                            <div>
                                <div className="text-sm text-white flex items-center gap-2">
                                    <PackageIcon size={14} className="text-purple-400" />
                                    {kit.name}
                                    {qtyInZone > 0 && (
                                        <span className="text-xs bg-purple-950 text-purple-400 border border-purple-900 px-1.5 rounded font-bold">
                                            x{qtyInZone}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 pl-6 mt-0.5">
                                    {kit.items.length} componenti • <span className={isOverbooked ? 'text-rose-500 font-bold' : 'text-slate-400'}>Disponibili: {avail.available}</span> / {avail.total}
                                </div>
                            </div>
                            <Plus size={16} className={`${isOverbooked ? 'text-rose-500' : 'text-slate-600 group-hover:text-emerald-500'} transition-colors`}/>
                          </button>
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
                          <button key={item.id} onClick={(e) => { e.preventDefault(); if (isOverbooked) { setOverbookedModal({ isOpen: true, item, type: 'item', avail: avail.available, total: avail.total }); } else { addToSection(item, 'item'); } }} className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 flex justify-between items-center group">
                            <div>
                                <div className="text-sm text-white flex items-center gap-2">
                                    {item.name}
                                    {qtyInZone > 0 && (
                                        <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 rounded font-bold">
                                            x{qtyInZone}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    {item.category} • <span className={isOverbooked ? 'text-rose-500 font-bold' : 'text-slate-400'}>Disponibili: {avail.available}</span> / {avail.total}
                                </div>
                            </div>
                            <Plus size={16} className={`${isOverbooked ? 'text-rose-500' : 'text-slate-600 group-hover:text-emerald-500'} transition-colors`}/>
                          </button>
                        )})}
                        
                        {/* Create new */}
                        {filteredPickerItems.length === 0 && filteredPickerKits.length === 0 && filteredPickerTemplates.length === 0 && <button onClick={() => setIsNewItemModalOpen(true)} className="w-full text-left px-4 py-3 hover:bg-slate-800 text-emerald-500 flex gap-2"><Plus/> Crea "{pickerSearch}"</button>}
                      </div>
                    )}
                </div>
                
                {/* Category & Action Buttons Row */}
                <div className="flex items-center gap-2">
                    <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="bg-slate-950 border border-slate-700 text-white px-2 py-2 rounded-lg text-sm flex-1 sm:w-32 outline-none">
                        <option value="All">Tutte</option>
                        {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    
                    <button 
                        onClick={() => {
                            setTempItemFormData({ name: '', quantity: 1, category: activeSection?.name || '', notes: '' });
                            setIsTempItemModalOpen(true);
                        }}
                        className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 font-bold text-xs transition-all shrink-0 shadow-lg shadow-amber-900/20"
                        title="Articolo Temporaneo"
                    >
                        <Plus size={14} /> <span className="hidden md:inline">Temp.</span><span className="md:hidden">T</span>
                    </button>

                    <button onClick={() => setIsNewItemModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg shrink-0" title="Nuovo Articolo"><Plus size={16} /></button>
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
                        title="Clicca per modificare l'oggetto master e i suoi accessori"
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

                  // Retrieve Kit Reminders if applicable
                  const originalKit = comp.type === 'kit' ? kits.find(k => k.id === comp.referenceId) : null;
                  const hasKitReminders = originalKit?.reminders && originalKit.reminders.length > 0;

                  // Highlight Logic
                  const isMainMatch = comp.name === highlightedItemName;
                  const isSubMatch = comp.contents?.some(c => c.name === highlightedItemName);
                  
                  // NEW LOGIC: if searching and not matched, hide completely
                  if (highlightedItemName && !isMainMatch && !isSubMatch) return null;

                  const isParentOfMatch = highlightedItemName && isSubMatch;

                  const hasAccessories = comp.contents && comp.contents.length > 0;
                  const isDragOver = isDragging && activeDragOverIdx === idx && activeDragOverSectionId === activeSection.id;

                  return (
                      <div 
                           key={comp.uniqueId} 
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
                                              onClick={(e) => { e.stopPropagation(); setHighlightedItemName(highlightedItemName === comp.name ? null : comp.name); }}
                                              title="Clicca per evidenziare ovunque"
                                          >
                                              {comp.name} 
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
                                              {hasKitReminders && (
                                                  <button 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        const newSet = new Set(openRemindersIds);
                                                        if (newSet.has(comp.uniqueId)) newSet.delete(comp.uniqueId);
                                                        else newSet.add(comp.uniqueId);
                                                        setOpenRemindersIds(newSet);
                                                    }}
                                                    className={`p-0.5 rounded-full ${openRemindersIds.has(comp.uniqueId) ? 'bg-yellow-500 text-black' : 'text-yellow-500 hover:bg-yellow-900/30'} transition-colors`}
                                                    title="Ci sono cose da ricordare per questo kit!"
                                                  >
                                                      <Lightbulb size={12} className={openRemindersIds.has(comp.uniqueId) ? "fill-current" : ""} />
                                                  </button>
                                              )}
                                          </div>
                                          <div className="text-xs text-slate-500">{comp.category}</div>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    {/* MOBILE ACTIONS TOGGLE */}
                                    <div className="flex md:hidden items-center gap-1">
                                        {activeActionMenuId === comp.uniqueId ? (
                                            <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 animate-in slide-in-from-right-2">
                                                <button onClick={() => setReplacingComponentId(comp.uniqueId)} className={`p-2 rounded ${isReplacing ? 'text-amber-500 bg-amber-900/30' : 'text-slate-400'}`} title="Sostituisci">
                                                    <ArrowLeftRight size={16} />
                                                </button>
                                                <button onClick={() => { const s = new Set(openNoteIds); s.has(comp.uniqueId)?s.delete(comp.uniqueId):s.add(comp.uniqueId); setOpenNoteIds(s); }} className={`p-2 rounded ${comp.notes ? 'text-yellow-400' : 'text-slate-400'}`} title="Nota">
                                                    <StickyNote size={16} />
                                                </button>
                                                <button onClick={() => removeComponent(comp.uniqueId)} className="p-2 text-rose-500" title="Elimina">
                                                    <Trash2 size={16} />
                                                </button>
                                                <button onClick={() => setActiveActionMenuId(null)} className="p-2 text-slate-500 border-l border-slate-700 ml-1">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => setActiveActionMenuId(comp.uniqueId)}
                                                className="p-2 bg-slate-800 text-slate-400 rounded-lg border border-slate-700"
                                            >
                                                <Settings2 size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {/* DESKTOP ACTIONS (Always visible on md+) */}
                                    <div className="hidden md:flex items-center gap-1">

                                        <button onClick={() => setReplacingComponentId(comp.uniqueId)} className={`p-1.5 rounded ${isReplacing ? 'text-amber-500 bg-amber-900/30' : 'text-slate-500 hover:bg-slate-700 hover:text-white'}`} title="Sostituisci Oggetto">
                                            <ArrowLeftRight size={14} />
                                        </button>

                                        <button onClick={() => { const s = new Set(openNoteIds); s.has(comp.uniqueId)?s.delete(comp.uniqueId):s.add(comp.uniqueId); setOpenNoteIds(s); }} className={`p-1.5 rounded ${comp.notes ? 'text-yellow-400' : 'text-slate-500 hover:text-white'}`} title="Aggiungi/Modifica Nota">
                                            <StickyNote size={14} />
                                        </button>
                                        
                                        <button onClick={() => removeComponent(comp.uniqueId)} className="p-1.5 ml-1 text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                                    </div>
                                    
                                    {/* QTY CONTROLS - ULTRA COMPACT */}
                                    <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden ml-1 sm:ml-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); updateComponentQty(comp.uniqueId, Math.max(1, comp.quantity - 1)); }} 
                                            className="p-1 px-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors border-r border-slate-800"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input 
                                            ref={el => { qtyInputRefs.current[comp.uniqueId] = el }} 
                                            type="number" 
                                            min="1" 
                                            className="w-7 h-7 bg-transparent text-center text-white text-xs outline-none appearance-none font-bold" 
                                            value={comp.quantity} 
                                            onChange={(e) => updateComponentQty(comp.uniqueId, Number(e.target.value))}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    pickerInputRef.current?.focus();
                                                    pickerInputRef.current?.select();
                                                }
                                            }}
                                        />
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); updateComponentQty(comp.uniqueId, comp.quantity + 1); }} 
                                            className="p-1 px-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors border-l border-slate-800"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                               </div>
                          </div>
                          
                          {/* KIT REMINDERS PANEL */}
                          {openRemindersIds.has(comp.uniqueId) && hasKitReminders && (
                              <div className="mt-2 mx-2 bg-yellow-900/20 border border-yellow-700/30 rounded p-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                  <div className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-2 flex items-center gap-2">
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

                          {/* Contents (Kits, Machines, Templates) */}
                          {((comp.contents && comp.contents.length > 0) || (comp.templateContents && comp.templateContents.length > 0)) && (
                            <div className="mt-2 ml-7 pl-3 border-l-2 border-slate-700 space-y-1.5 animate-in fade-in duration-300">
                                {/* Standard Machine Contents / Kit Items */}
                                {comp.contents?.map((c, i) => {
                                    const isAccMissing = c.itemId ? !inventory.some(inv => inv.id === c.itemId) : false;
                                    const isChildMatch = highlightedItemName && c.name === highlightedItemName;

                                    return (
                                        <div key={`acc-${i}`} className={`text-xs flex justify-between w-full max-w-md leading-tight group/acc ${isChildMatch ? 'text-blue-400' : 'text-slate-400'}`}>
                                            <span className="flex items-center gap-1 min-w-0">
                                                {isAccMissing && (
                                                    <AlertTriangle size={10} className="text-rose-500 shrink-0" />
                                                )}
                                                <span 
                                                    className={`truncate cursor-pointer hover:underline ${isAccMissing ? 'text-rose-900 line-through decoration-rose-500/50' : ''} ${isChildMatch ? 'font-bold underline' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); setHighlightedItemName(highlightedItemName === c.name ? null : c.name); }}
                                                >
                                                    {c.name}
                                                </span>
                                            </span>
                                            <span className="shrink-0 pl-2 opacity-60">x{c.quantity * comp.quantity}</span>
                                        </div>
                                    );
                                })}

                                {/* Expanded Template Contents */}
                                {comp.templateContents?.map((tc, i) => {
                                    const isChildMatch = highlightedItemName && tc.name === highlightedItemName;
                                    const hasSubContents = tc.contents && tc.contents.length > 0;
                                    
                                    return (
                                        <div key={`tmpl-child-${i}`} className="space-y-1">
                                            <div className={`text-xs flex justify-between w-full max-w-md leading-tight group/tmpl ${isChildMatch ? 'text-blue-400' : 'text-emerald-400/90'}`}>
                                                <span className="flex items-center gap-1 min-w-0">
                                                    <span 
                                                        className={`truncate cursor-pointer hover:underline font-medium ${isChildMatch ? 'font-bold underline text-blue-400' : ''}`}
                                                        onClick={(e) => { e.stopPropagation(); setHighlightedItemName(highlightedItemName === tc.name ? null : tc.name); }}
                                                    >
                                                        {tc.name}
                                                    </span>
                                                    {tc.type === 'kit' && <span className="text-xs bg-emerald-900/40 text-emerald-300 px-1 rounded uppercase font-bold shrink-0">Kit</span>}
                                                </span>
                                                <span className="shrink-0 pl-2 opacity-70">x{tc.quantity * comp.quantity}</span>
                                            </div>
                                            
                                            {/* Nested Kit Items or Machine Accessories inside Template */}
                                            {hasSubContents && (
                                                <div className="ml-3 border-l border-emerald-900/30 pl-2 space-y-0.5">
                                                    {tc.contents?.map((sub, si) => {
                                                        const isSubMatch = highlightedItemName && sub.name === highlightedItemName;
                                                        return (
                                                            <div key={si} className={`text-xs flex justify-between w-full max-w-sm leading-tight ${isSubMatch ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                                                                <span 
                                                                    className="truncate cursor-pointer hover:underline"
                                                                    onClick={(e) => { e.stopPropagation(); setHighlightedItemName(highlightedItemName === sub.name ? null : sub.name); }}
                                                                >
                                                                    - {sub.name}
                                                                </span>
                                                                <span className="shrink-0 pl-2 opacity-50">x{sub.quantity * tc.quantity * comp.quantity}</span>
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

      <ItemFormModal isOpen={isNewItemModalOpen} onClose={() => setIsNewItemModalOpen(false)} onSave={handleCreateNewItem} title="Nuovo Materiale" inventory={inventory} onCreateAccessory={handleCreateInventoryItemOnly} initialName={pickerSearch} />

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
        title="Modifica Materiale Master" 
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
        title="Modifica Kit Master"
      />

      {/* Temporary Item Modal */}
      <Modal isOpen={isTempItemModalOpen} onClose={() => setIsTempItemModalOpen(false)} title="Aggiungi Articolo Temporaneo">
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
                  <button onClick={() => setIsTempItemModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Annulla</button>
                  <button 
                      onClick={handleSaveTempItem}
                      disabled={!tempItemFormData.name}
                      className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                      Aggiungi
                  </button>
              </div>
          </div>
      </Modal>
      
      {/* Event Details Modal */}
      <EventFormModal 
          isOpen={isEventModalOpen} 
          onClose={() => setIsEventModalOpen(false)} 
          initialData={eventFormData}
          onSave={(data) => {
              setEventFormData(data);
              // Wait for React to apply state, then call save. Or modify handleSaveEvent to accept data.
              // We will just patch the internal state and trigger save.
              setTimeout(() => handleSaveEvent(data), 0);
          }}
      />

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

      {replacingComponentId && <div className="absolute inset-x-0 top-0 z-20 bg-amber-900/95 border-b border-amber-500/50 p-4 shadow-xl text-center text-amber-100 font-bold"><ArrowLeftRight className="inline mr-2"/> Modalità Sostituzione <button onClick={() => setReplacingComponentId(null)} className="ml-4 underline text-sm font-normal">Annulla</button></div>}
      </div>
  );
};
