import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { Plus, Search, Edit2, Trash2, Copy, Package, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { InventoryItem, Kit, Category } from '../types';
import { KitFormModal } from './KitFormModal';
import { ConfirmationModal } from './ConfirmationModal';
import { addOrUpdateItem, deleteItem, COLL_KITS } from '../firebase';

interface KitsViewProps {
  kits: Kit[];
  inventory: InventoryItem[];
}

export const KitsView: React.FC<KitsViewProps> = ({ kits, inventory }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<Kit | null>(null);
  
  const [kitToDelete, setKitToDelete] = useState<string | null>(null);
  const [activeKitAction, setActiveKitAction] = useState<'duplicate' | 'delete' | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const filteredKits = useMemo(() => {
      const searchTokens = (searchTerm || '').toLowerCase().split(' ').filter(t => t.trim() !== '');
      
      return kits
        .map(kit => {
            const name = (kit.name || '').toLowerCase();
            const cat = (kit.category || '').toLowerCase();
            const desc = (kit.description || '').toLowerCase();
            const combined = `${name} ${cat} ${desc}`;

            if (!searchTokens.every(token => combined.includes(token))) return { kit, score: -1, nameMatches: 0 };
            if (selectedCategory !== 'All' && kit.category !== selectedCategory) return { kit, score: -1, nameMatches: 0 };

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
                    if (cat.includes(token)) score += 20;
                    if (desc.includes(token)) score += 5;
                });
            }
            return { kit, score, nameMatches };
        })
        .filter(x => x.score > -1)
        .sort((a, b) => {
            if (b.nameMatches !== a.nameMatches) return b.nameMatches - a.nameMatches;
            if (b.score !== a.score) return b.score - a.score;
            return (a.kit.name || '').localeCompare(b.kit.name || '');
        })
        .map(x => x.kit);
  }, [kits, searchTerm, selectedCategory]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

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
    await addOrUpdateItem(COLL_KITS, kit);
    setIsModalOpen(false);
  };

  const confirmDelete = async () => {
    if (kitToDelete) {
      await deleteItem(COLL_KITS, kitToDelete);
      setKitToDelete(null);
    }
  };

  const handleDuplicate = async (kit: Kit) => {
    const newKit = { ...kit, id: generateId(), name: `${kit.name} (Copia)` };
    await addOrUpdateItem(COLL_KITS, newKit);
  };

  const getInventoryName = (id: string) => inventory.find(i => i.id === id)?.name || 'Unknown Item';

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 space-y-2 bg-slate-950 overflow-x-hidden">
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
                paginatedKits.map(kit => (
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
                        <div className="flex items-center gap-3">
                            <div className="hidden sm:flex p-1.5 bg-purple-900/20 text-purple-400 rounded shrink-0">
                                <Package size={14} />
                            </div>
                            <div className="font-medium text-white">{kit.name}</div>
                        </div>
                        <div className="hidden md:block text-xs text-slate-500 truncate max-w-xs mt-0.5">
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
                ))
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

      <KitFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingKit}
        inventory={inventory}
        title={editingKit ? "Modifica Kit" : "Nuovo Kit"}
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
