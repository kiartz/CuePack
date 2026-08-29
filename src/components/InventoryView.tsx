import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { Plus, Search, Edit2, Trash2, Copy, Filter, Link, Check, X, ChevronLeft, ChevronRight, Barcode, Eye, QrCode, Printer, FileText, ExternalLink } from 'lucide-react';
import { InventoryItem, Category, PackingList, ListComponent } from '../types';
import { ItemFormModal, generateProductCode, generateProductQrCode } from './ItemFormModal';
import { generateBarcodeSVG, generateQRCodeSVG, printBarcode, printQRCode } from '../utils/codeGenerators';
import { openDocumentInBrowser } from '../utils/documentViewer';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import { getCategoryDefinitions } from '../utils/categories';
import { addOrUpdateItem, deleteItem, COLL_INVENTORY, COLL_LISTS, getInventoryCollection } from '../firebase';

interface InventoryViewProps {
  items: InventoryItem[];
  packingLists: PackingList[];
  activeDatabaseId?: string;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ items, packingLists, activeDatabaseId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Inline Editing State
  const [editingCell, setEditingCell] = useState<{ itemId: string, field: keyof InventoryItem } | null>(null);
  const [editValue, setEditValue] = useState<string | number>('');
  const editInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Deletion & Action Mode State
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [activeInventoryAction, setActiveInventoryAction] = useState<'duplicate' | 'delete' | null>(null);
  const [viewAccessoriesItem, setViewAccessoriesItem] = useState<InventoryItem | null>(null);
  const [viewDocumentsItem, setViewDocumentsItem] = useState<InventoryItem | null>(null);
  const [previewCodeItem, setPreviewCodeItem] = useState<{ code: string; name: string } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const filteredItems = useMemo(() => {
    // Safety check
    if (!items || !Array.isArray(items)) return [];

    const searchTokens = (searchTerm || '').toLowerCase().split(' ').filter(token => token.trim() !== '');

    const results = items
      .map(item => {
        const name = (item.name || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const subcat = (item.subcategory || item.folder || '').toLowerCase();
        const alias = (item.alias || '').toLowerCase();
        const loc = (item.location || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const pcode = (item.productCode || '').toLowerCase();
        const icodes = (item.instances || []).map(inst => inst.id.toLowerCase()).join(' ');
        
        const combinedText = `${name} ${cat} ${subcat} ${alias} ${loc} ${desc} ${pcode} ${icodes}`;
        const isMatch = searchTokens.every(token => combinedText.includes(token));
        
        if (!isMatch) return { item, score: -1, nameMatches: 0 }; 

        let score = 0;
        let nameMatches = 0;

        if (searchTokens.length === 0) {
            score = 1; 
        } else {
            searchTokens.forEach(token => {
                const inName = name.includes(token);
                if (inName) {
                    nameMatches++;
                    if (name === token) score += 1000;
                    else if (name.startsWith(token)) score += 500;
                    else if (name.includes(" " + token)) score += 200;
                    else score += 100;
                }
                if (cat.includes(token)) score += 10;
                if (desc.includes(token)) score += 1;
                if (pcode === token) score += 2000;
                else if (pcode.includes(token)) score += 1000;
                if (icodes.includes(token)) score += 800;
            });
        }

        const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
        if (!matchesCategory) return { item, score: -1, nameMatches: 0 };

        return { item, score, nameMatches };
      })
      .filter(result => result.score > -1)
      .sort((a, b) => {
          if (b.nameMatches !== a.nameMatches) return b.nameMatches - a.nameMatches;
          if (b.score !== a.score) return b.score - a.score;
          return (a.item.name || '').localeCompare(b.item.name || '');
      })
      .map(result => result.item);

      return results;
  }, [items, searchTerm, selectedCategory]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingCell]);

  const handleOpenModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
    } else {
      setEditingItem(null);
    }
    setIsModalOpen(true);
  };

  const handleCreateAccessory = async (newItem: InventoryItem) => {
     await addOrUpdateItem(COLL_INVENTORY, newItem);
  };

  // --- PROPAGATE UPDATES TO LISTS ---
  const propagateUpdates = async (updatedItem: InventoryItem) => {
      // Find lists that contain this item
      const listsToUpdate: PackingList[] = [];
      
      packingLists.forEach(list => {
          let listModified = false;
          
          // Helper to process components
          const processComponents = (components: ListComponent[]) => {
              return components.map(comp => {
                  if (comp.type === 'item' && comp.referenceId === updatedItem.id) {
                      // Update basic info
                      let compModified = false;
                      if (comp.name !== updatedItem.name) { comp.name = updatedItem.name; compModified = true; }
                      if (comp.category !== updatedItem.category) { comp.category = updatedItem.category; compModified = true; }
                      
                      // Update accessories (contents)
                      // We regenerate the contents array based on the new inventory item accessories
                      const newContents = (updatedItem.accessories || []).map(acc => {
                          const accItem = items.find(i => i.id === acc.itemId);
                          return {
                              itemId: acc.itemId,
                              name: accItem?.name || '?',
                              quantity: acc.quantity,
                              category: accItem?.category || 'Altro'
                          };
                      });
                      
                      // Check for deep equality of contents to avoid unnecessary writes
                      if (JSON.stringify(comp.contents) !== JSON.stringify(newContents)) {
                          comp.contents = newContents;
                          compModified = true;
                      }

                      if (compModified) listModified = true;
                      return { ...comp }; // Return new object if modified logic implies shallow copy here, but we are mutating list clone in practice below
                  }
                  return comp;
              });
          };

          // Zones Structure
          if (list.zones) {
              const newZones = list.zones.map(zone => ({
                  ...zone,
                  sections: zone.sections.map(section => ({
                      ...section,
                      components: processComponents(section.components)
                  }))
              }));
              
              if (listModified) {
                  listsToUpdate.push({ ...list, zones: newZones });
              }
          }
          // Legacy Structure
          else if (list.sections) {
               const newSections = list.sections.map(section => ({
                   ...section,
                   components: processComponents(section.components)
               }));
               
               if (listModified) {
                   listsToUpdate.push({ ...list, sections: newSections });
               }
          }
      });

      // Batch update lists
      if (listsToUpdate.length > 0) {
          console.log(`Propagating updates to ${listsToUpdate.length} lists...`);
          await Promise.all(listsToUpdate.map(l => addOrUpdateItem(COLL_LISTS, l)));
      }
  };


  // --- FIRESTORE SAVE ---
  const handleSave = async (itemData: Omit<InventoryItem, 'id'>) => {
    const normalizedName = itemData.name.trim().toLowerCase();
    
    // Check local array for existing name collision to merge
    const existingCollision = items.find(i => 
      i.name.trim().toLowerCase() === normalizedName && 
      (!editingItem || i.id !== editingItem.id)
    );

    let newItem: InventoryItem;

    if (existingCollision) {
      // Merge: Use existing ID
      newItem = { ...itemData, id: existingCollision.id };
    } else {
      // New or Update existing ID
      const id = editingItem ? editingItem.id : generateId();
      newItem = { ...itemData, id };
    }

    const inventoryCol = getInventoryCollection(activeDatabaseId);
    await addOrUpdateItem(inventoryCol, newItem);
    await propagateUpdates(newItem);
    setIsModalOpen(false);
  };

  // --- INLINE EDITING LOGIC (FIRESTORE) ---

  const startInlineEdit = (item: InventoryItem, field: keyof InventoryItem) => {
    setEditingCell({ itemId: item.id, field });
    setEditValue(item[field] as string | number);
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;
    const { itemId, field } = editingCell;
    const item = items.find(i => i.id === itemId);
    if (item) {
        const updatedItem = { ...item, [field]: editValue };
        // Sanitize: remove undefined values which Firestore hates
        const sanitizedItem = JSON.parse(JSON.stringify(updatedItem));
        const inventoryCol = getInventoryCollection(activeDatabaseId);
        await addOrUpdateItem(inventoryCol, sanitizedItem);
        // Only propagate if name or category changed, as these are cached in lists.
        // Also if technically accessories were editable inline (not currently), we'd propagate.
        if (field === 'name' || field === 'category') {
            await propagateUpdates(sanitizedItem);
        }
    }
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          saveInlineEdit();
      } else if (e.key === 'Escape') {
          cancelInlineEdit();
      }
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      const inventoryCol = getInventoryCollection(activeDatabaseId);
      await deleteItem(inventoryCol, itemToDelete);
      setItemToDelete(null);
    }
  };

  const [isAssigningCodes, setIsAssigningCodes] = useState(false);

  const handleAutoAssignMissingCodes = async () => {
    const unassigned = items.filter(i => (!i.productCode || !i.productCode.trim()) || (!i.qrCode || !i.qrCode.trim()));
    if (unassigned.length === 0) {
      alert("Tutti gli articoli in inventario hanno già sia il codice prodotto che il codice QR assegnati!");
      return;
    }
    if (confirm(`Vuoi generare e salvare automaticamente i codici mancanti per i ${unassigned.length} articoli senza codice?`)) {
      setIsAssigningCodes(true);
      try {
        const inventoryCol = getInventoryCollection(activeDatabaseId);
        const updatedList: InventoryItem[] = [];
        let runningItems = [...items];
        for (const item of unassigned) {
          const prodCode = item.productCode && item.productCode.trim() ? item.productCode : generateProductCode(runningItems, item.id);
          const qr = item.qrCode && item.qrCode.trim() ? item.qrCode : generateProductQrCode(runningItems, item.id);
          const updated = { ...item, productCode: prodCode, qrCode: qr };
          runningItems = runningItems.map(i => i.id === item.id ? updated : i);
          updatedList.push(updated);
        }
        await Promise.all(updatedList.map(u => addOrUpdateItem(inventoryCol, u)));
        alert(`Salvati con successo i codici per ${updatedList.length} articoli!`);
      } catch (err) {
        console.error("Errore durante l'assegnazione automatica dei codici:", err);
        alert("Si è verificato un errore durante il salvataggio dei codici.");
      } finally {
        setIsAssigningCodes(false);
      }
    }
  };

  const handleDuplicate = async (item: InventoryItem) => {
    const inventoryCol = getInventoryCollection(activeDatabaseId);
    const newItem = { ...item, id: generateId(), name: `${item.name} (Copia)` };
    await addOrUpdateItem(inventoryCol, newItem);
    handleOpenModal(newItem);
  };

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 space-y-2 bg-slate-950 overflow-x-hidden">
      {/* Top Header / Actions */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-2">
        <h1 className="text-lg font-bold text-white uppercase tracking-wider opacity-90">Inventario Materiali</h1>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full xl:w-auto">
          {/* Category Filter */}
          <div className="relative flex-grow sm:flex-none">
             <Filter className="absolute left-3 top-2.5 text-slate-500" size={16} />
             <select 
               className="bg-slate-900 border border-slate-700 text-slate-300 pl-8 pr-7 py-2 rounded-lg text-sm appearance-none outline-none focus:border-blue-500 w-full sm:w-auto font-medium"
               value={selectedCategory}
               onChange={(e) => setSelectedCategory(e.target.value)}
             >
               <option value="All">Tutte le Categorie ({items.length})</option>
               {Array.from(new Set([
                 ...getCategoryDefinitions().map(c => c.name),
                 ...Object.values(Category),
                 ...items.map(i => i.category).filter(Boolean)
               ])).map(c => {
                 const count = items.filter(i => (i.category || '').toLowerCase() === c.toLowerCase()).length;
                 return <option key={c} value={c}>{c} ({count})</option>;
               })}
             </select>
          </div>

          {/* Search Bar */}
          <div className="relative flex-grow min-w-0 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Cerca materiale o codice..." 
              className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-4 py-2 rounded-lg outline-none focus:border-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Actions Button Group */}
          <div className="flex items-center gap-2">
             <button 
                onClick={() => setActiveInventoryAction(activeInventoryAction === 'duplicate' ? null : 'duplicate')}
                className={`p-2.5 rounded-lg flex items-center justify-center transition-all ${activeInventoryAction === 'duplicate' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                title="Attiva modalità duplicazione (clicca su un articolo per duplicarlo)"
             >
                <Copy size={18} />
             </button>

             <button 
                onClick={() => setActiveInventoryAction(activeInventoryAction === 'delete' ? null : 'delete')}
                className={`p-2.5 rounded-lg flex items-center justify-center transition-all ${activeInventoryAction === 'delete' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                title="Attiva modalità eliminazione (clicca su un articolo per rimuoverlo)"
             >
                <Trash2 size={18} />
             </button>

             {items.some(i => (!i.productCode || !i.productCode.trim()) || (!i.qrCode || !i.qrCode.trim())) && (
                <button 
                  onClick={handleAutoAssignMissingCodes}
                  disabled={isAssigningCodes}
                  className="bg-slate-800 hover:bg-slate-700 text-purple-400 border border-purple-900/40 p-2.5 sm:px-3 sm:py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-sm active:scale-95"
                  title="Genera e memorizza automaticamente i codici prodotto e QR mancanti per tutti gli articoli dell'inventario"
                >
                  <Barcode size={18} />
                  <span className="hidden md:inline">{isAssigningCodes ? 'Salvataggio...' : 'Genera Mancanti'}</span>
                </button>
              )}

             <button 
                onClick={() => handleOpenModal()}
                className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-all shadow-lg shadow-blue-900/30 active:scale-95"
             >
                <Plus size={20} />
                <span className="hidden sm:inline">Nuovo Materiale</span>
             </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar w-full">
          <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
            <thead className="bg-slate-800 text-slate-300 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-2 px-3 font-bold text-xs uppercase tracking-wider text-slate-500">Nome</th>
                <th className="py-2 px-2 font-bold text-xs uppercase tracking-wider text-slate-500">Cod. Prod.</th>
                <th className="py-2 px-2 font-bold text-xs uppercase tracking-wider text-slate-500">QR Code / Barcode</th>
                <th className="py-2 px-2 font-bold text-xs uppercase tracking-wider text-slate-500">Cat.</th>
                <th className="py-2 px-2 font-bold text-right text-xs uppercase tracking-wider text-slate-500">kg</th>
                <th className="py-2 px-2 font-bold text-right text-xs uppercase tracking-wider text-slate-500">Watt</th>
                <th className="py-2 px-2 font-bold text-right text-xs uppercase tracking-wider text-slate-500">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Nessun materiale trovato.
                  </td>
                </tr>
              ) : (
                paginatedItems.map(item => {
                  const effectiveProductCode = item.productCode || generateProductCode(items, item.id);
                  const effectiveQrCode = item.qrCode || generateProductQrCode(items, item.id);
                  
                  return (
                  <tr 
                    key={item.id}  
                    className={`hover:bg-slate-800/50 transition-colors group cursor-pointer ${activeInventoryAction ? 'bg-blue-900/10' : ''}`}
                    onClick={() => {
                        if (activeInventoryAction === 'duplicate') { handleDuplicate(item); setActiveInventoryAction(null); }
                        else if (activeInventoryAction === 'delete') { setItemToDelete(item.id); setActiveInventoryAction(null); }
                        else { handleOpenModal(item); }
                    }}
                  >
                    {/* NAME COLUMN */}
                    <td className="py-2 px-3" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'name'); }}>
                      {editingCell?.itemId === item.id && editingCell?.field === 'name' ? (
                          <input 
                            ref={editInputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            className="w-full bg-slate-950 border border-blue-500 rounded px-1 py-0.5 text-xs text-white outline-none"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                          />
                      ) : (
                          <div className="flex items-center gap-2" title="Doppio click per rinominare">
                            <div className="font-medium text-white">{item.name}</div>
                            {item.accessories && item.accessories.length > 0 && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setViewAccessoriesItem(item); }}
                              title={`${item.accessories.length} accessori collegati`}
                              className="text-slate-500 hover:text-blue-400 hover:bg-slate-800 p-1 rounded transition-colors"
                            >
                                <Link size={14} className="fill-current" />
                            </button>
                            )}
                            {item.documents && item.documents.length > 0 && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1"
                            >
                              {item.documents.length === 1 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDocumentInBrowser(item.documents![0].url);
                                  }}
                                  title={`Apri documento: ${item.documents[0].name || item.documents[0].url}`}
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-1 rounded transition-colors flex items-center gap-0.5 text-xs font-mono"
                                >
                                  <FileText size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewDocumentsItem(item);
                                  }}
                                  title={`${item.documents.length} documenti collegati (clicca per scegliere quale visualizzare)`}
                                  className="text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:border-blue-800/50 dark:hover:bg-blue-900/40 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono flex items-center gap-1 transition-colors shadow-sm"
                                >
                                  <FileText size={12} />
                                  <span>{item.documents.length}</span>
                                </button>
                              )}
                            </div>
                            )}
                        </div>
                      )}
                      {(!editingCell || editingCell.itemId !== item.id || editingCell?.field !== 'name') && (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                              {item.description && (
                                  <div className="text-sm text-slate-500 truncate max-w-xs" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'description'); }}>
                                      {item.description}
                                  </div>
                              )}
                              {item.instances && item.instances.length > 0 && (
                                <div className="flex items-center gap-2 text-xs font-mono">
                                    <span className="text-emerald-400/80 bg-emerald-900/20 px-1 py-0.5 rounded">{item.instances.length} SERIALI</span>
                                </div>
                              )}
                          </div>
                      )}
                    </td>

                    {/* PRODUCT CODE COLUMN (NON-PRINTED IDENTIFIER) */}
                    <td className="py-2 px-2 font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                      <span 
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${item.productCode ? 'text-blue-400 bg-blue-900/20 border border-blue-800/40 font-semibold' : 'text-slate-500 italic'}`}
                        title="Codice identificativo prodotto (No Stampa)"
                        onClick={() => handleOpenModal(item)}
                      >
                        {item.productCode ? `#${item.productCode}` : `#${effectiveProductCode}`}
                      </span>
                    </td>

                    {/* QR CODE / BARCODE COLUMN (PRINTABLE TAG - 3 BUTTONS ONLY) */}
                    <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1 font-mono text-xs">
                        <button 
                          type="button" 
                          onClick={() => setPreviewCodeItem({ code: effectiveQrCode, name: item.name })} 
                          className="p-1.5 text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-800 dark:hover:text-blue-400 rounded-lg transition-colors"
                          title={`Visualizza QR Code e Barcode (${effectiveQrCode})`}
                        >
                          <Eye size={15} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => printBarcode(effectiveQrCode, item.name)} 
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 dark:hover:text-emerald-400 rounded-lg transition-colors"
                          title={`Stampa Codice a Barre (${effectiveQrCode})`}
                        >
                          <Barcode size={15} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => printQRCode(effectiveQrCode, item.name)} 
                          className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-800 dark:hover:text-purple-400 rounded-lg transition-colors"
                          title={`Stampa QR Code (${effectiveQrCode})`}
                        >
                          <QrCode size={15} />
                        </button>
                      </div>
                    </td>

                    {/* CATEGORY COLUMN */}
                    <td className="py-2 px-2" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'category'); }}>
                      {editingCell?.itemId === item.id && editingCell?.field === 'category' ? (
                          <select 
                            ref={editInputRef as React.RefObject<HTMLSelectElement>}
                            className="bg-slate-950 border border-blue-500 rounded px-1 py-0.5 text-white outline-none text-xs"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                          >
                             {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                      ) : (
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold border cursor-pointer
                              ${item.category === Category.AUDIO ? 'bg-amber-900/20 text-amber-500 border-amber-900/30' : 
                              item.category === Category.LIGHTS ? 'bg-purple-900/20 text-purple-500 border-purple-900/30' :
                              item.category === Category.VIDEO ? 'bg-blue-900/20 text-blue-500 border-blue-900/30' :
                              item.category === Category.REGIA ? 'bg-teal-900/20 text-teal-500 border-teal-900/30' :
                              'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                              title="Doppio click per cambiare categoria"
                            >
                              {item.category}
                            </span>
                            {(item.subcategory || item.folder) && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={item.subcategory || item.folder}>
                                {item.subcategory || item.folder}
                              </span>
                            )}
                          </div>
                      )}
                    </td>

                    {/* WEIGHT COLUMN */}
                    <td className="py-2 px-2 text-right" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'weight'); }}>
                        {editingCell?.itemId === item.id && editingCell?.field === 'weight' ? (
                             <input 
                                ref={editInputRef as React.RefObject<HTMLInputElement>}
                                type="number"
                                step="0.1"
                                className="w-14 bg-slate-950 border border-blue-500 rounded px-1 py-0.5 text-xs text-white outline-none text-right font-mono"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                onBlur={saveInlineEdit}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                             />
                        ) : (
                             <span className="text-slate-300 font-mono text-xs" title="Doppio click per modificare peso">{item.weight}</span>
                        )}
                    </td>

                    {/* POWER CONSUMPTION COLUMN */}
                    <td className="py-2 px-2 text-right" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'powerConsumption'); }}>
                        {editingCell?.itemId === item.id && editingCell?.field === 'powerConsumption' ? (
                             <input 
                                ref={editInputRef as React.RefObject<HTMLInputElement>}
                                type="number"
                                min="0"
                                className="w-14 bg-slate-950 border border-blue-500 rounded px-1 py-0.5 text-xs text-white outline-none text-right font-mono"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                onBlur={saveInlineEdit}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                             />
                        ) : (
                             <span className={`font-mono text-xs ${(item.powerConsumption || 0) > 0 ? 'text-yellow-400' : 'text-slate-500'}`} title="Doppio click per modificare consumo">
                                {item.powerConsumption || 0}
                             </span>
                        )}
                    </td>

                    {/* STOCK COLUMN */}
                    <td className="py-2 px-2 text-right" onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(item, 'inStock'); }}>
                       {editingCell?.itemId === item.id && editingCell?.field === 'inStock' ? (
                             <input 
                                ref={editInputRef as React.RefObject<HTMLInputElement>}
                                type="number"
                                className="w-14 bg-slate-950 border border-blue-500 rounded px-1 py-0.5 text-xs text-white outline-none text-right font-mono font-bold"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                onBlur={saveInlineEdit}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                             />
                        ) : (
                             <span className={`font-mono text-xs font-bold ${item.inStock > 0 ? 'text-emerald-400' : 'text-rose-400'}`} title="Doppio click per modificare stock">
                                {item.inStock}
                             </span>
                        )}
                    </td>

                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {filteredItems.length > 0 && (
          <div className="bg-slate-800 border-t border-slate-700 p-3 sm:p-4 pb-[calc(12px+env(safe-area-inset-bottom))] flex items-center justify-between">
             <div className="text-sm text-slate-400">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} di {filteredItems.length} materiali
             </div>
             
             <div className="flex items-center gap-2">
                <button
                   onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                   disabled={currentPage === 1}
                   className="p-2 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                   <ChevronLeft size={20} />
                </button>
                
                <span className="text-sm text-slate-300 min-w-[80px] text-center">
                   Pagina {currentPage} di {totalPages}
                </span>

                <button
                   onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                   disabled={currentPage === totalPages}
                   className="p-2 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                   <ChevronRight size={20} />
                </button>
             </div>
          </div>
        )}
      </div>

      <ItemFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingItem}
        inventory={items} // Pass full inventory for accessories selection
        onCreateAccessory={handleCreateAccessory}
        title={editingItem ? "Modifica Materiale" : "Nuovo Materiale"}
        activeDatabaseId={activeDatabaseId}
      />
      
      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title="Elimina Materiale"
        message="Sei sicuro di voler eliminare questo materiale dall'inventario?"
      />
      
      <Modal isOpen={!!viewAccessoriesItem} onClose={() => setViewAccessoriesItem(null)} title={`Accessori di ${viewAccessoriesItem?.name}`} size="md">
        <div className="space-y-2">
            {viewAccessoriesItem?.accessories?.map((acc, idx) => {
                const accItem = items.find(i => i.id === acc.itemId);
                const isAuto = acc.automatic !== false;
                return (
                    <div key={idx} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-white max-w-[200px] sm:max-w-xs truncate">{accItem ? accItem.name : 'Oggetto Sconosciuto'}</span>
                            <span className="text-xs text-slate-400">{accItem ? accItem.category : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isAuto ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>
                                {isAuto ? 'Automatico' : 'Opzionale'}
                            </span>
                            <span className="text-sm font-mono font-bold bg-slate-900 border border-slate-600 text-slate-300 px-2 py-1 rounded">x{acc.quantity}</span>
                        </div>
                    </div>
                );
            })}
        </div>
      </Modal>

      {/* ITEM DOCUMENTS PICKER MODAL */}
      <Modal isOpen={!!viewDocumentsItem} onClose={() => setViewDocumentsItem(null)} title={`Documenti di ${viewDocumentsItem?.name || ''}`} size="md">
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seleziona il documento da aprire e consultare direttamente nel browser:
          </p>
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
            {viewDocumentsItem?.documents?.map((doc) => {
              const displayName = doc.name && doc.name.trim() ? doc.name.trim() : doc.url;
              return (
                <div key={doc.id} className="flex justify-between items-center bg-white dark:bg-slate-800/80 p-3 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-slate-600 shadow-sm transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</div>
                      {doc.name && doc.name.trim() && (
                        <div className="text-[11px] text-slate-500 font-mono truncate">{doc.url}</div>
                      )}
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => openDocumentInBrowser(doc.url)} 
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-900/20 shrink-0 active:scale-95"
                    title="Apri e visualizza nel browser"
                  >
                    <Eye size={13} />
                    <span>Visualizza</span>
                    <ExternalLink size={11} className="opacity-70" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end pt-2">
            <button 
              type="button"
              onClick={() => setViewDocumentsItem(null)} 
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      </Modal>

      {/* CODE PREVIEW & PRINT MODAL */}
      <Modal isOpen={!!previewCodeItem} onClose={() => setPreviewCodeItem(null)} title={`Codici Prodotto: ${previewCodeItem?.code || ''}`} size="md">
        {previewCodeItem && (
          <div className="space-y-6 text-center p-1">
            {previewCodeItem.name && (
              <div className="text-sm font-semibold text-white truncate max-w-sm mx-auto">
                {previewCodeItem.name}
              </div>
            )}
            
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Codice a Barre (Code 128)</div>
              <div 
                className="bg-white p-3 rounded-lg flex items-center justify-center overflow-x-auto max-w-full inline-block mx-auto shadow-md" 
                dangerouslySetInnerHTML={{ __html: generateBarcodeSVG(previewCodeItem.code, 60, 2) }} 
              />
              <div>
                <button 
                  type="button" 
                  onClick={() => printBarcode(previewCodeItem.code, previewCodeItem.name)} 
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 mx-auto transition-all shadow-lg shadow-emerald-900/30 active:scale-95"
                >
                  <Printer size={15} /> Stampa Barcode
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">QR Code</div>
              <div 
                className="bg-white p-3 rounded-lg flex items-center justify-center overflow-hidden inline-block mx-auto shadow-md" 
                dangerouslySetInnerHTML={{ __html: generateQRCodeSVG(previewCodeItem.code, 160) }} 
              />
              <div>
                <button 
                  type="button" 
                  onClick={() => printQRCode(previewCodeItem.code, previewCodeItem.name)} 
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 mx-auto transition-all shadow-lg shadow-purple-900/30 active:scale-95"
                >
                  <Printer size={15} /> Stampa QR Code
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button type="button" onClick={() => setPreviewCodeItem(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors">Chiudi</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
