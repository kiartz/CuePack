import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Copy, Filter, Link } from 'lucide-react';
import { InventoryItem, Category, PackingList, Kit } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmationModal } from './ConfirmationModal';

interface InventoryViewProps {
  items: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  lists: PackingList[];
  setLists: React.Dispatch<React.SetStateAction<PackingList[]>>;
  kits: Kit[];
  setKits: React.Dispatch<React.SetStateAction<Kit[]>>;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ items, setItems, lists, setLists, kits, setKits }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Deletion State
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const filteredItems = items
    .filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleOpenModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
    } else {
      setEditingItem(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = (itemData: Omit<InventoryItem, 'id'>) => {
    // Normalizzazione nome per controllo duplicati
    const normalizedName = itemData.name.trim().toLowerCase();

    // Cerca collisioni (escludendo l'oggetto che stiamo modificando se è lo stesso ID)
    const existingCollision = items.find(i => 
      i.name.trim().toLowerCase() === normalizedName && 
      (!editingItem || i.id !== editingItem.id)
    );

    let finalId = '';

    if (existingCollision) {
      // LOGICA DI MERGE
      finalId = existingCollision.id;
      setItems(prev => {
        const newItems = prev.map(i => {
          if (i.id === existingCollision.id) {
            return { ...itemData, id: i.id };
          }
          return i;
        });
        if (editingItem && editingItem.id !== existingCollision.id) {
           return newItems.filter(i => i.id !== editingItem.id);
        }
        return newItems;
      });
    } else {
      // LOGICA STANDARD
      if (editingItem) {
        // Update
        finalId = editingItem.id;
        setItems(prev => prev.map(i => i.id === editingItem.id ? { ...itemData, id: i.id } : i));
      } else {
        // Create
        finalId = crypto.randomUUID();
        const newItem: InventoryItem = {
          ...itemData,
          id: finalId,
        };
        setItems(prev => [...prev, newItem]);
      }
    }

    // --- SYNCHRONIZE LISTS & KITS ---
    // If we updated an item (finalId exists in previous items), we must update:
    // 1. 'contents' field in Packing Lists
    // 2. 'items' list in Kits (add accessories if missing)
    
    if (finalId) {
        const newAccessories = itemData.accessories || [];
        
        // 1. Update Packing Lists
        const resolvedContents = newAccessories.map(acc => {
            const accItem = items.find(i => i.id === acc.itemId);
            return {
                name: accItem?.name || 'Accessorio',
                quantity: acc.quantity,
                category: accItem?.category || 'Altro'
            };
        });

        setLists(prevLists => prevLists.map(list => ({
            ...list,
            sections: list.sections.map(section => ({
                ...section,
                components: section.components.map(comp => {
                    // Update if it's the item we just modified
                    if (comp.type === 'item' && comp.referenceId === finalId) {
                         return { 
                             ...comp, 
                             // Update cached name if changed
                             name: itemData.name, 
                             category: itemData.category,
                             // Update contents (accessories)
                             contents: resolvedContents 
                        };
                    }
                    return comp;
                })
            }))
        })));

        // 2. Update Kits
        setKits(prevKits => prevKits.map(kit => {
            // Check if this kit contains the item we just updated/created
            const parentItemInKit = kit.items.find(ki => ki.itemId === finalId);

            if (parentItemInKit) {
                 // The item is in this kit. Let's check its accessories.
                 let updatedKitItems = [...kit.items];
                 let kitChanged = false;

                 newAccessories.forEach(acc => {
                     // Check if this specific accessory is already in the kit
                     const accessoryInKit = updatedKitItems.find(ki => ki.itemId === acc.itemId);

                     if (!accessoryInKit) {
                         // It's missing! Add it as a separate item.
                         // Quantity = (Qty of parent item in kit) * (Qty of accessory per parent)
                         updatedKitItems.push({
                             itemId: acc.itemId,
                             quantity: parentItemInKit.quantity * acc.quantity
                         });
                         kitChanged = true;
                     }
                 });

                 if (kitChanged) {
                     return { ...kit, items: updatedKitItems };
                 }
            }
            return kit;
        }));
    }

    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      setItems(prev => prev.filter(i => i.id !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const handleDuplicate = (item: InventoryItem) => {
    // Manteniamo lo STESSO nome (senza 'Copia') come richiesto.
    const newItem = { ...item, id: crypto.randomUUID() };
    setItems(prev => [...prev, newItem]);
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
              placeholder="Cerca materiale..."
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
             {/* Custom arrow for select */}
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
                <th className="p-4 font-semibold text-right text-sm uppercase tracking-wider">Stock</th>
                <th className="p-4 font-semibold text-center text-sm uppercase tracking-wider">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Nessun materiale trovato.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                    onDoubleClick={() => handleOpenModal(item)}
                    title="Doppio click per modificare"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-white">{item.name}</div>
                        {item.accessories && item.accessories.length > 0 && (
                          <span title={`${item.accessories.length} accessori collegati`}>
                            <Link size={14} className="text-slate-500" />
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 truncate max-w-xs">{item.description}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border
                        ${item.category === Category.AUDIO ? 'bg-amber-900/20 text-amber-500 border-amber-900/30' : 
                          item.category === Category.LIGHTS ? 'bg-purple-900/20 text-purple-500 border-purple-900/30' :
                          item.category === Category.VIDEO ? 'bg-blue-900/20 text-blue-500 border-blue-900/30' :
                          item.category === Category.REGIA ? 'bg-teal-900/20 text-teal-500 border-teal-900/30' :
                          'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="p-4 text-right text-slate-300 font-mono">{item.weight}</td>
                    <td className="p-4 text-right">
                       <span className={`font-mono font-bold ${item.inStock > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                         {item.inStock}
                       </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }} className="p-2 text-blue-400 hover:text-blue-300 rounded-lg hover:bg-slate-800"><Edit2 size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(item); }} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"><Copy size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item.id); }} className="p-2 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-slate-800"><Trash2 size={16} /></button>
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