import React, { useState, useEffect } from 'react';
import { InventoryItem, Category } from '../types';
import { Modal } from './Modal';
import { Plus, X, Search, Link } from 'lucide-react';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Omit<InventoryItem, 'id'>) => void;
  initialData?: InventoryItem | null;
  inventory?: InventoryItem[]; // Needed to pick accessories
  title: string;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory = [], title 
}) => {
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    category: Category.AUDIO,
    inStock: 0,
    weight: 0,
    name: '',
    description: '',
    accessories: []
  });

  const [weightInput, setWeightInput] = useState('0');
  
  // Accessory Picker State
  const [accessorySearch, setAccessorySearch] = useState('');
  const [isAccessoryPickerOpen, setIsAccessoryPickerOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({ 
            ...initialData,
            accessories: initialData.accessories || [] 
        });
        setWeightInput(initialData.weight?.toString() || '0');
      } else {
        // Reset for new item
        setFormData({ 
            category: Category.AUDIO, 
            inStock: 0, 
            weight: 0, 
            name: '', 
            description: '',
            accessories: []
        });
        setWeightInput('0');
      }
      setAccessorySearch('');
      setIsAccessoryPickerOpen(false);
    }
  }, [isOpen, initialData]);

  const handleSubmit = () => {
    if (!formData.name) return;

    const parsedWeight = parseFloat(weightInput.replace(',', '.'));
    const finalWeight = isNaN(parsedWeight) ? 0 : parsedWeight;

    onSave({
      name: formData.name!,
      category: formData.category || Category.AUDIO,
      inStock: formData.inStock || 0,
      weight: finalWeight,
      description: formData.description || '',
      accessories: formData.accessories || []
    });
    
    onClose();
  };

  const addAccessory = (item: InventoryItem) => {
      const currentAccessories = formData.accessories || [];
      const existing = currentAccessories.find(a => a.itemId === item.id);
      
      if (existing) {
          setFormData({
              ...formData,
              accessories: currentAccessories.map(a => a.itemId === item.id ? { ...a, quantity: a.quantity + 1 } : a)
          });
      } else {
          setFormData({
              ...formData,
              accessories: [...currentAccessories, { itemId: item.id, quantity: 1 }]
          });
      }
  };

  const removeAccessory = (itemId: string) => {
      setFormData({
          ...formData,
          accessories: (formData.accessories || []).filter(a => a.itemId !== itemId)
      });
  };

  const updateAccessoryQty = (itemId: string, qty: number) => {
      if (qty < 1) return;
      setFormData({
          ...formData,
          accessories: (formData.accessories || []).map(a => a.itemId === itemId ? { ...a, quantity: qty } : a)
      });
  };
  
  const getInventoryName = (id: string) => inventory.find(i => i.id === id)?.name || 'Oggetto sconosciuto';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Left Column: Standard Data */}
        <div className="flex-1 space-y-4">
            <div>
            <label className="block text-sm text-slate-400 mb-1">Nome</label>
            <input 
                type="text" 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
                value={formData.name || ''}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Es. Cavo XLR 10m"
                autoFocus
            />
            </div>
            <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm text-slate-400 mb-1">Categoria</label>
                <select 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as Category})}
                >
                {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm text-slate-400 mb-1">Stock Totale</label>
                <input 
                type="number" 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
                value={formData.inStock}
                onChange={e => setFormData({...formData, inStock: Number(e.target.value)})}
                />
            </div>
            </div>
            <div>
            <label className="block text-sm text-slate-400 mb-1">Peso (kg)</label>
            <input 
                type="text"
                inputMode="decimal"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
                value={weightInput}
                onChange={e => {
                const val = e.target.value;
                if (/^[\d.,]*$/.test(val)) {
                    setWeightInput(val);
                }
                }}
                onBlur={() => {
                const parsed = parseFloat(weightInput.replace(',', '.'));
                if (!isNaN(parsed)) {
                    setWeightInput(parsed.toString());
                }
                }}
            />
            </div>
            <div>
            <label className="block text-sm text-slate-400 mb-1">Descrizione</label>
            <textarea 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none h-24"
                value={formData.description || ''}
                onChange={e => setFormData({...formData, description: e.target.value})}
            />
            </div>
        </div>

        {/* Right Column: Accessories */}
        <div className="w-full md:w-1/2 flex flex-col border-l border-slate-800 pl-0 md:pl-6">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                <Link size={16} className="text-blue-500" />
                Accessori Predefiniti
            </h3>
            <p className="text-xs text-slate-500 mb-4">
                Oggetti aggiunti automaticamente in lista quando selezioni questo articolo (es. Cavi, Ganci).
            </p>

            <div className="relative mb-3 group">
                <Search className="absolute left-3 top-2.5 text-slate-500 z-30 pointer-events-none" size={16} />
                <input 
                    type="text"
                    placeholder="Cerca accessorio nell'inventario..."
                    className="w-full bg-slate-950 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm focus:border-blue-500 outline-none relative z-20"
                    value={accessorySearch}
                    onChange={(e) => {
                        setAccessorySearch(e.target.value);
                        setIsAccessoryPickerOpen(true);
                    }}
                    onFocus={() => setIsAccessoryPickerOpen(true)}
                />
                
                {/* Search Results Dropdown */}
                {isAccessoryPickerOpen && accessorySearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-y-auto z-30 custom-scrollbar">
                        {inventory
                            .filter(i => 
                                i.id !== initialData?.id && // Don't allow adding self
                                i.name.toLowerCase().includes(accessorySearch.toLowerCase())
                            )
                            .map(item => (
                                <button
                                    key={item.id}
                                    className="w-full text-left p-2 hover:bg-slate-700 text-sm flex justify-between items-center border-b border-slate-700/50 last:border-0"
                                    onClick={() => {
                                        addAccessory(item);
                                        setAccessorySearch('');
                                        setIsAccessoryPickerOpen(false);
                                    }}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-slate-200">{item.name}</span>
                                        <span className="text-[10px] text-slate-500">{item.category}</span>
                                    </div>
                                    <Plus size={14} className="text-blue-500" />
                                </button>
                            ))}
                         {inventory.filter(i => i.id !== initialData?.id && i.name.toLowerCase().includes(accessorySearch.toLowerCase())).length === 0 && (
                             <div className="p-2 text-xs text-slate-500 text-center">Nessun oggetto trovato</div>
                         )}
                    </div>
                )}
                
                {/* Invisible backdrop to close picker when clicking outside */}
                {isAccessoryPickerOpen && (
                     <div className="fixed inset-0 z-10" onClick={() => setIsAccessoryPickerOpen(false)} />
                )}
            </div>

            {/* List of Added Accessories */}
            <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 p-2 overflow-y-auto max-h-[300px] custom-scrollbar space-y-2">
                {(!formData.accessories || formData.accessories.length === 0) && (
                    <div className="text-center text-slate-600 py-8 text-sm">
                        Nessun accessorio collegato.
                    </div>
                )}
                {formData.accessories?.map((acc) => (
                    <div key={acc.itemId} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800">
                        <span className="text-slate-300 text-sm truncate flex-1 mr-2" title={getInventoryName(acc.itemId)}>
                            {getInventoryName(acc.itemId)}
                        </span>
                        <div className="flex items-center gap-2">
                            <input 
                                type="number"
                                min="1"
                                className="w-14 bg-slate-800 border border-slate-700 rounded px-1 py-1 text-center text-white text-sm focus:border-blue-500 outline-none"
                                value={acc.quantity}
                                onChange={(e) => updateAccessoryQty(acc.itemId, Number(e.target.value))}
                            />
                            <button 
                                onClick={() => removeAccessory(acc.itemId)}
                                className="text-rose-500 hover:text-rose-400 p-1"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-800">
        <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
        <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">Salva</button>
      </div>
    </Modal>
  );
};