import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, Category } from '../types';
import { Modal } from './Modal';
import { Plus, X, Search, Link, ArrowLeft } from 'lucide-react';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Omit<InventoryItem, 'id'>) => void;
  initialData?: InventoryItem | null;
  inventory?: InventoryItem[];
  onCreateAccessory?: (item: InventoryItem) => void;
  title: string;
  // This prop was added in a previous faulty attempt and might exist in the user's file.
  // Including it in the signature to avoid breaking, even if it's not used in the new logic.
  initialName?: string;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory = [], onCreateAccessory, title 
}) => {
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [weightInput, setWeightInput] = useState('0');
  const [powerInput, setPowerInput] = useState('0');
  const [accessorySearch, setAccessorySearch] = useState('');
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [localInventory, setLocalInventory] = useState<InventoryItem[]>([]);
  const [quickForm, setQuickForm] = useState<Partial<InventoryItem>>({});
  const [quickWeightInput, setQuickWeightInput] = useState('0');
  const [quickPowerInput, setQuickPowerInput] = useState('0');

  // Effect to initialize or reset form state when modal opens/closes or data changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({ ...initialData });
        setWeightInput(initialData.weight?.toString() || '0');
        setPowerInput(initialData.powerConsumption?.toString() || '0');
      } else {
        setFormData({
          category: Category.AUDIO,
          inStock: 0,
          weight: 0,
          powerConsumption: 0,
          name: '',
          description: '',
          accessories: []
        });
        setWeightInput('0');
        setPowerInput('0');
      }
      setAccessorySearch('');
      setIsQuickCreateOpen(false);
      setLocalInventory([]); // Reset local cache on open
    }
  }, [initialData, isOpen]);

  const handleNumericInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    formKey: keyof InventoryItem,
    formSetter: React.Dispatch<React.SetStateAction<Partial<InventoryItem>>>
  ) => {
    const val = e.target.value;
    setter(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      formSetter(prev => ({ ...prev, [formKey]: num }));
    }
  };

  const handleSubmit = () => {
    if (formData.name && formData.category) {
      onSave(formData as Omit<InventoryItem, 'id'>);
      onClose();
    }
  };

  const addAccessory = (item: InventoryItem) => {
    const currentAccessories = formData.accessories || [];
    const existing = currentAccessories.find(a => a.itemId === item.id);
    
    let updatedAccessories;
    if (existing) {
      updatedAccessories = currentAccessories.map(a => 
        a.itemId === item.id ? { ...a, quantity: a.quantity + 1 } : a
      );
    } else {
      updatedAccessories = [...currentAccessories, { itemId: item.id, quantity: 1 }];
    }
    setFormData(prev => ({ ...prev, accessories: updatedAccessories }));
    setAccessorySearch('');
  };

  const removeAccessory = (itemId: string) => {
    setFormData(prev => ({ 
      ...prev, 
      accessories: (prev.accessories || []).filter(a => a.itemId !== itemId) 
    }));
  };

  const updateAccessoryQuantity = (itemId: string, qty: number) => {
    if (qty < 1) return;
    setFormData(prev => ({ 
      ...prev, 
      accessories: (prev.accessories || []).map(a => a.itemId === itemId ? { ...a, quantity: qty } : a) 
    }));
  };

  const openQuickCreate = () => {
      setQuickForm({
          name: accessorySearch,
          category: Category.CABLES,
          inStock: 0,
          weight: 0,
          powerConsumption: 0,
          description: ''
      });
      setQuickWeightInput('0');
      setQuickPowerInput('0');
      setIsQuickCreateOpen(true);
  };

  const handleCreateAndAddAccessory = () => {
      if (!quickForm.name?.trim() || !onCreateAccessory) return;
      
      const newItemData: InventoryItem = {
          id: crypto.randomUUID(),
          name: quickForm.name.trim(),
          category: quickForm.category || Category.CABLES,
          inStock: quickForm.inStock || 0,
          weight: quickForm.weight || 0,
          powerConsumption: quickForm.powerConsumption || 0,
          description: quickForm.description || '',
          accessories: []
      };

      setLocalInventory(prev => [...prev, newItemData]);
      onCreateAccessory(newItemData);
      addAccessory(newItemData);
      
      setIsQuickCreateOpen(false);
      setAccessorySearch(''); 
  };

  const searchResults = useMemo(() => {
    const tokens = accessorySearch.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return [];
    return inventory.filter(i => {
        if (i.id === initialData?.id) return false;
        const combined = `${i.name} ${i.category} ${i.description || ''}`.toLowerCase();
        return tokens.every(token => combined.includes(token));
    });
  }, [inventory, accessorySearch, initialData]);

  const renderAccessoryList = () => {
    const accessories = formData.accessories || [];
    if (accessories.length === 0) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 p-4 text-center">
            <Link size={32} className="mb-2 opacity-20" />
            <p className="text-sm">Nessun accessorio collegato.</p>
            <p className="text-xs mt-1 opacity-50">Cerca qui sopra per aggiungerne uno.</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {accessories.map((acc, idx) => {
            const accItem = inventory.find(i => i.id === acc.itemId) || localInventory.find(i => i.id === acc.itemId);
            const accName = accItem ? accItem.name : 'Caricamento...';
            return (
            <div key={idx} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800/50 group">
                <div className="flex-1 min-w-0 pr-2">
                    <div className="text-sm text-slate-200 truncate">{accName}</div>
                    <div className="text-[10px] text-slate-500">Accessorio collegato</div>
                </div>
                <div className="flex items-center gap-2">
                    <input type="number" min="1" className="w-10 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white text-xs outline-none focus:border-blue-500" value={acc.quantity} onChange={(e) => updateAccessoryQuantity(acc.itemId, parseInt(e.target.value))} />
                    <button onClick={() => removeAccessory(acc.itemId)} className="text-slate-600 hover:text-rose-500 p-1"><X size={14} /></button>
                </div>
            </div>
            );
        })}
      </div>
    );
  };
  
  const renderAccessorySearch = () => (
    <div className="space-y-1">
      {searchResults.length > 0 ? (
        searchResults.map(item => (
          <button key={item.id} onClick={() => addAccessory(item)} className="w-full text-left p-2 hover:bg-blue-900/20 border border-transparent hover:border-blue-500/30 rounded-lg flex justify-between items-center group transition-colors">
            <div className="min-w-0">
              <div className="text-sm text-slate-200 truncate font-medium group-hover:text-blue-300">{item.name}</div>
              <div className="text-xs text-slate-500">{item.category}</div>
            </div>
            <Plus size={16} className="text-slate-600 group-hover:text-blue-400" />
          </button>
        ))
      ) : (
        <div className="text-center py-8">
            <p className="text-sm text-slate-500 mb-2">Nessun risultato per "{accessorySearch}"</p>
            {onCreateAccessory && (
              <button onClick={openQuickCreate} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full inline-flex items-center gap-1">
                  <Plus size={12} /> Crea "{accessorySearch}"
              </button>
            )}
        </div>
      )}
    </div>
  );

  const renderQuickCreateForm = () => (
      <div className="absolute inset-0 z-20 bg-slate-900 flex flex-col animate-in fade-in zoom-in-95 rounded-xl">
          <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                  <button onClick={() => setIsQuickCreateOpen(false)} className="text-slate-400 hover:text-white mr-2"><ArrowLeft size={20} /></button>
                  <h2 className="text-xl font-bold text-white">Nuovo Accessorio</h2>
              </div>
              <button onClick={() => setIsQuickCreateOpen(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
          </div>
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="max-w-3xl mx-auto space-y-4">
                  <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome</label>
                      <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={quickForm.name} onChange={e => setQuickForm({...quickForm, name: e.target.value})} placeholder="Es. Gancio Aliscaf" autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Categoria</label>
                          <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={quickForm.category} onChange={e => setQuickForm({...quickForm, category: e.target.value as Category})}>
                              {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Stock Totale</label>
                          <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-right" value={quickForm.inStock} onChange={e => setQuickForm({...quickForm, inStock: parseInt(e.target.value) || 0})} />
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Peso (kg)</label>
                          <input type="number" step="0.01" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={quickWeightInput} onChange={e => handleNumericInputChange(e, setQuickWeightInput, 'weight', setQuickForm)} />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Consumo (W)</label>
                          <input type="number" step="1" min="0" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={quickPowerInput} onChange={e => handleNumericInputChange(e, setQuickPowerInput, 'powerConsumption', setQuickForm)} placeholder="0 se non elettrico" />
                      </div>
                  </div>
                  <div className="space-y-1">
                      <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
                      <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-24 resize-none" value={quickForm.description} onChange={e => setQuickForm({...quickForm, description: e.target.value})} placeholder="Dettagli aggiuntivi..." />
                  </div>
              </div>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t border-slate-800 bg-slate-900 rounded-b-xl">
              <button onClick={() => setIsQuickCreateOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">Annulla</button>
              <button onClick={handleCreateAndAddAccessory} disabled={!quickForm.name} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">Crea Accessorio</button>
          </div>
      </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col lg:flex-row gap-6 relative">
        <div className="flex-1 space-y-4">
            <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome</label>
                <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none placeholder-slate-700" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Es. Cavo XLR 5mt" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Categoria</label>
                    <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as Category})}>
                        {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Stock Totale</label>
                    <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-right" value={formData.inStock} onChange={e => setFormData({...formData, inStock: parseInt(e.target.value) || 0})} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Peso (kg)</label>
                    <input type="number" step="0.01" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={weightInput} onChange={e => handleNumericInputChange(e, setWeightInput, 'weight', setFormData)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Consumo (W)</label>
                    <input type="number" step="1" min="0" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={powerInput} onChange={e => handleNumericInputChange(e, setPowerInput, 'powerConsumption', setFormData)} placeholder="0 se non elettrico" />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
                <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-24 resize-none placeholder-slate-700" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Dettagli aggiuntivi..." />
            </div>
        </div>

        <div className="hidden lg:block w-px bg-slate-800" />

        <div className="w-full lg:w-[400px] flex flex-col h-[500px] lg:h-auto">
            <div className="mb-3">
                <h3 className="font-bold text-white flex items-center gap-2"><Link size={16} className="text-blue-500" /> Accessori Predefiniti</h3>
                <p className="text-xs text-slate-500 mt-1 leading-snug">Oggetti aggiunti automaticamente in lista quando selezioni questo articolo (es. Cavi, Ganci).</p>
            </div>
            <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                    <input type="text" placeholder="Cerca accessorio nell'inventario..." className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500 placeholder-slate-600" value={accessorySearch} onChange={(e) => setAccessorySearch(e.target.value)} />
                </div>
                {onCreateAccessory && (
                    <button onClick={openQuickCreate} className="bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 rounded-lg w-10 flex items-center justify-center transition-colors" title="Crea nuovo accessorio se non esiste">
                        <Plus size={20} />
                    </button>
                )}
            </div>
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 overflow-y-auto custom-scrollbar relative">
                {accessorySearch ? renderAccessorySearch() : renderAccessoryList()}
            </div>
        </div>

        {isQuickCreateOpen && renderQuickCreateForm()}
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-slate-800 mt-2">
        <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">Annulla</button>
        <button onClick={handleSubmit} disabled={!formData.name} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20">Salva</button>
      </div>
    </Modal>
  );
};
