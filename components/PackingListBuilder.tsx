import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Trash2, FileDown, Settings2, Box, Package as PackageIcon, Calendar, MapPin, ClipboardList, StickyNote, Edit2, Filter, CheckSquare, Square, Scissors, Clipboard, ClipboardCopy, X, ArrowLeftRight, GripVertical, Lightbulb } from 'lucide-react';
import { InventoryItem, Kit, PackingList, ListSection, ListComponent, Category } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PackingListBuilderProps {
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  kits: Kit[];
  lists: PackingList[];
  setLists: React.Dispatch<React.SetStateAction<PackingList[]>>;
  activeListId: string;
  setActiveListId: React.Dispatch<React.SetStateAction<string>>;
}

export const PackingListBuilder: React.FC<PackingListBuilderProps> = ({ 
  inventory, 
  setInventory, 
  kits, 
  lists, 
  setLists, 
  activeListId, 
  setActiveListId 
}) => {
  // Selection State
  const [activeSectionId, setActiveSectionId] = useState<string>('');

  // Search/Picker State
  const [pickerSearch, setPickerSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'items' | 'kits' | 'suggestions'>('items');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // LIST LOCAL SEARCH STATE
  const [listSearch, setListSearch] = useState('');

  // Note Toggle State
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set());
  
  // Deletion State for LIST
  const [isDeleteListModalOpen, setIsDeleteListModalOpen] = useState(false);
  
  // Deletion State for SECTION
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);

  // MULTI-SELECTION & CLIPBOARD STATE
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ListComponent[]>([]);

  // REPLACEMENT STATE
  const [replacingComponentId, setReplacingComponentId] = useState<string | null>(null);

  // New Item Modal
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  
  // Section Management Modal State
  const [sectionModal, setSectionModal] = useState<{
    isOpen: boolean;
    type: 'create' | 'rename';
    sectionId?: string;
    name: string;
  }>({
    isOpen: false,
    type: 'create',
    name: ''
  });

  // DRAG AND DROP STATE
  const dragItem = useRef<{ sectionId: string, index: number, uniqueId: string } | null>(null);
  const dragOverItem = useRef<{ sectionId: string, index: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-focus Refs
  const qtyInputRefs = useRef<{ [uniqueId: string]: HTMLInputElement | null }>({});
  const [lastAddedComponentId, setLastAddedComponentId] = useState<string | null>(null);

  // Derived State
  const activeList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);
  const sections = activeList?.sections || [];
  const activeSection = sections.find(s => s.id === activeSectionId);

  // --- Map of Quantities currently in the List ---
  const quantitiesInList = useMemo(() => {
    const map = new Map<string, number>();
    if (!activeList) return map;

    activeList.sections.forEach(section => {
        section.components.forEach(comp => {
            const current = map.get(comp.referenceId) || 0;
            map.set(comp.referenceId, current + comp.quantity);
        });
    });
    return map;
  }, [activeList]);

  // --- FILTERED PICKER ITEMS (With Optimized Scoring) ---
  const filteredPickerItems = useMemo(() => {
      const searchTokens = (pickerSearch || '').toLowerCase().split(' ').filter(t => t.trim() !== '');
      
      return inventory
        .map(item => {
            const name = (item.name || '').toLowerCase();
            const cat = (item.category || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const combined = `${name} ${cat} ${desc}`;

            // Strict Filter
            if (!searchTokens.every(token => combined.includes(token))) return { item, score: -1, nameMatches: 0 };
            if (selectedCategory !== 'All' && item.category !== selectedCategory) return { item, score: -1, nameMatches: 0 };

            // Score
            let score = 0;
            let nameMatches = 0;

            if (searchTokens.length === 0) {
                score = 1; 
            } else {
                searchTokens.forEach(token => {
                    const inName = name.includes(token);
                    if (inName) {
                        nameMatches++;
                        if (name === token) score += 1000;
                        else if (name.startsWith(token)) score += 500;
                        else if (name.includes(" " + token)) score += 200;
                        else score += 100;
                    }
                    
                    if (cat.includes(token)) score += 20;
                    if (desc.includes(token)) score += 5;
                });
            }
            return { item, score, nameMatches };
        })
        .filter(x => x.score > -1)
        .sort((a, b) => {
            // 1. Priority: Amount of search terms found in the NAME
            if (b.nameMatches !== a.nameMatches) {
                return b.nameMatches - a.nameMatches;
            }
            // 2. Priority: Score
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return (a.item.name || '').localeCompare(b.item.name || '');
        })
        .map(x => x.item);
  }, [inventory, pickerSearch, selectedCategory]);

  // --- FILTERED PICKER KITS (With Optimized Scoring) ---
  const filteredPickerKits = useMemo(() => {
      const searchTokens = (pickerSearch || '').toLowerCase().split(' ').filter(t => t.trim() !== '');

      return kits
        .map(kit => {
            const name = (kit.name || '').toLowerCase();
            const cat = (kit.category || '').toLowerCase();
            const desc = (kit.description || '').toLowerCase();
            const combined = `${name} ${cat} ${desc}`;

            if (!searchTokens.every(token => combined.includes(token))) return { kit, score: -1, nameMatches: 0 };
            if (selectedCategory !== 'All' && kit.category !== selectedCategory) return { kit, score: -1, nameMatches: 0 };

            let score = 0;
            let nameMatches = 0;

            if (searchTokens.length === 0) {
                score = 1;
            } else {
                searchTokens.forEach(token => {
                    const inName = name.includes(token);
                    if (inName) {
                        nameMatches++;
                        if (name === token) score += 1000;
                        else if (name.startsWith(token)) score += 500;
                        else if (name.includes(" " + token)) score += 200;
                        else score += 100;
                    }
                    if (cat.includes(token)) score += 20;
                    if (desc.includes(token)) score += 5;
                });
            }
            return { kit, score, nameMatches };
        })
        .filter(x => x.score > -1)
        .sort((a, b) => {
            if (b.nameMatches !== a.nameMatches) return b.nameMatches - a.nameMatches;
            if (b.score !== a.score) return b.score - a.score;
            return (a.kit.name || '').localeCompare(b.kit.name || '');
        })
        .map(x => x.kit);
  }, [kits, pickerSearch, selectedCategory]);


  // --- FILTERED LIST COMPONENTS (Local Search) ---
  const filteredListComponents = useMemo(() => {
    if (!activeSection) return [];
    if (!listSearch.trim()) return activeSection.components;

    const term = listSearch.toLowerCase();
    return activeSection.components.filter(c => 
      (c.name || '').toLowerCase().includes(term) || 
      (c.notes || '').toLowerCase().includes(term) ||
      c.contents?.some(sub => (sub.name || '').toLowerCase().includes(term))
    );
  }, [activeSection, listSearch]);

  // --- SAFETY CHECK: Ensure activeListId is valid ---
  useEffect(() => {
    // We only reset if we have lists BUT no active list is found.
    // We check specifically if activeListId is not empty to avoid overwriting a pending selection
    if (lists.length > 0) {
        const found = lists.find(l => l.id === activeListId);
        if (!found) {
            // Fallback to the last list (usually the one just added) or first
             console.warn("Active List ID not found in lists. Switching to last available list.");
             setActiveListId(lists[lists.length - 1].id);
        }
    } else if (lists.length === 0 && activeListId !== '') {
        setActiveListId('');
    }
  }, [lists, activeListId, setActiveListId]);
  
  // Set initial active section when switching lists or when mounting
  useEffect(() => {
    if (activeList) {
       // If no section is selected OR the selected section no longer exists in this list
       const currentSectionExists = activeList.sections.find(s => s.id === activeSectionId);
       
       if (!activeSectionId || !currentSectionExists) {
          // 1. Try to recover from localStorage
          const savedSectionId = localStorage.getItem(`cuepack_last_section_${activeList.id}`);
          const savedSectionExists = activeList.sections.find(s => s.id === savedSectionId);

          if (savedSectionId && savedSectionExists) {
              setActiveSectionId(savedSectionId);
          } else if (activeList.sections.length > 0) {
              // 2. Fallback to first section
              setActiveSectionId(activeList.sections[0].id);
          } else {
              setActiveSectionId('');
          }
       }
    } else {
        setActiveSectionId('');
    }
  }, [activeListId, activeList, activeSectionId]); // Removed 'sections' dep to avoid loops, activeList handles it

  // Reset selection and SEARCH when switching lists/sections
  useEffect(() => {
      setSelectedIds(new Set());
      setClipboard([]);
      setReplacingComponentId(null);
      setListSearch(''); // Clear search when switching context
  }, [activeListId, activeSectionId]);

  // Effect to auto-focus newly added item's quantity
  useEffect(() => {
    if (lastAddedComponentId && qtyInputRefs.current[lastAddedComponentId]) {
      qtyInputRefs.current[lastAddedComponentId]?.focus();
      qtyInputRefs.current[lastAddedComponentId]?.select();
      setLastAddedComponentId(null);
    }
  }, [sections, lastAddedComponentId]);

  // --- List Management ---

  const handleCreateList = () => {
    const newList: PackingList = {
      id: crypto.randomUUID(),
      eventName: 'Nuovo Evento',
      eventDate: '',
      location: '',
      creationDate: new Date().toISOString(),
      notes: '',
      sections: [
        { id: crypto.randomUUID(), name: 'Audio', components: [] },
        { id: crypto.randomUUID(), name: 'Luci', components: [] },
        { id: crypto.randomUUID(), name: 'Video', components: [] },
        { id: crypto.randomUUID(), name: 'Regia', components: [] },
      ],
      checklistEnabledSectors: [],
      checklistCheckedItems: []
    };
    setLists([...lists, newList]);
    setActiveListId(newList.id);
  };

  const confirmDeleteList = () => {
    if (!activeList) return;
    
    // Calculate new lists first
    const newLists = lists.filter(l => l.id !== activeListId);
    
    // Determine what the next ID should be BEFORE updating state
    let nextId = '';
    if (newLists.length > 0) {
      // Switch to the previous one in the list, or the first one
      nextId = newLists[newLists.length - 1].id;
    }

    setLists(newLists);
    setActiveListId(nextId);
  };

  const updateActiveList = (updates: Partial<PackingList>) => {
    setLists(prev => prev.map(l => l.id === activeListId ? { ...l, ...updates } : l));
  };

  // --- Multi-Selection & Clipboard Logic ---

  const toggleSelection = (uniqueId: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(uniqueId)) {
        newSet.delete(uniqueId);
    } else {
        newSet.add(uniqueId);
    }
    setSelectedIds(newSet);
  };

  const selectAllInSection = () => {
      if (!activeList || !activeSectionId) return;
      const section = activeList.sections.find(s => s.id === activeSectionId);
      if (!section) return;

      const newSet = new Set(selectedIds);
      section.components.forEach(c => newSet.add(c.uniqueId));
      setSelectedIds(newSet);
  };

  const deselectAll = () => {
      setSelectedIds(new Set());
  };

  const getSelectedComponents = (): ListComponent[] => {
      if (!activeList) return [];
      const allComponents = activeList.sections.flatMap(s => s.components);
      return allComponents.filter(c => selectedIds.has(c.uniqueId));
  };

  const handleCopy = () => {
      const itemsToCopy = getSelectedComponents();
      if (itemsToCopy.length > 0) {
          setClipboard(itemsToCopy);
      }
  };

  const handleCut = () => {
      const itemsToCut = getSelectedComponents();
      if (itemsToCut.length > 0) {
          setClipboard(itemsToCut);
          handleBulkDelete();
      }
  };

  const handlePaste = () => {
      if (!activeList || !activeSectionId || clipboard.length === 0) return;

      const newComponents = clipboard.map(item => ({
          ...item,
          uniqueId: crypto.randomUUID(), // MUST generate new ID
      }));

      const newSections = sections.map(s => {
          if (s.id === activeSectionId) {
              return { ...s, components: [...s.components, ...newComponents] };
          }
          return s;
      });

      updateActiveList({ sections: newSections });
      setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
      if (!activeList || selectedIds.size === 0) return;

      const newSections = sections.map(s => ({
          ...s,
          components: s.components.filter(c => !selectedIds.has(c.uniqueId))
      }));

      updateActiveList({ sections: newSections });
      setSelectedIds(new Set());
  };


  // --- Section Management ---

  const openAddSectionModal = () => {
    setSectionModal({
        isOpen: true,
        type: 'create',
        name: ''
    });
  };
  
  const openRenameSectionModal = (id: string, currentName: string) => {
    setSectionModal({
        isOpen: true,
        type: 'rename',
        sectionId: id,
        name: currentName
    });
  };

  const handleSectionModalSave = () => {
      if (!activeList || !sectionModal.name.trim()) return;
      
      if (sectionModal.type === 'create') {
          const newId = crypto.randomUUID();
          const newSection: ListSection = { id: newId, name: sectionModal.name.trim(), components: [] };
          updateActiveList({ sections: [...sections, newSection] });
          setActiveSectionId(newId);
          // SAVE TO LS
          localStorage.setItem(`cuepack_last_section_${activeList.id}`, newId);
      } else {
          // Rename
           const newSections = sections.map(s => s.id === sectionModal.sectionId ? { ...s, name: sectionModal.name.trim() } : s);
           updateActiveList({ sections: newSections });
      }
      setSectionModal(prev => ({ ...prev, isOpen: false }));
  };

  const handleRemoveSectionClick = (id: string) => {
      setSectionToDelete(id);
  };

  const confirmRemoveSection = () => {
    if (!activeList || !sectionToDelete) return;
    if (sections.length <= 1) {
        setSectionToDelete(null);
        return;
    }

    const newSections = sections.filter(s => s.id !== sectionToDelete);
    updateActiveList({ sections: newSections });
    setSectionToDelete(null);
  };

  // --- Component Management ---

  const generateComponentFromItem = (item: InventoryItem | Kit, type: 'item' | 'kit'): Omit<ListComponent, 'uniqueId' | 'quantity' | 'notes'> => {
      if (type === 'kit') {
        const k = item as Kit;
        const kitContents = k.items.map(ki => {
          const invItem = inventory.find(i => i.id === ki.itemId);
          return {
            itemId: invItem?.id, // Important: Save itemId to track updates!
            name: invItem?.name || 'Unknown',
            quantity: ki.quantity,
            category: invItem?.category || 'Altro'
          };
        });

        return {
          type: 'kit',
          referenceId: k.id,
          name: k.name,
          category: 'Kit',
          contents: kitContents,
        };
      } else {
        const i = item as InventoryItem;
        
        let itemAccessories: { itemId?: string; name: string; quantity: number; category: string }[] | undefined = undefined;
        if (i.accessories && i.accessories.length > 0) {
            itemAccessories = i.accessories.map(acc => {
                const accItem = inventory.find(inv => inv.id === acc.itemId);
                return {
                    itemId: acc.itemId, // Important: Save itemId to track updates!
                    name: accItem?.name || 'Accessorio Sconosciuto',
                    quantity: acc.quantity,
                    category: accItem?.category || 'Altro'
                };
            });
        }

        return {
          type: 'item',
          referenceId: i.id,
          name: i.name,
          category: i.category,
          contents: itemAccessories,
        };
      }
  };

  const addToSection = (item: InventoryItem | Kit, type: 'item' | 'kit') => {
    if (!activeList || !activeSection) return;

    // --- REPLACEMENT LOGIC ---
    if (replacingComponentId) {
        // Check if the target item already exists in the section (to avoid duplicates)
        const targetReferenceId = item.id;
        const existingDuplicate = activeSection.components.find(
            c => c.type === type && c.referenceId === targetReferenceId && c.uniqueId !== replacingComponentId
        );

        if (existingDuplicate) {
             // MERGE SCENARIO: The item we want to swap in already exists.
             // We take the quantity from the replaced item and add it to the existing duplicate.
             const componentBeingReplaced = activeSection.components.find(c => c.uniqueId === replacingComponentId);
             const qtyToTransfer = componentBeingReplaced ? componentBeingReplaced.quantity : 1;

             const newSections = sections.map(s => {
                if (s.id === activeSectionId) {
                    return {
                        ...s,
                        components: s.components
                            .filter(c => c.uniqueId !== replacingComponentId) // Remove the replaced item
                            .map(c => {
                                if (c.uniqueId === existingDuplicate.uniqueId) {
                                    // Add quantity to existing item
                                    return { ...c, quantity: c.quantity + qtyToTransfer };
                                }
                                return c;
                            })
                    };
                }
                return s;
             });
             updateActiveList({ sections: newSections });
        } else {
            // STANDARD REPLACE SCENARIO
            const newComponentData = generateComponentFromItem(item, type);
            
            const newSections = sections.map(s => ({
                ...s,
                components: s.components.map(c => {
                    if (c.uniqueId === replacingComponentId) {
                        return {
                            ...c,
                            ...newComponentData,
                            // Maintain quantity and notes, uniqueId
                        };
                    }
                    return c;
                })
            }));
            
            updateActiveList({ sections: newSections });
        }
        
        setReplacingComponentId(null);
        return;
    }

    // --- STANDARD ADD LOGIC ---
    // 1. Check if the component already exists in this section
    const existingComponent = activeSection.components.find(
      c => c.type === type && c.referenceId === item.id
    );

    if (existingComponent) {
      // CASE A: It exists, increment quantity
      const newSections = sections.map(s => {
        if (s.id === activeSectionId) {
          return {
            ...s,
            components: s.components.map(c => 
              c.uniqueId === existingComponent.uniqueId 
                ? { ...c, quantity: c.quantity + 1 }
                : c
            )
          };
        }
        return s;
      });
      updateActiveList({ sections: newSections });
      setLastAddedComponentId(existingComponent.uniqueId);

    } else {
      // CASE B: It's new, create and add
      const baseData = generateComponentFromItem(item, type);
      const component: ListComponent = {
          uniqueId: crypto.randomUUID(),
          quantity: 1,
          notes: '',
          ...baseData
      };

      const newSections = sections.map(s => {
        if (s.id === activeSectionId) {
          return { ...s, components: [...s.components, component] };
        }
        return s;
      });

      updateActiveList({ sections: newSections });
      setLastAddedComponentId(component.uniqueId);
    }
  };

  const updateComponentQty = (sectionId: string, uniqueId: string, qty: number) => {
    if (qty < 1 || !activeList) return;
    const newSections = sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          components: s.components.map(c => c.uniqueId === uniqueId ? { ...c, quantity: qty } : c)
        };
      }
      return s;
    });
    updateActiveList({ sections: newSections });
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, sectionId: string, index: number, uniqueId: string) => {
      // Logic: If dragging an item that IS NOT selected, select ONLY that item.
      // If dragging an item that IS selected, keep the current selection (allowing multi-drag).
      if (!selectedIds.has(uniqueId)) {
          setSelectedIds(new Set([uniqueId]));
      }

      dragItem.current = { sectionId, index, uniqueId };
      setIsDragging(true);
      // e.dataTransfer.effectAllowed = "move"; // Optional: customize cursor
  };

  const handleDragEnter = (e: React.DragEvent, sectionId: string, index: number) => {
      e.preventDefault(); // allow drop
      dragOverItem.current = { sectionId, index };
  };

  const handleDragEnd = () => {
      setIsDragging(false);
      
      // If valid drop target and dropping in same section (simplification for now)
      if (dragItem.current && dragOverItem.current && activeList) {
          const sourceSectionId = dragItem.current.sectionId;
          const destSectionId = dragOverItem.current.sectionId;
          const destIndex = dragOverItem.current.index; // Index in the ORIGINAL list where we dropped

          if (sourceSectionId === destSectionId) {
              const section = sections.find(s => s.id === sourceSectionId);
              if (section) {
                  // Determine exactly which items are moving
                  // If the dragged item was part of the selection, move ALL selected items.
                  // Otherwise (shouldn't happen due to DragStart logic, but safe fallback), move just the dragged one.
                  let idsToMove = new Set<string>();
                  if (selectedIds.has(dragItem.current.uniqueId)) {
                      idsToMove = selectedIds;
                  } else {
                      idsToMove.add(dragItem.current.uniqueId);
                  }

                  const targetComponent = section.components[destIndex];

                  // Prevent dropping onto itself or onto another selected item (no-op for simplicity)
                  if (!idsToMove.has(targetComponent.uniqueId)) {
                      
                      // Split list into "Moving" and "Staying"
                      // We filter based on the 'idsToMove' set to preserve original relative order of moving items
                      const itemsToMove: ListComponent[] = [];
                      const itemsToStay: ListComponent[] = [];

                      section.components.forEach(c => {
                          if (idsToMove.has(c.uniqueId)) {
                              itemsToMove.push(c);
                          } else {
                              itemsToStay.push(c);
                          }
                      });

                      // Find the new insertion index in the "itemsToStay" array.
                      // We look for the component we dropped ONTO.
                      let insertionIndex = itemsToStay.findIndex(c => c.uniqueId === targetComponent.uniqueId);
                      
                      // If we dropped onto an item, we insert BEFORE it.
                      // Note: If dragging downwards, users sometimes expect 'after', but 'before' is standard "insert" logic.
                      if (insertionIndex === -1) {
                          // Should not happen if logic is correct, append to end fallback
                          insertionIndex = itemsToStay.length;
                      }

                      // Reconstruct
                      const newComponents = [
                          ...itemsToStay.slice(0, insertionIndex),
                          ...itemsToMove,
                          ...itemsToStay.slice(insertionIndex)
                      ];

                      const newSections = sections.map(s => s.id === sourceSectionId ? { ...s, components: newComponents } : s);
                      updateActiveList({ sections: newSections });
                  }
              }
          }
      }

      dragItem.current = null;
      dragOverItem.current = null;
  };
  
  const updateComponentNote = (sectionId: string, uniqueId: string, note: string) => {
    if (!activeList) return;
    const newSections = sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          components: s.components.map(c => c.uniqueId === uniqueId ? { ...c, notes: note } : c)
        };
      }
      return s;
    });
    updateActiveList({ sections: newSections });
  };
  
  const toggleNoteInput = (uniqueId: string) => {
    const newSet = new Set(openNoteIds);
    if (newSet.has(uniqueId)) {
      newSet.delete(uniqueId);
    } else {
      newSet.add(uniqueId);
    }
    setOpenNoteIds(newSet);
  };

  const removeComponent = (sectionId: string, uniqueId: string) => {
    if (!activeList) return;
    const newSections = sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, components: s.components.filter(c => c.uniqueId !== uniqueId) };
      }
      return s;
    });
    updateActiveList({ sections: newSections });
    if (selectedIds.has(uniqueId)) {
        const newSet = new Set(selectedIds);
        newSet.delete(uniqueId);
        setSelectedIds(newSet);
    }
  };

  const handleStartReplace = (uniqueId: string) => {
      setReplacingComponentId(uniqueId);
  };

  // FIX: Generate a valid ID for new items created via quick-add modal
  const handleCreateNewItem = (itemData: Omit<InventoryItem, 'id'>) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: crypto.randomUUID()
    };
    setInventory(prev => [...prev, newItem]);
    addToSection(newItem, 'item');
  };
  
  // Updated to accept the full item
  const handleCreateAccessory = (newItem: InventoryItem) => {
     setInventory(prev => [...prev, newItem]);
  };

  // --- SUGGESTION LOGIC ---
  const getSuggestedItems = () => {
    if (!activeSection) return [];
    
    // 1. Analyze categories present in the current section
    const categoriesPresent = new Set<string>();
    activeSection.components.forEach(c => {
        categoriesPresent.add(c.category);
    });

    // 2. Define suggestion rules
    const suggestions = inventory.filter(item => {
        const n = item.name.toLowerCase();
        const c = item.category;

        // A. Always suggest Consumables/Essentials
        const isEssential = 
            n.includes('nastro') || 
            n.includes('gaffa') || 
            n.includes('batterie') || 
            n.includes('fascette') || 
            n.includes('ciabatta') ||
            n.includes('adattatore');
        
        if (isEssential) return true;

        // B. Contextual suggestions
        if (categoriesPresent.has(Category.AUDIO)) {
            // Suggest Audio Cables & Stands
            if (c === Category.CABLES && (n.includes('xlr') || n.includes('speakon') || n.includes('jack'))) return true;
            if (c === Category.STRUCTURE && (n.includes('asta') || n.includes('stativo'))) return true;
        }

        if (categoriesPresent.has(Category.LIGHTS)) {
            // Suggest DMX, Powercon, Clamps, Safety
            if (c === Category.CABLES && (n.includes('dmx') || n.includes('powercon') || n.includes('trueone'))) return true;
            if (c === Category.STRUCTURE && (n.includes('gancio') || n.includes('safety') || n.includes('aliscaf'))) return true;
        }

        if (categoriesPresent.has(Category.VIDEO)) {
             // Suggest Video Cables
             if (c === Category.CABLES && (n.includes('hdmi') || n.includes('bnc') || n.includes('ethercon') || n.includes('rete'))) return true;
        }

        return false;
    });

    // 3. Sort priorities (Essentials first)
    return suggestions.sort((a, b) => {
        const aEssential = a.name.toLowerCase().includes('nastro') || a.name.toLowerCase().includes('batterie');
        const bEssential = b.name.toLowerCase().includes('nastro') || b.name.toLowerCase().includes('batterie');
        if (aEssential && !bEssential) return -1;
        if (!aEssential && bEssential) return 1;
        return a.name.localeCompare(b.name);
    });
  };

  const suggestedItems = activeTab === 'suggestions' ? getSuggestedItems() : [];


  // --- Calculate Global Totals for Export ---
  const calculateGlobalTotals = () => {
    if (!activeList) return new Map<string, number>();

    const totalsMap = new Map<string, number>();

    activeList.sections.forEach(section => {
      section.components.forEach(comp => {
        // 1. Add the component itself (Kit Name or Item Name)
        const currentCompTotal = totalsMap.get(comp.name) || 0;
        totalsMap.set(comp.name, currentCompTotal + comp.quantity);

        // 2. Add its contents (Kit items or Accessories)
        if (comp.contents) {
          comp.contents.forEach(sub => {
            const qtyToAdd = sub.quantity * comp.quantity;
            const currentSubTotal = totalsMap.get(sub.name) || 0;
            totalsMap.set(sub.name, currentSubTotal + qtyToAdd);
          });
        }
      });
    });

    return totalsMap;
  };

  // --- Export ---
  const exportPDF = () => {
    if (!activeList) return;
    
    // Calculate global totals before generating PDF
    const globalTotals = calculateGlobalTotals();

    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.text(`LISTA MATERIALE "${activeList.eventName.toUpperCase()}"`, 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Evento: ${activeList.eventName}`, 14, 30);
    doc.text(`Luogo: ${activeList.location}`, 14, 36);
    doc.text(`Data: ${activeList.eventDate}`, 14, 42);

    let finalY = 50;

    activeList.sections.forEach(section => {
      if (section.components.length === 0) return;

      doc.setFontSize(14);
      doc.setFillColor(200, 200, 200);
      doc.rect(14, finalY, 182, 8, 'F');
      doc.setTextColor(0, 0, 0);
      doc.text(section.name.toUpperCase(), 16, finalY + 5.5);
      finalY += 10;

      const tableData: any[] = [];
      
      section.components.forEach(comp => {
        let nameContent = comp.name;
        if (comp.type === 'kit') {
          nameContent = `[KIT] ${comp.name}`;
        }
        
        if (comp.notes) {
          nameContent += `\nNOTE: ${comp.notes}`;
        }

        const totalQty = globalTotals.get(comp.name) || 0;
        tableData.push([nameContent, comp.quantity, totalQty, '']);
        
        if (comp.contents && comp.contents.length > 0) {
          comp.contents.forEach(subItem => {
            const subTotalQty = globalTotals.get(subItem.name) || 0;
            tableData.push([`  - ${subItem.name}`, subItem.quantity * comp.quantity, subTotalQty, '']);
          });
        }
      });

      autoTable(doc, {
        startY: finalY,
        head: [['Materiale', 'Qta', 'Totale', 'Check']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
        styles: { fontSize: 10, cellPadding: 2 },
        // Adjust column widths: Total column added
        columnStyles: { 
            0: { cellWidth: 110 }, 
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } 
        },
        didDrawPage: (data) => {
            finalY = data.cursor?.y || 0;
            const pageSize = doc.internal.pageSize;
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
            const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
            doc.setFontSize(8);
            doc.setTextColor(150);
            const pageStr = 'Pagina ' + data.pageNumber;
            doc.text(pageStr, pageWidth - 14, pageHeight - 10, { align: 'right' });
            doc.text("Generato con CUEPACK Manager", 14, pageHeight - 10);
        }
      });
      
      finalY = (doc as any).lastAutoTable.finalY + 10;
    });

    if (activeList.notes) {
        if (finalY > 250) {
            doc.addPage();
            finalY = 20;
        }
        doc.setFontSize(10);
        doc.setTextColor(0,0,0);
        doc.text("Note Magazzino:", 14, finalY);
        doc.setFontSize(9);
        doc.text(activeList.notes, 14, finalY + 5);
    }

    // Generate Filename: Name_YYYY-MM-DD_HH-mm
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    // Sanitize event name
    const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
    const fileName = `${safeName}_${year}-${month}-${day}_${hours}-${minutes}.pdf`;

    doc.save(fileName);
  };

  const exportCSV = () => {
    if (!activeList) return;
    
    // Calculate global totals
    const globalTotals = calculateGlobalTotals();

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Sezione,Tipo,Nome,Quantità Sezione,Totale Globale,Note,Contenuto Kit/Accessori\n";

    activeList.sections.forEach(s => {
      s.components.forEach(c => {
        const note = c.notes ? c.notes.replace(/"/g, '""') : '';
        const typeLabel = c.type === 'kit' ? 'KIT' : 'Singolo';
        const totalQty = globalTotals.get(c.name) || 0;
        
        csvContent += `${s.name},${typeLabel},${c.name},${c.quantity},${totalQty},"${note}",""\n`;
        
        if (c.contents && c.contents.length > 0) {
            c.contents.forEach(subItem => {
                const subLabel = c.type === 'kit' ? 'Parte Kit' : 'Accessorio';
                const subTotalQty = globalTotals.get(subItem.name) || 0;
                csvContent += `${s.name},${subLabel},${subItem.name},${subItem.quantity * c.quantity},${subTotalQty},"","Appartiene a: ${c.name}"\n`;
            });
        }
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    // Generate Filename: Name_YYYY-MM-DD_HH-mm
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const safeName = (activeList.eventName || 'evento').replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
    const fileName = `${safeName}_${year}-${month}-${day}_${hours}-${minutes}.csv`;

    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeReplacementComponent = replacingComponentId 
    ? activeSection?.components.find(c => c.uniqueId === replacingComponentId)
    : null;

  if (lists.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
        <ClipboardList size={64} className="opacity-20" />
        <h2 className="text-xl font-bold">Nessun evento presente</h2>
        <button 
          onClick={handleCreateList}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg flex items-center gap-2 font-medium transition-colors"
        >
          <Plus size={20} /> Crea Primo Evento
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row gap-0 md:gap-4 p-4 overflow-hidden">
      
      {/* LEFT: Builder & List Preview */}
      <div className="flex-1 flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
        
        {/* Top Bar: Event Management */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="bg-emerald-900/30 p-2 rounded-lg text-emerald-500">
               <Settings2 size={20} />
            </div>
            <div className="flex flex-col flex-1">
               <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Gestione Eventi</span>
               <div className="flex items-center gap-2">
                 <select 
                   value={activeListId} 
                   onChange={(e) => setActiveListId(e.target.value)}
                   className="bg-slate-900 border border-slate-700 text-white text-sm rounded p-1 pr-8 outline-none focus:border-emerald-500 cursor-pointer max-w-[200px] truncate"
                 >
                   {lists.map(l => (
                     <option key={l.id} value={l.id}>
                       {l.eventName ? l.eventName : 'Nuovo Evento'} ({l.eventDate ? l.eventDate : 'No Data'})
                     </option>
                   ))}
                 </select>
               </div>
            </div>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={handleCreateList}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium transition-colors"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Nuovo Evento</span>
            </button>
            <button 
              onClick={() => setIsDeleteListModalOpen(true)}
              className="px-3 py-2 bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-900/50 rounded transition-colors group"
              title="Elimina Evento"
            >
              <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>

        {/* Header Inputs for Active List */}
        {activeList && (
          <div className="p-3 bg-slate-800 border-b border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-500 font-bold text-xs">EV</span>
               </div>
               <input 
                placeholder="Nome Evento" 
                className="w-full bg-slate-900 border border-slate-700 pl-10 py-1.5 px-2 text-sm rounded text-white outline-none focus:border-emerald-500"
                value={activeList.eventName} 
                onChange={e => updateActiveList({ eventName: e.target.value })}
              />
            </div>
            <div className="relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MapPin size={14} className="text-slate-500" />
               </div>
               <input 
                placeholder="Location" 
                className="w-full bg-slate-900 border border-slate-700 pl-10 py-1.5 px-2 text-sm rounded text-white outline-none focus:border-emerald-500"
                value={activeList.location} 
                onChange={e => updateActiveList({ location: e.target.value })}
              />
            </div>
            <div className="relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar size={14} className="text-slate-500" />
               </div>
               <input 
                type="date"
                className="w-full bg-slate-900 border border-slate-700 pl-10 py-1.5 px-2 text-sm rounded text-white outline-none focus:border-emerald-500"
                value={activeList.eventDate} 
                onChange={e => updateActiveList({ eventDate: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* Section Tabs */}
        {activeList && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700 overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => {
                  setActiveSectionId(s.id);
                  // SAVE ACTIVE SECTION FOR THIS LIST
                  localStorage.setItem(`cuepack_last_section_${activeList.id}`, s.id);
              }}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 group
                ${activeSectionId === s.id 
                  ? 'bg-slate-700 text-white border-t border-x border-slate-600' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              {s.name}
              <span className="bg-slate-900 px-1.5 py-0.5 rounded-full text-xs text-slate-500">{s.components.length}</span>
              {activeSectionId === s.id && (
                  <div className="flex items-center gap-1 ml-1">
                      <span 
                        onClick={(e) => {
                            e.stopPropagation();
                            openRenameSectionModal(s.id, s.name);
                        }}
                        className="p-1 hover:bg-slate-600 rounded-full text-slate-400 hover:text-white transition-colors"
                        title="Rinomina Sezione"
                      >
                          <Edit2 size={12} />
                      </span>
                      {sections.length > 1 && (
                          <span 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSectionClick(s.id);
                            }}
                            className="p-1 hover:bg-slate-600 rounded-full text-slate-400 hover:text-rose-500 transition-colors"
                            title="Elimina Sezione"
                          >
                              <Trash2 size={12} />
                          </span>
                      )}
                  </div>
              )}
            </button>
          ))}
          <button 
            onClick={openAddSectionModal} 
            className="p-2 text-emerald-500 hover:bg-emerald-900/30 rounded-lg hover:text-emerald-400 transition-colors"
            title="Aggiungi Sezione"
          >
            <Plus size={18} />
          </button>
        </div>
        )}

        {/* BULK ACTIONS TOOLBAR */}
        {activeList && (selectedIds.size > 0 || clipboard.length > 0) && (
            <div className="px-4 py-2 bg-blue-900/20 border-b border-blue-900/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={selectAllInSection} className="text-xs text-blue-300 hover:text-white underline">Tutti</button>
                    <button onClick={deselectAll} className="text-xs text-blue-300 hover:text-white underline">Nessuno</button>
                    <span className="text-sm text-blue-200 font-medium ml-2">
                        {selectedIds.size} selezionati
                    </span>
                    {clipboard.length > 0 && (
                         <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                            Clipboard: {clipboard.length}
                         </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                        <>
                            <button onClick={handleCopy} className="p-1.5 text-blue-400 hover:bg-blue-900/40 rounded flex items-center gap-1 text-xs" title="Copia selezione">
                                <ClipboardCopy size={16} /> Copia
                            </button>
                            <button onClick={handleCut} className="p-1.5 text-blue-400 hover:bg-blue-900/40 rounded flex items-center gap-1 text-xs" title="Taglia selezione">
                                <Scissors size={16} /> Taglia
                            </button>
                            <button onClick={handleBulkDelete} className="p-1.5 text-rose-400 hover:bg-rose-900/40 rounded flex items-center gap-1 text-xs" title="Elimina selezionati">
                                <Trash2 size={16} /> Elimina
                            </button>
                        </>
                    )}
                    {clipboard.length > 0 && activeSectionId && (
                        <button onClick={handlePaste} className="ml-2 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1 shadow-lg shadow-emerald-900/20">
                            <Clipboard size={14} /> Incolla qui
                        </button>
                    )}
                </div>
            </div>
        )}

        {/* List Search Bar (Local Search) */}
        {activeSection && activeSection.components.length > 0 && (
            <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input 
                        type="text"
                        placeholder={`Cerca in ${activeSection.name}...`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-1 text-sm text-white focus:border-blue-500 outline-none"
                        value={listSearch}
                        onChange={(e) => setListSearch(e.target.value)}
                    />
                    {listSearch && (
                        <button 
                            onClick={() => setListSearch('')}
                            className="absolute right-2 top-2 text-slate-500 hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>
        )}

        {/* List Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-950/30">
          {!activeList ? (
             <div className="text-center py-20 text-slate-500">Seleziona o crea un evento</div>
          ) : !activeSection || activeSection.components.length === 0 ? (
            <div className="text-center py-20 text-slate-600">
              <Box size={48} className="mx-auto mb-4 opacity-50" />
              <p>Questa sezione è vuota. Aggiungi materiale dalla colonna di destra.</p>
              {clipboard.length > 0 && (
                   <button onClick={handlePaste} className="mt-4 text-emerald-500 hover:text-emerald-400 text-sm font-medium flex items-center justify-center gap-2">
                       <Clipboard size={16} /> Incolla {clipboard.length} elementi qui
                   </button>
              )}
            </div>
          ) : (
            filteredListComponents.map((comp, idx) => {
              const isNoteVisible = openNoteIds.has(comp.uniqueId) || !!comp.notes;
              const isSelected = selectedIds.has(comp.uniqueId);
              const isBeingReplaced = replacingComponentId === comp.uniqueId;
              const isBeingDragged = dragItem.current?.sectionId === activeSection.id && dragItem.current?.index === idx;
              
              return (
              <div 
                key={comp.uniqueId} 
                draggable={!listSearch} // Disable dragging while filtering to avoid index mismatches
                onDragStart={(e) => handleDragStart(e, activeSection.id, idx, comp.uniqueId)}
                onDragEnter={(e) => handleDragEnter(e, activeSection.id, idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className={`relative group p-2 rounded-lg border transition-all 
                ${isBeingReplaced
                    ? 'bg-amber-900/20 border-amber-500 ring-1 ring-amber-500'
                    : isBeingDragged
                        ? 'opacity-40 border-dashed border-blue-500'
                        : isSelected 
                            ? 'bg-blue-900/20 border-blue-500/50' 
                            : comp.type === 'kit' 
                                ? 'bg-purple-900/10 border-purple-900/30 hover:border-purple-500/30' 
                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                // Removed onClick={...} to disable row-wide selection
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 overflow-hidden">
                      {/* Selection Checkbox */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleSelection(comp.uniqueId); }}
                        className={`text-slate-500 hover:text-white transition-colors shrink-0 p-1 -ml-1 mr-2 cursor-pointer ${isSelected ? 'text-blue-500' : ''}`}
                        title="Seleziona"
                      >
                          {isSelected ? <CheckSquare size={18} className="text-blue-500" /> : <Square size={18} />}
                      </button>

                      {comp.type === 'kit' ? <PackageIcon size={18} className="text-purple-400 shrink-0" /> : <Box size={18} className="text-slate-400 shrink-0" />}
                      <div className="truncate">
                          <div className="font-medium text-slate-200 text-sm truncate">
                              {comp.name} 
                              {comp.type === 'kit' && <span className="ml-2 text-[10px] bg-purple-900 text-purple-200 px-1 rounded align-middle">KIT</span>}
                          </div>
                          <div className="text-xs text-slate-500 leading-tight">{comp.category}</div>
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
                       <button
                        onClick={() => handleStartReplace(comp.uniqueId)}
                        className={`p-1.5 rounded transition-colors ${isBeingReplaced ? 'text-amber-500 bg-amber-900/30' : 'text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                        title="Sostituisci Oggetto"
                      >
                        <ArrowLeftRight size={14} />
                      </button>

                      <button
                        onClick={() => toggleNoteInput(comp.uniqueId)}
                        className={`p-1.5 rounded transition-colors ${comp.notes ? 'text-yellow-400 hover:bg-yellow-900/20' : 'text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                        title="Aggiungi/Modifica Nota"
                      >
                        <StickyNote size={14} />
                      </button>
                      <input 
                          ref={(el) => { qtyInputRefs.current[comp.uniqueId] = el }}
                          type="number" 
                          min="1"
                          className="w-12 h-7 bg-slate-900 border border-slate-700 rounded px-1 text-center text-white text-sm focus:border-blue-500 outline-none"
                          value={comp.quantity}
                          onChange={(e) => updateComponentQty(activeSection.id, comp.uniqueId, Number(e.target.value))}
                      />
                      <button 
                          onClick={() => removeComponent(activeSection.id, comp.uniqueId)}
                          className="p-1.5 text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                          <Trash2 size={14} />
                      </button>
                  </div>
                </div>

                {isNoteVisible && (
                  <div className="mt-1.5 pl-8 pr-16" onClick={(e) => e.stopPropagation()}>
                     <input 
                        type="text"
                        placeholder="Aggiungi una nota..."
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-300 focus:border-blue-500 outline-none placeholder-slate-600 transition-all focus:bg-slate-900"
                        value={comp.notes || ''}
                        onChange={(e) => updateComponentNote(activeSection.id, comp.uniqueId, e.target.value)}
                     />
                  </div>
                )}

                {/* Contents Visualization (Kit Items OR Linked Accessories) */}
                {comp.contents && comp.contents.length > 0 && (
                    <div className="mt-2 ml-7 pl-3 border-l-2 border-slate-700 space-y-0.5">
                        {comp.contents.map((item, idx) => (
                            <div key={idx} className="text-[10px] text-slate-400 flex justify-between w-full max-w-md leading-tight">
                                <span>{item.name}</span>
                                <span className="text-slate-500">x {item.quantity * comp.quantity}</span>
                            </div>
                        ))}
                    </div>
                )}
              </div>
            )})
          )}
        </div>

        {/* Footer Actions */}
        {activeList && (
          <div className="p-4 border-t border-slate-700 bg-slate-800 flex flex-col md:flex-row gap-4 justify-between items-center z-10">
             <div className="w-full md:w-1/2">
                <input 
                    placeholder="Note per il magazzino..." 
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white"
                    value={activeList.notes}
                    onChange={e => updateActiveList({ notes: e.target.value })}
                />
             </div>
             <div className="flex gap-2">
                 <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors text-sm font-medium">
                     <FileDown size={16} /> CSV
                 </button>
                 <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow-lg shadow-emerald-900/20 transition-all font-medium">
                     <FileDown size={16} /> Esporta PDF
                 </button>
             </div>
          </div>
        )}
      </div>

      {/* RIGHT: Quick Picker */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative">
        
        {/* Replacement Banner overlay */}
        {replacingComponentId && activeReplacementComponent && (
            <div className="absolute inset-x-0 top-0 z-20 bg-amber-900/95 border-b border-amber-500/50 p-4 shadow-xl backdrop-blur-sm">
                <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold text-amber-100 flex items-center gap-2">
                        <ArrowLeftRight size={18} />
                        Modalità Sostituzione
                     </h3>
                     <button 
                        onClick={() => setReplacingComponentId(null)}
                        className="text-amber-300 hover:text-white"
                     >
                        <X size={20} />
                     </button>
                </div>
                <p className="text-xs text-amber-200/80 mb-3">
                    Stai sostituendo <span className="font-bold text-white">"{activeReplacementComponent.name}"</span>. 
                    Seleziona un nuovo oggetto dalla lista qui sotto per effettuare lo scambio mantenendo quantità e note.
                </p>
                <div className="h-1 w-full bg-amber-900 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 animate-pulse w-2/3"></div>
                </div>
            </div>
        )}

        <div className="p-4 bg-slate-800 border-b border-slate-700">
            <h3 className="font-bold text-white mb-3">Catalogo</h3>
            <div className="flex gap-2 mb-3 bg-slate-900 p-1 rounded-lg">
                <button 
                    onClick={() => setActiveTab('items')} 
                    className={`flex-1 text-sm py-1.5 rounded-md text-center transition-all ${activeTab === 'items' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >Materiale</button>
                <button 
                    onClick={() => setActiveTab('kits')}
                    className={`flex-1 text-sm py-1.5 rounded-md text-center transition-all ${activeTab === 'kits' ? 'bg-purple-900/50 text-purple-200 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >Kits</button>
                <button 
                    onClick={() => setActiveTab('suggestions')}
                    className={`flex items-center justify-center gap-1.5 flex-1 text-sm py-1.5 rounded-md text-center transition-all ${activeTab === 'suggestions' ? 'bg-amber-900/50 text-amber-200 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Suggerimenti intelligenti basati su questa lista"
                >
                    <Lightbulb size={14} /> Suggerimenti
                </button>
            </div>
            
            {/* Category Filter */}
            {activeTab !== 'suggestions' && (
            <div className="relative mb-3">
               <div className="absolute left-3 top-2.5 pointer-events-none text-slate-500">
                 <Filter size={16} />
               </div>
               <select
                 value={selectedCategory}
                 onChange={(e) => setSelectedCategory(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-8 py-2 rounded-lg text-sm focus:border-blue-500 outline-none appearance-none cursor-pointer"
               >
                 <option value="All">Tutte le Categorie</option>
                 {Object.values(Category).map(cat => (
                   <option key={cat} value={cat}>{cat}</option>
                 ))}
               </select>
               <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                 <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
               </div>
            </div>
            )}

            {activeTab !== 'suggestions' && (
            <div className="flex gap-2 relative">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                    <input 
                        placeholder="Cerca... (es. 'cavo 10')"
                        className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm outline-none focus:border-blue-500"
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        onClick={(e) => e.currentTarget.select()}
                    />
                </div>
                {activeTab === 'items' && (
                    <button 
                        onClick={() => setIsNewItemModalOpen(true)}
                        className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg"
                        title="Crea nuovo materiale"
                    >
                        <Plus size={20} />
                    </button>
                )}
            </div>
            )}
            
            {activeTab === 'suggestions' && (
                <div className="bg-amber-900/20 border border-amber-900/30 rounded p-2 text-xs text-amber-200/80 mb-2 flex gap-2">
                    <Lightbulb size={16} className="shrink-0 mt-0.5" />
                    <p>Suggerimenti basati sul contenuto attuale: Cavi, Adattatori e Consumabili che potresti aver dimenticato.</p>
                </div>
            )}
        </div>
        
        <div className={`flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar ${replacingComponentId ? 'pt-32' : ''}`}>
            {activeTab === 'suggestions' ? (
                 suggestedItems.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm p-4">
                        Nessun suggerimento specifico trovato. Aggiungi materiale audio, luci o video alla lista per vedere i cavi e gli accessori consigliati.
                    </div>
                 ) : (
                    suggestedItems.map(item => {
                        const qtyInList = quantitiesInList.get(item.id) || 0;
                        return (
                        <button 
                            key={item.id}
                            onClick={() => addToSection(item, 'item')}
                            className="w-full text-left p-3 rounded-lg group border border-transparent hover:bg-amber-900/10 hover:border-amber-900/30 transition-all flex justify-between items-center"
                        >
                            <div>
                                <div className="text-sm text-slate-200 flex items-center gap-2">
                                    {item.name}
                                    {qtyInList > 0 && (
                                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 rounded">x{qtyInList}</span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500">{item.category}</div>
                            </div>
                            <Plus size={16} className="text-amber-500/50 group-hover:text-amber-500" />
                        </button>
                    )})
                 )
            ) : activeTab === 'items' ? (
                filteredPickerItems
                .map(item => {
                    const qtyInList = quantitiesInList.get(item.id) || 0;
                    return (
                    <button 
                        key={item.id}
                        onClick={() => addToSection(item, 'item')}
                        className={`w-full text-left p-3 rounded-lg group border transition-all flex justify-between items-center
                            ${replacingComponentId 
                                ? 'hover:bg-amber-900/20 border-transparent hover:border-amber-500/50' 
                                : 'hover:bg-slate-800 border-transparent hover:border-slate-700'
                            }`}
                    >
                        <div>
                            <div className={`text-sm flex items-center gap-2 ${replacingComponentId ? 'text-amber-100' : 'text-slate-200'}`}>
                                {item.name}
                                {qtyInList > 0 && (
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 rounded">x{qtyInList}</span>
                                )}
                            </div>
                            <div className="text-xs text-slate-500">{item.category} • {item.weight}kg</div>
                        </div>
                        {replacingComponentId ? <ArrowLeftRight size={16} className="text-amber-500" /> : <Plus size={16} className="text-slate-600 group-hover:text-blue-400" />}
                    </button>
                )})
            ) : (
                filteredPickerKits
                .map(kit => {
                    const qtyInList = quantitiesInList.get(kit.id) || 0;
                    return (
                    <button 
                        key={kit.id}
                        onClick={() => addToSection(kit, 'kit')}
                        className={`w-full text-left p-3 rounded-lg group border transition-all flex justify-between items-center
                             ${replacingComponentId 
                                ? 'hover:bg-amber-900/20 border-transparent hover:border-amber-500/50' 
                                : 'hover:bg-purple-900/10 border-transparent hover:border-purple-900/30'
                            }`}
                    >
                        <div>
                            <div className={`text-sm font-medium flex items-center gap-2 ${replacingComponentId ? 'text-amber-100' : 'text-slate-200'}`}>
                                {kit.name}
                                {qtyInList > 0 && (
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 rounded">x{qtyInList}</span>
                                )}
                            </div>
                            <div className="text-xs text-slate-500">{kit.items.length} elementi</div>
                        </div>
                        {replacingComponentId ? <ArrowLeftRight size={16} className="text-amber-500" /> : <PackageIcon size={16} className="text-purple-600 group-hover:text-purple-400" />}
                    </button>
                )})
            )}
        </div>
      </div>
      <ItemFormModal
        isOpen={isNewItemModalOpen}
        onClose={() => setIsNewItemModalOpen(false)}
        onSave={handleCreateNewItem}
        title="Nuovo Materiale Rapido"
        inventory={inventory}
        onCreateAccessory={handleCreateAccessory}
      />
      
      <ConfirmationModal
        isOpen={isDeleteListModalOpen}
        onClose={() => setIsDeleteListModalOpen(false)}
        onConfirm={confirmDeleteList}
        title="Elimina Evento"
        message={`Sei sicuro di voler eliminare l'evento "${activeList?.eventName || 'Nuovo Evento'}"? Questa azione non può essere annullata.`}
      />

      <ConfirmationModal
        isOpen={!!sectionToDelete}
        onClose={() => setSectionToDelete(null)}
        onConfirm={confirmRemoveSection}
        title="Elimina Sezione"
        message={`Sei sicuro di voler eliminare questa sezione e tutto il materiale contenuto?`}
      />
      
      {/* Section Management Modal */}
      <Modal 
        isOpen={sectionModal.isOpen}
        onClose={() => setSectionModal(prev => ({...prev, isOpen: false}))}
        title={sectionModal.type === 'create' ? "Nuova Sezione" : "Rinomina Sezione"}
      >
        <div className="space-y-4">
            <div>
                <label className="block text-sm text-slate-400 mb-1">Nome Sezione</label>
                <input 
                    type="text" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
                    value={sectionModal.name}
                    onChange={e => setSectionModal(prev => ({...prev, name: e.target.value}))}
                    placeholder="Es. Palco, Backline..."
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSectionModalSave();
                    }}
                />
            </div>
            <div className="flex justify-end gap-2">
                <button 
                    onClick={() => setSectionModal(prev => ({...prev, isOpen: false}))}
                    className="px-4 py-2 text-slate-400 hover:text-white"
                >
                    Annulla
                </button>
                <button 
                    onClick={handleSectionModalSave}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
                >
                    Salva
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
};