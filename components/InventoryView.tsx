import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Copy } from 'lucide-react';
import { InventoryItem, Category } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmationModal } from './ConfirmationModal';

interface InventoryViewProps {
  items: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ items, setItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Deletion State
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
    } else {
      setEditingItem(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = (itemData: Omit<InventoryItem, 'id'>) => {
    if (editingItem) {
      // Update
      setItems(prev => prev.map(i => i.id === editingItem.id ? { ...itemData, id: i.id } : i));
    } else {
      // Create
      const newItem: InventoryItem = {
        ...itemData,
        id: crypto.randomUUID(),
      };
      setItems(prev => [...prev, newItem]);
    }
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      setItems(prev => prev.filter(i => i.id !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const handleDuplicate = (item: InventoryItem) => {
    const newItem = { ...item, id: crypto.randomUUID(), name: `${item.name} (Copia)` };
    setItems(prev => [...prev, newItem]);
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold text-white">Inventario Materiale</h1>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Cerca materiale..."
              className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Plus size={20} />
            <span className="hidden md:inline">Nuovo</span>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-slate-300 sticky top-0 z-10">
              <tr>
                <th className="p-4 font-semibold">Nome</th>
                <th className="p-4 font-semibold">Categoria</th>
                <th className="p-4 font-semibold text-right">Peso (kg)</th>
                <th className="p-4 font-semibold text-right">Stock</th>
                <th className="p-4 font-semibold text-center">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-white">{item.name}</div>
                    <div className="text-sm text-slate-500 truncate max-w-xs">{item.description}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-semibold
                      ${item.category === Category.AUDIO ? 'bg-amber-900/30 text-amber-500' : 
                        item.category === Category.LIGHTS ? 'bg-purple-900/30 text-purple-500' :
                        item.category === Category.VIDEO ? 'bg-blue-900/30 text-blue-500' :
                        item.category === Category.REGIA ? 'bg-teal-900/30 text-teal-500' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                      {item.category}
                    </span>
                  </td>
                  <td className="p-4 text-right text-slate-300">{item.weight}</td>
                  <td className="p-4 text-right text-slate-300">{item.inStock}</td>
                  <td className="p-4">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleOpenModal(item)} className="p-2 text-blue-400 hover:bg-blue-900/30 rounded-lg"><Edit2 size={16} /></button>
                      <button onClick={() => handleDuplicate(item)} className="p-2 text-emerald-400 hover:bg-emerald-900/30 rounded-lg"><Copy size={16} /></button>
                      <button onClick={() => setItemToDelete(item.id)} className="p-2 text-rose-400 hover:bg-rose-900/30 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ItemFormModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingItem}
        title={editingItem ? "Modifica Materiale" : "Nuovo Materiale"}
      />
      
      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title="Elimina Materiale"
        message="Sei sicuro di voler eliminare questo materiale dall'inventario? Questa azione non può essere annullata."
      />
    </div>
  );
};