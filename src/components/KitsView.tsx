import React, { useState, useEffect, useMemo } from 'react';
import { generateId } from '../utils';
import { Plus, Search, Trash2, Copy, Package, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { InventoryItem, Kit, Category, InventoryDatabase, DEFAULT_DATABASE_ID } from '../types';
import { KitFormModal } from './KitFormModal';
import { ConfirmationModal } from './ConfirmationModal';
import { Modal } from './Modal';
import { addOrUpdateItem, deleteItem, getKitsCollection } from '../firebase';
import { getDbBadgeStyle, getDbDotColor } from '../utils/databaseColors';
import { tokenizeQuery, scoreSearchMatch, matchesSearch } from '../utils/searchUtils';

interface KitsViewProps {
  kits: Kit[];
  inventory: InventoryItem[];
  activeDatabaseId?: string;
  databases?: InventoryDatabase[];
}

export const KitsView: React.FC<KitsViewProps> = ({ kits, inventory, activeDatabaseId, databases }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<Kit | null>(null);
  
  const [kitToDelete, setKitToDelete] = useState<string | null>(null);
  const [activeKitAction, setActiveKitAction] = useState<'duplicate' | 'delete' | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Active filters count
  const activeFiltersCount = (selectedDatabase !== 'All' ? 1 : 0) + (selectedCategory !== 'All' ? 1 : 0);

  const handleResetFilters = () => {
    setSelectedDatabase('All');
    setSelectedCategory('All');
  };

  // Databases list fallback
  const effectiveDatabases = useMemo(() => {
    if (databases && databases.length > 0) return databases;
    return [{ id: DEFAULT_DATABASE_ID, name: 'Database Principale', code: 'PRI', color: 'emerald' }];
  }, [databases]);

  const effectiveDatabasesMap = useMemo(() => {
    const map = new Map<string, InventoryDatabase>();
    for (const db of effectiveDatabases) {
      map.set(db.id, db);
    }
    return map;
  }, [effectiveDatabases]);

  // Inventory Map for O(1) instant lookups
  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of inventory) {
      map.set(item.id, item);
    }
    return map;
  }, [inventory]);

  // Precompute unique database IDs per kit for instant O(1) access
  const kitDbIdsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const kit of kits) {
      const dbSet = new Set<string>();
      for (const kItem of (kit.items || [])) {
        const inv = inventoryMap.get(kItem.itemId);
        dbSet.add(inv?.databaseId || DEFAULT_DATABASE_ID);
        for (const acc of (kItem.accessories || [])) {
          const accInv = inventoryMap.get(acc.itemId);
          dbSet.add(accInv?.databaseId || DEFAULT_DATABASE_ID);
        }
      }
      map.set(kit.id, Array.from(dbSet));
    }
    return map;
  }, [kits, inventoryMap]);

  // Available categories with kits
  const availableCategories = useMemo(() => {
    return Object.values(Category);
  }, []);

  const filteredKits = useMemo(() => {
    const searchTokens = tokenizeQuery(searchTerm);
    
    return kits
      .map(kit => {
        // 1. Search term match
        if (searchTokens.length > 0 && !matchesSearch(kit as any, searchTerm)) {
          return { kit, score: -1 };
        }
        
        // 2. Category filter
        if (selectedCategory !== 'All' && kit.category !== selectedCategory) return { kit, score: -1 };

        // 3. Multi-database filter:
        // Se un kit contiene più DB, viene mostrato se almeno uno dei suoi articoli appartiene al DB selezionato
        if (selectedDatabase !== 'All') {
          const kitDbs = kitDbIdsMap.get(kit.id) || [];
          if (!kitDbs.includes(selectedDatabase)) return { kit, score: -1 };
        }

        const score = searchTokens.length === 0 ? 1 : scoreSearchMatch(kit as any, searchTokens, searchTerm);
        return { kit, score };
      })
      .filter(x => x.score > -1)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.kit.name || '').localeCompare(b.kit.name || '');
      })
      .map(x => x.kit);
  }, [kits, searchTerm, selectedCategory, selectedDatabase, kitDbIdsMap]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedDatabase]);

  const totalPages = Math.ceil(filteredKits.length / ITEMS_PER_PAGE);
  const paginatedKits = filteredKits.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleOpenModal = (kit?: Kit) => {
    setEditingKit(kit || null);
    setIsModalOpen(true);
  };

  const handleSave = async (kit: Kit) => {
    const kitsCol = getKitsCollection(activeDatabaseId);
    await addOrUpdateItem(kitsCol, kit);
    setIsModalOpen(false);
  };

  const confirmDelete = async () => {
    if (kitToDelete) {
      const kitsCol = getKitsCollection(activeDatabaseId);
      await deleteItem(kitsCol, kitToDelete);
      setKitToDelete(null);
    }
  };

  const handleDuplicate = async (kit: Kit) => {
    const kitsCol = getKitsCollection(activeDatabaseId);
    const newKit = { ...kit, id: generateId(), name: `${kit.name} (Copia)` };
    await addOrUpdateItem(kitsCol, newKit);
  };

  return (
    <div className={`h-full flex flex-col p-2 sm:p-4 space-y-2 bg-slate-950 overflow-x-hidden transition-all duration-300 ${isFilterModalOpen ? 'lg:mr-[400px]' : ''}`}>
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-2">
        <h1 className="text-lg font-bold text-white uppercase tracking-wider opacity-90">Gestione Kit</h1>
        
        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full xl:w-auto">
          {/* Search Bar */}
          <div className="relative flex-grow min-w-0 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Cerca kit..." 
              className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-4 py-2 rounded-lg outline-none focus:border-purple-500 text-sm" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>

          {/* Filter Toggle Button with Tooltip - Identical to InventoryView */}
          <div className="relative group/filter shrink-0">
            <button 
              type="button"
              onClick={() => setIsFilterModalOpen(prev => !prev)}
              className={`p-2.5 sm:px-3 sm:py-2 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition-all shrink-0 ${
                isFilterModalOpen
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                  : activeFiltersCount > 0 
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/50 hover:bg-purple-600/30 shadow-sm shadow-purple-900/30' 
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
              title="Filtri"
              aria-label="Filtri"
            >
              <Filter size={18} />
              {activeFiltersCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full leading-none ${isFilterModalOpen ? 'bg-white text-purple-600' : 'bg-purple-500 text-white'}`}>
                  {activeFiltersCount}
                </span>
              )}
            </button>
            {/* Hover Tooltip Popup */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900 border border-slate-700 text-white text-[11px] font-semibold rounded-md shadow-xl opacity-0 invisible group-hover/filter:opacity-100 group-hover/filter:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50">
              Filtri
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-700" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveKitAction(p => p === 'duplicate' ? null : 'duplicate')}
              className={`p-2.5 rounded-lg flex items-center justify-center transition-all ${activeKitAction === 'duplicate' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              title="Copia Kit"
            >
              <Copy size={18} />
            </button>
            <button 
              onClick={() => setActiveKitAction(p => p === 'delete' ? null : 'delete')}
              className={`p-2.5 rounded-lg flex items-center justify-center transition-all ${activeKitAction === 'delete' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              title="Elimina Kit"
            >
              <Trash2 size={18} />
            </button>
            
            <button 
              onClick={() => handleOpenModal()}
              className="bg-purple-600 hover:bg-purple-500 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-all shadow-lg shadow-purple-900/30 active:scale-95"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Nuovo Kit</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar w-full">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-800 text-slate-300 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-2 px-3 font-bold text-xs uppercase tracking-wider text-slate-500">Nome Kit</th>
                <th className="py-2 px-2 font-bold text-xs uppercase tracking-wider text-slate-500">Categoria</th>
                <th className="py-2 px-2 font-bold text-center text-xs uppercase tracking-wider text-slate-500">Elementi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredKits.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">
                    Nessun kit trovato.
                  </td>
                </tr>
              ) : (
                paginatedKits.map(kit => {
                  const kitDbIds = kitDbIdsMap.get(kit.id) || [DEFAULT_DATABASE_ID];

                  return (
                    <tr 
                      key={kit.id} 
                      onClick={() => {
                        if (activeKitAction === 'duplicate') { handleDuplicate(kit); setActiveKitAction(null); }
                        else if (activeKitAction === 'delete') { setKitToDelete(kit.id); setActiveKitAction(null); }
                        else { handleOpenModal(kit); }
                      }}
                      className={`hover:bg-slate-800/50 transition-colors group cursor-pointer ${activeKitAction ? 'bg-purple-900/10' : ''}`}
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="hidden sm:flex p-1.5 bg-purple-900/20 text-purple-400 rounded shrink-0">
                            <Package size={14} />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {kitDbIds.map(dbId => {
                              const db = effectiveDatabasesMap.get(dbId);
                              const code = db?.code || (dbId === DEFAULT_DATABASE_ID ? 'PRI' : dbId.slice(0, 3).toUpperCase());
                              const color = db?.color || (dbId === DEFAULT_DATABASE_ID ? 'emerald' : 'blue');
                              return (
                                <span 
                                  key={dbId}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${getDbBadgeStyle(color)}`}
                                  title={`Contiene materiali dal DB: ${db?.name || dbId}`}
                                >
                                  <span className={`w-1 h-1 rounded-full ${getDbDotColor(color)}`} />
                                  {code}
                                </span>
                              );
                            })}
                            <span className="font-medium text-white">{kit.name}</span>
                          </div>
                        </div>
                        <div className="hidden md:block text-xs text-slate-500 truncate max-w-xs mt-0.5 sm:ml-8">
                          {kit.description || 'Nessuna descrizione.'}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold border uppercase tracking-wider
                          ${kit.category === Category.AUDIO ? 'bg-amber-900/20 text-amber-500 border-amber-900/30' : 
                            kit.category === Category.LIGHTS ? 'bg-purple-900/20 text-purple-500 border-purple-900/30' :
                            kit.category === Category.VIDEO ? 'bg-blue-900/20 text-blue-500 border-blue-900/30' :
                            kit.category === Category.STRUCTURE ? 'bg-slate-700/30 text-slate-400 border-slate-600/30' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {kit.category}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="text-slate-300 font-mono text-sm font-bold">{kit.items.length}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {filteredKits.length > 0 && (
          <div className="bg-slate-800 border-t border-slate-700 p-3 sm:p-4 pb-[calc(12px+env(safe-area-inset-bottom))] flex items-center justify-between">
            <div className="text-sm text-slate-400">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredKits.length)} di {filteredKits.length} kit
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

      {/* FILTER MODAL / DRAWER (Identical style to InventoryView) */}
      <Modal 
        isOpen={isFilterModalOpen} 
        onClose={() => setIsFilterModalOpen(false)} 
        title="Filtri Kit" 
        size="md"
        asDrawerOnDesktop
      >
        <div className="flex-1 flex flex-col justify-between space-y-4 h-full">
          <div className="space-y-4">
            {/* Database Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Database
              </label>
              <select
                value={selectedDatabase}
                onChange={(e) => setSelectedDatabase(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 font-medium"
              >
                <option value="All">Tutti i Database ({kits.length})</option>
                {effectiveDatabases.map(db => {
                  const count = kits.filter(k => 
                    k.items.some(kItem => {
                      const inv = inventory.find(i => i.id === kItem.itemId);
                      const itemDb = inv?.databaseId || DEFAULT_DATABASE_ID;
                      if (itemDb === db.id) return true;
                      return (kItem.accessories || []).some(acc => {
                        const accInv = inventory.find(i => i.id === acc.itemId);
                        return (accInv?.databaseId || DEFAULT_DATABASE_ID) === db.id;
                      });
                    })
                  ).length;
                  return (
                    <option key={db.id} value={db.id}>
                      [{db.code || db.name.slice(0, 3).toUpperCase()}] {db.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Categoria Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Categoria
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 font-medium"
              >
                <option value="All">Tutte le Categorie ({kits.length})</option>
                {availableCategories.map(c => {
                  const count = kits.filter(k => (k.category || '').toLowerCase() === c.toLowerCase()).length;
                  return <option key={c} value={c}>{c} ({count})</option>;
                })}
              </select>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-auto">
            <button
              type="button"
              onClick={handleResetFilters}
              disabled={activeFiltersCount === 0}
              className="text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors py-2 px-1"
            >
              Azzera Filtri
            </button>
            <button
              type="button"
              onClick={() => setIsFilterModalOpen(false)}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-purple-900/30 transition-all active:scale-95"
            >
              Mostra {filteredKits.length} Kit
            </button>
          </div>
        </div>
      </Modal>

      {/* KIT FORM MODAL */}
      <KitFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingKit}
        inventory={inventory}
        title={editingKit ? "Modifica Kit" : "Nuovo Kit"}
        databases={databases}
        activeDatabaseId={activeDatabaseId}
        kits={kits}
      />
      
      {/* CONFIRMATION MODAL */}
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
