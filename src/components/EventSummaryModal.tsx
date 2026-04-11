import React from 'react';
import { PackingList } from '../types';
import { Modal } from './Modal';
import { MapPin, Calendar, Clock, Phone, Building, Briefcase, FileText, BadgeInfo, Anchor, User, ArrowRight, PenSquare, ListOrdered, Home, Settings2, Truck, Wrench, Star } from 'lucide-react';

interface EventSummaryModalProps {
  event: PackingList | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onOpenList: () => void;
}

export const EventSummaryModal: React.FC<EventSummaryModalProps> = ({ event, isOpen, onClose, onEdit, onOpenList }) => {
  if (!event) return null;

  const formatDate = (dStr?: string) => {
      if (!dStr) return '-- / -- / ----';
      return new Date(dStr).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const personnelPasses = event.personnelPasses || [];
  const genericPersonnel = event.personnel?.join(', ') || '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Riepilogo Evento" size="lg">
        <div className="space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar pr-2">
            
            {/* INTESTAZIONE EVENTO */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 shadow-inner flex flex-col gap-2">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight leading-none">{event.eventName}</h2>
                        <div className="flex items-center gap-1.5 text-slate-400 mt-2 text-sm">
                            <MapPin size={16} className="text-emerald-500" />
                            {event.location || 'Nessuna location'}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
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

            {/* TIMELINE LOGISTICA */}
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

            {/* AZIONI RAPIDE */}
            <div className="border-t border-slate-800 pt-5 mt-2 flex flex-col sm:flex-row justify-end gap-3">
                <button 
                  onClick={onEdit} 
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-all transform active:scale-95 flex items-center justify-center gap-2 border border-slate-700"
                >
                  <PenSquare size={16} /> Modifica Dati
                </button>
                <button 
                  onClick={onOpenList} 
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg shadow-blue-900/20 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                  <ListOrdered size={16} /> Apri Lista Materiale <ArrowRight size={16} />
                </button>
            </div>
            
        </div>
    </Modal>
  );
};
