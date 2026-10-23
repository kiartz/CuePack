import React, { useState } from 'react';
import { PackingList, ListZone } from '../types';
import { Modal } from './Modal';
import { ShareEventModal } from './ShareEventModal';
import { ZoneEditModal } from './ZoneEditModal';
import { updateItemFields, COLL_LISTS } from '../firebase';
import { formatItalianDate } from '../utils';
import { 
  MapPin, Calendar, Clock, FileText, Anchor, User, PenSquare, 
  ListOrdered, Home, Settings2, Truck, Wrench, Star, Share2, 
  Layers, Users, StickyNote, Box, Edit2, Factory 
} from 'lucide-react';

interface EventSummaryModalProps {
  event: PackingList | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onOpenList: () => void;
  onUpdateZone?: (zoneId: string, updatedFields: Partial<ListZone>) => void;
}

export const EventSummaryModal: React.FC<EventSummaryModalProps> = ({ 
  event, 
  isOpen, 
  onClose, 
  onEdit, 
  onOpenList,
  onUpdateZone 
}) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ListZone | null>(null);
  const [localEvent, setLocalEvent] = useState<PackingList | null>(event);

  React.useEffect(() => {
    if (!event) {
      setLocalEvent(null);
      return;
    }
    setLocalEvent(prev => {
      if (!prev || prev.id !== event.id) return event;
      // Preserve local zone modifications so background prop updates do not revert edits
      return {
        ...event,
        zones: prev.zones || event.zones
      };
    });
  }, [event]);

  if (!event || !localEvent) return null;

  const formatDate = (dStr?: string) => formatItalianDate(dStr);

  const personnelPasses = localEvent.personnelPasses || [];
  const genericPersonnel = localEvent.personnel?.join(', ') || '';
  const zones = localEvent.zones || [];

  const handleSaveZone = async (updatedFields: Partial<ListZone>) => {
    if (!localEvent || !editingZone) return;
    const targetId = editingZone.id;
    const targetName = editingZone.name;
    const newZones = (localEvent.zones || []).map(z => {
      const isMatch = (z.id && targetId) ? z.id === targetId : z.name === targetName;
      return isMatch ? { ...z, ...updatedFields } : z;
    });
    
    // Immediate local update so the modal reflects changes instantly
    let updatedSnapshot = localEvent.snapshot;
    if (updatedSnapshot && updatedSnapshot.length > 0) {
      updatedSnapshot = updatedSnapshot.map(sz => {
        const isMatch = (sz.id && targetId) ? sz.id === targetId : sz.name === targetName;
        return isMatch ? { ...sz, ...updatedFields } : sz;
      });
    }

    const updatedEv = { ...localEvent, zones: newZones, snapshot: updatedSnapshot };
    setLocalEvent(updatedEv);
    
    try {
      const payload: Partial<PackingList> = { zones: newZones };
      if (updatedSnapshot) payload.snapshot = updatedSnapshot;
      await updateItemFields(COLL_LISTS, localEvent.id, payload);
      if (onUpdateZone) {
        onUpdateZone(targetId || targetName, updatedFields);
      }
    } catch (err) {
      console.error("Errore salvataggio zona:", err);
    }
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="Riepilogo Evento" size="xl">
        <div className="space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar pr-1">
            
            {/* INTESTAZIONE EVENTO */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 sm:p-5 shadow-inner flex flex-col gap-2">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight leading-none truncate">{event.eventName}</h2>
                            <button
                                type="button"
                                onClick={onEdit}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 border border-slate-700/80 transition-colors shadow-sm active:scale-95 flex items-center justify-center shrink-0"
                                title="Modifica Dati Evento"
                                aria-label="Modifica Dati Evento"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={onOpenList}
                                className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 border border-blue-500/30 transition-colors shadow-sm active:scale-95 flex items-center justify-center shrink-0"
                                title="Apri Pagina Lista Materiale"
                                aria-label="Apri Pagina Lista Materiale"
                            >
                                <ListOrdered size={16} />
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 mt-2 text-sm">
                            <MapPin size={16} className="text-emerald-500 shrink-0" />
                            <span className="truncate">{event.location || 'Nessuna location'}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        {event.setupCompany && (
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Service / Allestitore</span>
                                <span className="text-sm font-bold text-slate-300">{event.setupCompany}</span>
                            </div>
                        )}
                        {event.customer && (
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cliente Finale</span>
                                <span className="text-sm font-bold text-emerald-400">{event.customer}</span>
                            </div>
                        )}
                    </div>
                </div>
                {(event.executiveManager || event.designAuthor) && (
                    <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-800/50">
                        {event.executiveManager && (
                            <div className="flex items-center gap-2">
                                <Settings2 size={14} className="text-slate-500" />
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold uppercase text-slate-600">Resp. Esecutivo</span>
                                    <span className="text-xs font-bold text-slate-300">{event.executiveManager}</span>
                                </div>
                            </div>
                        )}
                        {event.designAuthor && (
                            <div className="flex items-center gap-2">
                                <PenSquare size={14} className="text-slate-500" />
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold uppercase text-slate-600">Autore Disegno</span>
                                    <span className="text-xs font-bold text-slate-300">{event.designAuthor}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* TIMELINE LOGISTICA GENERALE */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 pb-2 mb-4">Tempistiche e Logistica</h3>
               
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col">
                      <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Truck size={12}/> Carico</span>
                      <span className="text-sm font-bold text-slate-300 mt-1">{formatDate(event.truckLoadDate)}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-amber-900/30 flex flex-col">
                      <span className="text-[10px] font-bold text-amber-500/70 uppercase flex items-center gap-1"><Wrench size={12}/> Montaggio</span>
                      <span className="text-sm font-bold text-amber-500 mt-1">{formatDate(event.setupDate)}</span>
                  </div>
                  <div className="bg-blue-950/20 p-3 rounded-lg border border-blue-900/50 flex flex-col relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-1 bg-blue-600/20 rounded-bl-lg"><Star size={10} className="text-blue-500"/></div>
                      <span className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1"><Calendar size={12}/> Evento</span>
                      <span className="text-sm font-bold text-blue-300 mt-1">{formatDate(event.eventDate)}</span>
                      {event.endDate && event.endDate !== event.eventDate && (
                          <span className="text-xs text-blue-400/80 mt-0.5">a {formatDate(event.endDate)}</span>
                      )}
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-rose-900/30 flex flex-col">
                      <span className="text-[10px] font-bold text-rose-500/70 uppercase flex items-center gap-1"><Anchor size={12}/> Smont. / Rientro</span>
                      <span className="text-sm font-bold text-rose-400 mt-1">{formatDate(event.teardownDate)}</span>
                      {event.returnDate && event.returnDate !== event.teardownDate && (
                          <span className="text-xs text-rose-400/80 mt-0.5">a {formatDate(event.returnDate)}</span>
                      )}
                  </div>
               </div>
               {event.extraDays && event.extraDays.length > 0 && (
                  <div className="mt-3 p-2 bg-slate-950 border border-slate-800 rounded-lg flex items-center gap-2">
                       <span className="text-[10px] font-bold text-slate-500 uppercase">Giorni Extra/Viaggio:</span>
                       <div className="flex gap-1 flex-wrap">
                           {event.extraDays.map((d, i) => (
                               <span key={i} className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-300">{formatDate(d)}</span>
                           ))}
                       </div>
                  </div>
               )}
            </div>

            {/* SCHEMA ZONE E AREE EVENTO */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={14} className="text-emerald-400" /> Schema Zone e Aree ({zones.length})
                </h3>
              </div>

              {zones.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs italic">
                  Nessuna zona creata per questo evento.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {zones.map((zone) => {
                    const totalZoneItems = (zone.sections || []).reduce((acc, s) => acc + (s.components?.length || 0), 0);
                    return (
                      <div 
                        key={zone.id} 
                        className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-3 hover:border-slate-700 transition-colors"
                      >
                        {/* Zone Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                              <h4 className="font-black text-sm text-white uppercase tracking-tight truncate">{zone.name}</h4>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs">
                              {zone.location ? (
                                <div className="text-slate-400 flex items-center gap-1 truncate">
                                  <MapPin size={12} className="text-blue-400 shrink-0" />
                                  <span>{zone.location}</span>
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-600 italic">Nessuna posizione indicata</div>
                              )}
                              {zone.setupCompany && zone.setupCompany.trim() && (
                                <div className="text-amber-400/90 flex items-center gap-1 truncate font-medium">
                                  <Factory size={11} className="shrink-0" />
                                  <span>{zone.setupCompany}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded-md">
                              {totalZoneItems} mat.
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingZone(zone)}
                              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-800 rounded-lg transition-colors active:scale-95"
                              title="Modifica Dati Zona"
                              aria-label="Modifica Zona"
                            >
                              <Edit2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Zone Timings Schema */}
                        <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-amber-500/80 uppercase">Allest.</span>
                            <span className="text-slate-300 font-semibold">
                              {formatDate(zone.setupDate || event.setupDate || event.truckLoadDate || event.eventDate)}
                            </span>
                          </div>
                          <div className="flex flex-col border-x border-slate-800 px-1">
                            <span className="text-[9px] font-bold text-blue-400 uppercase">Show</span>
                            <span className="text-blue-300 font-semibold">
                              {formatDate(zone.showDate || event.eventDate)}
                            </span>
                            {(zone.showTimeStart || zone.showTimeEnd) && (
                              <span className="text-[10px] text-blue-400/80 font-mono">
                                {zone.showTimeStart || '--:--'} - {zone.showTimeEnd || '--:--'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-rose-500/80 uppercase">Smont.</span>
                            <span className="text-slate-300 font-semibold">
                              {formatDate(zone.teardownDate || event.teardownDate || event.returnDate || event.endDate || event.eventDate)}
                            </span>
                          </div>
                        </div>

                        {/* Personale & Note */}
                        {(zone.personnel || zone.notes) && (
                          <div className="space-y-1.5 pt-1 text-xs">
                            {zone.personnel && (
                              <div className="flex items-start gap-1.5 text-slate-300 bg-slate-900/40 p-1.5 rounded border border-slate-800/60">
                                <Users size={12} className="text-purple-400 shrink-0 mt-0.5" />
                                <span className="text-[11px] leading-tight line-clamp-2">{zone.personnel}</span>
                              </div>
                            )}
                            {zone.notes && (
                              <div className="flex items-start gap-1.5 text-amber-200/90 bg-slate-900/40 p-1.5 rounded border border-slate-800/60">
                                <StickyNote size={12} className="text-amber-400 shrink-0 mt-0.5" />
                                <span className="text-[11px] leading-tight line-clamp-2">{zone.notes}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sections tags */}
                        {zone.sections && zone.sections.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-900">
                            {zone.sections.map(s => (
                              <span key={s.id} className="text-[10px] px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400">
                                {s.name} ({s.components?.length || 0})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* INFO AGGIUNTIVE E PERSONALE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 pb-2 mb-3">Alloggio e Documenti</h3>
                    <div className="space-y-4">
                        <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Home size={12}/> Hotel</span>
                            {event.hotel ? (
                                <div className="text-sm text-slate-300 mt-1 break-words">{event.hotel}</div>
                            ) : (
                                <div className="text-xs text-slate-600 mt-1 italic">Nessun hotel specificato</div>
                            )}
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><FileText size={12}/> Disegno Tecnico</span>
                            {event.technicalDrawingLink ? (
                                <a href={event.technicalDrawingLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 mt-1 inline-block truncate max-w-full">
                                    {event.technicalDrawingLink}
                                </a>
                            ) : (
                                <div className="text-xs text-slate-600 mt-1 italic">Link non disponibile</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 pb-2 mb-3">Personale Assegnato</h3>
                    
                    {personnelPasses.length > 0 ? (
                        <div className="space-y-2">
                             {personnelPasses.map((p, i) => (
                                 <div key={i} className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                                     <div className="flex flex-col">
                                         <span className="text-sm font-bold text-slate-300 flex items-center gap-1.5 break-all">
                                            <User size={14} className="text-slate-500"/> {p.name || 'N/A'}
                                         </span>
                                         {p.role && (
                                             <span className="text-[10px] text-emerald-500 font-bold ml-5 uppercase tracking-wider bg-emerald-500/10 px-1.5 py-0.5 rounded-sm inline-block w-fit mt-0.5">
                                                 {p.role}
                                             </span>
                                         )}
                                     </div>
                                     {p.link ? (
                                        <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-medium">Pass</a>
                                     ) : (
                                        <span className="text-[10px] text-slate-600 italic">No pass</span>
                                     )}
                                 </div>
                             ))}
                        </div>
                    ) : genericPersonnel ? (
                        <div className="text-sm text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
                            {genericPersonnel}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-600 italic">Nessun personale assegnato.</div>
                    )}
                </div>
            </div>

            {/* AZIONI RAPIDE - STRICTLY ICON ONLY BUTTONS */}
            <div className="border-t border-slate-800 pt-5 mt-2 flex items-center justify-end gap-2.5">
                <button 
                  onClick={() => setIsShareModalOpen(true)} 
                  className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-medium transition-all transform active:scale-95 flex items-center justify-center border border-slate-700 min-w-[48px] min-h-[48px] shadow-sm"
                  title="Condividi Evento"
                  aria-label="Condividi Evento"
                >
                  <Share2 size={18} />
                </button>
                <button 
                  onClick={onEdit} 
                  className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 rounded-xl font-medium transition-all transform active:scale-95 flex items-center justify-center border border-slate-700 min-w-[48px] min-h-[48px] shadow-sm"
                  title="Modifica Dati Evento"
                  aria-label="Modifica Dati Evento"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={onOpenList} 
                  className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all transform active:scale-95 flex items-center justify-center min-w-[48px] min-h-[48px]"
                  title="Apri Lista Materiale"
                  aria-label="Apri Lista Materiale"
                >
                  <ListOrdered size={18} />
                </button>
            </div>
            
        </div>
    </Modal>

    {/* SHARE EVENT MODAL */}
    <ShareEventModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)} 
        list={event} 
    />

    {/* ZONE EDIT MODAL (When clicking pen on any zone) */}
    {editingZone && (
      <ZoneEditModal
        isOpen={!!editingZone}
        onClose={() => setEditingZone(null)}
        zone={editingZone}
        event={localEvent}
        onSave={handleSaveZone}
      />
    )}
    </>
  );
};
