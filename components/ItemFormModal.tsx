import React, { useState, useEffect } from 'react';
import { InventoryItem, Category } from '../types';
import { Modal } from './Modal';
import { Plus, X, Search, Link, ArrowLeft } from 'lucide-react';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Omit<InventoryItem, 'id'>) => void;
  initialData?: InventoryItem | null;
  inventory?: InventoryItem[]; // Needed to pick accessories
  onCreateAccessory?: (item: InventoryItem) => void; // CHANGED: Now accepts full item with ID
  title: string;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory = [], onCreateAccessory, title 
}) => {
  // --- MAIN FORM STATE ---
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    category: Category.AUDIO,
    inStock: 0,
    weight: 0,
    name: '',
    description: '',
    accessories: []
  });
  const [weightInput, setWeightInput] = useState('0');
  
  // --- ACCESSORY PICKER STATE ---
  const [accessorySearch, setAccessorySearch] = useState('');
  
  // --- QUICK CREATE ACCESSORY STATE ---
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickForm, setQuickForm] = useState<Partial<InventoryItem>>({
    name: '',
    category: Category.CABLES,
    inStock: 0,
    weight: 0,
    description: ''
  });
  const [quickWeightInput, setQuickWeightInput] = useState('0');

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
      setWeightInput(initialData.weight?.toString() || '0');
    } else {
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
    setIsQuickCreateOpen(false);
  }, [initialData, isOpen]);

  // Handle main form weight
  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setWeightInput(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setFormData(prev => ({ ...prev, weight: num }));
    }
  };

  // Handle quick form weight
  const handleQuickWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuickWeightInput(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setQuickForm(prev => ({ ...prev, weight: num }));
    }
  };

  const handleSubmit = () => {
    if (formData.name && formData.category) {
      onSave(formData as Omit<InventoryItem, 'id'>);
      onClose();
    }
  };

  // --- ACCESSORY LOGIC ---

  const addAccessory = (item: InventoryItem) => {
    const currentAccessories = formData.accessories || [];
    const existing = currentAccessories.find(a => a.itemId === item.id);
    
    if (existing) {
      const updated = currentAccessories.map(a => 
        a.itemId === item.id ? { ...a, quantity: a.quantity + 1 } : a
      );
      setFormData(prev => ({ ...prev, accessories: updated }));
    } else {
      setFormData(prev => ({ 
        ...prev, 
        accessories: [...currentAccessories, { itemId: item.id, quantity: 1 }] 
      }));
    }
    // Clear search to show linked list again
    setAccessorySearch('');
  };

  const removeAccessory = (itemId: string) => {
    const currentAccessories = formData.accessories || [];
    setFormData(prev => ({ 
      ...prev, 
      accessories: currentAccessories.filter(a => a.itemId !== itemId) 
    }));
  };

  const updateAccessoryQuantity = (itemId: string, qty: number) => {
    if (qty < 1) return;
    const currentAccessories = formData.accessories || [];
    setFormData(prev => ({ 
      ...prev, 
      accessories: currentAccessories.map(a => a.itemId === itemId ? { ...a, quantity: qty } : a) 
    }));
  };

  // Prepare Quick Create Form
  const openQuickCreate = () => {
      setQuickForm({
          name: accessorySearch,
          category: Category.CABLES,
          inStock: 0,
          weight: 0,
          description: ''
      });
      setQuickWeightInput('0');
      setIsQuickCreateOpen(true);
  };

  const handleCreateAndAddAccessory = () => {
      if (!quickForm.name?.trim() || !onCreateAccessory) return;
      
      // 1. Generate ID locally
      const newId = crypto.randomUUID();

      const newItemData: InventoryItem = {
          id: newId,
          name: quickForm.name.trim(),
          category: quickForm.category || Category.CABLES,
          inStock: quickForm.inStock || 0,
          weight: quickForm.weight || 0,
          description: quickForm.description || '',
          accessories: []
      };

      // 2. Add to Global Inventory via Callback
      onCreateAccessory(newItemData);

      // 3. IMMEDIATELY Link to current item
      addAccessory(newItemData);
      
      // 4. Update UI
      setIsQuickCreateOpen(false);
      setAccessorySearch(''); 
  };

  const getInventoryName = (id: string) => inventory.find(i => i.id === id)?.name || 'Unknown Item';

  // Filtered Inventory for Search
  const searchResults = accessorySearch.trim() 
    ? inventory.filter(i => 
        i.id !== initialData?.id && // Prevent self-reference
        (i.name.toLowerCase().includes(accessorySearch.toLowerCase()) || 
         i.category.toLowerCase().includes(accessorySearch.toLowerCase()))
      )
    : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col lg:flex-row gap-6 relative">
        
        {/* LEFT COLUMN: Main Data */}
        <div className="flex-1 space-y-4">
            <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome</label>
                <input 
                    type="text" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none placeholder-slate-700"
                    value={formData.name || ''}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Es. Cavo XLR 5mt"
                    autoFocus
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Categoria</label>
                    <select 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value as Category})}
                    >
                        {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Stock Totale</label>
                    <input 
                        type="number" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-right"
                        value={formData.inStock}
                        onChange={e => setFormData({...formData, inStock: parseInt(e.target.value) || 0})}
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Peso (kg)</label>
                <input 
                    type="number" 
                    step="0.01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                    value={weightInput}
                    onChange={handleWeightChange}
                />
            </div>

            <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
                <textarea 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-24 resize-none placeholder-slate-700"
                    value={formData.description || ''}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Dettagli aggiuntivi..."
                />
            </div>
        </div>

        {/* Divider for Desktop */}
        <div className="hidden lg:block w-px bg-slate-800" />

        {/* RIGHT COLUMN: Accessories */}
        <div className="w-full lg:w-[400px] flex flex-col h-[500px] lg:h-auto">
            <div className="mb-3">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Link size={16} className="text-blue-500" /> 
                    Accessori Predefiniti
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-snug">
                    Oggetti aggiunti automaticamente in lista quando selezioni questo articolo (es. Cavi, Ganci).
                </p>
            </div>

            <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                    <input 
                        type="text" 
                        placeholder="Cerca accessorio nell'inventario..." 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500 placeholder-slate-600"
                        value={accessorySearch}
                        onChange={(e) => setAccessorySearch(e.target.value)}
                    />
                </div>
                {onCreateAccessory && (
                    <button 
                        onClick={openQuickCreate}
                        className="bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 rounded-lg w-10 flex items-center justify-center transition-colors"
                        title="Crea nuovo accessorio se non esiste"
                    >
                        <Plus size={20} />
                    </button>
                )}
            </div>

            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 overflow-y-auto custom-scrollbar relative">
                {!accessorySearch ? (
                    // VIEW MODE: Show Linked Accessories
                    <>
                        {formData.accessories && formData.accessories.length > 0 ? (
                            <div className="space-y-2">
                                {/* Only verify existence in global inventory to show name, but show item even if ID not found yet (edge case) */}
                                {formData.accessories.map((acc, idx) => {
                                    const accName = inventory.find(i => i.id === acc.itemId)?.name || (acc.itemId === quickForm.name ? quickForm.name : 'Nuovo Oggetto');
                                    return (
                                    <div key={idx} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800/50 group">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="text-sm text-slate-200 truncate">{accName}</div>
                                            <div className="text-[10px] text-slate-500">Accessorio collegato</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                min="1"
                                                className="w-10 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white text-xs outline-none focus:border-blue-500"
                                                value={acc.quantity}
                                                onChange={(e) => updateAccessoryQuantity(acc.itemId, parseInt(e.target.value))}
                                            />
                                            <button 
                                                onClick={() => removeAccessory(acc.itemId)}
                                                className="text-slate-600 hover:text-rose-500 p-1"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )})}
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 p-4 text-center">
                                <Link size={32} className="mb-2 opacity-20" />
                                <p className="text-sm">Nessun accessorio collegato.</p>
                                <p className="text-xs mt-1 opacity-50">Cerca qui sopra per aggiungerne uno.</p>
                            </div>
                        )}
                    </>
                ) : (
                    // SEARCH MODE: Show Inventory Results
                    <div className="space-y-1">
                        {searchResults.length > 0 ? (
                            searchResults.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => addAccessory(item)}
                                    className="w-full text-left p-2 hover:bg-blue-900/20 border border-transparent hover:border-blue-500/30 rounded-lg flex justify-between items-center group transition-colors"
                                >
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
                                    <button 
                                        onClick={openQuickCreate}
                                        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full inline-flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Crea "{accessorySearch}"
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* QUICK CREATE OVERLAY (FULL COVER) */}
        {isQuickCreateOpen && (
            <div className="absolute inset-0 z-20 bg-slate-900 flex flex-col animate-in fade-in zoom-in-95 rounded-xl">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsQuickCreateOpen(false)} className="text-slate-400 hover:text-white mr-2">
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className="text-xl font-bold text-white">Nuovo Accessorio</h2>
                    </div>
                    <button onClick={() => setIsQuickCreateOpen(false)} className="text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>
                
                {/* Form Content - Same Layout as Main Form */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    <div className="max-w-3xl mx-auto space-y-4">
                        {/* Name */}
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                                value={quickForm.name}
                                onChange={e => setQuickForm({...quickForm, name: e.target.value})}
                                placeholder="Es. Gancio Aliscaf"
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Category */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Categoria</label>
                                <select 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                                    value={quickForm.category}
                                    onChange={e => setQuickForm({...quickForm, category: e.target.value as Category})}
                                >
                                    {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            {/* Stock */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Stock Totale</label>
                                <input 
                                    type="number" 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-right"
                                    value={quickForm.inStock}
                                    onChange={e => setQuickForm({...quickForm, inStock: parseInt(e.target.value) || 0})}
                                />
                            </div>
                        </div>

                        {/* Weight */}
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Peso (kg)</label>
                            <input 
                                type="number" 
                                step="0.01"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                                value={quickWeightInput}
                                onChange={handleQuickWeightChange}
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
                            <textarea 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-24 resize-none"
                                value={quickForm.description}
                                onChange={e => setQuickForm({...quickForm, description: e.target.value})}
                                placeholder="Dettagli aggiuntivi..."
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-slate-800 bg-slate-900 rounded-b-xl">
                    <button 
                        onClick={() => setIsQuickCreateOpen(false)}
                        className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        Annulla
                    </button>
                    <button 
                        onClick={handleCreateAndAddAccessory}
                        disabled={!quickForm.name}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                    >
                        Crea Accessorio
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Main Footer Actions */}
      <div className="flex justify-end gap-3 pt-6 border-t border-slate-800 mt-2">
        <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
            Annulla
        </button>
        <button 
            onClick={handleSubmit}
            disabled={!formData.name}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20"
        >
            Salva
        </button>
      </div>
    </Modal>
  );
};
