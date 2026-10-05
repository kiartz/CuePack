import React, { useState, useEffect, useRef } from 'react';
import { 
  CategoryDefinition, 
  getCategoryDefinitions, 
  isSystemCategory,
  isSystemSubcategory,
  deleteCategory,
  deleteSubcategory,
  addCategory,
  addSubcategoryToCategory,
  reorderCategories,
  reorderSubcategories
} from '../utils/categories';
import { Plus, Trash2, Tag, Layers, Check, Lock, GripVertical } from 'lucide-react';

interface CategoryManagerProps {
  onCategoriesUpdated?: () => void;
  className?: string;
}

// Calculate the final insertion index based on source, target and before/after position
const getTargetInsertIndex = (sourceIndex: number, targetIndex: number, position: 'before' | 'after'): number => {
  if (sourceIndex === targetIndex) return sourceIndex;
  if (sourceIndex < targetIndex) {
    return position === 'after' ? targetIndex : targetIndex - 1;
  } else {
    return position === 'before' ? targetIndex : targetIndex + 1;
  }
};

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  onCategoriesUpdated,
  className = ''
}) => {
  const [categories, setCategories] = useState<CategoryDefinition[]>(getCategoryDefinitions());
  const [selectedCatId, setSelectedCatId] = useState<string>(categories[0]?.id || 'Audio');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // Drag and drop state & synchronous refs for Macro Categories
  const [draggedCatIndex, setDraggedCatIndex] = useState<number | null>(null);
  const [catDropTarget, setCatDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  const draggedCatIndexRef = useRef<number | null>(null);
  const catDropTargetRef = useRef<{ index: number; position: 'before' | 'after' } | null>(null);

  // Drag and drop state & synchronous refs for Subcategories
  const [draggedSubIndex, setDraggedSubIndex] = useState<number | null>(null);
  const [subDropTarget, setSubDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  const draggedSubIndexRef = useRef<number | null>(null);
  const subDropTargetRef = useRef<{ index: number; position: 'before' | 'after' } | null>(null);

  // Sync state if categories change elsewhere
  useEffect(() => {
    const handleCategoriesUpdated = (e: any) => {
      const updated = e?.detail || getCategoryDefinitions();
      setCategories(updated);
    };
    window.addEventListener('cuepack_categories_updated', handleCategoriesUpdated);
    return () => window.removeEventListener('cuepack_categories_updated', handleCategoriesUpdated);
  }, []);

  const activeCategory = categories.find(c => c.id === selectedCatId) || categories[0];

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Questa categoria esiste già!');
      return;
    }
    const updated = addCategory(trimmed, ['Generale']);
    setCategories(updated);
    setSelectedCatId(trimmed);
    setNewCategoryName('');
    setIsAddingCategory(false);
    onCategoriesUpdated?.();
  };

  const handleDeleteCategory = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    if (isSystemCategory(cat.name)) {
      alert('Le categorie principali di sistema non possono essere eliminate.');
      return;
    }
    const updated = deleteCategory(catId);
    setCategories(updated);
    if (selectedCatId === catId) {
      setSelectedCatId(updated[0]?.id || 'Audio');
    }
    onCategoriesUpdated?.();
  };

  // --- Category Drag & Drop ---
  const handleCatDragStart = (e: React.DragEvent, index: number) => {
    draggedCatIndexRef.current = index;
    setDraggedCatIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleCatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const sourceIdx = draggedCatIndexRef.current;
    if (sourceIdx === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const isBelow = (e.clientY - rect.top) > (rect.height / 2);
    const position: 'before' | 'after' = isBelow ? 'after' : 'before';

    const targetObj: { index: number; position: 'before' | 'after' } = { index, position };
    catDropTargetRef.current = targetObj;

    const finalTarget = getTargetInsertIndex(sourceIdx, index, position);
    if (finalTarget !== sourceIdx) {
      setCatDropTarget(targetObj);
    } else {
      setCatDropTarget(null);
    }
  };

  const handleCatDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceIdx = draggedCatIndexRef.current;
    if (sourceIdx === null) {
      setDraggedCatIndex(null);
      setCatDropTarget(null);
      return;
    }

    let finalTargetIndex: number;
    if (targetIndex !== undefined) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isBelow = (e.clientY - rect.top) > (rect.height / 2);
      const position: 'before' | 'after' = isBelow ? 'after' : 'before';
      finalTargetIndex = getTargetInsertIndex(sourceIdx, targetIndex, position);
    } else if (catDropTargetRef.current) {
      finalTargetIndex = getTargetInsertIndex(
        sourceIdx, 
        catDropTargetRef.current.index, 
        catDropTargetRef.current.position
      );
    } else {
      finalTargetIndex = categories.length - 1;
    }

    if (sourceIdx !== finalTargetIndex && finalTargetIndex >= 0 && finalTargetIndex < categories.length) {
      const updated = reorderCategories(sourceIdx, finalTargetIndex);
      setCategories(updated);
      onCategoriesUpdated?.();
    }

    draggedCatIndexRef.current = null;
    catDropTargetRef.current = null;
    setDraggedCatIndex(null);
    setCatDropTarget(null);
  };

  const handleCatDragEnd = () => {
    draggedCatIndexRef.current = null;
    catDropTargetRef.current = null;
    setDraggedCatIndex(null);
    setCatDropTarget(null);
  };

  // --- Subcategory Handlers ---
  const handleAddSubcategory = () => {
    const trimmed = newSubcategoryName.trim();
    if (!trimmed || !activeCategory) return;
    if (activeCategory.subcategories.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      alert('Questa sottocategoria esiste già!');
      return;
    }
    const updated = addSubcategoryToCategory(activeCategory.name, trimmed);
    setCategories(updated);
    setNewSubcategoryName('');
    onCategoriesUpdated?.();
  };

  const handleDeleteSubcategory = (subcat: string) => {
    if (!activeCategory) return;
    if (isSystemSubcategory(activeCategory.name, subcat)) {
      alert('Le sottocategorie principali di sistema non possono essere eliminate.');
      return;
    }
    const updated = deleteSubcategory(activeCategory.name, subcat);
    setCategories(updated);
    onCategoriesUpdated?.();
  };

  // --- Subcategory Drag & Drop ---
  const handleSubDragStart = (e: React.DragEvent, index: number) => {
    draggedSubIndexRef.current = index;
    setDraggedSubIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleSubDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const sourceIdx = draggedSubIndexRef.current;
    if (sourceIdx === null || !activeCategory) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const isBelow = (e.clientY - rect.top) > (rect.height / 2);
    const position: 'before' | 'after' = isBelow ? 'after' : 'before';

    const targetObj: { index: number; position: 'before' | 'after' } = { index, position };
    subDropTargetRef.current = targetObj;

    const finalTarget = getTargetInsertIndex(sourceIdx, index, position);
    if (finalTarget !== sourceIdx) {
      setSubDropTarget(targetObj);
    } else {
      setSubDropTarget(null);
    }
  };

  const handleSubDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceIdx = draggedSubIndexRef.current;
    if (sourceIdx === null || !activeCategory) {
      setDraggedSubIndex(null);
      setSubDropTarget(null);
      return;
    }

    let finalTargetIndex: number;
    if (targetIndex !== undefined) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isBelow = (e.clientY - rect.top) > (rect.height / 2);
      const position: 'before' | 'after' = isBelow ? 'after' : 'before';
      finalTargetIndex = getTargetInsertIndex(sourceIdx, targetIndex, position);
    } else if (subDropTargetRef.current) {
      finalTargetIndex = getTargetInsertIndex(
        sourceIdx, 
        subDropTargetRef.current.index, 
        subDropTargetRef.current.position
      );
    } else {
      finalTargetIndex = activeCategory.subcategories.length - 1;
    }

    if (sourceIdx !== finalTargetIndex && finalTargetIndex >= 0 && finalTargetIndex < activeCategory.subcategories.length) {
      const updated = reorderSubcategories(activeCategory.name, sourceIdx, finalTargetIndex);
      setCategories(updated);
      onCategoriesUpdated?.();
    }

    draggedSubIndexRef.current = null;
    subDropTargetRef.current = null;
    setDraggedSubIndex(null);
    setSubDropTarget(null);
  };

  const handleSubDragEnd = () => {
    draggedSubIndexRef.current = null;
    subDropTargetRef.current = null;
    setDraggedSubIndex(null);
    setSubDropTarget(null);
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-12 gap-4 ${className}`}>
      
      {/* LEFT: Macro Categorie List (5 cols) */}
      <div className="md:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col h-[380px]">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={14} className="text-blue-400" />
            Macro Categorie ({categories.length})
          </span>
          <button
            type="button"
            onClick={() => setIsAddingCategory(!isAddingCategory)}
            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
            title="Aggiungi nuova macro categoria"
          >
            <Plus size={13} />
            {isAddingCategory ? 'Annulla' : '+ Nuova'}
          </button>
        </div>

        {isAddingCategory && (
          <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-slate-900 rounded-lg border border-slate-700 animate-fadeIn">
            <input
              type="text"
              placeholder="Nome nuova categoria..."
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              className="bg-slate-950 text-white text-xs px-2.5 py-1.5 rounded flex-1 outline-none border border-slate-700 focus:border-blue-500"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors"
              title="Conferma creazione"
            >
              <Check size={14} />
            </button>
          </div>
        )}

        <div 
          className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 py-1"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => handleCatDrop(e)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setCatDropTarget(null);
              catDropTargetRef.current = null;
            }
          }}
        >
          {categories.map((cat, idx) => {
            const isSelected = cat.id === activeCategory?.id;
            const isSys = isSystemCategory(cat.name);
            const isBeingDragged = draggedCatIndex === idx;

            return (
              <div
                key={cat.id}
                className="relative"
                onDragOver={(e) => handleCatDragOver(e, idx)}
                onDrop={(e) => handleCatDrop(e, idx)}
              >
                {/* Visual Highlight Line: Target position is BEFORE this item */}
                {catDropTarget?.index === idx && catDropTarget.position === 'before' && (
                  <div className="absolute -top-1 left-0 right-0 h-[3px] bg-blue-400 rounded-full shadow-[0_0_10px_#60a5fa] ring-1 ring-blue-300 z-30 pointer-events-none" />
                )}

                <div
                  draggable
                  onDragStart={(e) => handleCatDragStart(e, idx)}
                  onDragEnd={handleCatDragEnd}
                  onClick={() => setSelectedCatId(cat.id)}
                  className={`w-full px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-grab active:cursor-grabbing select-none group ${
                    isBeingDragged
                      ? 'opacity-30 border border-dashed border-blue-400 bg-slate-900/60'
                      : isSelected
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  {/* Grip Handle + Category Name + System Lock Indicator */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1 pointer-events-none select-none">
                    <GripVertical 
                      size={13} 
                      className={`shrink-0 transition-colors ${
                        isSelected 
                          ? 'text-blue-200 hover:text-white' 
                          : 'text-slate-600 group-hover:text-slate-400'
                      }`} 
                    />
                    {isSys && (
                      <span title="Categoria di base (bloccata, trascina per ordinare)">
                        <Lock 
                          size={11} 
                          className={`${isSelected ? 'text-blue-200' : 'text-slate-500'} shrink-0`} 
                        />
                      </span>
                    )}
                    <span className="truncate">{cat.name}</span>
                  </div>

                  {/* Counter & Action Controls (Delete) */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {cat.subcategories.length}
                    </span>

                    {/* Delete (only custom categories) */}
                    {!isSys && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Eliminare la categoria "${cat.name}" e tutte le sue sottocategorie?`)) {
                            handleDeleteCategory(cat.id);
                          }
                        }}
                        className={`p-1 rounded transition-colors ${
                          isSelected 
                            ? 'text-blue-200 hover:text-white hover:bg-blue-700' 
                            : 'text-slate-500 hover:text-rose-400 hover:bg-rose-950/40'
                        }`}
                        title="Elimina categoria personalizzata"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Visual Highlight Line: Target position is AFTER this item */}
                {catDropTarget?.index === idx && catDropTarget.position === 'after' && (
                  <div className="absolute -bottom-1 left-0 right-0 h-[3px] bg-blue-400 rounded-full shadow-[0_0_10px_#60a5fa] ring-1 ring-blue-300 z-30 pointer-events-none" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Subcategories List (7 cols) */}
      <div className="md:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col h-[380px]">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
            <Tag size={14} className="text-emerald-400 shrink-0" />
            Sottocategorie di <span className="text-white font-bold truncate">{activeCategory?.name}</span>
          </span>
          <span className="text-xs text-slate-500 font-mono shrink-0">
            {activeCategory?.subcategories.length || 0} elementi
          </span>
        </div>

        {/* Add Subcategory Input */}
        <div className="flex items-center gap-2 mb-2.5">
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
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shrink-0"
          >
            <Plus size={14} />
            Aggiungi
          </button>
        </div>

        {/* Subcategories Scrollable List */}
        <div 
          className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 py-1"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => handleSubDrop(e)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setSubDropTarget(null);
              subDropTargetRef.current = null;
            }
          }}
        >
          {(!activeCategory?.subcategories || activeCategory.subcategories.length === 0) ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Nessuna sottocategoria configurata per questa macro-categoria.
            </div>
          ) : (
            activeCategory.subcategories.map((sub, sIdx) => {
              const isSubSys = isSystemSubcategory(activeCategory.name, sub);
              const isBeingDragged = draggedSubIndex === sIdx;

              return (
                <div
                  key={sub}
                  className="relative"
                  onDragOver={(e) => handleSubDragOver(e, sIdx)}
                  onDrop={(e) => handleSubDrop(e, sIdx)}
                >
                  {/* Visual Highlight Line: Target position is BEFORE this item */}
                  {subDropTarget?.index === sIdx && subDropTarget.position === 'before' && (
                    <div className="absolute -top-1 left-0 right-0 h-[3px] bg-emerald-400 rounded-full shadow-[0_0_10px_#34d399] ring-1 ring-emerald-300 z-30 pointer-events-none" />
                  )}

                  <div
                    draggable
                    onDragStart={(e) => handleSubDragStart(e, sIdx)}
                    onDragEnd={handleSubDragEnd}
                    className={`flex items-center justify-between p-2 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-lg transition-colors group cursor-grab active:cursor-grabbing select-none ${
                      isBeingDragged
                        ? 'opacity-30 border border-dashed border-emerald-400 bg-slate-900/60'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 pr-1 pointer-events-none select-none">
                      <GripVertical size={13} className="text-slate-600 group-hover:text-slate-400 shrink-0" />
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0"></div>
                      <span className="text-xs font-medium text-slate-200 truncate">{sub}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {/* System lock indicator */}
                      {isSubSys && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800" title="Sottocategoria di base (bloccata, trascina per ordinare)">
                          <Lock size={10} className="text-slate-500" />
                          Base
                        </span>
                      )}

                      {/* Delete (only custom subcategories) */}
                      {!isSubSys && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSubcategory(sub)}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                          title="Rimuovi sottocategoria personalizzata"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Visual Highlight Line: Target position is AFTER this item */}
                  {subDropTarget?.index === sIdx && subDropTarget.position === 'after' && (
                    <div className="absolute -bottom-1 left-0 right-0 h-[3px] bg-emerald-400 rounded-full shadow-[0_0_10px_#34d399] ring-1 ring-emerald-300 z-30 pointer-events-none" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};
