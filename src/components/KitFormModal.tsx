import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { InventoryItem, Kit, Category } from '../types';
import { Modal } from './Modal';
import { ItemFormModal } from './ItemFormModal';
import { addOrUpdateItem, COLL_INVENTORY } from '../firebase';

interface KitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (kit: Kit) => void;
  initialData?: Kit | null;
  inventory: InventoryItem[];
  title: string;
}

export const KitFormModal: React.FC<KitFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory, title 
}) => {
  const [formData, setFormData] = useState<Partial<Kit>>({ items: [] });
  const [itemSearch, setItemSearch] = useState('');
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const qtyInputRefs = useRef<{ [itemId: string]: HTMLInputElement | null }>({});
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData, items: initialData.items || [] });
    } else {
      setFormData({ name: '', description: '', items: [], category: Category.OTHER });
    }
    setItemSearch('');
  }, [initialData, isOpen]);

  useEffect(() => {
    if (lastAddedItemId && qtyInputRefs.current[lastAddedItemId]) {
      qtyInputRefs.current[lastAddedItemId]?.focus();
      qtyInputRefs.current[lastAddedItemId]?.select();
      setLastAddedItemId(null);
    }
  }, [formData.items, lastAddedItemId]);

  const handleSave = () => {
    if (!formData.name) return;
    const cleanItems = (formData.items && Array.isArray(formData.items)) ? formData.items : [];
    const newKit = {
      ...formData as Kit,
      id: initialData?.id || crypto.randomUUID(),
      category: formData.category || Category.OTHER,
      items: cleanItems
    };
    onSave(newKit);
  };

  const addItemToKit = (invItem: InventoryItem) => {
    const itemsToAdd = [{ itemId: invItem.id, quantity: 1 }];
    if (invItem.accessories?.length) {
      invItem.accessories.forEach(acc => itemsToAdd.push({ itemId: acc.itemId, quantity: acc.quantity }));
    }
    let updatedItems = [...(formData.items || [])];
    itemsToAdd.forEach(toAdd => {
      const idx = updatedItems.findIndex(i => i.itemId === toAdd.itemId);
      if (idx >= 0) updatedItems[idx].quantity += toAdd.quantity;
      else updatedItems.push(toAdd);
    });
    setFormData({ ...formData, items: updatedItems });
    setLastAddedItemId(invItem.id);
  };

  const removeItemFromKit = (itemId: string) => {
    setFormData({ ...formData, items: formData.items?.filter(i => i.itemId !== itemId) });
  };

  const updateItemQty = (itemId: string, qty: number) => {
    if (qty < 1) return;
    setFormData({ ...formData, items: formData.items?.map(i => i.itemId === itemId ? { ...i, quantity: qty } : i) });
  };

  const filteredPickerItems = useMemo(() => {
    const term = itemSearch.toLowerCase().trim();
    if (!term) return inventory.slice(0, 50);
    return inventory.filter(i => i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term));
  }, [inventory, itemSearch]);

  const getInventoryName = (id: string) => inventory.find(i => i.id === id)?.name || 'Unknown Item';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col lg:flex-row gap-6 h-[70vh]">
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Nome Kit</label>
                <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-purple-500" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Es. Kit Regia" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Categoria</label>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-purple-500" value={formData.category || Category.OTHER} onChange={e => setFormData({...formData, category: e.target.value as Category})}>
                  {Object.values(Category).map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                </select>
              </div>
            </div>
            <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none h-16 resize-none" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Descrizione kit..." />
          </div>
          <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 p-4 overflow-hidden flex flex-col">
            <h4 className="text-sm font-semibold text-purple-400 mb-2 uppercase tracking-wider">Contenuto Kit</h4>
            <div className="overflow-y-auto flex-1 space-y-2 pr-2 custom-scrollbar">
              {formData.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-300 text-sm truncate flex-1 mr-2">{getInventoryName(item.itemId)}</span>
                  <div className="flex items-center gap-3">
                    {/* Fixed: Wrapped assignment in braces to return void instead of the element */}
                    <input ref={el => { qtyInputRefs.current[item.itemId] = el; }} type="number" className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-center text-white text-sm outline-none" value={item.quantity} onChange={e => updateItemQty(item.itemId, Number(e.target.value))} />
                    <button onClick={() => removeItemFromKit(item.itemId)} className="text-rose-500"><X size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="w-full lg:w-96 bg-slate-800 rounded-lg p-4 flex flex-col border border-slate-700">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-white text-sm">Aggiungi Materiale</h4>
            <button onClick={() => setIsNewItemModalOpen(true)} className="p-1.5 bg-slate-700 rounded text-slate-200"><Plus size={14} /></button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input type="text" placeholder="Cerca materiale..." className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm outline-none" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {filteredPickerItems.map(item => (
              <button key={item.id} onClick={() => addItemToKit(item)} className="w-full text-left p-2 hover:bg-slate-700 rounded flex justify-between items-center group">
                <span className="text-xs text-slate-300 truncate">{item.name}</span>
                <Plus size={14} className="text-slate-500 group-hover:text-purple-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-800">
        <button onClick={onClose} className="px-4 py-2 text-slate-400">Annulla</button>
        <button onClick={handleSave} className="px-6 py-2 bg-purple-600 text-white rounded-lg">Salva Kit</button>
      </div>
      <ItemFormModal isOpen={isNewItemModalOpen} onClose={() => setIsNewItemModalOpen(false)} onSave={async (d) => { const ni = { ...d, id: crypto.randomUUID(), accessories: d.accessories || [] }; await addOrUpdateItem(COLL_INVENTORY, ni); addItemToKit(ni); }} title="Nuovo Materiale" inventory={inventory} />
    </Modal>
  );
};