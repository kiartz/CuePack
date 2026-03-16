import React, { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Copy, Package, Filter } from 'lucide-react';
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
  
  // Deletion State
  const [kitToDelete, setKitToDelete] = useState<string | null>(null);

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
    const newKit = { ...kit, id: crypto.randomUUID(), name: `${kit.name} (Copia)` };
    await addOrUpdateItem(COLL_KITS, newKit);
  };

  const getInventoryName = (id: string) => inventory.find(i => i.id === id)?.name || 'Unknown Item';

  return (
    <div className="h-full flex flex-col p-6 space-y-4">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h1 className="text-3xl font-bold text-white">Gestione Kit</h1>
        
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
          {/* Search Bar */}
          <div className="relative flex-grow md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Cerca kit... (es. 'totem 2m')"
              className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <div className="relative min-w-[180px]">
             <div className="absolute left-3 top-2.5 pointer-events-none text-slate-400">
               <Filter size={18} />
             </div>
             <select
               value={selectedCategory}
               onChange={(e) => setSelectedCategory(e.target.value)}
               className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-8 py-2 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none appearance-none cursor-pointer"
             >
               <option value="All">Tutte le Categorie</option>
               {Object.values(Category).map(cat => (
                 <option key={cat} value={cat}>{cat}</option>
               ))}
             </select>
             <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
               <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
             </div>
          </div>

          <button 
            onClick={() => handleOpenModal()}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors whitespace-nowrap"
          >
            <Plus size={20} />
            <span>Nuovo Kit</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto pb-4 custom-scrollbar">
        {filteredKits.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            Nessun kit trovato.
          </div>
        ) : (
          filteredKits.map(kit => (
            <div key={kit.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col md:flex-row gap-4 items-center hover:border-slate-700 transition-all group">
                {/* Icon & Main Info */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="p-2 bg-purple-900/30 text-purple-400 rounded-lg shrink-0">
                        <Package size={20} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                             <h3 className="text-base font-bold text-white leading-tight truncate">{kit.name}</h3>
                             <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider shrink-0
                                  ${kit.category === Category.AUDIO ? 'bg-amber-900/20 text-amber-500 border-amber-900/30' : 
                                    kit.category === Category.LIGHTS ? 'bg-purple-900/20 text-purple-500 border-purple-900/30' :
                                    kit.category === Category.VIDEO ? 'bg-blue-900/20 text-blue-500 border-blue-900/30' :
                                    kit.category === Category.STRUCTURE ? 'bg-slate-700/30 text-slate-400 border-slate-600/30' :
                                    'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}>
                                  {kit.category}
                              </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                             {kit.description || 'Nessuna descrizione.'}
                        </div>
                    </div>
                </div>

                {/* Content Preview */}
                <div className="hidden lg:flex flex-col w-1/3 min-w-0 px-4 border-l border-slate-800">
                     <span className="text-[10px] uppercase text-slate-600 font-bold mb-1">Contenuto ({kit.items.length})</span>
                     <div className="text-xs text-slate-500 truncate">
                        {kit.items.slice(0, 5).map(i => getInventoryName(i.itemId)).join(', ')} {kit.items.length > 5 ? '...' : ''}
                     </div>
                </div>
              
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleDuplicate(kit)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800" title="Duplica"><Copy size={16} /></button>
                  <button onClick={() => handleOpenModal(kit)} className="p-2 text-blue-400 hover:text-blue-300 rounded-lg hover:bg-slate-800" title="Modifica"><Edit2 size={16} /></button>
                  <button onClick={() => setKitToDelete(kit.id)} className="p-2 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-slate-800" title="Elimina"><Trash2 size={16} /></button>
                </div>
            </div>
          ))
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