import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { generateId } from '../utils';
import { 
  Plus, 
  Search, 
  X, 
  Lightbulb, 
  Trash2, 
  Box, 
  Package, 
  ChevronDown, 
  GripVertical, 
  CornerDownRight,
  ArrowLeftRight
} from 'lucide-react';
import { 
  InventoryItem, 
  Kit, 
  KitComponent, 
  KitComponentAccessory, 
  Category, 
  InventoryDatabase, 
  DEFAULT_DATABASE_ID 
} from '../types';
import { Modal } from './Modal';
import { ItemFormModal } from './ItemFormModal';
import { addOrUpdateItem, getInventoryCollection } from '../firebase';
import { getDbBadgeStyle, getDbDotColor } from '../utils/databaseColors';
import { searchAndSortItems } from '../utils/searchUtils';

interface KitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (kit: Kit) => void;
  initialData?: Kit | null;
  inventory: InventoryItem[];
  title: string;
  databases?: InventoryDatabase[];
  activeDatabaseId?: string;
  kits?: Kit[];
}

const getTargetInsertIndex = (sourceIndex: number, targetIndex: number, position: 'before' | 'after'): number => {
  if (sourceIndex === targetIndex) return sourceIndex;
  if (sourceIndex < targetIndex) {
    return position === 'after' ? targetIndex : targetIndex - 1;
  } else {
    return position === 'before' ? targetIndex : targetIndex + 1;
  }
};

export const KitFormModal: React.FC<KitFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory, title, databases, activeDatabaseId, kits 
}) => {
  const [formData, setFormData] = useState<Partial<Kit>>({ items: [] });
  const [itemSearch, setItemSearch] = useState('');
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  
  // Track collapsed state for nested accessories per item
  const [collapsedItems, setCollapsedItems] = useState<{ [itemId: string]: boolean }>({});
  
  // Item ID currently opened in full ItemFormModal editor
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Item replacement state (index of kit item to replace)
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);

  // Drag and drop state & synchronous refs
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const dropTargetRef = useRef<{ index: number; position: 'before' | 'after' } | null>(null);

  // Reminder State
  const [reminderInput, setReminderInput] = useState('');
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  
  // Mobile Tab State
  const [activeTab, setActiveTab] = useState<'components' | 'picker'>('components');

  // Local overrides for items edited or created within this session
  const [localItemOverrides, setLocalItemOverrides] = useState<Record<string, InventoryItem>>({});

  // Memoized maps for instant O(1) item and database lookups
  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    (inventory || []).forEach(i => map.set(i.id, i));
    Object.values(localItemOverrides).forEach(i => map.set(i.id, i));
    return map;
  }, [inventory, localItemOverrides]);

  const getItem = useCallback((id: string): InventoryItem | undefined => {
    return inventoryMap.get(id);
  }, [inventoryMap]);

  const effectiveInventory = useMemo(() => {
    if (Object.keys(localItemOverrides).length === 0) return inventory;
    return inventory.map(item => localItemOverrides[item.id] || item);
  }, [inventory, localItemOverrides]);

  const effectiveDatabases = useMemo(() => {
    return (databases && databases.length > 0)
      ? databases
      : [{ id: DEFAULT_DATABASE_ID, name: 'Database Principale', code: 'PRI', color: 'emerald', isDefault: true }];
  }, [databases]);

  const effectiveDatabasesMap = useMemo(() => {
    const map = new Map<string, InventoryDatabase>();
    effectiveDatabases.forEach(d => map.set(d.id, d));
    return map;
  }, [effectiveDatabases]);

  useEffect(() => {
    if (initialData) {
      setFormData({ 
        ...initialData, 
        items: initialData.items || [], 
        reminders: initialData.reminders || [] 
      });
    } else {
      setFormData({ 
        name: '', 
        description: '', 
        items: [], 
        reminders: [], 
        category: Category.AUDIO 
      });
    }
    setItemSearch('');
    setReminderInput('');
    setEditingItemId(null);
    setCollapsedItems({});
    setActiveTab('components');
    setDraggedIndex(null);
    setDropTarget(null);
    setReplacingIndex(null);
    setLocalItemOverrides({});
  }, [initialData, isOpen]);

  const handleSave = () => {
    if (!formData.name?.trim()) return;
    const cleanItems = (formData.items && Array.isArray(formData.items)) ? formData.items : [];
    const newKit: Kit = {
      ...formData as Kit,
      id: initialData?.id || generateId(),
      name: formData.name.trim(),
      category: formData.category || Category.OTHER,
      items: cleanItems,
      reminders: formData.reminders || []
    };
    onSave(newKit);
  };

  const addReminder = () => {
    if (!reminderInput.trim()) return;
    setFormData(prev => ({ 
      ...prev, 
      reminders: [...(prev.reminders || []), reminderInput.trim()] 
    }));
    setReminderInput('');
  };

  const removeReminder = (index: number) => {
    const newReminders = [...(formData.reminders || [])];
    newReminders.splice(index, 1);
    setFormData(prev => ({ ...prev, reminders: newReminders }));
  };

  // --- ADD ITEM TO KIT (WITH GROUPED ACCESSORIES) ---
  const handleAddItemToKit = (invItem: InventoryItem) => {
    setFormData(prev => {
      const current = [...(prev.items || [])];
      const existingIdx = current.findIndex(i => i.itemId === invItem.id);

      if (existingIdx >= 0) {
        const oldComp = current[existingIdx];
        const oldQty = oldComp.quantity || 1;
        const newQty = oldQty + 1;

        // Scale accessories proportionally!
        const scaledAccessories = (oldComp.accessories || []).map(acc => {
          const baseDef = (invItem.accessories || []).find(a => a.itemId === acc.itemId);
          const unitRatio = baseDef?.quantity || (oldQty > 0 ? (acc.quantity / oldQty) : 1);
          return {
            ...acc,
            quantity: Math.max(1, Math.round(unitRatio * newQty))
          };
        });

        current[existingIdx] = {
          ...oldComp,
          quantity: newQty,
          accessories: scaledAccessories
        };
      } else {
        // Group its default accessories inside this kit item
        const defaultAccessories: KitComponentAccessory[] = (invItem.accessories || []).map(acc => ({
          itemId: acc.itemId,
          quantity: acc.quantity || 1
        }));

        current.push({
          itemId: invItem.id,
          quantity: 1,
          accessories: defaultAccessories
        });
      }
      return { ...prev, items: current };
    });
  };

  const handleRemoveItem = (itemIndex: number) => {
    setFormData(prev => {
      const current = [...(prev.items || [])];
      current.splice(itemIndex, 1);
      return { ...prev, items: current };
    });
    if (replacingIndex === itemIndex) {
      setReplacingIndex(null);
    } else if (replacingIndex !== null && replacingIndex > itemIndex) {
      setReplacingIndex(replacingIndex - 1);
    }
  };

  const handleReplaceItem = (itemIndex: number, newItem: InventoryItem) => {
    setFormData(prev => {
      const current = [...(prev.items || [])];
      const oldItem = current[itemIndex];
      if (!oldItem) return prev;

      const qty = oldItem.quantity || 1;
      // Keep existing quantity, attach new item's default accessories scaled by quantity
      const defaultAccessories: KitComponentAccessory[] = (newItem.accessories || []).map(acc => ({
        itemId: acc.itemId,
        quantity: (acc.quantity || 1) * qty
      }));

      current[itemIndex] = {
        itemId: newItem.id,
        quantity: qty,
        accessories: defaultAccessories
      };

      return { ...prev, items: current };
    });

    setReplacingIndex(null);
    setActiveTab('components');
  };

  const handleUpdateItemQty = (itemIndex: number, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(itemIndex);
      return;
    }
    setFormData(prev => {
      const current = [...(prev.items || [])];
      const comp = current[itemIndex];
      if (!comp) return prev;

      const oldQty = comp.quantity || 1;
      const invItem = getItem(comp.itemId);

      const compAccs = comp.accessories !== undefined 
        ? comp.accessories 
        : ((invItem?.accessories || []).map(a => ({ itemId: a.itemId, quantity: (a.quantity || 1) * oldQty })));

      const updatedAccessories = compAccs.map(acc => {
        const baseDef = (invItem?.accessories || []).find(a => a.itemId === acc.itemId);
        const unitRatio = baseDef?.quantity || (oldQty > 0 ? (acc.quantity / oldQty) : 1);
        return {
          ...acc,
          quantity: Math.max(1, Math.round(unitRatio * qty))
        };
      });

      current[itemIndex] = {
        ...comp,
        quantity: qty,
        accessories: updatedAccessories
      };
      return { ...prev, items: current };
    });
  };

  // --- SUB-ACCESSORIES EDITING (SPECIFIC FOR THIS KIT ITEM) ---
  const handleUpdateSubAccessoryQty = (itemIndex: number, accItemId: string, newQty: number) => {
    setFormData(prev => {
      const items = [...(prev.items || [])];
      const comp = items[itemIndex];
      if (!comp) return prev;

      let accs = comp.accessories !== undefined 
        ? [...comp.accessories] 
        : ((getItem(comp.itemId)?.accessories || []).map(a => ({ itemId: a.itemId, quantity: (a.quantity || 1) * (comp.quantity || 1) })));

      if (newQty <= 0) {
        accs = accs.filter(a => a.itemId !== accItemId);
      } else {
        accs = accs.map(a => a.itemId === accItemId ? { ...a, quantity: newQty } : a);
      }

      items[itemIndex] = { ...comp, accessories: accs };
      return { ...prev, items };
    });
  };

  const handleRemoveSubAccessory = (itemIndex: number, accItemId: string) => {
    setFormData(prev => {
      const items = [...(prev.items || [])];
      const comp = items[itemIndex];
      if (!comp) return prev;

      const accs = (comp.accessories !== undefined 
        ? comp.accessories 
        : (getItem(comp.itemId)?.accessories || []).map(a => ({ itemId: a.itemId, quantity: (a.quantity || 1) * (comp.quantity || 1) }))
      ).filter(a => a.itemId !== accItemId);

      items[itemIndex] = { ...comp, accessories: accs };
      return { ...prev, items };
    });
  };

  const toggleCollapse = (itemId: string) => {
    setCollapsedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // --- DRAG AND DROP REORDERING ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedIndexRef.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const sourceIdx = draggedIndexRef.current;
    if (sourceIdx === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const isBelow = (e.clientY - rect.top) > (rect.height / 2);
    const position: 'before' | 'after' = isBelow ? 'after' : 'before';

    const targetObj: { index: number; position: 'before' | 'after' } = { index, position };
    dropTargetRef.current = targetObj;

    const finalTarget = getTargetInsertIndex(sourceIdx, index, position);
    if (finalTarget !== sourceIdx) {
      setDropTarget(targetObj);
    } else {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceIdx = draggedIndexRef.current;
    if (sourceIdx === null) {
      setDraggedIndex(null);
      setDropTarget(null);
      return;
    }

    let finalTargetIndex: number;
    if (targetIndex !== undefined) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isBelow = (e.clientY - rect.top) > (rect.height / 2);
      const position: 'before' | 'after' = isBelow ? 'after' : 'before';
      finalTargetIndex = getTargetInsertIndex(sourceIdx, targetIndex, position);
    } else if (dropTargetRef.current) {
      finalTargetIndex = getTargetInsertIndex(
        sourceIdx, 
        dropTargetRef.current.index, 
        dropTargetRef.current.position
      );
    } else {
      finalTargetIndex = (formData.items?.length || 1) - 1;
    }

    const currentItems = [...(formData.items || [])];
    if (sourceIdx !== finalTargetIndex && finalTargetIndex >= 0 && finalTargetIndex < currentItems.length) {
      const [moved] = currentItems.splice(sourceIdx, 1);
      currentItems.splice(finalTargetIndex, 0, moved);
      setFormData(prev => ({ ...prev, items: currentItems }));
    }

    draggedIndexRef.current = null;
    dropTargetRef.current = null;
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    draggedIndexRef.current = null;
    dropTargetRef.current = null;
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const filteredPickerItems = useMemo(() => {
    if (!itemSearch.trim()) return effectiveInventory.slice(0, 50);
    return searchAndSortItems(effectiveInventory, itemSearch).slice(0, 50);
  }, [effectiveInventory, itemSearch]);

  const itemQuantities = useMemo(() => {
    const map = new Map<string, number>();
    formData.items?.forEach(item => {
      map.set(item.itemId, (map.get(item.itemId) || 0) + item.quantity);
    });
    return map;
  }, [formData.items]);

  const renderDbBadge = (dbId?: string) => {
    const effectiveId = dbId || DEFAULT_DATABASE_ID;
    const db = effectiveDatabasesMap.get(effectiveId);
    const code = db?.code || (effectiveId === DEFAULT_DATABASE_ID ? 'PRI' : effectiveId.slice(0, 3).toUpperCase());
    const color = db?.color || (effectiveId === DEFAULT_DATABASE_ID ? 'emerald' : 'blue');
    return (
      <span 
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${getDbBadgeStyle(color)}`}
        title={`Database: ${db?.name || effectiveId}`}
      >
        <span className={`w-1 h-1 rounded-full ${getDbDotColor(color)}`} />
        {code}
      </span>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen && !editingItemId} onClose={onClose} title={title} size="xl">
      <div className="space-y-3">
        {/* HEADER: GENERAL INFO */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Nome Kit <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text" 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-medium outline-none focus:border-purple-500 text-sm" 
                value={formData.name || ''} 
                onChange={e => setFormData({ ...formData, name: e.target.value })} 
                placeholder="Es. Kit Regia Video, Kit Radiomicrofoni..." 
                autoFocus
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Categoria
              </label>
              <select 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-medium outline-none focus:border-purple-500 text-sm" 
                value={formData.category || Category.AUDIO} 
                onChange={e => setFormData({ ...formData, category: e.target.value as Category })}
              >
                {Object.values(Category).map(c => (
                  <option key={c as string} value={c as string}>{c as string}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 flex items-end">
              <button 
                type="button"
                onClick={() => setIsRemindersOpen(true)}
                className={`w-full py-1.5 px-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                  formData.reminders && formData.reminders.length > 0 
                    ? 'bg-amber-950/40 text-amber-400 border-amber-800/60 hover:bg-amber-900/40 shadow-sm' 
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Lightbulb size={15} className={formData.reminders && formData.reminders.length > 0 ? 'fill-current text-amber-400' : ''} />
                <span>Promemoria Kit {formData.reminders && formData.reminders.length > 0 ? `(${formData.reminders.length})` : ''}</span>
              </button>
            </div>
          </div>

          <div>
            <input 
              type="text"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500" 
              value={formData.description || ''} 
              onChange={e => setFormData({ ...formData, description: e.target.value })} 
              placeholder="Descrizione opzionale o note per il kit..." 
            />
          </div>
        </div>

        {/* MOBILE TABS SELECTOR */}
        <div className="flex lg:hidden bg-slate-950 border border-slate-800 rounded-xl p-1 shrink-0">
          <button 
            type="button"
            onClick={() => setActiveTab('components')}
            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              activeTab === 'components' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400'
            }`}
          >
            Componenti ({formData.items?.length || 0})
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('picker')}
            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              activeTab === 'picker' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400'
            }`}
          >
            Aggiungi Materiale
          </button>
        </div>

        {/* TWO-COLUMN LAYOUT: REDESIGNED WITH DRAG & MOVE + GROUPED ACCESSORIES */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* SINISTRA (7 COLS): COMPONENTI DEL KIT (COMPACT & DRAG-AND-DROP) */}
          <div className={`lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 flex flex-col h-[500px] ${
            activeTab !== 'components' ? 'hidden lg:flex' : 'flex'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Package size={15} className="text-purple-400" />
                Componenti Kit ({formData.items?.length || 0})
              </h3>
              <span className="text-[11px] text-slate-400">
                Trascina la riga per ordinare
              </span>
            </div>

            {/* Scrollable list with Drop Zone */}
            <div 
              className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => handleDrop(e)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTarget(null);
                  dropTargetRef.current = null;
                }
              }}
            >
              {(!formData.items || formData.items.length === 0) ? (
                <div className="text-center py-20 text-slate-500 text-xs">
                  Nessun componente nel kit. Clicca sui materiali a destra per aggiungerli.
                </div>
              ) : (
                formData.items.map((item, idx) => {
                  const invItem = getItem(item.itemId);
                  // Resolve custom kit accessories or fallback to inventory accessories
                  const compAccessories: KitComponentAccessory[] = item.accessories !== undefined
                    ? item.accessories
                    : (invItem?.accessories || []).map(a => ({ itemId: a.itemId, quantity: (a.quantity || 1) * (item.quantity || 1) }));

                  const hasAccessories = compAccessories.length > 0;
                  const isCollapsed = !!collapsedItems[item.itemId];
                  const isBeingDragged = draggedIndex === idx;

                  return (
                    <div 
                      key={`${item.itemId}-${idx}`}
                      className="relative"
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                    >
                      {/* Highlight Line BEFORE */}
                      {dropTarget?.index === idx && dropTarget.position === 'before' && (
                        <div className="absolute -top-1 left-0 right-0 h-[3px] bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7] ring-1 ring-purple-400 z-30 pointer-events-none" />
                      )}

                      {/* Highlight Line AFTER */}
                      {dropTarget?.index === idx && dropTarget.position === 'after' && (
                        <div className="absolute -bottom-1 left-0 right-0 h-[3px] bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7] ring-1 ring-purple-400 z-30 pointer-events-none" />
                      )}

                      {/* Item Card Container (Compact Height) */}
                      <div 
                        className={`rounded-xl border transition-all ${
                          replacingIndex === idx
                            ? 'border-amber-500 bg-amber-950/20 ring-1 ring-amber-500/60 shadow-lg shadow-amber-950/40'
                            : isBeingDragged 
                              ? 'opacity-30 border-dashed border-purple-400 bg-slate-900/60' 
                              : hasAccessories 
                                ? 'bg-cyan-950/20 border-cyan-700/70 hover:border-cyan-500/80 shadow-sm shadow-cyan-950/30' 
                                : 'bg-slate-950 border-slate-800/90 hover:border-slate-700/80'
                        }`}
                      >
                        {/* MAIN ROW: COMPACT HEIGHT (py-1.5 px-2.5) */}
                        <div 
                          draggable
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragEnd={handleDragEnd}
                          className="py-1.5 px-2.5 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing select-none"
                        >
                          {/* Grip Handle, Icon, DB Badge, Name & Accessories badge */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span 
                              className="text-slate-600 hover:text-slate-400 shrink-0 p-0.5" 
                              title="Trascina per ordinare"
                            >
                              <GripVertical size={14} />
                            </span>

                            <Box size={16} className={hasAccessories ? "text-cyan-400 shrink-0" : "text-slate-400 shrink-0"} />
                            {renderDbBadge(invItem?.databaseId)}
                            
                            <div className="min-w-0 flex-1 flex items-center gap-1.5">
                              <span 
                                className="text-xs sm:text-sm font-bold text-white truncate cursor-pointer hover:text-cyan-400 hover:underline transition-colors" 
                                title={`Modifica ${invItem?.name || 'articolo'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingItemId(item.itemId);
                                }}
                              >
                                {invItem?.name || 'Articolo sconosciuto'}
                              </span>

                              {/* Grouped Accessories Badge & Toggle */}
                              {hasAccessories && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCollapse(item.itemId);
                                  }}
                                  className="flex items-center gap-1 text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded font-bold hover:bg-cyan-900/60 transition-colors shrink-0"
                                  title="Mostra / Nascondi accessori inclusi"
                                >
                                  <ChevronDown size={11} className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                  <span>{compAccessories.length} acc.</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Controls: Compact Stepper + Replace + Delete */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            {/* Stepper */}
                            <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 text-xs font-bold hover:bg-slate-700 transition-colors"
                              >
                                -
                              </button>
                              <input 
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => handleUpdateItemQty(idx, Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-8 text-center font-mono font-bold text-xs text-white bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 text-xs font-bold hover:bg-slate-700 transition-colors"
                              >
                                +
                              </button>
                            </div>

                            {/* Replace */}
                            <button
                              type="button"
                              onClick={() => {
                                if (replacingIndex === idx) {
                                  setReplacingIndex(null);
                                } else {
                                  setReplacingIndex(idx);
                                  setActiveTab('picker');
                                }
                              }}
                              className={`p-1 rounded-lg transition-colors ${
                                replacingIndex === idx
                                  ? 'text-amber-400 bg-amber-950/80 border border-amber-500/60 shadow-sm shadow-amber-900/30'
                                  : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'
                              }`}
                              title={replacingIndex === idx ? "Annulla sostituzione" : "Sostituisci materiale con un altro dall'elenco"}
                            >
                              <ArrowLeftRight size={14} />
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                              title="Rimuovi dal kit"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* NESTED GROUPED ACCESSORIES (ONLY FOR THIS KIT ITEM) */}
                        {(!isCollapsed && hasAccessories) && (
                          <div className="bg-slate-900/70 border-t border-cyan-800/40 px-3 py-1.5 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                              <span>Accessori inclusi ({compAccessories.length}):</span>
                            </div>

                            {/* Sub-Accessories List */}
                            {compAccessories.map(subAcc => {
                              const accInv = getItem(subAcc.itemId);
                              return (
                                <div 
                                  key={subAcc.itemId}
                                  className="py-1 px-2 bg-slate-950/90 border border-cyan-900/40 rounded-lg flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <CornerDownRight size={12} className="text-cyan-400/80 shrink-0 ml-0.5" />
                                    {renderDbBadge(accInv?.databaseId)}
                                    <span 
                                      className="text-slate-300 font-medium truncate cursor-pointer hover:text-cyan-400 hover:underline transition-colors" 
                                      title={`Modifica ${accInv?.name || 'accessorio'}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingItemId(subAcc.itemId);
                                      }}
                                    >
                                      {accInv?.name || 'Accessorio rimosso'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {/* Sub-Accessory Quantity Stepper (Kit-Specific!) */}
                                    <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-800 rounded p-0.5">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSubAccessoryQty(idx, subAcc.itemId, subAcc.quantity - 1)}
                                        className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 text-[10px] font-bold"
                                        title="Riduci quantità nel kit"
                                      >
                                        -
                                      </button>
                                      <input 
                                        type="number"
                                        min="1"
                                        value={subAcc.quantity}
                                        onChange={e => handleUpdateSubAccessoryQty(idx, subAcc.itemId, Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-7 text-center font-mono font-bold text-[11px] text-white bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSubAccessoryQty(idx, subAcc.itemId, subAcc.quantity + 1)}
                                        className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 text-[10px] font-bold"
                                        title="Aumenta quantità nel kit"
                                      >
                                        +
                                      </button>
                                    </div>

                                    {/* Remove Sub-Accessory from this kit */}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSubAccessory(idx, subAcc.itemId)}
                                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                                      title="Rimuovi accessorio da questo kit"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* DESTRA (5 COLS): RICERCA MATERIALE DA AGGIUNGERE */}
          <div className={`lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 flex flex-col h-[500px] ${
            activeTab !== 'picker' ? 'hidden lg:flex' : 'flex'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                {replacingIndex !== null ? (
                  <>
                    <ArrowLeftRight size={15} className="text-amber-400" />
                    <span className="text-amber-300">Sostituisci Materiale</span>
                  </>
                ) : (
                  <>
                    <Search size={15} className="text-purple-400" />
                    <span>Aggiungi da Inventario</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickCreateOpen(true)}
                className="text-xs text-emerald-400 hover:underline font-bold"
              >
                + Crea Rapido
              </button>
            </div>

            {/* Banner Modalità Sostituzione */}
            {replacingIndex !== null && (
              <div className="bg-amber-950/70 border border-amber-500/60 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-200">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ArrowLeftRight size={13} className="text-amber-400 shrink-0" />
                  <span className="truncate">
                    Sostituisci: <strong className="text-white">{getItem(formData.items?.[replacingIndex]?.itemId)?.name || 'Articolo'}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplacingIndex(null)}
                  className="px-2 py-0.5 bg-amber-900/80 hover:bg-amber-800 text-amber-200 border border-amber-600/50 rounded-lg font-bold text-[10px] shrink-0 transition-colors"
                >
                  Annulla
                </button>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-slate-500" size={15} />
              <input 
                type="text" 
                placeholder={replacingIndex !== null ? "Cerca materiale sostituto..." : "Cerca materiale per nome o codice..."}
                className={`w-full bg-slate-950 border rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-colors ${
                  replacingIndex !== null 
                    ? 'border-amber-500/60 focus:border-amber-400' 
                    : 'border-slate-700 focus:border-purple-500'
                }`}
                value={itemSearch} 
                onChange={e => setItemSearch(e.target.value)} 
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
              {filteredPickerItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Nessun materiale trovato.
                </div>
              ) : (
                filteredPickerItems.map(item => {
                  const qtyInKit = itemQuantities.get(item.id) || 0;
                  const isAdded = qtyInKit > 0;
                  const hasAccessories = item.accessories && item.accessories.length > 0;
                  const isCurrentReplaced = replacingIndex !== null && item.id === formData.items?.[replacingIndex]?.itemId;

                  return (
                    <div 
                      key={item.id} 
                      onClick={() => {
                        if (replacingIndex !== null) {
                          handleReplaceItem(replacingIndex, item);
                        } else {
                          handleAddItemToKit(item);
                        }
                      }}
                      className={`py-1.5 px-2.5 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                        replacingIndex !== null
                          ? isCurrentReplaced
                            ? 'bg-amber-950/30 border-amber-600/60 ring-1 ring-amber-500/40'
                            : 'bg-slate-950 hover:bg-amber-950/20 hover:border-amber-600/50 border-slate-800/80'
                          : isAdded 
                            ? 'bg-slate-950/80 border-slate-800 hover:bg-slate-900' 
                            : hasAccessories
                              ? 'bg-cyan-950/20 hover:bg-cyan-900/30 border-cyan-800/40'
                              : 'bg-slate-950 hover:bg-slate-900 border-slate-800/80'
                      }`}
                    >
                      <div className="min-w-0 flex-1 mr-2 flex items-center gap-2">
                        <Box size={16} className={hasAccessories ? "text-cyan-400 shrink-0" : "text-slate-400 shrink-0"} />
                        {renderDbBadge(item.databaseId)}
                        <div className="min-w-0 flex-1 flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate" title={item.name}>
                            {item.name}
                          </span>
                          {hasAccessories && (
                            <span className="text-[9px] bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 px-1 py-0.5 rounded font-bold shrink-0">
                              {item.accessories?.length} acc.
                            </span>
                          )}
                          {isCurrentReplaced && (
                            <span className="text-[9px] bg-amber-950 text-amber-300 border border-amber-800/70 px-1 py-0.5 rounded font-bold shrink-0">
                              Attuale
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAdded && replacingIndex === null && (
                          <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-1.5 py-0.5 rounded font-mono font-bold">
                            x{qtyInKit}
                          </span>
                        )}
                        {replacingIndex !== null ? (
                          <button
                            type="button"
                            className="p-1 rounded-md text-xs font-bold transition-colors bg-amber-600/20 text-amber-300 hover:bg-amber-600 hover:text-white"
                            title="Seleziona come sostituto"
                          >
                            <ArrowLeftRight size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="p-1 rounded-md text-xs font-bold transition-colors bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white"
                            title="Aggiungi al kit"
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER ACTIONS */}
        <div className="flex items-center justify-end gap-3 pt-2.5 border-t border-slate-800">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2 text-xs text-slate-400 hover:text-white font-medium transition-colors"
          >
            Annulla
          </button>
          <button 
            type="button"
            onClick={handleSave} 
            disabled={!formData.name?.trim()}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-purple-900/30 transition-all active:scale-95"
          >
            Salva Kit
          </button>
        </div>
      </div>

      {/* MODAL CREA RAPIDO MATERIALE */}
      {isQuickCreateOpen && (
        <ItemFormModal 
          isOpen={isQuickCreateOpen} 
          onClose={() => setIsQuickCreateOpen(false)} 
          onSave={async (itemData) => { 
            const newId = generateId();
            const newFullItem: InventoryItem = { 
              ...itemData, 
              id: newId, 
              accessories: (itemData as any).accessories || [] 
            } as InventoryItem; 

            setLocalItemOverrides(prev => ({
              ...prev,
              [newId]: newFullItem
            }));

            const col = getInventoryCollection(activeDatabaseId);
            await addOrUpdateItem(col, newFullItem); 
            if (replacingIndex !== null) {
              handleReplaceItem(replacingIndex, newFullItem);
            } else {
              handleAddItemToKit(newFullItem); 
            }
            setIsQuickCreateOpen(false);
          }} 
          inventory={effectiveInventory} 
          databases={databases}
          defaultDatabaseId={activeDatabaseId}
          isQuickMode={true}
          title="Nuovo Materiale Rapido"
          kits={kits || []}
        />
      )}

      {/* REMINDERS MODAL */}
      <Modal isOpen={isRemindersOpen} onClose={() => setIsRemindersOpen(false)} title="Promemoria Kit" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Aggiungi note importanti o checklist che verranno mostrate quando userai questo kit.</p>
          <div className="flex gap-2">
            <input 
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none text-sm"
              placeholder="Es. Controllare le batterie..."
              value={reminderInput}
              onChange={e => setReminderInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addReminder()}
              autoFocus
            />
            <button 
              type="button"
              onClick={addReminder} 
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm flex items-center gap-1.5 transition-colors"
            >
              <Plus size={16}/> Aggiungi
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar bg-slate-950 p-2 rounded-xl border border-slate-800">
            {(!formData.reminders || formData.reminders.length === 0) ? (
              <div className="text-center py-6 text-slate-500 text-xs">Nessun promemoria configurato.</div>
            ) : (
              formData.reminders.map((rem, rIdx) => (
                <div key={rIdx} className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-sm">
                  <span className="text-slate-200 truncate flex-1 mr-2">{rem}</span>
                  <button 
                    type="button"
                    onClick={() => removeReminder(rIdx)} 
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-800">
            <button 
              type="button"
              onClick={() => setIsRemindersOpen(false)} 
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
            >
              Fatto
            </button>
          </div>
        </div>
      </Modal>
    </Modal>

      {/* FULL ITEM FORM MODAL (WHEN EDITING AN ITEM FROM KIT) */}
      {editingItemId && (
        <ItemFormModal
          isOpen={!!editingItemId}
          onClose={() => setEditingItemId(null)}
          onSave={async (itemData) => {
            const targetItem = getItem(editingItemId) || inventory.find(i => i.id === editingItemId);
            if (!targetItem) return;

            const updatedItem: InventoryItem = {
              ...targetItem,
              ...itemData,
              id: editingItemId,
              accessories: (itemData as any).accessories || []
            };

            // 1. Immediately store in local overrides
            setLocalItemOverrides(prev => ({
              ...prev,
              [editingItemId]: updatedItem
            }));

            // 2. Immediately update this kit's components with new accessories scaled by component quantity
            setFormData(prev => {
              const current = [...(prev.items || [])];
              const updatedItems = current.map(comp => {
                if (comp.itemId === editingItemId) {
                  const qty = comp.quantity || 1;
                  const newAccessories: KitComponentAccessory[] = (updatedItem.accessories || []).map(acc => ({
                    itemId: acc.itemId,
                    quantity: (acc.quantity || 1) * qty
                  }));
                  return {
                    ...comp,
                    accessories: newAccessories
                  };
                }
                return comp;
              });
              return { ...prev, items: updatedItems };
            });

            // 3. Persist to Firestore
            const col = getInventoryCollection(targetItem.databaseId || activeDatabaseId);
            await addOrUpdateItem(col, updatedItem);

            setEditingItemId(null);
          }}
          initialData={getItem(editingItemId) || inventory.find(i => i.id === editingItemId) || null}
          inventory={effectiveInventory}
          databases={databases}
          defaultDatabaseId={getItem(editingItemId)?.databaseId || activeDatabaseId}
          backButtonLabel="Torna al Kit"
          kits={kits || []}
        />
      )}
    </>
  );
};
