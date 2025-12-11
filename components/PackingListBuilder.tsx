import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Trash2, FileDown, Settings2, Box, Package as PackageIcon, Calendar, MapPin, ClipboardList, StickyNote, Edit2 } from 'lucide-react';
import { InventoryItem, Kit, PackingList, ListSection, ListComponent } from '../types';
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
  const [activeTab, setActiveTab] = useState<'items' | 'kits'>('items');
  
  // Note Toggle State
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set());
  
  // Deletion State for LIST
  const [isDeleteListModalOpen, setIsDeleteListModalOpen] = useState(false);
  
  // Deletion State for SECTION
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);

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

  // Auto-focus Refs
  const qtyInputRefs = useRef<{ [uniqueId: string]: HTMLInputElement | null }>({});
  const [lastAddedComponentId, setLastAddedComponentId] = useState<string | null>(null);

  // Derived State
  const activeList = lists.find(l => l.id === activeListId);
  const sections = activeList?.sections || [];

  // --- SAFETY CHECK: Ensure activeListId is always valid ---
  useEffect(() => {
    // If we have lists, but the active ID doesn't match any of them
    if (lists.length > 0 && !lists.find(l => l.id === activeListId)) {
      // Automatically switch to the first available list
      setActiveListId(lists[0].id);
    } else if (lists.length === 0 && activeListId !== '') {
      // If no lists exist, clear the ID
      setActiveListId('');
    }
  }, [lists, activeListId, setActiveListId]);
  
  // Set initial active section when switching lists or when sections change
  useEffect(() => {
    if (activeList) {
       // If no section is selected OR the selected section no longer exists in this list
       const currentSectionExists = activeList.sections.find(s => s.id === activeSectionId);
       if (!activeSectionId || !currentSectionExists) {
          if (activeList.sections.length > 0) {
            setActiveSectionId(activeList.sections[0].id);
          } else {
            setActiveSectionId('');
          }
       }
    }
  }, [activeListId, activeList, activeSectionId]);

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
      ]
    };
    setLists([...lists, newList]);
    setActiveListId(newList.id);
  };

  const confirmDeleteList = () => {
    if (!activeList) return;
    
    // Calculate new lists first
    const newLists = lists.filter(l => l.id !== activeListId);
    
    // Determine what the next ID should be BEFORE updating state
    // This prevents a "flash" of undefined state
    let nextId = '';
    if (newLists.length > 0) {
      nextId = newLists[0].id;
    }

    setLists(newLists);
    setActiveListId(nextId);
  };

  const updateActiveList = (updates: Partial<PackingList>) => {
    setLists(prev => prev.map(l => l.id === activeListId ? { ...l, ...updates } : l));
  };

  // --- Section Management ---

  const activeSection = sections.find(s => s.id === activeSectionId);

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
    // Don't delete if it's the last one (safety check, though UI shouldn't allow it)
    if (sections.length <= 1) {
        setSectionToDelete(null);
        return;
    }

    const newSections = sections.filter(s => s.id !== sectionToDelete);
    updateActiveList({ sections: newSections });
    setSectionToDelete(null);
  };

  // --- Component Management ---

  const addToSection = (item: InventoryItem | Kit, type: 'item' | 'kit') => {
    if (!activeList || !activeSection) return;

    // 1. Check if the component (Item OR Kit) already exists in this section
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
      let component: ListComponent;

      if (type === 'kit') {
        const k = item as Kit;
        const kitContents = k.items.map(ki => {
          const invItem = inventory.find(i => i.id === ki.itemId);
          return {
            name: invItem?.name || 'Unknown',
            quantity: ki.quantity,
            category: invItem?.category || 'Altro'
          };
        });

        component = {
          uniqueId: crypto.randomUUID(),
          type: 'kit',
          referenceId: k.id,
          name: k.name,
          quantity: 1,
          category: 'Kit',
          contents: kitContents,
          notes: ''
        };
      } else {
        const i = item as InventoryItem;
        component = {
          uniqueId: crypto.randomUUID(),
          type: 'item',
          referenceId: i.id,
          name: i.name,
          quantity: 1,
          category: i.category,
          notes: ''
        };
      }

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
  };

  const handleCreateNewItem = (itemData: Omit<InventoryItem, 'id'>) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: crypto.randomUUID(),
    };
    setInventory(prev => [...prev, newItem]);
    addToSection(newItem, 'item');
  };

  // --- Export ---
  const exportPDF = () => {
    if (!activeList) return;
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

        tableData.push([nameContent, comp.quantity, '']);
        
        if (comp.type === 'kit' && comp.contents) {
          comp.contents.forEach(kItem => {
            tableData.push([`  - ${kItem.name}`, kItem.quantity * comp.quantity, '']);
          });
        }
      });

      autoTable(doc, {
        startY: finalY,
        head: [['Materiale', 'Qta', 'Check']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [40, 40, 40] },
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 20, halign: 'center' } },
        didDrawPage: (data) => {
            finalY = data.cursor?.y || 0;
            
            // Footer Logic
            const pageSize = doc.internal.pageSize;
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
            const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
            
            doc.setFontSize(8);
            doc.setTextColor(150);
            
            // Page Number (Right)
            const pageStr = 'Pagina ' + data.pageNumber;
            doc.text(pageStr, pageWidth - 14, pageHeight - 10, { align: 'right' });
            
            // App Branding (Left)
            doc.text("Generato con CUEPACK Manager", 14, pageHeight - 10);
        }
      });
      
      finalY = (doc as any).lastAutoTable.finalY + 10;
    });

    if (activeList.notes) {
        // Check if we need a new page for notes
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

    doc.save(`Lista_${(activeList.eventName || 'evento').replace(/\s/g, '_')}.pdf`);
  };

  const exportCSV = () => {
    if (!activeList) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Sezione,Tipo,Nome,Quantità,Note,Contenuto Kit (se applicabile)\n";

    activeList.sections.forEach(s => {
      s.components.forEach(c => {
        const note = c.notes ? c.notes.replace(/"/g, '""') : '';
        if (c.type === 'kit') {
            csvContent += `${s.name},KIT,${c.name},${c.quantity},"${note}",""\n`;
            c.contents?.forEach(ki => {
                csvContent += `${s.name},Parte Kit,${ki.name},${ki.quantity * c.quantity},"","Appartiene a: ${c.name}"\n`;
            });
        } else {
            csvContent += `${s.name},Singolo,${c.name},${c.quantity},"${note}",""\n`;
        }
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `lista_${activeList.eventName || 'evento'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      <div className="flex-1 flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        
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
                   className="bg-slate-900 border border-slate-700 text-white text-sm rounded p-1 pr-8 outline-none focus:border-emerald-500 cursor-pointer"
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
          <div className="p-6 bg-slate-800 border-b border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-500 font-bold text-xs">EV</span>
               </div>
               <input 
                placeholder="Nome Evento" 
                className="w-full bg-slate-900 border border-slate-700 pl-10 p-2 rounded text-white outline-none focus:border-emerald-500"
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
                className="w-full bg-slate-900 border border-slate-700 pl-10 p-2 rounded text-white outline-none focus:border-emerald-500"
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
                className="w-full bg-slate-900 border border-slate-700 pl-10 p-2 rounded text-white outline-none focus:border-emerald-500"
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
              onClick={() => setActiveSectionId(s.id)}
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

        {/* List Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/30">
          {!activeList ? (
             <div className="text-center py-20 text-slate-500">Seleziona o crea un evento</div>
          ) : !activeSection || activeSection.components.length === 0 ? (
            <div className="text-center py-20 text-slate-600">
              <Box size={48} className="mx-auto mb-4 opacity-50" />
              <p>Questa sezione è vuota. Aggiungi materiale dalla colonna di destra.</p>
            </div>
          ) : (
            activeSection.components.map(comp => {
              const isNoteVisible = openNoteIds.has(comp.uniqueId) || !!comp.notes;
              return (
              <div key={comp.uniqueId} className={`relative group p-4 rounded-lg border transition-all ${comp.type === 'kit' ? 'bg-purple-900/10 border-purple-900/30' : 'bg-slate-800 border-slate-700'}`}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                      {comp.type === 'kit' ? <PackageIcon size={20} className="text-purple-400" /> : <Box size={20} className="text-slate-400" />}
                      <div>
                          <div className="font-medium text-slate-200">
                              {comp.name} 
                              {comp.type === 'kit' && <span className="ml-2 text-xs bg-purple-900 text-purple-200 px-1 rounded">KIT</span>}
                          </div>
                          <div className="text-xs text-slate-500">{comp.category}</div>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleNoteInput(comp.uniqueId)}
                        className={`p-1.5 rounded transition-colors ${comp.notes ? 'text-yellow-400 hover:bg-yellow-900/20' : 'text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                        title="Aggiungi/Modifica Nota"
                      >
                        <StickyNote size={18} />
                      </button>
                      <input 
                          ref={(el) => { qtyInputRefs.current[comp.uniqueId] = el }}
                          type="number" 
                          min="1"
                          className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center text-white focus:border-blue-500 outline-none"
                          value={comp.quantity}
                          onChange={(e) => updateComponentQty(activeSection.id, comp.uniqueId, Number(e.target.value))}
                      />
                      <button 
                          onClick={() => removeComponent(activeSection.id, comp.uniqueId)}
                          className="text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                          <Trash2 size={18} />
                      </button>
                  </div>
                </div>

                {isNoteVisible && (
                  <div className="mt-2 pl-8 pr-24">
                     <input 
                        type="text"
                        placeholder="Aggiungi una nota..."
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-300 focus:border-blue-500 outline-none placeholder-slate-600 transition-all focus:bg-slate-900"
                        value={comp.notes || ''}
                        onChange={(e) => updateComponentNote(activeSection.id, comp.uniqueId, e.target.value)}
                     />
                  </div>
                )}

                {/* Kit Contents Visualization */}
                {comp.type === 'kit' && comp.contents && (
                    <div className="mt-3 ml-2 pl-4 border-l-2 border-slate-700 space-y-1">
                        {comp.contents.map((item, idx) => (
                            <div key={idx} className="text-xs text-slate-400 flex justify-between w-full max-w-md">
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
          <div className="p-4 border-t border-slate-700 bg-slate-800 flex flex-col md:flex-row gap-4 justify-between items-center">
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
      <div className="w-full md:w-80 lg:w-96 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
            </div>
            <div className="flex gap-2 relative">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                    <input 
                        placeholder="Cerca..." 
                        className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm outline-none focus:border-blue-500"
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
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
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {activeTab === 'items' ? (
                inventory
                .filter(i => i.name.toLowerCase().includes(pickerSearch.toLowerCase()) || i.category.toLowerCase().includes(pickerSearch.toLowerCase()))
                .map(item => (
                    <button 
                        key={item.id}
                        onClick={() => addToSection(item, 'item')}
                        className="w-full text-left p-3 hover:bg-slate-800 rounded-lg group border border-transparent hover:border-slate-700 transition-all flex justify-between items-center"
                    >
                        <div>
                            <div className="text-sm text-slate-200">{item.name}</div>
                            <div className="text-xs text-slate-500">{item.category} • {item.weight}kg</div>
                        </div>
                        <Plus size={16} className="text-slate-600 group-hover:text-blue-400" />
                    </button>
                ))
            ) : (
                kits
                .filter(k => k.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                .map(kit => (
                    <button 
                        key={kit.id}
                        onClick={() => addToSection(kit, 'kit')}
                        className="w-full text-left p-3 hover:bg-purple-900/10 rounded-lg group border border-transparent hover:border-purple-900/30 transition-all flex justify-between items-center"
                    >
                        <div>
                            <div className="text-sm text-slate-200 font-medium">{kit.name}</div>
                            <div className="text-xs text-slate-500">{kit.items.length} elementi</div>
                        </div>
                        <PackageIcon size={16} className="text-purple-600 group-hover:text-purple-400" />
                    </button>
                ))
            )}
        </div>
      </div>
      <ItemFormModal
        isOpen={isNewItemModalOpen}
        onClose={() => setIsNewItemModalOpen(false)}
        onSave={handleCreateNewItem}
        title="Nuovo Materiale Rapido"
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