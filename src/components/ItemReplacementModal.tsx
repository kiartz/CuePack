import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  ArrowLeftRight, 
  RotateCcw,
  Check,
  Filter,
  Database
} from 'lucide-react';
import { 
  InventoryItem, 
  Kit, 
  ListComponent, 
  InventoryDatabase, 
  Category, 
  DEFAULT_DATABASE_ID,
  ItemReplacementInfo
} from '../types';
import { getDbBadgeStyle } from '../utils/databaseColors';
import { searchAndSortItems, isTextMatch } from '../utils/searchUtils';

export interface ReplacementItemDraft {
  id: string; // temp unique id
  type: 'item' | 'kit';
  referenceId: string;
  name: string;
  quantity: number;
  category: string;
  databaseId?: string;
  contents?: { itemId?: string; name: string; quantity: number; category: string }[];
}

export interface AccessoryDraft {
  index: number;
  itemId?: string;
  name: string;
  quantity: number;
  category: string;
}

interface ItemReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetComponent: ListComponent | null;
  targetZoneName: string;
  targetSectionName: string;
  targetAccessoryIndex?: number | null; // se stiamo sostituendo un singolo accessorio
  inventory: InventoryItem[];
  kits?: Kit[];
  databases?: InventoryDatabase[];
  onConfirm: (payload: {
    targetComponentId: string;
    targetGroupId?: string;
    originalUniqueId?: string;
    accessoryIndex?: number | null;
    originalQuantityRemaining: number; // quanti pezzi dell'originale mantenere (0 se azzerato/sostituito)
    newReplacements: ReplacementItemDraft[];
    updatedAccessories?: AccessoryDraft[];
    reason?: string;
  }) => void;
  onRevert?: () => void; // Ripristina com'era in origine
}

export const ItemReplacementModal: React.FC<ItemReplacementModalProps> = ({
  isOpen,
  onClose,
  targetComponent,
  targetZoneName,
  targetSectionName,
  targetAccessoryIndex = null,
  inventory,
  kits = [],
  databases = [],
  onConfirm,
  onRevert
}) => {
  if (!isOpen || !targetComponent) return null;

  // Determina se stiamo sostituendo un accessorio o il componente principale
  const isReplacingAccessory = targetAccessoryIndex !== null && targetAccessoryIndex !== undefined && targetAccessoryIndex >= 0;
  const targetAccessory = isReplacingAccessory && targetComponent.contents ? targetComponent.contents[targetAccessoryIndex] : null;

  // Rileva se l'oggetto ha già una modifica/sostituzione attiva
  const existingInfo: ItemReplacementInfo | undefined = isReplacingAccessory
    ? targetAccessory?.replacementInfo
    : targetComponent.replacementInfo;

  const isAlreadyModified = !!existingInfo;

  // Nome e quantità originaria intatta
  const originalName = isAlreadyModified
    ? existingInfo.originalName
    : (isReplacingAccessory ? (targetAccessory?.name || 'Accessorio') : targetComponent.name);

  // Quantità riportata dalla distinta/lista: per accessori o kit sub-items è sub.quantity * comp.quantity
  const listReportedQty = isReplacingAccessory
    ? ((targetAccessory?.quantity || 1) * (targetComponent.quantity || 1))
    : targetComponent.quantity;

  const initialQuantity = isAlreadyModified
    ? existingInfo.originalQuantity
    : listReportedQty;

  const targetCategory = isAlreadyModified
    ? (existingInfo.originalCategory || (isReplacingAccessory ? targetAccessory?.category : targetComponent.category))
    : (isReplacingAccessory ? targetAccessory?.category : targetComponent.category);

  const isKit = !isReplacingAccessory && targetComponent.type === 'kit';

  // STATO 1: Quantità del materiale originale (Riga 1)
  // Se già modificato in precedenza, inizializziamo con quanto salvato (es. 0 o parziale)
  // Se nuovo, parte con initialQuantity
  const [originalQty, setOriginalQty] = useState<number>(() => {
    if (isAlreadyModified) {
      return existingInfo.originalRemainingQuantity ?? 0;
    }
    return initialQuantity;
  });

  // STATO 2: Lista di nuovi materiali aggiunti/sostitutivi (Righe 2..N)
  const [replacements, setReplacements] = useState<ReplacementItemDraft[]>(() => {
    if (isAlreadyModified && existingInfo.replacements && existingInfo.replacements.length > 0) {
      return existingInfo.replacements.map((r, idx) => {
        const invItem = r.type === 'item' ? inventory.find(i => String(i.id) === String(r.referenceId)) : null;
        const resolvedContents = (r.contents && r.contents.length > 0)
          ? r.contents
          : (invItem?.accessories || []).map(a => {
              const invSub = inventory.find(i => String(i.id) === String(a.itemId));
              return {
                itemId: a.itemId,
                name: invSub?.name || 'Accessorio',
                quantity: a.quantity,
                category: invSub?.category || 'Altro'
              };
            });

        return {
          id: `rep-saved-${idx}-${Date.now()}`,
          type: r.type || 'item',
          referenceId: r.referenceId || '',
          name: r.name,
          quantity: r.quantity || 1,
          category: r.category || 'Altro',
          databaseId: r.databaseId,
          contents: resolvedContents
        };
      });
    }
    // Se era stato sostituito in-place con un altro elemento (es. test precedente)
    if (isAlreadyModified && targetComponent.name !== existingInfo.originalName) {
      return [{
        id: `rep-prev-${targetComponent.uniqueId}`,
        type: targetComponent.type as 'item' | 'kit',
        referenceId: targetComponent.referenceId,
        name: targetComponent.name,
        quantity: targetComponent.quantity,
        category: targetComponent.category,
        databaseId: targetComponent.databaseId
      }];
    }
    return [];
  });

  // Sincronizza lo stato ogni volta che il modale si apre o cambia targetComponent
  useEffect(() => {
    if (!isOpen || !targetComponent) return;

    if (isAlreadyModified) {
      setOriginalQty(existingInfo.originalRemainingQuantity ?? 0);
      if (existingInfo.replacements && existingInfo.replacements.length > 0) {
        setReplacements(existingInfo.replacements.map((r, idx) => {
          const invItem = r.type === 'item' ? inventory.find(i => String(i.id) === String(r.referenceId)) : null;
          const resolvedContents = (r.contents && r.contents.length > 0)
            ? r.contents
            : (invItem?.accessories || []).map(a => {
                const invSub = inventory.find(i => String(i.id) === String(a.itemId));
                return {
                  itemId: a.itemId,
                  name: invSub?.name || 'Accessorio',
                  quantity: a.quantity,
                  category: invSub?.category || 'Altro'
                };
              });

          return {
            id: `rep-saved-${idx}-${Date.now()}`,
            type: r.type || 'item',
            referenceId: r.referenceId || '',
            name: r.name,
            quantity: r.quantity || 1,
            category: r.category || 'Altro',
            databaseId: r.databaseId,
            contents: resolvedContents
          };
        }));
      } else {
        setReplacements([]);
      }
    } else {
      setOriginalQty(initialQuantity);
      setReplacements([]);
    }
  }, [isOpen, targetComponent, targetAccessoryIndex, isAlreadyModified, initialQuantity]);

  // Ricerca catalogo per aggiungere materiali
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('All');
  const reason = existingInfo?.reason;

  const effectiveDatabases = useMemo(() => {
    return (databases && databases.length > 0)
      ? databases
      : [{ id: DEFAULT_DATABASE_ID, name: 'Database Principale', code: 'PRI', color: 'emerald', isDefault: true }];
  }, [databases]);

  // Categorie disponibili
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    inventory.forEach(i => { if (i.category) cats.add(i.category); });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [inventory]);

  // Ricerca filtrata inventario + kit
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return { items: [], kits: [] };

    let filteredItems = inventory;
    let filteredKits = kits;

    if (selectedDatabase !== 'All') {
      filteredItems = filteredItems.filter(i => (i.databaseId || DEFAULT_DATABASE_ID) === selectedDatabase);
    }
    if (selectedCategory !== 'All') {
      filteredItems = filteredItems.filter(i => (i.category || '').toLowerCase() === selectedCategory.toLowerCase());
      filteredKits = filteredKits.filter(k => (k.category || '').toLowerCase() === selectedCategory.toLowerCase());
    }

    const itemsMatched = searchAndSortItems(filteredItems, searchTerm).slice(0, 30);
    const kitsMatched = !isReplacingAccessory 
      ? filteredKits.filter(k => isTextMatch(k.name, searchTerm)).slice(0, 10)
      : [];

    return {
      items: itemsMatched,
      kits: kitsMatched
    };
  }, [searchTerm, inventory, kits, selectedCategory, selectedDatabase, isReplacingAccessory]);

  // Aggiunta materiale sostitutivo
  const handleAddReplacementItem = (item: InventoryItem) => {
    const existing = replacements.find(r => r.type === 'item' && r.referenceId === item.id);
    if (existing) {
      setReplacements(prev => prev.map(r => r.id === existing.id ? { ...r, quantity: r.quantity + 1 } : r));
    } else {
      const missingQty = Math.max(1, initialQuantity - originalQty);
      const draft: ReplacementItemDraft = {
        id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: 'item',
        referenceId: item.id,
        name: item.name,
        quantity: missingQty,
        category: item.category,
        databaseId: item.databaseId || DEFAULT_DATABASE_ID,
        contents: (item.accessories || []).map(a => {
          const invSub = inventory.find(i => String(i.id) === String(a.itemId));
          return {
            itemId: a.itemId,
            name: invSub?.name || 'Accessorio',
            quantity: a.quantity,
            category: invSub?.category || 'Altro'
          };
        })
      };
      setReplacements(prev => [...prev, draft]);
    }
  };

  const handleAddReplacementKit = (kit: Kit) => {
    const existing = replacements.find(r => r.type === 'kit' && r.referenceId === kit.id);
    if (existing) {
      setReplacements(prev => prev.map(r => r.id === existing.id ? { ...r, quantity: r.quantity + 1 } : r));
    } else {
      const missingQty = Math.max(1, initialQuantity - originalQty);
      const draft: ReplacementItemDraft = {
        id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: 'kit',
        referenceId: kit.id,
        name: kit.name,
        quantity: missingQty,
        category: kit.category,
        contents: kit.items.flatMap(ki => {
          const invSub = inventory.find(i => i.id === ki.itemId);
          const main = {
            itemId: invSub?.id,
            name: invSub?.name || 'Articolo',
            quantity: ki.quantity,
            category: invSub?.category || 'Altro'
          };
          const accs = (ki.accessories || []).map(a => {
            const accInv = inventory.find(i => i.id === a.itemId);
            return {
              itemId: a.itemId,
              name: accInv?.name || 'Accessorio',
              quantity: a.quantity,
              category: accInv?.category || 'Altro'
            };
          });
          return [main, ...accs];
        })
      };
      setReplacements(prev => [...prev, draft]);
    }
  };

  const handleUpdateReplacementQty = (id: string, delta: number) => {
    setReplacements(prev => prev.map(r => {
      if (r.id === id) {
        const next = Math.max(1, r.quantity + delta);
        return { ...r, quantity: next };
      }
      return r;
    }));
  };

  const handleRemoveReplacement = (id: string) => {
    setReplacements(prev => prev.filter(r => r.id !== id));
  };

  // Verifica se ci sono state modifiche per abilitare la conferma
  const hasChanges = useMemo(() => {
    if (isAlreadyModified) return true; // Se già modificato, può sempre aggiornare
    if (originalQty !== initialQuantity) return true;
    if (replacements.length > 0) return true;
    return false;
  }, [originalQty, initialQuantity, replacements.length, isAlreadyModified]);

  const handleSubmit = () => {
    onConfirm({
      targetComponentId: targetComponent.uniqueId,
      targetGroupId: existingInfo?.replacementGroupId,
      originalUniqueId: existingInfo?.originalUniqueId,
      accessoryIndex: isReplacingAccessory ? targetAccessoryIndex : null,
      originalQuantityRemaining: originalQty,
      newReplacements: replacements,
      reason: reason?.trim() || undefined
    });
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border-0 sm:border border-slate-700/80 rounded-none sm:rounded-2xl shadow-2xl w-full max-w-3xl h-full sm:h-auto max-h-full sm:max-h-[90vh] flex flex-col overflow-hidden text-slate-100 pt-[env(safe-area-inset-top)] sm:pt-0 pb-[env(safe-area-inset-bottom)] sm:pb-0">
        
        {/* HEADER */}
        <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <ArrowLeftRight size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white text-sm sm:text-base truncate">
                Modifica / Sostituzione Materiale
              </h3>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Zona: <span className="text-slate-200 font-semibold">{targetZoneName}</span> • Reparto: <span className="text-slate-200 font-semibold">{targetSectionName}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Chiudi"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        {/* UNIFIED SINGLE-COLUMN BODY */}
        <div className="flex-1 flex flex-col p-3 sm:p-5 gap-2.5 sm:gap-3 overflow-y-auto custom-scrollbar">

          {/* BARRA DI RICERCA & FILTRI (Compatta su singola riga orizzontale) */}
          <div className="space-y-2 shrink-0">
            <div className="flex items-center gap-1.5 w-full">
              {/* Barra di ricerca principale */}
              <div className="relative flex-1 min-w-0">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Digita nome materiale..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 sm:pl-9 pr-7 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    aria-label="Cancella ricerca"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Tasto Icona Filtro Categorie */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  className={`p-2 sm:p-2.5 rounded-xl border flex items-center justify-center transition-all ${
                    selectedCategory !== 'All'
                      ? 'bg-amber-500/25 border-amber-500 text-amber-300 ring-1 ring-amber-500/40'
                      : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:text-white'
                  }`}
                  title={selectedCategory === 'All' ? 'Tutte le Categorie' : `Categoria: ${selectedCategory}`}
                  aria-label="Filtra Categoria"
                >
                  <Filter size={16} />
                  {selectedCategory !== 'All' && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
                  )}
                </button>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Filtra per Categoria"
                >
                  <option value="All">Tutte le Categorie</option>
                  {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              {/* Tasto Icona Filtro Database */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  className={`p-2 sm:p-2.5 rounded-xl border flex items-center justify-center transition-all ${
                    selectedDatabase !== 'All'
                      ? 'bg-blue-500/25 border-blue-500 text-blue-300 ring-1 ring-blue-500/40'
                      : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:text-white'
                  }`}
                  title={selectedDatabase === 'All' ? 'Tutti i Database' : `Database: ${effectiveDatabases.find(d => d.id === selectedDatabase)?.name || selectedDatabase}`}
                  aria-label="Filtra Database"
                >
                  <Database size={16} />
                  {selectedDatabase !== 'All' && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-400 rounded-full" />
                  )}
                </button>
                <select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Filtra per Database"
                >
                  <option value="All">Tutti i Database</option>
                  {effectiveDatabases.map(db => (
                    <option key={db.id} value={db.id}>[{db.code || db.name.slice(0, 3).toUpperCase()}] {db.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* RISULTATI RICERCA ATTIVA (A tutta larghezza della finestra pop up) */}
            {searchTerm.trim().length > 0 && (
              <div className="mt-2 w-full border border-slate-800 rounded-xl bg-slate-950/95 p-2 max-h-48 overflow-y-auto custom-scrollbar space-y-1.5 animate-in fade-in shadow-2xl">
                {searchResults.items.length === 0 && searchResults.kits.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-500">
                    Nessun materiale trovato per "{searchTerm}".
                  </div>
                ) : (
                  <>
                    {/* Articoli trovati */}
                    {searchResults.items.map(item => {
                      const itemDb = effectiveDatabases.find(d => d.id === (item.databaseId || DEFAULT_DATABASE_ID));
                      return (
                        <div 
                          key={item.id} 
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs transition-colors"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5 truncate">
                              {itemDb && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border leading-none shrink-0 ${getDbBadgeStyle(itemDb.color)}`}>
                                  {itemDb.code || itemDb.name.slice(0, 3).toUpperCase()}
                                </span>
                              )}
                              <span className="font-bold text-white truncate">{item.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.category} • Scorta magazzino: <strong className="text-slate-300">{item.inStock ?? 0}</strong>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddReplacementItem(item)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                          >
                            <Plus size={13} /> Aggiungi
                          </button>
                        </div>
                      );
                    })}

                    {/* Kit trovati */}
                    {searchResults.kits.map(kit => (
                      <div 
                        key={kit.id} 
                        className="flex items-center justify-between p-2 rounded-lg bg-purple-950/20 hover:bg-purple-950/40 border border-purple-800/40 text-xs transition-colors"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 border border-purple-700/60 leading-none shrink-0">
                              KIT
                            </span>
                            <span className="font-bold text-white truncate">{kit.name}</span>
                          </div>
                          <div className="text-[10px] text-purple-300/70 mt-0.5">
                            {kit.category} • {kit.items.length} articoli inclusi
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddReplacementKit(kit)}
                          className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 text-xs font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                        >
                          <Plus size={13} /> Aggiungi Kit
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGA DIVISORIA TRA CERCA MATERIALI E LE RIGHE DEI MATERIALI */}
          <div className="border-t border-slate-800/80 my-0.5 shrink-0" />

          {/* LISTA MATERIALI (LAYOUT ORDINATO A RIGHE MINIMAL) */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              
              {/* SEZIONE 1: OGGETTO ORIGINALE PREVISTO */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 block">
                  Materiale Originale Previsto
                </span>

                {(() => {
                  const targetInvItem = isReplacingAccessory && targetAccessory
                    ? inventory.find(i => String(i.id) === String(targetAccessory.itemId || (targetAccessory as any).referenceId))
                    : (targetComponent.type === 'item' ? inventory.find(i => String(i.id) === String(targetComponent.referenceId)) : null);

                  const origContents = isReplacingAccessory
                    ? (existingInfo?.originalContents || (targetInvItem?.accessories || []).map(a => {
                        const invSub = inventory.find(i => String(i.id) === String(a.itemId));
                        return {
                          itemId: a.itemId,
                          name: invSub?.name || 'Accessorio',
                          quantity: a.quantity,
                          category: invSub?.category || 'Altro'
                        };
                      }))
                    : ((targetComponent.contents && targetComponent.contents.length > 0)
                        ? targetComponent.contents
                        : existingInfo?.originalContents);
                  const hasOrigContents = origContents && origContents.length > 0;

                  return (
                    <div className={`rounded-xl border transition-all overflow-hidden ${
                      originalQty === 0 
                        ? 'bg-rose-950/20 border-rose-500/50 text-rose-200' 
                        : originalQty < initialQuantity
                          ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-white'
                    }`}>
                      {/* Riga Testata Oggetto Originale */}
                      <div className="py-2 px-3 flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider shrink-0 ${
                              originalQty === 0 
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              Orig
                            </span>
                            {targetComponent.type === 'kit' && !isReplacingAccessory && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider shrink-0 bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                KIT
                              </span>
                            )}
                            <h4 className={`font-bold text-sm truncate ${originalQty === 0 ? 'line-through text-rose-300/80' : 'text-white'}`}>
                              {originalName}
                            </h4>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {targetCategory} • Inizialmente previsti: <strong className={originalQty === 0 ? 'text-rose-300' : 'text-slate-200'}>{initialQuantity}x</strong>
                          </div>
                        </div>

                        {/* Stepper Quantità Oggetto Originale */}
                        <div className="flex items-center gap-1 shrink-0">
                          <div className={`flex items-center rounded-lg overflow-hidden border ${
                            originalQty === 0 
                              ? 'bg-rose-950 border-rose-500/60' 
                              : 'bg-slate-950 border-slate-700'
                          }`}>
                            <button 
                              type="button"
                              onClick={() => setOriginalQty(prev => Math.max(0, prev - 1))}
                              className={`py-1 px-2 sm:px-2.5 transition-colors ${originalQty === 0 ? 'text-rose-300 hover:text-white hover:bg-rose-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                              title="Diminuisci quantità materiale originale"
                              aria-label="Diminuisci quantità"
                            >
                              <Minus size={13} />
                            </button>
                            <span className={`w-8 sm:w-9 text-center text-xs font-bold font-mono ${
                              originalQty === 0 ? 'text-rose-300 font-black text-sm' : 'text-emerald-400'
                            }`}>
                              {originalQty}x
                            </span>
                            <button 
                              type="button"
                              onClick={() => setOriginalQty(prev => prev + 1)}
                              className={`py-1 px-2 sm:px-2.5 transition-colors ${originalQty === 0 ? 'text-rose-300 hover:text-white hover:bg-rose-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                              title="Aumenta quantità materiale originale"
                              aria-label="Aumenta quantità"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Righe Accessori Originali (una sotto l'altra, senza caselline) */}
                      {hasOrigContents && (
                        <div className="border-t border-slate-800/60 bg-slate-950/40 divide-y divide-slate-850/60">
                          {origContents.map((sub, sIdx) => {
                            const subQty = originalQty === 0 ? 0 : sub.quantity * originalQty;
                            return (
                              <div 
                                key={sIdx} 
                                className={`py-1.5 px-3 pl-6 sm:pl-8 flex items-center justify-between gap-2 text-xs transition-colors ${
                                  originalQty === 0 ? 'text-slate-500 opacity-60' : 'text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-slate-500 select-none font-bold">-</span>
                                  <span className={`truncate ${originalQty === 0 ? 'line-through' : ''}`}>{sub.name}</span>
                                </div>
                                <span className="font-mono font-bold text-slate-400 shrink-0">
                                  x{subQty}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* SEZIONE 2: NUOVI MATERIALI INSERITI DAL MAGAZZINO */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider px-1 block flex items-center gap-1.5">
                  <ArrowLeftRight size={11} /> Materiali Inseriti dal Magazzino
                </span>

                {replacements.map(item => {
                  const hasContents = item.contents && item.contents.length > 0;
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden animate-in fade-in slide-in-from-top-1">
                      {/* Testata Articolo Sostitutivo */}
                      <div className="py-2 px-3 flex items-center justify-between gap-2.5 bg-slate-800/30">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                              Nuovo
                            </span>
                            {item.type === 'kit' && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider shrink-0 bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                KIT
                              </span>
                            )}
                            <h4 className="font-bold text-sm text-white truncate">
                              {item.name}
                            </h4>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {item.category}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Stepper + e - */}
                          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                            <button 
                              type="button"
                              onClick={() => handleUpdateReplacementQty(item.id, -1)}
                              className="py-1 px-2 sm:px-2.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Diminuisci quantità"
                              aria-label="Diminuisci quantità"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-8 sm:w-9 text-center text-xs font-bold font-mono text-cyan-400">
                              {item.quantity}x
                            </span>
                            <button 
                              type="button"
                              onClick={() => handleUpdateReplacementQty(item.id, 1)}
                              className="py-1 px-2 sm:px-2.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Aumenta quantità"
                              aria-label="Aumenta quantità"
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          {/* Tasto Cestino per eliminare la riga aggiunta */}
                          <button
                            type="button"
                            onClick={() => handleRemoveReplacement(item.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 transition-colors cursor-pointer"
                            title="Rimuovi questo articolo"
                            aria-label="Rimuovi articolo"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Righe Accessori Inclusi nel Nuovo Prodotto (una sotto l'altra, stile app pulito) */}
                      {hasContents && (
                        <div className="border-t border-slate-800/60 bg-slate-950/40 divide-y divide-slate-850/60">
                          {item.contents.map((sub, sIdx) => {
                            const childTotalQty = sub.quantity * item.quantity;
                            return (
                              <div 
                                key={sIdx} 
                                className="py-1.5 px-3 pl-6 sm:pl-8 flex items-center justify-between gap-2 text-xs text-slate-300"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-cyan-500/70 select-none font-bold">-</span>
                                  <span className="truncate">{sub.name}</span>
                                </div>
                                <span className="font-mono font-bold text-cyan-300 shrink-0">
                                  x{childTotalQty}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {replacements.length === 0 && (
                  <div className="text-center py-4 border border-dashed border-slate-800/80 rounded-xl text-slate-500 text-xs">
                    Nessun materiale sostitutivo aggiunto. Usa la barra di ricerca in alto per aggiungere un articolo o kit.
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div>
            {/* TASTO RIPRISTINA COM'ERA IN ORIGINE (Simbolo compatto con icona) */}
            {isAlreadyModified && (
              <button 
                type="button"
                onClick={() => {
                  if (onRevert) {
                    onRevert();
                    onClose();
                  }
                }}
                className="p-2 sm:p-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-500/40 hover:border-rose-500 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                title="Ripristina com'era in origine"
                aria-label="Ripristina com'era in origine"
              >
                <RotateCcw size={18} className="text-rose-400" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* TASTO ANNULLA (Compatto con icona) */}
            <button 
              type="button"
              onClick={onClose}
              className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center border border-slate-700/80 active:scale-95"
              title="Annulla"
              aria-label="Annulla"
            >
              <X size={18} />
            </button>

            {/* TASTO APPLICA MODIFICHE (Solo la spunta) */}
            <button 
              type="button"
              disabled={!hasChanges}
              onClick={handleSubmit}
              className={`p-2 sm:p-2.5 px-3.5 sm:px-4 rounded-xl transition-all shadow-lg flex items-center justify-center ${
                hasChanges
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30 active:scale-95 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
              }`}
              title="Applica Modifiche"
              aria-label="Applica Modifiche"
            >
              <Check size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
