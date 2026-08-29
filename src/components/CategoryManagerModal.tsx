import React, { useState } from 'react';
import { Modal } from './Modal';
import { 
  CategoryDefinition, 
  getCategoryDefinitions, 
  saveCategoryDefinitions 
} from '../utils/categories';
import { Plus, Trash2, FolderPlus, Tag, Layers, Check, Edit2 } from 'lucide-react';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesUpdated?: () => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  onCategoriesUpdated
}) => {
  const [categories, setCategories] = useState<CategoryDefinition[]>(getCategoryDefinitions());
  const [selectedCatId, setSelectedCatId] = useState<string>(categories[0]?.id || 'Audio');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  const activeCategory = categories.find(c => c.id === selectedCatId) || categories[0];

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Questa categoria esiste già!');
      return;
    }
    const newCat: CategoryDefinition = {
      id: trimmed,
      name: trimmed,
      subcategories: []
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    saveCategoryDefinitions(updated);
    setSelectedCatId(newCat.id);
    setNewCategoryName('');
    setIsAddingCategory(false);
    onCategoriesUpdated?.();
  };

  const handleAddSubcategory = () => {
    const trimmed = newSubcategoryName.trim();
    if (!trimmed || !activeCategory) return;
    if (activeCategory.subcategories.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      alert('Questa sottocategoria esiste già!');
      return;
    }
    const updated = categories.map(c => {
      if (c.id === activeCategory.id) {
        return {
          ...c,
          subcategories: [...c.subcategories, trimmed].sort((a, b) => a.localeCompare(b))
        };
      }
      return c;
    });
    setCategories(updated);
    saveCategoryDefinitions(updated);
    setNewSubcategoryName('');
    onCategoriesUpdated?.();
  };

  const handleDeleteSubcategory = (subcat: string) => {
    if (!activeCategory) return;
    const updated = categories.map(c => {
      if (c.id === activeCategory.id) {
        return {
          ...c,
          subcategories: c.subcategories.filter(s => s !== subcat)
        };
      }
      return c;
    });
    setCategories(updated);
    saveCategoryDefinitions(updated);
    onCategoriesUpdated?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestione Categorie & Sottocategorie" size="lg">
      <div className="space-y-4">
        <p className="text-xs text-slate-400">
          Personalizza l'albero delle categorie per organizzare e filtrare il materiale in modo rapido e preciso.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-96">
          {/* LEFT: Categories List */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-blue-400" />
                Categorie ({categories.length})
              </span>
              <button
                type="button"
                onClick={() => setIsAddingCategory(!isAddingCategory)}
                className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                title="Nuova Categoria"
              >
                <Plus size={16} />
              </button>
            </div>

            {isAddingCategory && (
              <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-slate-900 rounded-lg border border-slate-700">
                <input
                  type="text"
                  placeholder="Nome categoria..."
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  className="bg-slate-950 text-white text-xs px-2 py-1.5 rounded flex-1 outline-none border border-slate-700"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold"
                >
                  <Check size={14} />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              {categories.map(cat => {
                const isSelected = cat.id === activeCategory?.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCatId(cat.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {cat.subcategories.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Subcategories List */}
          <div className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Tag size={14} className="text-emerald-400" />
                Sottocategorie di <span className="text-white font-bold">{activeCategory?.name}</span>
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {activeCategory?.subcategories.length || 0} elementi
              </span>
            </div>

            {/* Add Subcategory Input */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder={`Aggiungi sottocategoria a ${activeCategory?.name || ''}...`}
                value={newSubcategoryName}
                onChange={e => setNewSubcategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSubcategory()}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddSubcategory}
                disabled={!newSubcategoryName.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Plus size={14} />
                Aggiungi
              </button>
            </div>

            {/* Subcategories Scrollable List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
              {(!activeCategory?.subcategories || activeCategory.subcategories.length === 0) ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Nessuna sottocategoria configurata per questa macro-categoria.
                </div>
              ) : (
                activeCategory.subcategories.map(sub => (
                  <div
                    key={sub}
                    className="flex items-center justify-between p-2 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0"></div>
                      <span className="text-xs font-medium text-slate-200 truncate">{sub}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSubcategory(sub)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-all"
                      title="Rimuovi sottocategoria"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Chiudi & Applica
          </button>
        </div>
      </div>
    </Modal>
  );
};
