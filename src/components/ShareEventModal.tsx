import React, { useState } from 'react';
import { Modal } from './Modal';
import { PackingList } from '../types';
import { getShareUrl, copyToClipboard } from '../utils/share';
import { ClipboardList, ClipboardCheck, Copy, Check, Lock, MapPin, Calendar, ExternalLink } from 'lucide-react';

interface ShareEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  list: PackingList | null;
}

export const ShareEventModal: React.FC<ShareEventModalProps> = ({
  isOpen,
  onClose,
  list
}) => {
  const [copiedType, setCopiedType] = useState<'lists' | 'prep-material' | null>(null);

  if (!list) return null;

  const builderUrl = getShareUrl('lists', list.id);
  const warehouseUrl = getShareUrl('prep-material', list.id);

  const handleCopy = async (type: 'lists' | 'prep-material', url: string) => {
    const success = await copyToClipboard(url);
    if (success) {
      setCopiedType(type);
      setTimeout(() => {
        setCopiedType(prev => (prev === type ? null : prev));
      }, 2500);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Condividi Evento"
      size="md"
    >
      <div className="space-y-5 text-slate-200">
        {/* Header Event Summary Card */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base text-white truncate">{list.eventName}</h4>
              {list.version && (
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono shrink-0">
                  v{list.version}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-1">
              {list.location && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin size={12} className="text-slate-500 shrink-0" />
                  <span className="truncate">{list.location}</span>
                </span>
              )}
              {list.eventDate && (
                <span className="flex items-center gap-1 shrink-0">
                  <Calendar size={12} className="text-slate-500" />
                  {new Date(list.eventDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Option 1: Builder / Preparation List */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/40 transition-all rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-950/70 border border-blue-800/60 flex items-center justify-center text-blue-400">
                <ClipboardList size={18} />
              </div>
              <div>
                <div className="font-bold text-sm text-white">Crea Eventi (Lista Materiale)</div>
                <div className="text-[11px] text-slate-400">Per l'ufficio / produzione (modifica e creazione distinta)</div>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-800/40">
              Crea Eventi
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={builderUrl}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono select-all focus:outline-none focus:border-blue-500/60 truncate"
            />
            <button
              onClick={() => handleCopy('lists', builderUrl)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                copiedType === 'lists'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30 active:scale-95'
              }`}
            >
              {copiedType === 'lists' ? (
                <>
                  <Check size={14} className="animate-in zoom-in" />
                  <span>Copiato!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copia Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Option 2: Warehouse / Ready List */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition-all rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-950/70 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                <ClipboardCheck size={18} />
              </div>
              <div>
                <div className="font-bold text-sm text-white">Preparazione Eventi</div>
                <div className="text-[11px] text-slate-400">Per il magazzino (spunta materiale, carico e rientro)</div>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-300 border border-emerald-800/40">
              Preparazione Eventi
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={warehouseUrl}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono select-all focus:outline-none focus:border-emerald-500/60 truncate"
            />
            <button
              onClick={() => handleCopy('prep-material', warehouseUrl)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                copiedType === 'prep-material'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 active:scale-95'
              }`}
            >
              {copiedType === 'prep-material' ? (
                <>
                  <Check size={14} className="animate-in zoom-in" />
                  <span>Copiato!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copia Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Security & Login Note */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400">
          <Lock size={15} className="text-amber-400/90 shrink-0 mt-0.5" />
          <p>
            <strong className="text-slate-300 font-semibold">Accesso protetto:</strong> Chi riceve il link dovrà effettuare l'accesso a CuePack per visualizzare e operare sull'evento.
          </p>
        </div>

        {/* Footer Close */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
};
