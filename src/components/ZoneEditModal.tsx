import React, { useState, useEffect, useRef } from 'react';
import { ListZone, PackingList } from '../types';
import { Modal } from './Modal';
import { Check, X, Calendar, Clock, MapPin, Layers, Users, StickyNote, Factory } from 'lucide-react';

interface ZoneEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  zone: ListZone | null;
  onSave: (updatedFields: Partial<ListZone>) => Promise<void> | void;
  event?: PackingList | null;
}

export const ZoneEditModal: React.FC<ZoneEditModalProps> = ({
  isOpen,
  onClose,
  zone,
  onSave,
  event,
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [setupCompany, setSetupCompany] = useState('');
  const [setupDate, setSetupDate] = useState('');
  const [showDate, setShowDate] = useState('');
  const [showTimeStart, setShowTimeStart] = useState('');
  const [showTimeEnd, setShowTimeEnd] = useState('');
  const [teardownDate, setTeardownDate] = useState('');
  const [notes, setNotes] = useState('');
  const [personnel, setPersonnel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !zone) {
      initializedKeyRef.current = null;
      return;
    }

    const currentKey = `${zone.id || zone.name}_${isOpen}`;
    // Initialize form inputs only upon opening or when switching to a different zone
    if (initializedKeyRef.current !== currentKey) {
      initializedKeyRef.current = currentKey;

      setName(zone.name || '');
      setLocation(zone.location || '');
      setSetupCompany(zone.setupCompany || '');
      
      // Default to event dates if zone has no specific dates
      const defaultSetup = event?.setupDate || event?.truckLoadDate || event?.eventDate || '';
      const defaultShow = event?.eventDate || '';
      const defaultTeardown = event?.teardownDate || event?.returnDate || event?.endDate || '';

      setSetupDate(zone.setupDate || defaultSetup);
      setShowDate(zone.showDate || defaultShow);
      setShowTimeStart(zone.showTimeStart || '');
      setShowTimeEnd(zone.showTimeEnd || '');
      setTeardownDate(zone.teardownDate || defaultTeardown);
      setNotes(zone.notes || '');
      setPersonnel(zone.personnel || '');
    }
  }, [isOpen, zone?.id, zone?.name]);

  if (!zone) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        location: location.trim(),
        setupCompany: setupCompany.trim(),
        setupDate: setupDate || '',
        showDate: showDate || '',
        showTimeStart: showTimeStart || '',
        showTimeEnd: showTimeEnd || '',
        teardownDate: teardownDate || '',
        notes: notes.trim(),
        personnel: personnel.trim(),
      });
      onClose();
    } catch (err) {
      console.error("Errore salvataggio zona:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Modifica Zona" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* NOME, POSIZIONE & ALLESTITORE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Layers size={13} className="text-emerald-400" /> Nome Zona *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Palco Centrale, Foyer, Regia FOH..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <MapPin size={13} className="text-blue-400" /> Posizione / Area
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="es. Palco A, Sala Convegni, Lato SX..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Factory size={13} className="text-amber-400" /> Allestitore (Azienda Allestimento)
            </label>
            <input
              type="text"
              value={setupCompany}
              onChange={(e) => setSetupCompany(e.target.value)}
              placeholder="es. Eurostand, Service Allestimenti Srl..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        {/* DATE & ORARI */}
        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
            <Calendar size={13} className="text-amber-400" /> Tempistiche Zona
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Data Allestimento */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Data Allestimento
              </label>
              <input
                type="date"
                value={setupDate}
                onChange={(e) => setSetupDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Data Show */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Data Show
              </label>
              <input
                type="date"
                value={showDate}
                onChange={(e) => setShowDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Data Smontaggio */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Data Smontaggio
              </label>
              <input
                type="date"
                value={teardownDate}
                onChange={(e) => setTeardownDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Orari Show Da - A */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800/60">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Clock size={12} className="text-cyan-400" /> Orario Show Da
              </label>
              <input
                type="time"
                value={showTimeStart}
                onChange={(e) => setShowTimeStart(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Clock size={12} className="text-cyan-400" /> Orario Show A
              </label>
              <input
                type="time"
                value={showTimeEnd}
                onChange={(e) => setShowTimeEnd(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* PERSONALE */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Users size={13} className="text-purple-400" /> Personale Assegnato
          </label>
          <input
            type="text"
            value={personnel}
            onChange={(e) => setPersonnel(e.target.value)}
            placeholder="es. Mario Rossi (Audio), Luca Bianchi (Luci)..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* NOTE ZONA */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <StickyNote size={13} className="text-amber-400" /> Note Zona
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Istruzioni speciali, passaggi cavi, quote, altezze..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors custom-scrollbar"
          />
        </div>

        {/* FOOTER ACTIONS - STRICTLY ICON ONLY BUTTONS */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/80 transition-colors shadow-sm active:scale-95 flex items-center justify-center min-w-[48px] min-h-[48px]"
            title="Annulla"
            aria-label="Annulla"
          >
            <X size={20} />
          </button>
          <button
            type="submit"
            className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-all active:scale-95 flex items-center justify-center min-w-[48px] min-h-[48px]"
            title="Salva Zona"
            aria-label="Salva"
          >
            <Check size={20} />
          </button>
        </div>
      </form>
    </Modal>
  );
};
