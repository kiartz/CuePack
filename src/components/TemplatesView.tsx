import React, { useState, useEffect, useMemo } from 'react';
import { generateId } from '../utils';
import { Plus, Search, Trash2, Copy, Blocks, ChevronLeft, ChevronRight } from 'lucide-react';
import { InventoryItem, Kit, Template, Category, PackingList } from '../types';
import { TemplateFormModal } from './TemplateFormModal';
import { ConfirmationModal } from './ConfirmationModal';
import { addOrUpdateItem, deleteItem, COLL_TEMPLATES } from '../firebase';

interface TemplatesViewProps {
  templates: Template[];
  inventory: InventoryItem[];
  kits: Kit[];
  lists: PackingList[];
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({ templates, inventory, kits, lists }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<'duplicate' | 'delete' | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const filteredTemplates = useMemo(() => {
      const searchTokens = (searchTerm || '').toLowerCase().split(' ').filter(t => t.trim() !== '');
      
      return templates
        .map(template => {
            const name = (template.name || '').toLowerCase();
            const cat = (template.category || '').toLowerCase();
            const desc = (template.description || '').toLowerCase();
            const combined = `${name} ${cat} ${desc}`;

            if (!searchTokens.every(token => combined.includes(token))) return { template, score: -1, nameMatches: 0 };
            if (selectedCategory !== 'All' && template.category !== selectedCategory) return { template, score: -1, nameMatches: 0 };

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
            return { template, score, nameMatches };
        })
        .filter(x => x.score > -1)
        .sort((a, b) => {
            if (b.nameMatches !== a.nameMatches) return b.nameMatches - a.nameMatches;
            if (b.score !== a.score) return b.score - a.score;
            return (a.template.name || '').localeCompare(b.template.name || '');
        })
        .map(x => x.template);
  }, [templates, searchTerm, selectedCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  const totalPages = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);
  const paginatedTemplates = filteredTemplates.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleOpenModal = (template?: Template) => {
    setEditingTemplate(template || null);
    setIsModalOpen(true);
  };

  const handleSave = async (template: Template) => {
    await addOrUpdateItem(COLL_TEMPLATES, template);
    setIsModalOpen(false);
  };

  const confirmDelete = async () => {
    if (templateToDelete) {
      await deleteItem(COLL_TEMPLATES, templateToDelete);
      setTemplateToDelete(null);
    }
  };

  const handleDuplicate = async (template: Template) => {
    const newTemplate = { ...template, id: generateId(), name: `${template.name} (Copia)` };
    await addOrUpdateItem(COLL_TEMPLATES, newTemplate);
  };

  const activeListsWithTemplate = useMemo(() => {
      if (!templateToDelete) return [];
      return lists.filter(list => 
          !list.isArchived &&
          !list.isCompleted &&
          (list.zones || []).some(zone => 
              (zone.sections || []).some(section => 
                  section.components.some(comp => comp.type === 'template' && comp.referenceId === templateToDelete)
              )
          )
      );
  }, [templateToDelete, lists]);

  const deleteMessage = activeListsWithTemplate.length > 0
      ? `ATTENZIONE: Questo template è in uso nelle liste attive: ${activeListsWithTemplate.map(l => '"' + l.eventName + '"').join(", ")}. Se lo elimini, verrà segnalato come mancante durante la visualizzazione di queste liste, ma il materiale nelle liste di magazzino completate sarà mantenuto. Sei sicuro di procedere con l'eliminazione?`
      : "Sei sicuro di voler eliminare questo template? I materiali e i kit all'interno non verranno cancellati.";

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 space-y-2 bg-slate-950 overflow-x-hidden">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-2">
        <h1 className="text-lg font-bold text-white uppercase tracking-wider opacity-90">Gestione Template</h1>
        
        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full xl:w-auto">
          {/* Search Bar */}
          <div className="relative flex-grow min-w-0 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
            <input 
              type="text"
              placeholder="Cerca template..."
              className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-4 py-2 rounded-lg outline-none focus:border-emerald-500 text-sm focus:ring-1 focus:ring-emerald-500/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
             <button 
                onClick={() => setActiveAction(p => p === 'duplicate' ? null : 'duplicate')}
                className={`p-2.5 rounded-lg flex items-center justify-center transition-all ${activeAction === 'duplicate' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                title="Copia Template"
             >
                <Copy size={18} />
             </button>
             <button 
                onClick={() => setActiveAction(p => p === 'delete' ? null : 'delete')}
                className={`p-2.5 rounded-lg flex items-center justify-center transition-all ${activeAction === 'delete' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                title="Elimina Template"
             >
                <Trash2 size={18} />
             </button>
             
             <button 
                onClick={() => handleOpenModal()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-all shadow-lg shadow-emerald-900/30 active:scale-95"
             >
                <Plus size={20} />
                <span className="hidden sm:inline">Nuovo Template</span>
             </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar w-full">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-800 text-slate-300 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-2 px-3 font-bold text-xs uppercase tracking-wider text-slate-500">Nome Template</th>
                <th className="py-2 px-2 font-bold text-xs uppercase tracking-wider text-slate-500">Categoria</th>
                <th className="py-2 px-2 font-bold text-center text-xs uppercase tracking-wider text-slate-500">Componenti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">
                    Nessun template trovato.
                  </td>
                </tr>
              ) : (
                paginatedTemplates.map(template => (
                  <tr 
                    key={template.id} 
                    onClick={() => {
                        if (activeAction === 'duplicate') { handleDuplicate(template); setActiveAction(null); }
                        else if (activeAction === 'delete') { setTemplateToDelete(template.id); setActiveAction(null); }
                        else { handleOpenModal(template); }
                    }}
                    className={`hover:bg-slate-800/50 transition-colors group cursor-pointer ${activeAction ? 'bg-emerald-900/10' : ''}`}
                  >
                    <td className="py-2 px-3">
                        <div className="flex items-center gap-3">
                            <div className="hidden sm:flex p-1.5 bg-emerald-900/20 text-emerald-400 rounded shrink-0 ring-1 ring-emerald-500/20">
                                <Blocks size={14} />
                            </div>
                            <div className="font-medium text-white">{template.name}</div>
                        </div>
                        <div className="hidden md:block text-xs text-slate-500 truncate max-w-xs mt-0.5">
                            {template.description || 'Nessuna descrizione.'}
                        </div>
                    </td>
                    <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold border uppercase tracking-wider
                          ${template.category === Category.AUDIO ? 'bg-amber-900/20 text-amber-500 border-amber-900/30' : 
                            template.category === Category.LIGHTS ? 'bg-purple-900/20 text-purple-500 border-purple-900/30' :
                            template.category === Category.VIDEO ? 'bg-blue-900/20 text-blue-500 border-blue-900/30' :
                            template.category === Category.STRUCTURE ? 'bg-slate-700/30 text-slate-400 border-slate-600/30' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {template.category}
                        </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                        <span className="text-slate-300 font-mono text-sm font-bold">{template.items.length}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {filteredTemplates.length > 0 && (
          <div className="bg-slate-800 border-t border-slate-700 p-3 sm:p-4 pb-[calc(12px+env(safe-area-inset-bottom))] flex items-center justify-between">
             <div className="text-sm text-slate-400">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredTemplates.length)} di {filteredTemplates.length} template
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

      <TemplateFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingTemplate}
        inventory={inventory}
        kits={kits}
        title={editingTemplate ? "Modifica Template" : "Nuovo Template"}
      />
      
      <ConfirmationModal
        isOpen={!!templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        onConfirm={confirmDelete}
        title={activeListsWithTemplate.length > 0 ? "⚠️ Template In Uso" : "Elimina Template"}
        message={deleteMessage}
      />
    </div>
  );
};

