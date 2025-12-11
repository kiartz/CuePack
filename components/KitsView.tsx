import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Copy, Package, X } from 'lucide-react';
import { InventoryItem, Kit, KitComponent } from '../types';
import { Modal } from './Modal';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmationModal } from './ConfirmationModal';

interface KitsViewProps {
  kits: Kit[];
  setKits: React.Dispatch<React.SetStateAction<Kit[]>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

export const KitsView: React.FC<KitsViewProps> = ({ kits, setKits, inventory, setInventory }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<Kit | null>(null);
  const [formData, setFormData] = useState<Partial<Kit>>({ items: [] });
  const [itemSearch, setItemSearch] = useState('');
  
  // Deletion State
  const [kitToDelete, setKitToDelete] = useState<string | null>(null);
  
  // State for creating new item on the fly
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);

  // Refs for auto-focusing quantity inputs
  const qtyInputRefs = useRef<{ [itemId: string]: HTMLInputElement | null }>({});
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);

  const filteredKits = kits.filter(kit => 
    kit.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Effect to focus and select the quantity input when a new item is added
  useEffect(() => {
    if (lastAddedItemId && qtyInputRefs.current[lastAddedItemId]) {
      qtyInputRefs.current[lastAddedItemId]?.focus();
      qtyInputRefs.current[lastAddedItemId]?.select();
      setLastAddedItemId(null); // Reset after focusing
    }
  }, [formData.items, lastAddedItemId]);

  const handleOpenModal = (kit?: Kit) => {
    if (kit) {
      setEditingKit(kit);
      setFormData({ ...kit });
    } else {
      setEditingKit(null);
      setFormData({ name: '', description: '', items: [] });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name) return;

    if (editingKit) {
      setKits(prev => prev.map(k => k.id === editingKit.id ? { ...formData, id: k.id } as Kit : k));
    } else {
      const newKit: Kit = {
        ...formData as Kit,
        id: crypto.randomUUID(),
      };
      setKits(prev => [...prev, newKit]);
    }
    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (kitToDelete) {
      setKits(prev => prev.filter(k => k.id !== kitToDelete));
      setKitToDelete(null);
    }
  };

  const handleDuplicate = (kit: Kit) => {
    const newKit = { ...kit, id: crypto.randomUUID(), name: `${kit.name} (Copia)` };
    setKits(prev => [...prev, newKit]);
  };

  const addItemToKit = (invItem: InventoryItem) => {
    const existing = formData.items?.find(i => i.itemId === invItem.id);
    if (existing) {
      const updatedItems = formData.items?.map(i => i.itemId === invItem.id ? { ...i, quantity: i.quantity + 1 } : i);
      setFormData({ ...formData, items: updatedItems });
    } else {
      setFormData({ ...formData, items: [...(formData.items || []), { itemId: invItem.id, quantity: 1 }] });
    }
    // Trigger auto-focus
    setLastAddedItemId(invItem.id);
  };

  const removeItemFromKit = (itemId: string) => {
    setFormData({ ...formData, items: formData.items?.filter(i => i.itemId !== itemId) });
  };

  const updateItemQty = (itemId: string, qty: number) => {
    if (qty < 1) return;
    setFormData({ ...formData, items: formData.items?.map(i => i.itemId === itemId ? { ...i, quantity: qty } : i) });
  };

  const getInventoryName = (id: string) => inventory.find(i => i.id === id)?.name || 'Unknown Item';

  const handleCreateNewItem = (itemData: Omit<InventoryItem, 'id'>) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: crypto.randomUUID(),
    };
    setInventory(prev => [...prev, newItem]);
    // Auto add to kit and focus
    addItemToKit(newItem);
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold text-white">Gestione Kit</h1>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Cerca kit..."
              className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Plus size={20} />
            <span className="hidden md:inline">Nuovo Kit</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-4">
        {filteredKits.map(kit => (
          <div key={kit.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-4 hover:border-slate-700 transition-all">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-900/30 text-purple-400 rounded-lg">
                  <Package size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{kit.name}</h3>
                  <p className="text-sm text-slate-500">{kit.items.length} Elementi</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleDuplicate(kit)} className="p-2 text-slate-400 hover:text-white rounded-lg"><Copy size={16} /></button>
                <button onClick={() => handleOpenModal(kit)} className="p-2 text-blue-400 hover:text-blue-300 rounded-lg"><Edit2 size={16} /></button>
                <button onClick={() => setKitToDelete(kit.id)} className="p-2 text-rose-400 hover:text-rose-300 rounded-lg"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="bg-slate-950/50 rounded-lg p-3 text-sm text-slate-400 h-24 overflow-y-auto">
              {kit.description || 'Nessuna descrizione.'}
            </div>
            <div className="text-xs text-slate-500 border-t border-slate-800 pt-3">
               Contiene: {kit.items.slice(0, 3).map(i => getInventoryName(i.itemId)).join(', ')} {kit.items.length > 3 ? '...' : ''}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingKit ? "Modifica Kit" : "Nuovo Kit"} size="xl">
        <div className="flex flex-col lg:flex-row gap-6 h-[70vh]">
          {/* Left: Details & Selected Items */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="space-y-4">
               <div>
                <label className="block text-sm text-slate-400 mb-1">Nome Kit</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-purple-500 outline-none"
                  value={formData.name || ''}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Descrizione</label>
                <textarea 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-purple-500 outline-none h-20"
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
            </div>

            <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 p-4 overflow-hidden flex flex-col">
              <h4 className="text-sm font-semibold text-purple-400 mb-2 uppercase tracking-wider">Contenuto Kit</h4>
              <div className="overflow-y-auto flex-1 space-y-2 pr-2 custom-scrollbar">
                {formData.items?.length === 0 && <p className="text-slate-600 text-center py-4">Nessun materiale aggiunto.</p>}
                {formData.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-300 text-sm">{getInventoryName(item.itemId)}</span>
                    <div className="flex items-center gap-3">
                      <input 
                        ref={(el) => { qtyInputRefs.current[item.itemId] = el }}
                        type="number" 
                        className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-center text-white text-sm focus:border-purple-500 outline-none"
                        value={item.quantity}
                        onChange={(e) => updateItemQty(item.itemId, Number(e.target.value))}
                      />
                      <button onClick={() => removeItemFromKit(item.itemId)} className="text-rose-500 hover:text-rose-400">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Item Picker */}
          <div className="w-full lg:w-96 bg-slate-800 rounded-lg p-4 flex flex-col border border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-white">Aggiungi Materiale</h4>
              <button 
                onClick={() => setIsNewItemModalOpen(true)}
                className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
                title="Crea nuovo materiale"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Cerca..."
                className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm focus:border-purple-500 outline-none"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              {inventory
                .filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()))
                .map(item => (
                <button 
                  key={item.id}
                  onClick={() => addItemToKit(item)}
                  className="w-full text-left p-2 hover:bg-slate-700 rounded flex justify-between items-center group transition-colors"
                >
                  <span className="text-sm text-slate-300 truncate w-48">{item.name}</span>
                  <Plus size={16} className="text-slate-500 group-hover:text-purple-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 border-t border-slate-800 pt-4">
          <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
          <button onClick={handleSave} className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium">Salva Kit</button>
        </div>
      </Modal>

      <ItemFormModal
        isOpen={isNewItemModalOpen}
        onClose={() => setIsNewItemModalOpen(false)}
        onSave={handleCreateNewItem}
        title="Nuovo Materiale"
      />
      
      <ConfirmationModal
        isOpen={!!kitToDelete}
        onClose={() => setKitToDelete(null)}
        onConfirm={confirmDelete}
        title="Elimina Kit"
        message="Sei sicuro di voler eliminare questo kit? I materiali all'interno non verranno cancellati dall'inventario."
      />
    </div>
  );
};