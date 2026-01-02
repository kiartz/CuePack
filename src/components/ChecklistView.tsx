import React, { useState } from 'react';
import { CheckSquare, Square, ChevronRight, RotateCcw } from 'lucide-react';
import { PackingList, ChecklistCategory } from '../types';
import { addOrUpdateItem, COLL_LISTS } from '../firebase';

interface ChecklistViewProps {
  activeList: PackingList;
  checklist: ChecklistCategory[];
}

export const ChecklistView: React.FC<ChecklistViewProps> = ({ 
  activeList,
  checklist
}) => {
  // Local state for accordion expansion (independent of enabled state)
  const [expandedSectors, setExpandedSectors] = useState<string[]>([]);

  const enabledSectors = activeList.checklistEnabledSectors || [];
  const checkedItems = activeList.checklistCheckedItems || [];

  const updateList = async (updatedFields: Partial<PackingList>) => {
    const updatedList = { ...activeList, ...updatedFields };
    await addOrUpdateItem(COLL_LISTS, updatedList);
  };

  const toggleExpansion = (sectorId: string) => {
      setExpandedSectors(prev => 
          prev.includes(sectorId) 
              ? prev.filter(id => id !== sectorId) 
              : [...prev, sectorId]
      );
  };

  const toggleEnabled = async (sectorId: string) => {
    let newEnabledSectors: string[];
    if (enabledSectors.includes(sectorId)) {
      newEnabledSectors = enabledSectors.filter(id => id !== sectorId);
    } else {
      newEnabledSectors = [...enabledSectors, sectorId];
      // Auto-expand when enabling for better UX
      if (!expandedSectors.includes(sectorId)) {
          setExpandedSectors(prev => [...prev, sectorId]);
      }
    }
    await updateList({ checklistEnabledSectors: newEnabledSectors });
  };

  const toggleGroup = async (groupId: string) => {
    let newCheckedItems: string[];
    if (checkedItems.includes(groupId)) {
      newCheckedItems = checkedItems.filter(id => id !== groupId);
    } else {
      newCheckedItems = [...checkedItems, groupId];
    }
    await updateList({ checklistCheckedItems: newCheckedItems });
  };

  const resetChecks = async () => {
    if (confirm("Vuoi rimuovere tutte le spunte e disattivare i settori?")) {
      await updateList({ 
          checklistCheckedItems: [],
          checklistEnabledSectors: []
      });
      setExpandedSectors([]);
    }
  };

  const getGroupId = (sectorId: string, groupIdx: number) => {
    return `${sectorId}-${groupIdx}`;
  };

  return (
    <div className="flex flex-col pb-10">
      {(enabledSectors.length > 0 || checkedItems.length > 0) && (
          <div className="px-3 py-2 flex justify-end">
              <button 
                onClick={resetChecks}
                className="text-[10px] text-slate-500 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                  <RotateCcw size={10} /> Reset Tutto
              </button>
          </div>
      )}

      <div className="space-y-1 p-2">
        {checklist.map((sector) => {
          const isEnabled = enabledSectors.includes(sector.id);
          const isExpanded = expandedSectors.includes(sector.id);
          const cleanedTitle = sector.title.replace(/SETTORE\s*/i, '');
          
          const totalGroups = sector.groups.length;
          let checkedGroups = 0;
          
          sector.groups.forEach((_, gIdx) => {
              if (checkedItems.includes(getGroupId(sector.id, gIdx))) {
                  checkedGroups++;
              }
          });
          
          const isComplete = totalGroups > 0 && totalGroups === checkedGroups;

          return (
            <div 
              key={sector.id} 
              className={`rounded-lg border transition-all duration-300 overflow-hidden 
                ${isEnabled 
                    ? isComplete 
                        ? 'bg-emerald-900/30 border-emerald-600/50 shadow-md shadow-emerald-900/10' 
                        : 'bg-slate-900 border-slate-700 shadow-sm'
                    : 'border-transparent opacity-80 hover:opacity-100 hover:bg-slate-900/30'
                }`}
            >
              {/* Sector Header */}
              <div className="w-full flex items-center justify-between p-2.5 gap-2 select-none">
                 {/* Left: Title & Chevron (Controls Expansion Only) */}
                 <div 
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer group/header"
                    onClick={() => toggleExpansion(sector.id)}
                 >
                     <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} ${isComplete && isEnabled ? 'text-emerald-400' : 'text-slate-600 group-hover/header:text-slate-400'}`}>
                         <ChevronRight size={14} />
                     </div>
                     <div className="flex-1 min-w-0">
                         <div className={`text-xs font-bold truncate ${isComplete && isEnabled ? 'text-emerald-100' : isEnabled ? 'text-blue-100' : 'text-slate-400 group-hover/header:text-slate-300'}`}>
                            {cleanedTitle}
                         </div>
                     </div>
                 </div>

                 {/* Right: Toggle Switch & Info (Controls Enabled State Only) */}
                 <div className="flex items-center gap-2 shrink-0">
                     {isEnabled && (
                         <div className={`text-[10px] font-mono mr-1 ${isComplete ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                             {checkedGroups}/{totalGroups}
                         </div>
                     )}
                     
                     <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleEnabled(sector.id);
                        }}
                        className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none 
                            ${isEnabled ? (isComplete ? 'bg-emerald-500' : 'bg-blue-600') : 'bg-slate-700 hover:bg-slate-600'}`}
                        title={isEnabled ? "Disattiva Settore" : "Attiva Settore"}
                     >
                        <span 
                            className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 flex items-center justify-center text-[8px] font-bold text-slate-800
                                ${isEnabled ? 'translate-x-5' : 'translate-x-0'}
                            `}
                        >
                            {isEnabled ? 'SI' : 'NO'}
                        </span>
                     </button>
                 </div>
              </div>

              {/* Sector Content (Shown if Expanded) */}
              {isExpanded && (
                <div className={`border-t p-2 space-y-3 animate-in ${isComplete ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-950/30'}`}>
                  {sector.groups.map((group, groupIdx) => {
                    const groupId = getGroupId(sector.id, groupIdx);
                    const isGroupChecked = checkedItems.includes(groupId);

                    return (
                      <div key={groupId} className={`group/item ${!isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                        {/* Macro Group Header (Interactive Checkbox) */}
                        <div 
                            className={`flex items-center gap-2 cursor-pointer p-1.5 rounded transition-colors select-none
                                ${isGroupChecked 
                                    ? isComplete ? 'hover:bg-emerald-900/40 text-emerald-300' : 'hover:bg-slate-800 text-slate-200'
                                    : 'hover:bg-slate-800 text-slate-300'
                                }`}
                            onClick={() => toggleGroup(groupId)}
                        >
                            <div className={`shrink-0 transition-colors ${isGroupChecked ? 'text-emerald-500' : 'text-slate-500 group-hover/item:text-slate-300'}`}>
                                {isGroupChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                            </div>
                            <h4 className={`text-[11px] font-bold uppercase tracking-wider leading-tight ${isGroupChecked ? 'opacity-80' : ''}`}>
                                {group.title}
                            </h4>
                        </div>

                        {/* List Items (Static Reminders) */}
                        <div className={`pl-7 pr-2 border-l border-slate-800/50 ml-2.5 mt-1 mb-2 ${isGroupChecked ? 'opacity-50 grayscale' : 'opacity-100'}`}>
                            <ul className="space-y-1">
                                {group.items.map((item, itemIdx) => (
                                    <li key={itemIdx} className="flex items-start gap-2 text-[10px] text-slate-400 leading-snug">
                                        <span className="mt-1 w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                      </div>
                    );
                  })}
                  {!isEnabled && (
                      <div className="text-center text-[10px] text-slate-500 italic py-2">
                          Attiva il settore (SI) per spuntare le voci
                      </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};