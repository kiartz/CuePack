import React, { useState, useEffect, useRef, useMemo } from 'react';
import { generateId } from '../utils';
import { Plus, Search, X, Lightbulb, Blocks, Layers, Package } from 'lucide-react';
import { InventoryItem, Kit, Category, Template, TemplateComponent } from '../types';
import { Modal } from './Modal';
import { ItemFormModal } from './ItemFormModal';
import { addOrUpdateItem, COLL_TEMPLATES, COLL_INVENTORY } from '../firebase';

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: Template) => void;
  initialData?: Template | null;
  inventory: InventoryItem[];
  kits: Kit[];
  title: string;
}

export const TemplateFormModal: React.FC<TemplateFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory, kits, title 
}) => {
  const [formData, setFormData] = useState<Partial<Template>>({ items: [] });
  const [itemSearch, setItemSearch] = useState('');
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const qtyInputRefs = useRef<{ [refId: string]: HTMLInputElement | null }>({});
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  
  // Reminder State
  const [reminderInput, setReminderInput] = useState('');
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  
  // Mobile Tab State
  const [activeTab, setActiveTab] = useState<'info' | 'picker'>('info');

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData, items: initialData.items || [], reminders: initialData.reminders || [] });
    } else {
      setFormData({ name: '', description: '', items: [], reminders: [], category: Category.OTHER });
    }
    setItemSearch('');
    setReminderInput('');
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
    const newTemplate = {
      ...formData as Template,
      id: initialData?.id || generateId(),
      category: formData.category || Category.OTHER,
      items: formData.items || [],
      reminders: formData.reminders || []
    };
    onSave(newTemplate);
  };

  const addReminder = () => {
    if (!reminderInput.trim()) return;
    setFormData({ ...formData, reminders: [...(formData.reminders || []), reminderInput.trim()] });
    setReminderInput('');
  };

  const removeReminder = (index: number) => {
    const newReminders = [...(formData.reminders || [])];
    newReminders.splice(index, 1);
    setFormData({ ...formData, reminders: newReminders });
  };

  const addItemToTemplate = (item: InventoryItem | Kit, type: 'item' | 'kit') => {
    const toAdd: TemplateComponent = { type, referenceId: item.id, quantity: 1 };
    let updatedItems = [...(formData.items || [])];
    const idx = updatedItems.findIndex(i => i.referenceId === toAdd.referenceId && i.type === toAdd.type);
    
    if (idx >= 0) updatedItems[idx].quantity += toAdd.quantity;
    else updatedItems.push(toAdd);
    
    setFormData({ ...formData, items: updatedItems });
    setLastAddedItemId(item.id);
  };

  const removeItemFromTemplate = (referenceId: string, type: 'item' | 'kit') => {
    setFormData({ ...formData, items: formData.items?.filter(i => !(i.referenceId === referenceId && i.type === type)) });
  };

  const updateItemQty = (referenceId: string, type: 'item' | 'kit', qty: number) => {
    if (qty < 1) return;
    setFormData({ ...formData, items: formData.items?.map(i => (i.referenceId === referenceId && i.type === type) ? { ...i, quantity: qty } : i) });
  };

  const handleCreateNewItem = async (itemData: Omit<InventoryItem, 'id'>) => {
    const newItem: InventoryItem = { ...itemData, id: generateId(), accessories: (itemData as any).accessories || [] };
    await addOrUpdateItem(COLL_INVENTORY, newItem);
    addItemToTemplate(newItem, 'item');
    setIsNewItemModalOpen(false);
  };

  const handleCreateInventoryItemOnly = async (newItem: InventoryItem) => {
    await addOrUpdateItem(COLL_INVENTORY, newItem);
  };

  const filteredPickerItems = useMemo(() => {
    const term = itemSearch.toLowerCase().trim();
    const inventoryMatches = inventory.filter(i => i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term));
    const kitMatches = kits.filter(k => k.name.toLowerCase().includes(term) || k.category.toLowerCase().includes(term));
    
    return {
      items: term ? inventoryMatches : inventoryMatches.slice(0, 30),
      kits: term ? kitMatches : kitMatches.slice(0, 20)
    };
  }, [inventory, kits, itemSearch]);

  const itemQuantities = useMemo(() => {
    const map = new Map<string, number>();
    formData.items?.forEach(item => {
      const key = `${item.type}-${item.referenceId}`;
      map.set(key, (map.get(key) || 0) + item.quantity);
    });
    return map;
  }, [formData.items]);

  const getNameAndIcon = (comp: TemplateComponent) => {
    if (comp.type === 'kit') {
      const k = kits.find(x => x.id === comp.referenceId);
      return { name: k?.name || 'Kit Sconosciuto', icon: <Package size={14} className="text-purple-400" /> };
    } else {
      const i = inventory.find(x => x.id === comp.referenceId);
      return { name: i?.name || 'Oggetto Sconosciuto', icon: <Layers size={14} className="text-emerald-400" /> };
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="flex lg:hidden bg-slate-900 border border-slate-800 rounded-xl p-1 mb-4 shrink-0">
        <button 
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'info' ? 'bg-slate-800 text-emerald-400 shadow-lg border border-slate-700' : 'text-slate-500'}`}
        >
          Dettagli Template
        </button>
        <button 
          onClick={() => setActiveTab('picker')}
          className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'picker' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500'}`}
        >
          Aggiungi Materiale
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[70vh] lg:h-[60vh]">
        <div className={`flex-1 flex flex-col gap-4 min-h-0 ${activeTab !== 'info' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Nome Template</label>
                <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 md:p-2 text-white outline-none focus:border-emerald-500 text-base md:text-sm" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Es. Template Regia Avanzata" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Categoria</label>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 md:p-2 text-white outline-none focus:border-emerald-500 text-base md:text-sm" value={formData.category || Category.OTHER} onChange={e => setFormData({...formData, category: e.target.value as Category})}>
                  {Object.values(Category).map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                </select>
              </div>
            </div>
            
            <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none h-16 resize-none" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Descrizione template..." />
            
            <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 flex flex-col">
              <h4 className="text-sm font-semibold text-emerald-400 mb-2 uppercase tracking-wider">Contenuto Template</h4>
              <div className="space-y-2">
                {formData.items?.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Il template è vuoto. Aggiungi materiale dalla destra.</p>}
                {formData.items?.map((item, idx) => {
                  const info = getNameAndIcon(item);
                  return (
                    <div key={idx} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800">
                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                        {info.icon}
                        <span className="text-slate-300 text-sm truncate">{info.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input ref={el => { qtyInputRefs.current[item.referenceId] = el; }} type="number" className="w-16 bg-slate-800 border border-slate-700 rounded p-2 text-center text-white text-base md:text-sm outline-none focus:border-emerald-500" value={item.quantity} onChange={e => updateItemQty(item.referenceId, item.type, Number(e.target.value))} />
                        <button onClick={() => removeItemFromTemplate(item.referenceId, item.type)} className="text-rose-500 p-2 -mr-2"><X size={20} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className={`w-full lg:w-96 bg-slate-800 rounded-lg p-4 flex flex-col border border-slate-700 h-full ${activeTab !== 'picker' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-white text-sm">Aggiungi Materiale</h4>
            <button onClick={() => setIsNewItemModalOpen(true)} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 transition-colors" title="Nuovo materiale">
              <Plus size={14} />
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-3.5 md:top-2.5 text-slate-400" size={16} />
            <input type="text" placeholder="Cerca materiale o kit..." className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-3 md:py-2 rounded-lg text-base md:text-sm outline-none focus:border-emerald-500" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
            
            {/* Kits Section */}
            {filteredPickerItems.kits.length > 0 && (
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-1 px-1">Kits</h5>
                <div className="space-y-1">
                  {filteredPickerItems.kits.map(kit => {
                    const qty = itemQuantities.get(`kit-${kit.id}`) || 0;
                    return (
                      <button key={kit.id} onClick={() => addItemToTemplate(kit, 'kit')} className="w-full text-left p-2 hover:bg-slate-700 rounded flex justify-between items-center group">
                        <div className="flex items-center gap-2 min-w-0">
                          <Package size={12} className="text-purple-500 shrink-0" />
                          <span className="text-xs text-slate-300 truncate">{kit.name}</span>
                          {qty > 0 && (
                            <span className="text-[10px] bg-purple-950 text-purple-400 border border-purple-900/50 px-1 rounded font-bold shrink-0">x{qty}</span>
                          )}
                        </div>
                        <Plus size={14} className="text-slate-500 group-hover:text-emerald-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inventory Section */}
            {filteredPickerItems.items.length > 0 && (
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1 px-1">Singoli / Accessoriati</h5>
                <div className="space-y-1">
                  {filteredPickerItems.items.map(item => {
                    const qty = itemQuantities.get(`item-${item.id}`) || 0;
                    return (
                      <button key={item.id} onClick={() => addItemToTemplate(item, 'item')} className="w-full text-left p-2 hover:bg-slate-700 rounded flex justify-between items-center group">
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers size={12} className="text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-300 truncate">{item.name}</span>
                          {qty > 0 && (
                            <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-900/50 px-1 rounded font-bold shrink-0">x{qty}</span>
                          )}
                        </div>
                        <Plus size={14} className="text-slate-500 group-hover:text-emerald-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {filteredPickerItems.items.length === 0 && filteredPickerItems.kits.length === 0 && (
                <div className="text-center p-4 text-slate-500 text-xs">Nessun elemento trovato.</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse md:flex-row justify-between items-stretch md:items-center mt-6 pt-4 border-t border-slate-800 gap-4">
        <button 
            onClick={() => setIsRemindersOpen(true)}
            className={`flex items-center justify-center gap-2 p-3 md:px-4 md:py-2 w-full md:w-auto rounded-lg transition-colors ${formData.reminders && formData.reminders.length > 0 ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-900/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-yellow-400'}`}
        >
            <Lightbulb size={20} className={formData.reminders && formData.reminders.length > 0 ? 'fill-current' : ''} />
            <span className="text-sm font-bold uppercase tracking-wider">Note Template {formData.reminders && formData.reminders.length > 0 ? `(${formData.reminders.length})` : ''}</span>
        </button>
        <div className="flex gap-2 flex-col md:flex-row w-full md:w-auto">
            <button onClick={onClose} className="w-full md:w-auto p-3 md:px-4 md:py-2 text-slate-400 font-medium">Annulla</button>
            <button onClick={handleSave} className="w-full md:w-auto p-3 md:px-6 md:py-2 bg-emerald-600 hover:bg-emerald-500 transition-colors text-white rounded-lg font-bold shadow-lg shadow-emerald-900/20">Salva Template</button>
        </div>
      </div>
    
      {/* REMINDERS MODAL */}
      <Modal isOpen={isRemindersOpen} onClose={() => setIsRemindersOpen(false)} title="Note Template" size="md">
            <div className="space-y-4">
                <p className="text-sm text-slate-400">Aggiungi note importanti che verranno mostrate quando userai questo template.</p>
                <div className="flex gap-2">
                    <input 
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:border-yellow-500 outline-none"
                        placeholder="Es. Richiede approvazione..."
                        value={reminderInput}
                        onChange={e => setReminderInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addReminder()}
                        autoFocus
                    />
                    <button onClick={addReminder} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded flex items-center gap-2">
                        <Plus size={18}/> Aggiungi
                    </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar bg-slate-900 p-2 rounded border border-slate-800">
                    {formData.reminders?.map((rem, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-800 p-3 rounded border border-slate-700">
                            <div className="flex items-center gap-3">
                                <Lightbulb size={16} className="text-yellow-500 shrink-0" />
                                <span className="text-sm text-slate-200">{rem}</span>
                            </div>
                            <button onClick={() => removeReminder(idx)} className="text-slate-500 hover:text-rose-500 transition-colors"><X size={18}/></button>
                        </div>
                    ))}
                    {(!formData.reminders || formData.reminders.length === 0) && (
                        <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
                            <Lightbulb size={32} className="opacity-20" />
                            <span>Nessuna nota attiva</span>
                        </div>
                    )}
                </div>
                <div className="flex justify-end pt-2">
                    <button onClick={() => setIsRemindersOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded">Chiudi</button>
                </div>
            </div>
      </Modal>

      <ItemFormModal 
        isOpen={isNewItemModalOpen} 
        onClose={() => setIsNewItemModalOpen(false)} 
        onSave={handleCreateNewItem} 
        onCreateAccessory={handleCreateInventoryItemOnly}
        title="Nuovo Materiale" 
        inventory={inventory} 
      />
    </Modal>
  );
};

