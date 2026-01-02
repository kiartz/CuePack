import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Edit2, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { ChecklistCategory, ChecklistGroup } from '../types';
import { addOrUpdateItem, COLL_CHECKLIST_CONFIG } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface ChecklistManagerProps {
  checklist: ChecklistCategory[];
  onBack: () => void;
}

export const ChecklistManager: React.FC<ChecklistManagerProps> = ({ checklist, onBack }) => {
  const [localChecklist, setLocalChecklist] = useState<ChecklistCategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Deep copy to avoid mutating props directly
    setLocalChecklist(JSON.parse(JSON.stringify(checklist)));
    setHasChanges(false);
  }, [checklist]);

  const saveChecklist = async () => {
    try {
      // Save to checklist_config/master
      // We wrap it in an object as the document structure
      await setDoc(doc(db, COLL_CHECKLIST_CONFIG, 'master'), { categories: localChecklist });
      setHasChanges(false);
      alert('Checklist salvata con successo!');
    } catch (error) {
      console.error("Error saving checklist:", error);
      alert('Errore durante il salvataggio.');
    }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedCategories(newSet);
  };

  // --- CRUD OPERATIONS ---

  const addCategory = () => {
    const newCat: ChecklistCategory = {
      id: crypto.randomUUID(),
      title: 'Nuovo Settore',
      subtitle: 'Descrizione settore',
      groups: []
    };
    setLocalChecklist([...localChecklist, newCat]);
    setHasChanges(true);
    setExpandedCategories(new Set(expandedCategories).add(newCat.id));
  };

  const updateCategory = (id: string, updates: Partial<ChecklistCategory>) => {
    setLocalChecklist(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    setHasChanges(true);
  };

  const deleteCategory = (id: string) => {
    if (!confirm('Eliminare questo settore e tutto il suo contenuto?')) return;
    setLocalChecklist(prev => prev.filter(c => c.id !== id));
    setHasChanges(true);
  };

  const addGroup = (catId: string) => {
    const newGroup: ChecklistGroup = {
      title: 'Nuovo Gruppo',
      items: []
    };
    setLocalChecklist(prev => prev.map(c => {
      if (c.id === catId) {
        return { ...c, groups: [...c.groups, newGroup] };
      }
      return c;
    }));
    setHasChanges(true);
  };

  const updateGroup = (catId: string, groupIdx: number, updates: Partial<ChecklistGroup>) => {
    setLocalChecklist(prev => prev.map(c => {
      if (c.id === catId) {
        const newGroups = [...c.groups];
        newGroups[groupIdx] = { ...newGroups[groupIdx], ...updates };
        return { ...c, groups: newGroups };
      }
      return c;
    }));
    setHasChanges(true);
  };

  const deleteGroup = (catId: string, groupIdx: number) => {
    if (!confirm('Eliminare questo gruppo?')) return;
    setLocalChecklist(prev => prev.map(c => {
      if (c.id === catId) {
        return { ...c, groups: c.groups.filter((_, idx) => idx !== groupIdx) };
      }
      return c;
    }));
    setHasChanges(true);
  };

  const addItem = (catId: string, groupIdx: number) => {
    setLocalChecklist(prev => prev.map(c => {
      if (c.id === catId) {
        const newGroups = [...c.groups];
        newGroups[groupIdx] = { 
          ...newGroups[groupIdx], 
          items: [...newGroups[groupIdx].items, 'Nuova voce'] 
        };
        return { ...c, groups: newGroups };
      }
      return c;
    }));
    setHasChanges(true);
  };

  const updateItem = (catId: string, groupIdx: number, itemIdx: number, text: string) => {
    setLocalChecklist(prev => prev.map(c => {
      if (c.id === catId) {
        const newGroups = [...c.groups];
        const newItems = [...newGroups[groupIdx].items];
        newItems[itemIdx] = text;
        newGroups[groupIdx] = { ...newGroups[groupIdx], items: newItems };
        return { ...c, groups: newGroups };
      }
      return c;
    }));
    setHasChanges(true);
  };

  const deleteItem = (catId: string, groupIdx: number, itemIdx: number) => {
    setLocalChecklist(prev => prev.map(c => {
      if (c.id === catId) {
        const newGroups = [...c.groups];
        const newItems = newGroups[groupIdx].items.filter((_, idx) => idx !== itemIdx);
        newGroups[groupIdx] = { ...newGroups[groupIdx], items: newItems };
        return { ...c, groups: newGroups };
      }
      return c;
    }));
    setHasChanges(true);
  };


  return (
    <div className="h-full flex flex-col p-6 bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Gestione Checklist</h1>
            <p className="text-slate-400">Modifica la struttura della checklist globale</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={addCategory}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus size={18} /> Nuovo Settore
          </button>
          <button 
            onClick={saveChecklist}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-colors ${hasChanges ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            <Save size={18} /> Salva Modifiche
          </button>
        </div>
      </div>

      {/* Main Content - Scrollable List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pb-20">
        {localChecklist.map((category) => {
          const isExpanded = expandedCategories.has(category.id);

          return (
            <div key={category.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              {/* Category Header */}
              <div className="p-4 flex items-start gap-4 bg-slate-900 border-b border-slate-800/50">
                <button onClick={() => toggleExpand(category.id)} className="mt-1 text-slate-500 hover:text-white transition-colors">
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
                
                <div className="flex-1 space-y-2">
                   <div className="flex gap-2">
                     <input 
                        className="bg-transparent text-lg font-bold text-white border-b border-transparent focus:border-blue-500 outline-none w-full"
                        value={category.title}
                        onChange={(e) => updateCategory(category.id, { title: e.target.value })}
                        placeholder="Titolo Settore"
                     />
                   </div>
                   <input 
                      className="bg-transparent text-sm text-slate-500 border-b border-transparent focus:border-slate-600 outline-none w-full"
                      value={category.subtitle}
                      onChange={(e) => updateCategory(category.id, { subtitle: e.target.value })}
                      placeholder="Sottotitolo / Descrizione"
                   />
                </div>

                <button onClick={() => deleteCategory(category.id)} className="p-2 text-slate-600 hover:text-rose-500 hover:bg-slate-800 rounded transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Groups & Items */}
              {isExpanded && (
                <div className="p-4 bg-slate-950/30 space-y-6">
                  {category.groups.map((group, groupIdx) => (
                    <div key={groupIdx} className="pl-4 border-l-2 border-slate-800">
                      {/* Group Header */}
                      <div className="flex justify-between items-center mb-2 group/header">
                        <input 
                            className="bg-transparent text-sm font-bold uppercase tracking-wider text-blue-400 border-b border-transparent focus:border-blue-500 outline-none flex-1"
                            value={group.title}
                            onChange={(e) => updateGroup(category.id, groupIdx, { title: e.target.value })}
                            placeholder="NOME GRUPPO"
                        />
                        <button onClick={() => deleteGroup(category.id, groupIdx)} className="opacity-0 group-hover/header:opacity-100 p-1 text-slate-600 hover:text-rose-500 transition-all">
                            <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Items List */}
                      <div className="space-y-2">
                        {group.items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex items-center gap-2 group/item">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0"></span>
                            <input 
                                className="bg-transparent text-sm text-slate-300 border-b border-transparent focus:border-slate-600 outline-none flex-1"
                                value={item}
                                onChange={(e) => updateItem(category.id, groupIdx, itemIdx, e.target.value)}
                            />
                            <button onClick={() => deleteItem(category.id, groupIdx, itemIdx)} className="opacity-0 group-hover/item:opacity-100 text-slate-600 hover:text-rose-500 p-1">
                                <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button 
                            onClick={() => addItem(category.id, groupIdx)}
                            className="text-xs text-emerald-600 hover:text-emerald-400 flex items-center gap-1 mt-2 font-medium"
                        >
                            <Plus size={12} /> Aggiungi Voce
                        </button>
                      </div>
                    </div>
                  ))}

                  <button 
                    onClick={() => addGroup(category.id)}
                    className="w-full py-2 border-2 border-dashed border-slate-800 rounded-lg text-slate-500 hover:text-blue-400 hover:border-blue-500/50 hover:bg-slate-900 transition-all text-sm font-medium flex justify-center items-center gap-2"
                  >
                    <Plus size={16} /> Nuovo Gruppo
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
