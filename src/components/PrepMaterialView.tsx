import React, { useState, useMemo } from 'react';
import { Search, MapPin, Calendar, ArrowLeft, Truck, CheckSquare, Square, MessageSquare, AlertTriangle, ChevronRight, AlertOctagon, X, Save, AlertCircle, LayoutList, Layers } from 'lucide-react';
import { PackingList, ListComponent, WarehouseState, ListZone, ListSection } from '../types';
import { addOrUpdateItem, COLL_LISTS } from '../firebase';
import { Modal } from './Modal';

interface PrepMaterialViewProps {
  lists: PackingList[];
}

export const PrepMaterialView: React.FC<PrepMaterialViewProps> = ({ lists }) => {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Detail View State
  const [activeZoneId, setActiveZoneId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'zones' | 'totals'>('zones');
  
  // Highlight State (Totals View)
  const [highlightedItemName, setHighlightedItemName] = useState<string | null>(null);

  // Note Modal State
  const [noteModal, setNoteModal] = useState<{ isOpen: boolean, targets: { uniqueId?: string, parentId?: string, childIdx?: number }[], text: string }>({
      isOpen: false, targets: [], text: ''
  });

  // Broken/Issue Modal State
  const [brokenModal, setBrokenModal] = useState<{ isOpen: boolean, targets: { uniqueId?: string, parentId?: string, childIdx?: number }[], text: string }>({
      isOpen: false, targets: [], text: ''
  });

  // Issues Summary Modal
  const [issuesModalList, setIssuesModalList] = useState<PackingList | null>(null);

  const activeList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);
  
  // --- HELPERS ---

  const getIssues = (list: PackingList) => {
      const issues: { component: ListComponent, zoneName: string, sectionName: string }[] = [];
      if (!list.zones) return issues;
      
      list.zones.forEach(z => {
          z.sections.forEach(s => {
              s.components.forEach(c => {
                  if (c.warehouseState?.isBroken || c.warehouseState?.warehouseNote) {
                      issues.push({ component: c, zoneName: z.name, sectionName: s.name });
                  }
                  // Check contents for kits
                  if (c.contents) {
                      c.contents.forEach(sub => {
                          if (sub.warehouseState?.isBroken || sub.warehouseState?.warehouseNote) {
                              issues.push({ component: { ...c, name: `${c.name} > ${sub.name}` }, zoneName: z.name, sectionName: s.name });
                          }
                      });
                  }
              });
          });
      });
      return issues;
  };

  const isComponentUnresolved = (c: ListComponent) => {
      const ws = c.warehouseState;
      // If no change log, it's not "unresolved" in the context of "Modified Warning"
      if (!ws?.changeLog) return false;

      // Check main component (only if not a kit, as kits don't have main checkboxes anymore)
      const mainUnresolved = c.type !== 'kit' && !(ws.inDistinta && ws.loaded);
      
      // Check contents
      let contentsUnresolved = false;
      if (c.contents && c.contents.length > 0) {
          contentsUnresolved = !c.contents.every(sub => 
              sub.warehouseState?.inDistinta && sub.warehouseState?.loaded
          );
      }

      return mainUnresolved || contentsUnresolved;
  };

  const filteredLists = useMemo(() => {
    return lists
      .filter(l => !!l.version) // Only show completed lists (those with a version)
      .filter(l => l.eventName.toLowerCase().includes(searchTerm.toLowerCase()) || l.location.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [lists, searchTerm]);
  
  // --- AGGREGATION LOGIC FOR TOTALS VIEW ---
  const aggregatedData = useMemo(() => {
      if (!activeList || !activeList.zones) return null;
      
      const zoneMap = new Map<string, {
          complex: Map<string, any>,
          simple: Map<string, any>
      }>();

      activeList.zones.forEach(zone => {
          // Complex: Kits & Assemblies within this zone
          const complexItems = new Map<string, {
              name: string,
              totalQty: number,
              inDistintaQty: number,
              loadedQty: number,
              returnedQty: number,
              hasNote: boolean,
              hasIssue: boolean,
              instances: { uniqueId: string, note?: string, isBroken?: boolean }[],
              children: Map<string, { 
                  name: string,
                  totalQty: number, 
                  inDistintaQty: number,
                  loadedQty: number,
                  returnedQty: number,
                  hasNote: boolean,
                  hasIssue: boolean,
                  instances: { parentId: string, childIdx: number, note?: string, isBroken?: boolean }[]
              }>
          }>();

          // Simple: Loose Items within this zone
          const simpleItems = new Map<string, {
              name: string,
              totalQty: number,
              inDistintaQty: number,
              loadedQty: number,
              returnedQty: number,
              hasNote: boolean,
              hasIssue: boolean,
              instances: { uniqueId: string, note?: string, isBroken?: boolean }[]
          }>();

          zone.sections.forEach(section => {
              section.components.forEach(comp => {
                  const ws = comp.warehouseState || { inDistinta: false, loaded: false, returned: false };
                  const isComplex = comp.type === 'kit' || (comp.contents && comp.contents.length > 0);

                  if (isComplex) {
                      const displayName = comp.type === 'kit' ? `KIT-${comp.name}` : comp.name;
                      if (!complexItems.has(displayName)) {
                          complexItems.set(displayName, { 
                              name: comp.name,
                              totalQty: 0, inDistintaQty: 0, loadedQty: 0, returnedQty: 0, 
                              hasNote: false, hasIssue: false,
                              instances: [], children: new Map() 
                          });
                      }
                      const parent = complexItems.get(displayName)!;
                      parent.totalQty += comp.quantity;
                      if (comp.type !== 'kit') {
                          if (ws.inDistinta) parent.inDistintaQty += comp.quantity;
                          if (ws.loaded) parent.loadedQty += comp.quantity;
                          if (ws.returned) parent.returnedQty += comp.quantity;
                      }
                      if (ws.warehouseNote) parent.hasNote = true;
                      if (ws.isBroken) parent.hasIssue = true;
                      parent.instances.push({ uniqueId: comp.uniqueId, note: ws.warehouseNote, isBroken: ws.isBroken });

                      comp.contents?.forEach((sub, subIdx) => {
                          const subWs = sub.warehouseState || { inDistinta: false, loaded: false, returned: false };
                          if (!parent.children.has(sub.name)) {
                              parent.children.set(sub.name, { 
                                  name: sub.name,
                                  totalQty: 0, inDistintaQty: 0, loadedQty: 0, returnedQty: 0, 
                                  hasNote: false, hasIssue: false,
                                  instances: [] 
                              });
                          }
                          const child = parent.children.get(sub.name)!;
                          const q = sub.quantity * comp.quantity;
                          child.totalQty += q;
                          if (subWs.inDistinta) child.inDistintaQty += q;
                          if (subWs.loaded) child.loadedQty += q;
                          if (subWs.returned) child.returnedQty += q;
                          if (subWs.warehouseNote) child.hasNote = true;
                          if (subWs.isBroken) child.hasIssue = true;
                          child.instances.push({ parentId: comp.uniqueId, childIdx: subIdx, note: subWs.warehouseNote, isBroken: subWs.isBroken });
                      });

                  } else {
                      if (!simpleItems.has(comp.name)) {
                          simpleItems.set(comp.name, { 
                              name: comp.name,
                              totalQty: 0, inDistintaQty: 0, loadedQty: 0, returnedQty: 0, 
                              hasNote: false, hasIssue: false,
                              instances: [] 
                          });
                      }
                      const item = simpleItems.get(comp.name)!;
                      item.totalQty += comp.quantity;
                      if (ws.inDistinta) item.inDistintaQty += comp.quantity;
                      if (ws.loaded) item.loadedQty += comp.quantity;
                      if (ws.returned) item.returnedQty += comp.quantity;
                      if (ws.warehouseNote) item.hasNote = true;
                      if (ws.isBroken) item.hasIssue = true;
                      item.instances.push({ uniqueId: comp.uniqueId, note: ws.warehouseNote, isBroken: ws.isBroken });
                  }
              });
          });
          
          zoneMap.set(zone.id, { complex: complexItems, simple: simpleItems });
      });

      return zoneMap;
  }, [activeList]);

  // Calculate Stats for Highlighted Item in Active Zone (Depends on aggregatedData)
  const highlightStats = useMemo(() => {
      if (!highlightedItemName || !activeZoneId || !aggregatedData) return null;
      const zoneData = aggregatedData.get(activeZoneId);
      if (!zoneData) return null;

      let stats = { kit: 0, accessories: 0, loose: 0 };

      // 1. Check Simple (Loose)
      if (zoneData.simple.has(highlightedItemName)) {
          stats.loose += zoneData.simple.get(highlightedItemName).totalQty;
      }

      // 2. Check Complex (Kits & Machines)
      zoneData.complex.forEach((data, key) => {
          const isKitWrapper = key.startsWith('KIT-');

          // Check Parent
          if (data.name === highlightedItemName) {
              if (isKitWrapper) stats.kit += data.totalQty;
              else stats.loose += data.totalQty; // Machines count as main/loose items
          }

          // Check Children
          if (data.children.has(highlightedItemName)) {
              const qty = data.children.get(highlightedItemName).totalQty;
              if (isKitWrapper) stats.kit += qty;
              else stats.accessories += qty;
          }
      });

      return stats;
  }, [highlightedItemName, activeZoneId, aggregatedData]);


  // --- ACTIONS ---
  
  const updateComponentState = async (componentId: string, updates: Partial<WarehouseState>) => {
      if (!activeList || !activeList.zones) return;

      const newZones = activeList.zones.map(z => ({
          ...z,
          sections: z.sections.map(s => ({
              ...s,
              components: s.components.map(c => {
                  if (c.uniqueId === componentId) {
                      return {
                          ...c,
                          warehouseState: {
                              ...c.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                              ...updates
                          }
                      };
                  }
                  return c;
              })
          }))
      }));

      await addOrUpdateItem(COLL_LISTS, { ...activeList, zones: newZones });
  };

  const updateContentState = async (componentId: string, contentIdx: number, updates: Partial<WarehouseState>) => {
      if (!activeList || !activeList.zones) return;

      const newZones = activeList.zones.map(z => ({
          ...z,
          sections: z.sections.map(s => ({
              ...s,
              components: s.components.map(c => {
                  if (c.uniqueId === componentId && c.contents) {
                      const newContents = [...c.contents];
                      const currentContent = newContents[contentIdx];
                      newContents[contentIdx] = {
                          ...currentContent,
                          warehouseState: {
                              ...currentContent.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                              ...updates
                          }
                      };
                      return { ...c, contents: newContents };
                  }
                  return c;
              })
          }))
      }));

      await addOrUpdateItem(COLL_LISTS, { ...activeList, zones: newZones });
  };

  const handleBatchUpdate = async (
      targets: { uniqueId?: string, parentId?: string, childIdx?: number }[], 
      updates: Partial<WarehouseState>
  ) => {
      if (!activeList || !activeList.zones) return;

      const newZones = activeList.zones.map(z => ({
          ...z,
          sections: z.sections.map(s => ({
              ...s,
              components: s.components.map(c => {
                  // Check if this component is a direct target
                  const isDirectTarget = targets.some(t => t.uniqueId === c.uniqueId);
                  
                  // Check if any children are targets
                  let newContents = c.contents;
                  if (c.contents) {
                      const childTargets = targets.filter(t => t.parentId === c.uniqueId);
                      if (childTargets.length > 0) {
                          newContents = c.contents.map((sub, idx) => {
                              if (childTargets.some(t => t.childIdx === idx)) {
                                  return {
                                      ...sub,
                                      warehouseState: {
                                          ...sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                                          ...updates
                                      }
                                  };
                              }
                              return sub;
                          });
                      }
                  }

                  if (isDirectTarget) {
                      return {
                          ...c,
                          contents: newContents,
                          warehouseState: {
                              ...c.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' },
                              ...updates
                          }
                      };
                  } else if (newContents !== c.contents) {
                      return { ...c, contents: newContents };
                  }
                  
                  return c;
              })
          }))
      }));

      await addOrUpdateItem(COLL_LISTS, { ...activeList, zones: newZones });
  };

  const saveNote = () => {
      if (noteModal.targets.length > 0) {
          handleBatchUpdate(noteModal.targets, { warehouseNote: noteModal.text });
          setNoteModal({ isOpen: false, targets: [], text: '' });
      }
  };

  const saveBrokenReport = () => {
      if (brokenModal.targets.length > 0) {
          handleBatchUpdate(brokenModal.targets, { isBroken: true, brokenNote: brokenModal.text });
          setBrokenModal({ isOpen: false, targets: [], text: '' });
      }
  };

  const resolveBrokenReport = () => {
      if (brokenModal.targets.length > 0) {
          handleBatchUpdate(brokenModal.targets, { isBroken: false, brokenNote: '' });
          setBrokenModal({ isOpen: false, targets: [], text: '' });
      }
  };

  const clearDeletedItems = async (zoneName: string) => {
      if (!activeList) return;
      const newDeletedItems = activeList.deletedItems?.filter(d => d.zoneName !== zoneName) || [];
      await addOrUpdateItem(COLL_LISTS, { ...activeList, deletedItems: newDeletedItems });
  };


  // --- RENDER: LIST VIEW ---
  if (!activeListId) {
    return (
      <div className="h-full flex flex-col p-6 bg-slate-950 overflow-hidden">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Truck className="text-blue-500" size={32} />
              Preparazione Materiale
          </h1>
          <p className="text-slate-400">Gestione carichi, scarichi e segnalazioni magazzino</p>
        </div>

        <div className="relative mb-6 max-w-md">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
           <input 
              placeholder="Cerca evento..." 
              className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg outline-none focus:border-blue-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
           />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
           {filteredLists.map(list => {
               const issues = getIssues(list);
               const hasIssues = issues.length > 0;
               
               // Status Colors
               const isVersionOne = list.version === '1.0';
               const hasUnresolvedChanges = list.zones?.some(z => 
                   z.sections.some(s => 
                       s.components.some(c => isComponentUnresolved(c))
                   )
               ) || (list.deletedItems && list.deletedItems.length > 0);
               const isModified = list.version && list.version > '1.0' && hasUnresolvedChanges;
               
               // Check if Fully Loaded (Distinta & Loaded checked for ALL items)
               let isFullyLoaded = true;
               let isReturned = true;

               if (list.zones && list.zones.length > 0) {
                   list.zones.forEach(z => {
                       z.sections.forEach(s => {
                           s.components.forEach(c => {
                               // Check contents (for BOTH Kits and Items)
                               if (c.contents && c.contents.length > 0) {
                                   c.contents.forEach(sub => {
                                       const ws = sub.warehouseState;
                                       if (!ws?.inDistinta || !ws?.loaded) isFullyLoaded = false;
                                       if (!ws?.returned) isReturned = false;
                                   });
                               }
                               
                               // Check main item (Ignore for Kits as they are just containers)
                               if (c.type !== 'kit') {
                                   const ws = c.warehouseState;
                                   if (!ws?.inDistinta || !ws?.loaded) isFullyLoaded = false;
                                   if (!ws?.returned) isReturned = false;
                               }
                           });
                       });
                   });
               } else {
                   isFullyLoaded = false;
                   isReturned = false;
               }

               // If there are deleted items that haven't been cleared/hidden, it's not fully loaded (requires attention)
               if (list.deletedItems && list.deletedItems.length > 0) {
                   isFullyLoaded = false;
                   // Assuming deleted items don't affect "Returned" status if they are already processed/deleted? 
                   // Or should they block "Returned"? 
                   // Usually if an item is deleted, it's gone. But if it was "removed in last version", the user needs to acknowledge it.
                   // Let's assume for now "Returned" only cares about *current* items.
               }

               let borderColor = 'border-slate-800';
               let bgColor = 'bg-slate-900';
               
               if (isReturned) {
                   borderColor = 'border-purple-500/50';
                   bgColor = 'bg-purple-900/10';
               } else if (isFullyLoaded) {
                   borderColor = 'border-emerald-500/50';
                   bgColor = 'bg-emerald-900/10';
               } else if (isVersionOne) {
                   borderColor = 'border-blue-500/50';
                   bgColor = 'bg-blue-900/10';
               } else if (isModified) {
                   borderColor = 'border-amber-500/50';
                   bgColor = 'bg-amber-900/10';
               }

               return (
                   <div key={list.id} className={`border rounded-xl p-4 hover:border-slate-600 transition-all flex items-center gap-4 group ${borderColor} ${bgColor}`}>
                       <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-lg shrink-0 relative">
                           {list.eventName.charAt(0).toUpperCase()}
                           {list.version && <div className="absolute -bottom-2 -right-2 bg-slate-950 text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 font-mono">v{list.version}</div>}
                       </div>
                       
                       <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setActiveListId(list.id); setActiveZoneId(list.zones?.[0]?.id || ''); }}>
                           <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors truncate flex items-center gap-3">
                               {list.eventName}
                               {isReturned && <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded font-bold uppercase">Evento rientrato</span>}
                               {!isReturned && isFullyLoaded && <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded font-bold uppercase">Carico Completo</span>}
                               {!isReturned && !isFullyLoaded && isVersionOne && <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded font-bold uppercase">Pronto</span>}
                               {!isReturned && !isFullyLoaded && isModified && <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded font-bold uppercase">Modificato</span>}
                           </h3>
                           <div className="flex items-center gap-4 text-sm text-slate-500">
                               <span className="flex items-center gap-1"><MapPin size={14}/> {list.location}</span>
                               <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(list.eventDate).toLocaleDateString()}</span>
                           </div>
                       </div>

                       {hasIssues && (
                           <button 
                                onClick={(e) => { e.stopPropagation(); setIssuesModalList(list); }}
                                className="w-10 h-10 rounded-full bg-amber-900/20 flex items-center justify-center text-amber-500 animate-pulse hover:bg-amber-900/40 transition-colors"
                                title="Visualizza segnalazioni"
                           >
                               <AlertTriangle size={20} className="fill-current" />
                           </button>
                       )}

                       <button 
                            onClick={() => { setActiveListId(list.id); setActiveZoneId(list.zones?.[0]?.id || ''); }}
                            className="p-3 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded-lg transition-colors"
                       >
                           <ChevronRight size={20} />
                       </button>
                   </div>
               );
           })}
        </div>

        {/* ISSUES SUMMARY MODAL */}
        <Modal isOpen={!!issuesModalList} onClose={() => setIssuesModalList(null)} title="Segnalazioni Evento" size="lg">
            <div className="space-y-4">
                {issuesModalList && getIssues(issuesModalList).length === 0 && <p className="text-slate-500">Nessuna segnalazione presente.</p>}
                {issuesModalList && getIssues(issuesModalList).map((issue, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-start gap-3">
                        {issue.component.warehouseState?.isBroken ? <AlertOctagon className="text-rose-500 shrink-0 mt-1" /> : <MessageSquare className="text-blue-500 shrink-0 mt-1" />}
                        <div>
                            <div className="font-bold text-white">{issue.component.name}</div>
                            <div className="text-xs text-slate-500 mb-1">{issue.zoneName} &gt; {issue.sectionName}</div>
                            {issue.component.warehouseState?.isBroken && (
                                <div className="mt-1">
                                    <div className="text-rose-400 text-sm font-medium uppercase">
                                        {issue.component.warehouseState.brokenNote || 'SEGNALATO ROTTO/MANCANTE'}
                                    </div>
                                </div>
                            )}
                            {issue.component.warehouseState?.warehouseNote && (
                                <div className="bg-slate-900 p-2 rounded text-sm text-slate-300 mt-1 italic">
                                    "{issue.component.warehouseState.warehouseNote}"
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div className="flex justify-end pt-4">
                    <button onClick={() => setIssuesModalList(null)} className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700">Chiudi</button>
                </div>
            </div>
        </Modal>
      </div>
    );
  }

  // --- RENDER: DETAIL VIEW ---
  const activeZone = activeList?.zones?.find(z => z.id === activeZoneId);
  const zoneDeletedItems = activeList?.deletedItems?.filter(d => d.zoneName === activeZone?.name);

  // Helper for Totals Buttons
  const renderTotalButton = (
      type: 'distinta' | 'carico' | 'rientro',
      current: number,
      total: number,
      onClick: () => void
  ) => {
      let bgColor = 'bg-slate-800';
      let textColor = 'text-slate-600';
      let icon = <Square size={24} />;
      let label = '';
      
      const isComplete = current >= total;
      const isStarted = current > 0;
      
      if (isComplete) {
          icon = <CheckSquare size={24} />;
          if (type === 'distinta') textColor = 'text-emerald-500';
          if (type === 'carico') textColor = 'text-blue-500';
          if (type === 'rientro') textColor = 'text-purple-500';
      } else if (isStarted) {
          // YELLOW BUTTON
          bgColor = 'bg-yellow-500 hover:bg-yellow-400';
          textColor = 'text-black';
          label = `${current}/${total}`;
      } else {
          // Not started
          textColor = 'text-slate-600';
      }

      return (
          <label className="flex flex-col items-center gap-1 cursor-pointer group">
              <span className="text-[10px] text-slate-500 font-bold uppercase group-hover:text-slate-300">
                  {type === 'distinta' ? 'Distinta' : type === 'carico' ? 'Carico' : 'Rientro'}
              </span>
              <button 
                  onClick={onClick}
                  className={`flex items-center justify-center min-w-[32px] h-8 rounded transition-all ${isStarted && !isComplete ? bgColor : ''} ${!isStarted || isComplete ? 'hover:scale-110' : ''} ${textColor}`}
              >
                  {isStarted && !isComplete ? (
                      <span className="text-xs font-bold px-1">{label}</span>
                  ) : (
                      icon
                  )}
              </button>
          </label>
      );
  };

  return (
      <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                  <button onClick={() => setActiveListId(null)} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg"><ArrowLeft size={20}/></button>
                  <div className="min-w-0">
                      <h2 className="text-xl font-bold text-white flex items-center gap-2 truncate">
                          {activeList?.eventName}
                          {activeList?.version && <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-400">v{activeList.version}</span>}
                      </h2>
                      <div className="text-xs text-slate-500 flex gap-2">
                          <span>{activeList?.location}</span> • <span>{new Date(activeList?.eventDate || '').toLocaleDateString()}</span>
                      </div>
                  </div>
              </div>
              
              {/* VIEW SWITCHER */}
              <div className="flex items-center bg-slate-800 rounded-lg p-1 shrink-0">
                  <button 
                      onClick={() => setViewMode('zones')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'zones' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                      <Layers size={16} /> Reparti
                  </button>
                  <button 
                      onClick={() => setViewMode('totals')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'totals' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                      <LayoutList size={16} /> Totali
                  </button>
              </div>
          </div>

          {/* VIEW: ZONES (Standard) */}
          {viewMode === 'zones' && (
             <>
                {/* Zone Tabs */}
                <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto px-4 gap-1 shrink-0">
                    {activeList?.zones?.map(zone => {
                        const hasZoneDeletions = activeList.deletedItems?.some(d => d.zoneName === zone.name);
                        const hasZoneChanges = zone.sections.some(s => s.components.some(c => isComponentUnresolved(c)));
                        const isModifiedZone = hasZoneDeletions || hasZoneChanges;

                        return (
                            <button
                                key={zone.id}
                                onClick={() => setActiveZoneId(zone.id)}
                                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeZoneId === zone.id ? 'border-blue-500 text-white bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                            >
                                {zone.name}
                                {isModifiedZone && (
                                    <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" title="Modifiche rilevate in questa zona" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Main Content (Zones) */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative flex flex-col">
                    {highlightedItemName && (
                        <div className="sticky top-0 left-0 right-0 z-20 bg-blue-600 text-white px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2 mb-4 shrink-0 rounded-lg">
                            <div className="flex items-center gap-4">
                                <div className="font-bold text-sm flex items-center gap-2">
                                    <Search size={16} /> EVIDENZIATO: <span className="underline">{highlightedItemName}</span>
                                </div>
                                {highlightStats && (
                                    <div className="flex gap-3 text-xs border-l border-blue-400 pl-4">
                                        <div className="flex flex-col items-center leading-none" title="Quantità nei Kit">
                                            <span className="font-bold text-lg">{highlightStats.kit}</span>
                                            <span className="opacity-70 text-[9px] uppercase">Kit</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità negli Accessori">
                                            <span className="font-bold text-lg">{highlightStats.accessories}</span>
                                            <span className="opacity-70 text-[9px] uppercase">Acc.</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità Sfusi">
                                            <span className="font-bold text-lg">{highlightStats.loose}</span>
                                            <span className="opacity-70 text-[9px] uppercase">Sfusi</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setHighlightedItemName(null)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-bold uppercase transition-colors">
                                ESCI
                            </button>
                        </div>
                    )}

                    {activeZone ? (
                        <div className="space-y-6">
                            
                            {/* DELETED ITEMS WARNING BLOCK */}
                            {zoneDeletedItems && zoneDeletedItems.length > 0 && (
                                <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl overflow-hidden mb-6">
                                    <div className="px-4 py-2 bg-rose-900/20 border-b border-rose-900/30 text-rose-400 font-bold text-sm flex items-center justify-between">
                                        <div className="flex items-center gap-2"><AlertCircle size={16} /> MATERIALE RIMOSSO NELL'ULTIMA VERSIONE</div>
                                        <button 
                                            onClick={() => clearDeletedItems(activeZone.name)}
                                            className="text-[10px] bg-rose-500 text-white px-2 py-1 rounded hover:bg-rose-400 transition-colors"
                                        >
                                            NASCONDI SEGNALAZIONI
                                        </button>
                                    </div>
                                    <div className="divide-y divide-rose-900/20">
                                        {zoneDeletedItems.map((del, idx) => (
                                            <div key={idx} className="p-3 opacity-75 flex flex-col gap-2">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-8 h-8 rounded bg-rose-900/20 flex items-center justify-center text-rose-500 font-bold text-xs shrink-0">0</div>
                                                        <div className="flex-1">
                                                            <div className="font-bold text-rose-200 line-through decoration-rose-500/50">{del.originalComponent.name}</div>
                                                            <div className="text-xs text-rose-400/70">Era in: {del.sectionName} • (Era: {del.originalComponent.quantity})</div>
                                                        </div>
                                                    </div>
                                                    {/* Deleted Contents/Accessories */}
                                                    {del.originalComponent.contents && del.originalComponent.contents.length > 0 && (
                                                        <div className="pl-12 space-y-1">
                                                            {del.originalComponent.contents.map((sub, subIdx) => (
                                                                <div key={subIdx} className="flex items-center gap-2 text-rose-400/60 text-xs">
                                                                    <span> - </span>
                                                                    <span className="line-through">{sub.name}</span>
                                                                    <span className="font-mono">x{sub.quantity * del.originalComponent.quantity}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeZone.sections.map(section => (
                                <div key={section.id} className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-800 font-bold text-slate-400 text-sm uppercase tracking-wider">
                                        {section.name}
                                    </div>
                                    <div className="divide-y divide-slate-800">
                                        {section.components.length === 0 && <div className="p-4 text-center text-slate-600 text-sm">Nessun materiale in questa sezione.</div>}
                                        {section.components.map(comp => {
                                            const isKit = comp.type === 'kit';
                                            
                                            // IF KIT: Render Header + Contents
                                            if (isKit) {
                                                const ws = comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                const hasChanged = ws.changeLog !== undefined;
                                                const showChangeWarning = hasChanged && isComponentUnresolved({ ...comp, warehouseState: ws }); 
                                                
                                                // Highlight Logic
                                                const isMainMatch = comp.name === highlightedItemName;
                                                const hasSubMatch = comp.contents?.some(c => c.name === highlightedItemName);
                                                const isContainerDimmed = highlightedItemName && !isMainMatch && !hasSubMatch;

                                                return (
                                                    <React.Fragment key={comp.uniqueId}>
                                                        {/* Kit Header (No Checkboxes) */}
                                                        <div className={`p-3 border-l-4 flex flex-col md:flex-row gap-4 items-center transition-all duration-300 ${isContainerDimmed ? 'opacity-25 grayscale' : 'opacity-100'} ${showChangeWarning ? 'bg-amber-900/10 border-amber-500' : 'bg-purple-900/10 border-purple-500/50'}`}>
                                                            <div className={`flex-1 w-full transition-opacity ${highlightedItemName && !isMainMatch ? 'opacity-25 grayscale' : 'opacity-100'}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <span 
                                                                        className={`font-bold text-lg cursor-pointer hover:underline ${isMainMatch ? 'text-blue-400 scale-105 origin-left' : 'text-white'}`}
                                                                        onClick={() => setHighlightedItemName(highlightedItemName === comp.name ? null : comp.name)}
                                                                    >
                                                                        {comp.name}
                                                                    </span>
                                                                    <span className="bg-purple-900 text-purple-200 px-2 py-0.5 rounded text-base font-mono font-bold">x{comp.quantity} (KIT)</span>
                                                                    {hasChanged && (
                                                                        <span className={`text-xs font-medium ml-2 ${showChangeWarning ? '' : 'opacity-40'}`}>
                                                                            {ws.changeLog?.previousQuantity === 0 
                                                                                ? <span className={showChangeWarning ? "text-emerald-400 font-bold uppercase tracking-wider text-[10px]" : "text-white/60 font-bold uppercase tracking-wider text-[10px]"}> (NUOVO KIT)</span>
                                                                                : <span className={showChangeWarning ? "text-amber-400 font-bold" : "text-white/60 font-bold"}>(Era: {ws.changeLog?.previousQuantity} v{activeList?.version})</span>
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-slate-500 mt-0.5">{comp.category} {comp.notes && <span className="text-yellow-600 ml-2">• Nota Prod: {comp.notes}</span>}</div>
                                                                
                                                                {ws.warehouseNote && (
                                                                    <div className="mt-1 text-xs text-blue-400 bg-blue-900/20 p-1.5 rounded inline-block">
                                                                        Note Magazzino: {ws.warehouseNote}
                                                                    </div>
                                                                )}
                                                                {ws.isBroken && (
                                                                    <div className="mt-1">
                                                                        <div className="text-rose-500 text-xs font-bold flex items-center gap-1 uppercase">
                                                                            <AlertOctagon size={12}/> {ws.brokenNote || 'SEGNALATO ROTTO / MANCANTE'}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Kit Controls */}
                                                            <div className={`flex items-center gap-2 transition-opacity ${highlightedItemName && !isMainMatch ? 'opacity-25 grayscale' : 'opacity-100'}`}>
                                                                <button 
                                                                    onClick={() => setNoteModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.warehouseNote || '' })}
                                                                    className={`p-2 rounded hover:bg-slate-700 transition-colors ${ws.warehouseNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'}`}
                                                                    title="Aggiungi Nota Magazzino"
                                                                >
                                                                    <MessageSquare size={18} className={ws.warehouseNote ? 'fill-current' : ''} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => setBrokenModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.brokenNote || '' })}
                                                                    className={`p-2 rounded hover:bg-slate-700 transition-colors ${ws.isBroken ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'}`}
                                                                    title={ws.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                >
                                                                    <AlertTriangle size={18} className={ws.isBroken ? 'fill-current' : ''} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Kit Contents */}
                                                        {comp.contents?.map((sub, subIdx) => {
                                                            const subWs = sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                            const totalQty = sub.quantity * comp.quantity;
                                                            const contentWarning = hasChanged && (!subWs.inDistinta || !subWs.loaded);
                                                            
                                                            // Content Highlight Logic
                                                            const isChildMatch = sub.name === highlightedItemName;
                                                            const isRowDimmed = highlightedItemName && !isChildMatch;

                                                            return (
                                                                <div key={`${comp.uniqueId}-sub-${subIdx}`} className={`pl-8 pr-3 py-2 border-b border-slate-800/50 flex flex-col md:flex-row gap-4 items-center transition-all duration-300 ${isContainerDimmed || isRowDimmed ? 'opacity-25 grayscale' : 'opacity-100'} ${subWs.isBroken ? 'bg-rose-900/10' : contentWarning ? 'bg-amber-900/5' : 'hover:bg-slate-800/30'}`}>
                                                                    {/* Content Info */}
                                                                    <div className="flex-1 w-full flex items-center gap-3">
                                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${contentWarning ? 'bg-amber-500' : 'bg-purple-500/50'}`}></div>
                                                                        <div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span 
                                                                                    className={`font-medium cursor-pointer hover:underline ${isChildMatch ? 'text-blue-400 font-bold' : 'text-slate-300'}`}
                                                                                    onClick={() => setHighlightedItemName(highlightedItemName === sub.name ? null : sub.name)}
                                                                                >
                                                                                    {sub.name}
                                                                                </span>
                                                                                <span className={`text-base px-1.5 py-0.5 rounded font-mono ${contentWarning ? 'bg-amber-900/20 text-amber-500 font-bold' : 'bg-slate-800 text-slate-400'}`}>x{totalQty}</span>
                                                                            </div>
                                                                            {subWs.warehouseNote && <div className="text-xs text-blue-400 bg-blue-900/20 px-1 rounded inline-block mt-0.5">Nota: {subWs.warehouseNote}</div>}
                                                                            {subWs.isBroken && <div className="text-rose-500 text-xs font-bold uppercase mt-0.5">{subWs.brokenNote || 'ROTTO'}</div>}
                                                                        </div>
                                                                    </div>

                                                                                                                                  {/* Content Controls */}
                                                                                                                                  <div className="flex items-center gap-2">
                                                                                                                                      {/* Actions */}
                                                                                                                                      <div className="flex gap-1 pr-4 border-r border-slate-800">
                                                                                                                                          <button 
                                                                                                                                              onClick={() => setNoteModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.warehouseNote || '' })}
                                                                                                                                              className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${subWs.warehouseNote ? 'text-blue-400' : 'text-slate-600'}`}
                                                                                                                                              title="Aggiungi Nota Magazzino"
                                                                                                                                          >
                                                                                                                                              <MessageSquare size={16} className={subWs.warehouseNote ? 'fill-current' : ''} />
                                                                                                                                          </button>
                                                                                                                                          <button 
                                                                                                                                              onClick={() => setBrokenModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.brokenNote || '' })}
                                                                                                                                              className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${subWs.isBroken ? 'text-rose-500' : 'text-slate-600'}`}
                                                                                                                                              title={subWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                                                                                          >
                                                                                                                                              <AlertTriangle size={16} className={subWs.isBroken ? 'fill-current' : ''} />
                                                                                                                                          </button>
                                                                                                                                      </div>
                                                                    
                                                                                                                                      {/* Content Checkboxes */}
                                                                                                                                      <div className="flex gap-4">                                                                            <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                                <button onClick={() => updateContentState(comp.uniqueId, subIdx, { inDistinta: !subWs.inDistinta })} className={subWs.inDistinta ? 'text-emerald-500' : contentWarning ? 'text-rose-500 animate-pulse' : 'text-slate-600'}>
                                                                                    {subWs.inDistinta ? <CheckSquare size={20} /> : <Square size={20} />}
                                                                                </button>
                                                                            </label>
                                                                            <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                                <button onClick={() => updateContentState(comp.uniqueId, subIdx, { loaded: !subWs.loaded })} className={subWs.loaded ? 'text-blue-500' : contentWarning ? 'text-rose-500 animate-pulse' : 'text-slate-600'}>
                                                                                    {subWs.loaded ? <CheckSquare size={20} /> : <Square size={20} />}
                                                                                </button>
                                                                            </label>
                                                                            <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                                <button onClick={() => updateContentState(comp.uniqueId, subIdx, { returned: !subWs.returned })} className={subWs.returned ? 'text-purple-500' : 'text-slate-600'}>
                                                                                    {subWs.returned ? <CheckSquare size={20} /> : <Square size={20} />}
                                                                                </button>
                                                                            </label>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            }

                                            // IF ITEM: Render Standard Row
                                            const ws = comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                            const hasChanged = ws.changeLog !== undefined;
                                            const showChangeWarning = hasChanged && !isComponentUnresolved(comp) ? false : hasChanged; 
                                            
                                            // Highlight Logic
                                            const isMatch = comp.name === highlightedItemName;
                                            const isDimmed = highlightedItemName && !isMatch;

                                            const hasAccessories = comp.contents && comp.contents.length > 0;

                                            return (
                                                <React.Fragment key={comp.uniqueId}>
                                                    <div className={`p-3 flex flex-col md:flex-row gap-4 items-center transition-all duration-300 ${isDimmed ? 'opacity-25 grayscale' : 'opacity-100'} ${ws.isBroken ? 'bg-rose-900/10' : showChangeWarning ? 'bg-amber-900/10' : hasAccessories ? 'bg-cyan-900/10 border-l-4 border-cyan-500/50' : 'hover:bg-slate-800/50'}`}>
                                                        {/* Item Info */}
                                                        <div className="flex-1 w-full">
                                                            <div className="flex items-center gap-2">
                                                                <span 
                                                                    className={`font-bold text-lg cursor-pointer hover:underline ${isMatch ? 'text-blue-400 scale-105 origin-left' : 'text-white'}`}
                                                                    onClick={() => setHighlightedItemName(highlightedItemName === comp.name ? null : comp.name)}
                                                                >
                                                                    {comp.name}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded text-base font-mono font-bold ${showChangeWarning ? 'bg-amber-500 text-black' : hasAccessories ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-slate-300'}`}>
                                                                    x{comp.quantity}
                                                                </span>
                                                                {hasChanged && (
                                                                <span className="text-slate-300 text-xs font-medium">
                                                                    {ws.changeLog?.previousQuantity === 0 
                                                                        ? <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px] ml-1"> (NUOVO MATERIALE)</span>
                                                                        : `(Era: ${ws.changeLog?.previousQuantity} v${activeList?.version})`
                                                                    }
                                                                </span>
                                                            )}
                                                            </div>
                                                            <div className="text-xs text-slate-500 mt-0.5">{comp.category} {comp.notes && <span className="text-yellow-600 ml-2">• Nota Prod: {comp.notes}</span>}</div>
                                                            
                                                            {ws.warehouseNote && (
                                                                <div className="mt-1 text-xs text-blue-400 bg-blue-900/20 p-1.5 rounded inline-block">
                                                                    Note Magazzino: {ws.warehouseNote}
                                                                </div>
                                                            )}
                                                            {ws.isBroken && (
                                                                <div className="mt-1">
                                                                    <div className="text-rose-500 text-xs font-bold flex items-center gap-1 uppercase">
                                                                        <AlertOctagon size={12}/> {ws.brokenNote || 'SEGNALATO ROTTO / MANCANTE'}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Controls */}
                                                        <div className="flex items-center gap-2 md:gap-6 w-full md:w-auto justify-between md:justify-end">
                                                            
                                                                                                                  {/* Actions */}
                                                                                                                  <div className="flex gap-1 pr-4 border-r border-slate-800">
                                                                                                                      <button 
                                                                                                                          onClick={() => setNoteModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.warehouseNote || '' })}
                                                                                                                          className={`p-2 rounded hover:bg-slate-700 transition-colors ${ws.warehouseNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'}`}
                                                                                                                          title="Aggiungi Nota Magazzino"
                                                                                                                      >
                                                                                                                          <MessageSquare size={18} className={ws.warehouseNote ? 'fill-current' : ''} />
                                                                                                                      </button>
                                                                                                                      <button 
                                                                                                                          onClick={() => setBrokenModal({ isOpen: true, targets: [{ uniqueId: comp.uniqueId }], text: ws.brokenNote || '' })}
                                                                                                                          className={`p-2 rounded hover:bg-slate-700 transition-colors ${ws.isBroken ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'}`}
                                                                                                                          title={ws.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                                                                      >
                                                                                                                          <AlertTriangle size={18} className={ws.isBroken ? 'fill-current' : ''} />
                                                                                                                      </button>
                                                                                                                  </div>
                                                            {/* Checkboxes */}
                                                            <div className="flex gap-4">
                                                                {(() => {
                                                                    const isResolved = ws.inDistinta && ws.loaded;
                                                                    const showWarning = hasChanged && !isResolved;

                                                                    return (
                                                                        <>
                                                                            <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                                <span className="text-[10px] text-slate-500 font-bold uppercase group-hover:text-slate-300">Distinta</span>
                                                                                <button onClick={() => updateComponentState(comp.uniqueId, { inDistinta: !ws.inDistinta })} className={ws.inDistinta ? 'text-emerald-500' : showWarning ? 'text-rose-500 animate-pulse' : 'text-slate-600'}>
                                                                                    {ws.inDistinta ? <CheckSquare size={24} /> : <Square size={24} />}
                                                                                </button>
                                                                            </label>
                                                                            <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                                <span className="text-[10px] text-slate-500 font-bold uppercase group-hover:text-slate-300">Carico</span>
                                                                                <button onClick={() => updateComponentState(comp.uniqueId, { loaded: !ws.loaded })} className={ws.loaded ? 'text-blue-500' : showWarning ? 'text-rose-500 animate-pulse' : 'text-slate-600'}>
                                                                                    {ws.loaded ? <CheckSquare size={24} /> : <Square size={24} />}
                                                                                </button>
                                                                            </label>
                                                                        </>
                                                                    );
                                                                })()}
                                                                <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase group-hover:text-slate-300">Rientro</span>
                                                                    <button onClick={() => updateComponentState(comp.uniqueId, { returned: !ws.returned })} className={ws.returned ? 'text-purple-500' : 'text-slate-600'}>
                                                                        {ws.returned ? <CheckSquare size={24} /> : <Square size={24} />}
                                                                    </button>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Accessories (Contents) */}
                                                    {comp.contents?.map((sub, subIdx) => {
                                                        const subWs = sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
                                                        const totalQty = sub.quantity * comp.quantity;
                                                        const contentWarning = hasChanged && (!subWs.inDistinta || !subWs.loaded);
                                                        
                                                        // Highlight Logic
                                                        const isMatch = sub.name === highlightedItemName;
                                                        
                                                        return (
                                                            <div key={`${comp.uniqueId}-acc-${subIdx}`} className={`pl-8 pr-3 py-2 border-b border-slate-800/50 flex flex-col md:flex-row gap-4 items-center transition-all duration-300 ${isDimmed ? 'opacity-25 grayscale' : 'opacity-100'} ${subWs.isBroken ? 'bg-rose-900/10' : contentWarning ? 'bg-amber-900/5' : 'hover:bg-slate-800/30'}`}>
                                                                {/* Accessory Info */}
                                                                <div className="flex-1 w-full flex items-center gap-3">
                                                                    <div className={`${hasAccessories ? 'text-cyan-500/50' : 'text-slate-600'} shrink-0`}> - </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span 
                                                                                className={`font-medium text-sm cursor-pointer hover:underline ${isMatch ? 'text-blue-400 font-bold' : 'text-slate-400'}`}
                                                                                onClick={() => setHighlightedItemName(highlightedItemName === sub.name ? null : sub.name)}
                                                                            >
                                                                                {sub.name}
                                                                            </span>
                                                                            <span className={`text-base px-1.5 py-0.5 rounded font-mono ${hasAccessories ? 'bg-cyan-900/20 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}>x{totalQty}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                                                                          {/* Accessory Controls */}
                                                                                                                          <div className="flex items-center gap-2">
                                                                                                                              {/* Actions */}
                                                                                                                              <div className="flex gap-1 pr-4 border-r border-slate-800">
                                                                                                                                  <button 
                                                                                                                                      onClick={() => setNoteModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.warehouseNote || '' })}
                                                                                                                                      className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${subWs.warehouseNote ? 'text-blue-400' : 'text-slate-600'}`}
                                                                                                                                      title="Aggiungi Nota Magazzino"
                                                                                                                                  >
                                                                                                                                      <MessageSquare size={16} className={subWs.warehouseNote ? 'fill-current' : ''} />
                                                                                                                                  </button>
                                                                                                                                  <button 
                                                                                                                                      onClick={() => setBrokenModal({ isOpen: true, targets: [{ parentId: comp.uniqueId, childIdx: subIdx }], text: subWs.brokenNote || '' })}
                                                                                                                                      className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${subWs.isBroken ? 'text-rose-500' : 'text-slate-600'}`}
                                                                                                                                      title={subWs.isBroken ? "Modifica Segnalazione" : "Segnala Rotto/Mancante"}
                                                                                                                                  >
                                                                                                                                      <AlertTriangle size={16} className={subWs.isBroken ? 'fill-current' : ''} />
                                                                                                                                  </button>
                                                                                                                              </div>
                                                                
                                                                                                                              <div className="flex gap-4">                                                                        <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                            <button onClick={() => updateContentState(comp.uniqueId, subIdx, { inDistinta: !subWs.inDistinta })} className={subWs.inDistinta ? 'text-emerald-500' : contentWarning ? 'text-rose-500 animate-pulse' : 'text-slate-600'}>
                                                                                {subWs.inDistinta ? <CheckSquare size={20} /> : <Square size={20} />}
                                                                            </button>
                                                                        </label>
                                                                        <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                            <button onClick={() => updateContentState(comp.uniqueId, subIdx, { loaded: !subWs.loaded })} className={subWs.loaded ? 'text-blue-500' : contentWarning ? 'text-rose-500 animate-pulse' : 'text-slate-600'}>
                                                                                {subWs.loaded ? <CheckSquare size={20} /> : <Square size={20} />}
                                                                            </button>
                                                                        </label>
                                                                        <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                                                            <button onClick={() => updateContentState(comp.uniqueId, subIdx, { returned: !subWs.returned })} className={subWs.returned ? 'text-purple-500' : 'text-slate-600'}>
                                                                                {subWs.returned ? <CheckSquare size={20} /> : <Square size={20} />}
                                                                            </button>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-500">Seleziona una zona per visualizzare il materiale.</div>
                    )}
                </div>
             </>
          )}

          {/* VIEW: TOTALS (Aggregated) */}
          {viewMode === 'totals' && aggregatedData && activeList?.zones && (
              <>
                {/* Zone Tabs (Same as Zones View) */}
                <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto px-4 gap-1 shrink-0">
                    {activeList.zones.map(zone => {
                        return (
                            <button
                                key={zone.id}
                                onClick={() => setActiveZoneId(zone.id)}
                                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeZoneId === zone.id ? 'border-blue-500 text-white bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                            >
                                {zone.name}
                            </button>
                        );
                    })}
                </div>

                {/* Main Content (Active Zone Totals) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
                    {highlightedItemName && (
                        <div className="sticky top-0 left-0 right-0 z-20 bg-blue-600 text-white px-4 py-2 shadow-lg flex justify-between items-center animate-in slide-in-from-top-2 shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="font-bold text-sm flex items-center gap-2">
                                    <Search size={16} /> EVIDENZIATO: <span className="underline">{highlightedItemName}</span>
                                </div>
                                {highlightStats && (
                                    <div className="flex gap-3 text-xs border-l border-blue-400 pl-4">
                                        <div className="flex flex-col items-center leading-none" title="Quantità nei Kit">
                                            <span className="font-bold text-lg">{highlightStats.kit}</span>
                                            <span className="opacity-70 text-[9px] uppercase">Kit</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità negli Accessori">
                                            <span className="font-bold text-lg">{highlightStats.accessories}</span>
                                            <span className="opacity-70 text-[9px] uppercase">Acc.</span>
                                        </div>
                                        <div className="flex flex-col items-center leading-none" title="Quantità Sfusi">
                                            <span className="font-bold text-lg">{highlightStats.loose}</span>
                                            <span className="opacity-70 text-[9px] uppercase">Sfusi</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setHighlightedItemName(null)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-bold uppercase transition-colors">
                                ESCI
                            </button>
                        </div>
                    )}

                    <div className="space-y-6 p-4">
                    {(() => {
                        const zoneData = aggregatedData.get(activeZoneId);
                        if (!zoneData) return <div className="text-center py-20 text-slate-500">Seleziona una zona per visualizzare i totali.</div>;
                        if (zoneData.complex.size === 0 && zoneData.simple.size === 0) return <div className="text-center py-20 text-slate-500">Nessun materiale in questa zona.</div>;

                        // --- CROSS-REFERENCE CALCULATION ---
                        const itemKitParents = new Map<string, Set<string>>();
                        const itemAccessoryParents = new Map<string, Set<string>>();
                        const simpleItemsSet = new Set<string>();

                        // Fill simple items set
                        zoneData.simple.forEach((_, name) => simpleItemsSet.add(name));

                        // Fill parents maps
                        zoneData.complex.forEach((parentData, parentKey) => {
                             const isKit = parentKey.startsWith('KIT-');
                             parentData.children.forEach((_, childName) => {
                                 const mapToUse = isKit ? itemKitParents : itemAccessoryParents;
                                 if (!mapToUse.has(childName)) mapToUse.set(childName, new Set());
                                 mapToUse.get(childName)!.add(parentKey);
                             });
                        });

                        const getItemWarning = (itemName: string, currentParentKey: string) => {
                            const isCurrentKit = currentParentKey.startsWith('KIT-');
                            
                            const inLoose = simpleItemsSet.has(itemName);
                            
                            const kitSet = itemKitParents.get(itemName);
                            const accSet = itemAccessoryParents.get(itemName);

                            // Check Kit intersection
                            // If current is Kit, it's "other" if size > 1 or set doesn't have current.
                            // If current is Machine, it's "other" if size > 0.
                            const inOtherKits = kitSet && (isCurrentKit ? (kitSet.size > 1 || !kitSet.has(currentParentKey)) : kitSet.size > 0);
                            
                            // Check Accessory intersection
                            // If current is Machine, it's "other" if size > 1.
                            // If current is Kit, it's "other" if size > 0.
                            const inAccessories = accSet && (!isCurrentKit ? (accSet.size > 1 || !accSet.has(currentParentKey)) : accSet.size > 0);

                            const parts: string[] = [];
                            if (inOtherKits) parts.push("KIT");
                            if (inAccessories) parts.push("ACCESSORI");
                            if (inLoose) parts.push("SFUSI");

                            if (parts.length === 0) return null;
                            
                            const joined = parts.length === 1 
                                ? parts[0] 
                                : parts.slice(0, -1).join(', ') + ' E ' + parts.slice(-1);
                                
                            return `!!!ALTRI IN ${joined}!!!`;
                        };

                        return (
                          <div className="space-y-4">
                              {/* Section A: Complex (Kits/Machines) */}
                              {Array.from(zoneData.complex.entries()).map(([key, data]) => {
                                  // Highlight Check (Parent)
                                  const isMainMatch = data.name === highlightedItemName;
                                  const hasSubMatch = Array.from(data.children.keys()).some(k => k === highlightedItemName);
                                  const isContainerDimmed = highlightedItemName && !isMainMatch && !hasSubMatch;
                                  
                                  const parentInLoose = simpleItemsSet.has(data.name);
                                  const isActuallyKit = key.startsWith('KIT-');

                                  return (
                                  <div key={key} className={`bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden transition-all duration-300 ${isContainerDimmed ? 'opacity-25 grayscale' : 'opacity-100'}`}>
                                      <div className={`p-3 border-l-4 ${isActuallyKit ? 'border-purple-500/50 bg-purple-900/10' : 'border-cyan-500/50 bg-cyan-900/10'} flex flex-col md:flex-row gap-4 items-center transition-opacity ${highlightedItemName && !isMainMatch ? 'opacity-25 grayscale' : 'opacity-100'}`}>
                                          <div className="flex-1 w-full flex items-center gap-2 flex-wrap">
                                              <span 
                                                  className={`font-bold text-lg cursor-pointer hover:underline ${isMainMatch ? 'text-blue-400 scale-105' : 'text-white'}`}
                                                  onClick={() => setHighlightedItemName(highlightedItemName === data.name ? null : data.name)}
                                              >
                                                  {data.name}
                                              </span>
                                              <span className={`${isActuallyKit ? 'bg-purple-900 text-purple-200' : 'bg-cyan-900 text-cyan-200'} px-2 py-0.5 rounded text-base font-mono font-bold`}>x{data.totalQty} ({isActuallyKit ? 'KIT' : 'MACCHINA'})</span>
                                              {parentInLoose && <span className="text-[10px] font-bold text-rose-500 animate-pulse bg-rose-950/30 px-1 rounded">!!!ALTRI IN SFUSI!!!</span>}
                                          </div>
                                          {/* Aggregated Actions for Parent (Notes/Issues only) */}
                                          <div className="flex gap-1 pr-4 border-r border-slate-800">
                                              <button 
                                                  onClick={() => setNoteModal({ isOpen: true, targets: data.instances, text: '' })}
                                                  className={`p-2 rounded hover:bg-slate-700 transition-colors ${data.hasNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'}`}
                                              >
                                                  <MessageSquare size={18} className={data.hasNote ? 'fill-current' : ''} />
                                              </button>
                                              <button 
                                                  onClick={() => setBrokenModal({ isOpen: true, targets: data.instances, text: '' })}
                                                  className={`p-2 rounded hover:bg-slate-700 transition-colors ${data.hasIssue ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'}`}
                                              >
                                                  <AlertTriangle size={18} className={data.hasIssue ? 'fill-current' : ''} />
                                              </button>
                                          </div>
                                      </div>
                                      <div className="divide-y divide-slate-800">
                                          {Array.from((data.children as Map<string, any>).entries()).map(([childName, childData]) => {
                                              const warning = getItemWarning(childName, key); 
                                              const isChildMatch = childName === highlightedItemName;
                                              const isRowDimmed = highlightedItemName && !isChildMatch;
                                              
                                              return (
                                              <div key={childName} className={`pl-8 pr-3 py-2 flex flex-col md:flex-row gap-4 items-center hover:bg-slate-800/30 transition-all duration-300 ${isContainerDimmed || isRowDimmed ? 'opacity-25 grayscale' : 'opacity-100'}`}>
                                                  <div className="flex-1 w-full flex items-center gap-3">
                                                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActuallyKit ? 'bg-purple-500/50' : 'bg-cyan-500/50'}`}></div>
                                                      <div className="flex flex-col">
                                                          <div className="flex items-center gap-2 flex-wrap">
                                                              <span 
                                                                  className={`font-medium cursor-pointer hover:underline ${isChildMatch ? 'text-blue-400 font-bold' : 'text-slate-300'}`}
                                                                  onClick={() => setHighlightedItemName(highlightedItemName === childName ? null : childName)}
                                                              >
                                                                  {childName}
                                                              </span>
                                                              <span className={`text-base px-1.5 py-0.5 rounded font-mono ${isActuallyKit ? 'bg-slate-800 text-slate-400' : 'bg-cyan-900/20 text-cyan-400'}`}>x{childData.totalQty}</span>
                                                          </div>
                                                          {warning && <span className="text-[10px] font-bold text-rose-500 animate-pulse mt-0.5">{warning}</span>}
                                                      </div>
                                                  </div>
                                                  <div className="flex items-center gap-4">
                                                      {/* Actions */}
                                                      <div className="flex gap-1 pr-4 border-r border-slate-800">
                                                          <button 
                                                              onClick={() => setNoteModal({ isOpen: true, targets: childData.instances, text: '' })}
                                                              className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${childData.hasNote ? 'text-blue-400' : 'text-slate-600'}`}
                                                          >
                                                              <MessageSquare size={16} className={childData.hasNote ? 'fill-current' : ''} />
                                                          </button>
                                                          <button 
                                                              onClick={() => setBrokenModal({ isOpen: true, targets: childData.instances, text: '' })}
                                                              className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${childData.hasIssue ? 'text-rose-500' : 'text-slate-600'}`}
                                                          >
                                                              <AlertTriangle size={16} className={childData.hasIssue ? 'fill-current' : ''} />
                                                          </button>
                                                      </div>

                                                      <div className="flex gap-4">
                                                          {renderTotalButton('distinta', childData.inDistintaQty, childData.totalQty, () => 
                                                              handleBatchUpdate(childData.instances, { inDistinta: childData.inDistintaQty < childData.totalQty })
                                                          )}
                                                          {renderTotalButton('carico', childData.loadedQty, childData.totalQty, () => 
                                                              handleBatchUpdate(childData.instances, { loaded: childData.loadedQty < childData.totalQty })
                                                          )}
                                                          {renderTotalButton('rientro', childData.returnedQty, childData.totalQty, () => 
                                                              handleBatchUpdate(childData.instances, { returned: childData.returnedQty < childData.totalQty })
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                          )})}
                                      </div>
                                  </div>
                              )})}

                              {/* Section B: Simple Items */}
                              {zoneData.simple.size > 0 && (
                                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                                      <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-800 font-bold text-slate-400 text-sm uppercase tracking-wider">
                                          Materiale Sfuso (Totali Zona)
                                      </div>
                                      <div className="divide-y divide-slate-800">
                                          {Array.from((zoneData.simple as Map<string, any>).entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([name, data]) => {
                                              const isMatch = name === highlightedItemName;
                                              const isDimmed = highlightedItemName && !isMatch;
                                              
                                              return (
                                              <div key={name} className={`p-3 flex flex-col md:flex-row gap-4 items-center hover:bg-slate-800/50 transition-colors duration-300 ${isDimmed ? 'opacity-25 grayscale' : 'opacity-100'}`}>
                                                  <div className="flex-1 w-full flex items-center gap-2">
                                                      <span 
                                                          className={`font-bold text-lg cursor-pointer hover:underline ${isMatch ? 'text-blue-400' : 'text-white'}`}
                                                          onClick={() => setHighlightedItemName(highlightedItemName === name ? null : name)}
                                                      >
                                                          {data.name}
                                                      </span>
                                                      <span className="px-2 py-0.5 rounded text-base font-mono font-bold bg-slate-800 text-slate-300">
                                                          x{data.totalQty}
                                                      </span>
                                                  </div>
                                                  <div className="flex items-center gap-4">
                                                      {/* Actions */}
                                                      <div className="flex gap-1 pr-4 border-r border-slate-800">
                                                          <button 
                                                              onClick={() => setNoteModal({ isOpen: true, targets: data.instances, text: '' })}
                                                              className={`p-2 rounded hover:bg-slate-700 transition-colors ${data.hasNote ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'}`}
                                                          >
                                                              <MessageSquare size={18} className={data.hasNote ? 'fill-current' : ''} />
                                                          </button>
                                                          <button 
                                                              onClick={() => setBrokenModal({ isOpen: true, targets: data.instances, text: '' })}
                                                              className={`p-2 rounded hover:bg-slate-700 transition-colors ${data.hasIssue ? 'text-rose-500 bg-rose-900/20' : 'text-slate-500'}`}
                                                          >
                                                              <AlertTriangle size={18} className={data.hasIssue ? 'fill-current' : ''} />
                                                          </button>
                                                      </div>

                                                      <div className="flex gap-4">
                                                          {renderTotalButton('distinta', data.inDistintaQty, data.totalQty, () => 
                                                              handleBatchUpdate(data.instances, { inDistinta: data.inDistintaQty < data.totalQty })
                                                          )}
                                                          {renderTotalButton('carico', data.loadedQty, data.totalQty, () => 
                                                              handleBatchUpdate(data.instances, { loaded: data.loadedQty < data.totalQty })
                                                          )}
                                                          {renderTotalButton('rientro', data.returnedQty, data.totalQty, () => 
                                                              handleBatchUpdate(data.instances, { returned: data.returnedQty < data.totalQty })
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                          )})}
                                      </div>
                                  </div>
                              )}
                          </div>
                        );
                    })()}
                    </div>
                </div>
              </>
          )}

          {/* Note Input Modal */}
          <Modal isOpen={noteModal.isOpen} onClose={() => setNoteModal(prev => ({ ...prev, isOpen: false }))} title="Nota Magazzino">
              <div className="space-y-4">
                  <textarea 
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white h-32 focus:border-blue-500 outline-none"
                      placeholder="Scrivi qui la nota per il magazzino..."
                      value={noteModal.text}
                      onChange={e => setNoteModal(prev => ({ ...prev, text: e.target.value }))}
                      autoFocus
                  />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setNoteModal(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
                      <button onClick={saveNote} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-2">
                          <Save size={16} /> Salva Nota
                      </button>
                  </div>
              </div>
          </Modal>

          {/* Broken Report Modal */}
          <Modal isOpen={brokenModal.isOpen} onClose={() => setBrokenModal(prev => ({ ...prev, isOpen: false }))} title="Segnalazione Problema">
              <div className="space-y-4">
                  <p className="text-slate-400 text-sm">Descrivi il problema riscontrato (rotto, mancante, danneggiato...)</p>
                  <textarea 
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white h-32 focus:border-rose-500 outline-none"
                      placeholder="Esempio: Cavo tranciato, Lampada bruciata..."
                      value={brokenModal.text}
                      onChange={e => setBrokenModal(prev => ({ ...prev, text: e.target.value }))}
                      autoFocus
                  />
                  <div className="flex justify-between">
                      <button onClick={resolveBrokenReport} className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded text-sm">
                          Risolto / Non Rotto
                      </button>
                      <div className="flex gap-2">
                          <button onClick={() => setBrokenModal(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
                          <button onClick={saveBrokenReport} className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded flex items-center gap-2">
                              <AlertTriangle size={16} /> Salva Segnalazione
                          </button>
                      </div>
                  </div>
              </div>
          </Modal>

      </div>
  );
};