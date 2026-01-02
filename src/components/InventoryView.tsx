import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Copy, Filter, Link, Check, X } from 'lucide-react';
import { InventoryItem, Category, PackingList, ListComponent } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmationModal } from './ConfirmationModal';
import { addOrUpdateItem, deleteItem, COLL_INVENTORY, COLL_LISTS } from '../firebase';

interface InventoryViewProps {
  items: InventoryItem[];
  packingLists: PackingList[];
}

export const InventoryView: React.FC<InventoryViewProps> = ({ items, packingLists }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Inline Editing State
  const [editingCell, setEditingCell] = useState<{ itemId: string, field: keyof InventoryItem } | null>(null);
  const [editValue, setEditValue] = useState<string | number>('');
  const editInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Deletion State
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    // Safety check
    if (!items || !Array.isArray(items)) return [];

    const searchTokens = (searchTerm || '').toLowerCase().split(' ').filter(token => token.trim() !== '');

    const results = items
      .map(item => {
        const name = (item.name || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        
        const combinedText = `${name} ${cat} ${desc}`;
        const isMatch = searchTokens.every(token => combinedText.includes(token));
        
        if (!isMatch) return { item, score: -1, nameMatches: 0 }; 

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
                if (cat.includes(token)) score += 10;
                if (desc.includes(token)) score += 1;
            });
        }

        const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
        if (!matchesCategory) return { item, score: -1, nameMatches: 0 };

        return { item, score, nameMatches };
      })
      .filter(result => result.score > -1)
      .sort((a, b) => {
          if (b.nameMatches !== a.nameMatches) return b.nameMatches - a.nameMatches;
          if (b.score !== a.score) return b.score - a.score;
          return (a.item.name || '').localeCompare(b.item.name || '');
      })
      .map(result => result.item);

      return results;
  }, [items, searchTerm, selectedCategory]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingCell]);

  const handleOpenModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
    } else {
      setEditingItem(null);
    }
    setIsModalOpen(true);
  };

  const handleCreateAccessory = async (newItem: InventoryItem) => {
     await addOrUpdateItem(COLL_INVENTORY, newItem);
  };

  // --- PROPAGATE UPDATES TO LISTS ---
  const propagateUpdates = async (updatedItem: InventoryItem) => {
      // Find lists that contain this item
      const listsToUpdate: PackingList[] = [];
      
      packingLists.forEach(list => {
          let listModified = false;
          
          // Helper to process components
          const processComponents = (components: ListComponent[]) => {
              return components.map(comp => {
                  if (comp.type === 'item' && comp.referenceId === updatedItem.id) {
                      // Update basic info
                      let compModified = false;
                      if (comp.name !== updatedItem.name) { comp.name = updatedItem.name; compModified = true; }
                      if (comp.category !== updatedItem.category) { comp.category = updatedItem.category; compModified = true; }
                      
                      // Update accessories (contents)
                      // We regenerate the contents array based on the new inventory item accessories
                      const newContents = (updatedItem.accessories || []).map(acc => {
                          const accItem = items.find(i => i.id === acc.itemId);
                          return {
                              itemId: acc.itemId,
                              name: accItem?.name || '?',
                              quantity: acc.quantity,
                              category: accItem?.category || 'Altro'
                          };
                      });
                      
                      // Check for deep equality of contents to avoid unnecessary writes
                      if (JSON.stringify(comp.contents) !== JSON.stringify(newContents)) {
                          comp.contents = newContents;
                          compModified = true;
                      }

                      if (compModified) listModified = true;
                      return { ...comp }; // Return new object if modified logic implies shallow copy here, but we are mutating list clone in practice below
                  }
                  return comp;
              });
          };

          // Zones Structure
          if (list.zones) {
              const newZones = list.zones.map(zone => ({
                  ...zone,
                  sections: zone.sections.map(section => ({
                      ...section,
                      components: processComponents(section.components)
                  }))
              }));
              
              if (listModified) {
                  listsToUpdate.push({ ...list, zones: newZones });
              }
          }
          // Legacy Structure
          else if (list.sections) {
               const newSections = list.sections.map(section => ({
                   ...section,
                   components: processComponents(section.components)
               }));
               
               if (listModified) {
                   listsToUpdate.push({ ...list, sections: newSections });
               }
          }
      });

      // Batch update lists
      if (listsToUpdate.length > 0) {
          console.log(`Propagating updates to ${listsToUpdate.length} lists...`);
          await Promise.all(listsToUpdate.map(l => addOrUpdateItem(COLL_LISTS, l)));
      }
  };


  // --- FIRESTORE SAVE ---
  const handleSave = async (itemData: Omit<InventoryItem, 'id'>) => {
    const normalizedName = itemData.name.trim().toLowerCase();
    
    // Check local array for existing name collision to merge
    const existingCollision = items.find(i => 
      i.name.trim().toLowerCase() === normalizedName && 
      (!editingItem || i.id !== editingItem.id)
    );

    let newItem: InventoryItem;

    if (existingCollision) {
      // Merge: Use existing ID
      newItem = { ...itemData, id: existingCollision.id };
    } else {
      // New or Update existing ID
      const id = editingItem ? editingItem.id : crypto.randomUUID();
      newItem = { ...itemData, id };
    }

    await addOrUpdateItem(COLL_INVENTORY, newItem);
    await propagateUpdates(newItem);
    setIsModalOpen(false);
  };

  // --- INLINE EDITING LOGIC (FIRESTORE) ---

  const startInlineEdit = (item: InventoryItem, field: keyof InventoryItem) => {
    setEditingCell({ itemId: item.id, field });
    setEditValue(item[field] as string | number);
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;
    const { itemId, field } = editingCell;
    const item = items.find(i => i.id === itemId);
    if (item) {
        const updatedItem = { ...item, [field]: editValue };
        await addOrUpdateItem(COLL_INVENTORY, updatedItem);
        // Only propagate if name or category changed, as these are cached in lists.
        // Also if technically accessories were editable inline (not currently), we'd propagate.
        if (field === 'name' || field === 'category') {
            await propagateUpdates(updatedItem);
        }
    }
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          saveInlineEdit();
      } else if (e.key === 'Escape') {
          cancelInlineEdit();
      }
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      await deleteItem(COLL_INVENTORY, itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleDuplicate = async (item: InventoryItem) => {
    const newItem = { ...item, id: crypto.randomUUID(), name: `${item.name} (Copia)` };
    await addOrUpdateItem(COLL_INVENTORY, newItem);
    handleOpenModal(newItem);
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-4">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h1 className="text-3xl font-bold text-white">Inventario Materiale</h1>
        
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
          {/* Search Bar */}
          <div className="relative flex-grow md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Cerca materiale... (es. 'cavo 10')"
              className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <div className="relative min-w-[180px]">
             <div className="absolute left-3 top-2.5 pointer-events-none text-slate-400">
               <Filter size={18} />
             </div>
             <select
               value={selectedCategory}
               onChange={(e) => setSelectedCategory(e.target.value)}
               className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-8 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
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

          <button 
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors whitespace-nowrap"
          >
            <Plus size={20} />
            <span>Nuovo</span>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800 text-slate-300 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-4 font-semibold text-sm uppercase tracking-wider">Nome</th>
                <th className="p-4 font-semibold text-sm uppercase tracking-wider">Categoria</th>
                <th className="p-4 font-semibold text-right text-sm uppercase tracking-wider">Peso (kg)</th>
                <th className="p-4 font-semibold text-right text-sm uppercase tracking-wider">Consumo (W)</th>
                <th className="p-4 font-semibold text-right text-sm uppercase tracking-wider">Stock</th>
                <th className="p-4 font-semibold text-center text-sm uppercase tracking-wider">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Nessun materiale trovato.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-slate-800/50 transition-colors group"
                  >
                    {/* NAME COLUMN */}
                    <td className="p-4" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'name'); }}>
                      {editingCell?.itemId === item.id && editingCell?.field === 'name' ? (
                          <input 
                            ref={editInputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            className="w-full bg-slate-950 border border-blue-500 rounded p-1 text-white outline-none"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleKeyDown}
                          />
                      ) : (
                          <div className="flex items-center gap-2 cursor-text" title="Doppio click per rinominare">
                            <div className="font-medium text-white">{item.name}</div>
                            {item.accessories && item.accessories.length > 0 && (
                            <span title={`${item.accessories.length} accessori collegati`}>
                                <Link size={14} className="text-slate-500" />
                            </span>
                            )}
                        </div>
                      )}
                      {(!editingCell || editingCell.itemId !== item.id || editingCell?.field !== 'name') && (
                          <div className="text-sm text-slate-500 truncate max-w-xs cursor-text" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'description'); }}>
                              {item.description}
                          </div>
                      )}
                    </td>

                    {/* CATEGORY COLUMN */}
                    <td className="p-4" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'category'); }}>
                      {editingCell?.itemId === item.id && editingCell?.field === 'category' ? (
                          <select 
                            ref={editInputRef as React.RefObject<HTMLSelectElement>}
                            className="bg-slate-950 border border-blue-500 rounded p-1 text-white outline-none text-sm"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleKeyDown}
                          >
                             {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                      ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer
                            ${item.category === Category.AUDIO ? 'bg-amber-900/20 text-amber-500 border-amber-900/30' : 
                            item.category === Category.LIGHTS ? 'bg-purple-900/20 text-purple-500 border-purple-900/30' :
                            item.category === Category.VIDEO ? 'bg-blue-900/20 text-blue-500 border-blue-900/30' :
                            item.category === Category.REGIA ? 'bg-teal-900/20 text-teal-500 border-teal-900/30' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                            title="Doppio click per cambiare categoria"
                          >
                            {item.category}
                          </span>
                      )}
                    </td>

                    {/* WEIGHT COLUMN */}
                    <td className="p-4 text-right" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'weight'); }}>
                        {editingCell?.itemId === item.id && editingCell?.field === 'weight' ? (
                             <input 
                                ref={editInputRef as React.RefObject<HTMLInputElement>}
                                type="number"
                                step="0.1"
                                className="w-20 bg-slate-950 border border-blue-500 rounded p-1 text-white outline-none text-right font-mono"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                onBlur={saveInlineEdit}
                                onKeyDown={handleKeyDown}
                             />
                        ) : (
                             <span className="text-slate-300 font-mono cursor-pointer" title="Doppio click per modificare peso">{item.weight}</span>
                        )}
                    </td>

                    {/* POWER CONSUMPTION COLUMN */}
                    <td className="p-4 text-right" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'powerConsumption'); }}>
                        {editingCell?.itemId === item.id && editingCell?.field === 'powerConsumption' ? (
                             <input 
                                ref={editInputRef as React.RefObject<HTMLInputElement>}
                                type="number"
                                min="0"
                                className="w-20 bg-slate-950 border border-blue-500 rounded p-1 text-white outline-none text-right font-mono"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                onBlur={saveInlineEdit}
                                onKeyDown={handleKeyDown}
                             />
                        ) : (
                             <span className={`font-mono cursor-pointer ${(item.powerConsumption || 0) > 0 ? 'text-yellow-400' : 'text-slate-500'}`} title="Doppio click per modificare consumo">
                                {item.powerConsumption || 0}
                             </span>
                        )}
                    </td>

                    {/* STOCK COLUMN */}
                    <td className="p-4 text-right" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'inStock'); }}>
                       {editingCell?.itemId === item.id && editingCell?.field === 'inStock' ? (
                             <input 
                                ref={editInputRef as React.RefObject<HTMLInputElement>}
                                type="number"
                                className="w-20 bg-slate-950 border border-blue-500 rounded p-1 text-white outline-none text-right font-mono font-bold"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                onBlur={saveInlineEdit}
                                onKeyDown={handleKeyDown}
                             />
                        ) : (
                             <span className={`font-mono font-bold cursor-pointer ${item.inStock > 0 ? 'text-emerald-400' : 'text-rose-400'}`} title="Doppio click per modificare stock">
                                {item.inStock}
                             </span>
                        )}
                    </td>

                    {/* ACTIONS */}
                    <td className="p-4">
                      <div className="flex justify-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }} className="p-2 text-blue-400 hover:text-blue-300 rounded-lg hover:bg-slate-800" title="Modifica completa"><Edit2 size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(item); }} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800" title="Duplica"><Copy size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item.id); }} className="p-2 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-slate-800" title="Elimina"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ItemFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingItem}
        inventory={items} // Pass full inventory for accessories selection
        onCreateAccessory={handleCreateAccessory}
        title={editingItem ? "Modifica Materiale" : "Nuovo Materiale"}
      />
      
      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title="Elimina Materiale"
        message="Sei sicuro di voler eliminare questo materiale dall'inventario?"
      />
    </div>
  );
};