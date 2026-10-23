import React from 'react';
import { ListZone, PackingList } from '../types';
import { Modal } from './Modal';
import { X, Edit2, MapPin, Calendar, Clock, Wrench, Anchor, Users, StickyNote, Layers, Box, Factory } from 'lucide-react';
import { formatItalianDate } from '../utils';

interface ZoneInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  zone: ListZone | null;
  event?: PackingList | null;
  onEdit?: () => void;
}

export const ZoneInfoModal: React.FC<ZoneInfoModalProps> = ({
  isOpen,
  onClose,
  zone,
  event,
  onEdit,
}) => {
  if (!zone) return null;

  const formatDate = (dStr?: string) => formatItalianDate(dStr);

  const totalItems = (zone.sections || []).reduce(
    (acc, s) => acc + (s.components?.length || 0),
    0
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Dettagli Zona: ${zone.name}`} size="lg">
      <div className="space-y-4">
        {/* NOME & POSIZIONE HEADER */}
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 shadow-inner flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Layers size={18} />
              </span>
              <h3 className="text-xl font-black text-white uppercase tracking-tight truncate">
                {zone.name}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-400 mt-2 text-xs sm:text-sm">
              <div className="flex items-center gap-1.5">
                <MapPin size={15} className="text-blue-400 shrink-0" />
                <span className="font-medium text-slate-300">
                  {zone.location || 'Posizione non specificata'}
                </span>
              </div>
              {zone.setupCompany && zone.setupCompany.trim() && (
                <div className="flex items-center gap-1.5">
                  <Factory size={14} className="text-amber-400 shrink-0" />
                  <span className="font-medium text-amber-300/90">
                    {zone.setupCompany}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Elementi Inclusi
            </span>
            <span className="text-sm font-bold text-emerald-400">
              {totalItems} materiali
            </span>
          </div>
        </div>

        {/* TEMPISTICHE ZONA */}
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-3.5 space-y-3">
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
            <Calendar size={13} className="text-amber-400" /> Tempistiche Zona
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Montaggio */}
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col">
              <span className="text-[10px] font-bold text-amber-500/80 uppercase flex items-center gap-1">
                <Wrench size={12} /> Allestimento
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-200 mt-1">
                {formatDate(zone.setupDate || event?.setupDate || event?.truckLoadDate || event?.eventDate)}
              </span>
            </div>

            {/* Show */}
            <div className="bg-slate-950 p-2.5 rounded-lg border border-blue-900/40 flex flex-col">
              <span className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
                <Calendar size={12} /> Data Show
              </span>
              <span className="text-xs sm:text-sm font-bold text-blue-200 mt-1">
                {formatDate(zone.showDate || event?.eventDate)}
              </span>
              {(zone.showTimeStart || zone.showTimeEnd) && (
                <span className="text-[11px] text-blue-300/80 flex items-center gap-1 mt-0.5">
                  <Clock size={11} /> {zone.showTimeStart || '--:--'} - {zone.showTimeEnd || '--:--'}
                </span>
              )}
            </div>

            {/* Smontaggio */}
            <div className="bg-slate-950 p-2.5 rounded-lg border border-rose-900/40 flex flex-col">
              <span className="text-[10px] font-bold text-rose-500/80 uppercase flex items-center gap-1">
                <Anchor size={12} /> Smontaggio
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-200 mt-1">
                {formatDate(zone.teardownDate || event?.teardownDate || event?.returnDate || event?.endDate || event?.eventDate)}
                {zone.returnDate && zone.returnDate !== (zone.teardownDate || event?.teardownDate) && (
                  <span className="text-slate-400 font-normal"> - {formatDate(zone.returnDate)}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* PERSONALE & NOTE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Personale */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
              <Users size={12} /> Personale Assegnato
            </span>
            {zone.personnel ? (
              <p className="text-xs sm:text-sm text-slate-200 bg-slate-950 p-2.5 rounded-lg border border-slate-800 leading-relaxed whitespace-pre-line">
                {zone.personnel}
              </p>
            ) : (
              <div className="text-xs text-slate-500 italic p-2">Nessun personale assegnato</div>
            )}
          </div>

          {/* Note */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
              <StickyNote size={12} /> Note Zona
            </span>
            {zone.notes ? (
              <p className="text-xs sm:text-sm text-amber-200/90 bg-slate-950 p-2.5 rounded-lg border border-slate-800 leading-relaxed whitespace-pre-line">
                {zone.notes}
              </p>
            ) : (
              <div className="text-xs text-slate-500 italic p-2">Nessuna nota presente</div>
            )}
          </div>
        </div>

        {/* REPARTI INCLUSI NELLA ZONA */}
        {zone.sections && zone.sections.length > 0 && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Box size={12} /> Reparti Presenti ({zone.sections.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {zone.sections.map((s) => (
                <span
                  key={s.id}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {s.name}
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({s.components?.length || 0})
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS - STRICTLY ICON ONLY BUTTONS */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-colors shadow-sm active:scale-95 flex items-center justify-center min-w-[48px] min-h-[48px]"
              title="Modifica Zona"
              aria-label="Modifica"
            >
              <Edit2 size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors shadow-sm active:scale-95 flex items-center justify-center min-w-[48px] min-h-[48px]"
            title="Chiudi"
            aria-label="Chiudi"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </Modal>
  );
};
