import React, { useState, useEffect } from 'react';
import { telemetry, TelemetryStats, TelemetryEvent } from '../services/firestoreTelemetry';
import { Database, RotateCcw, ChevronDown, ChevronUp, Activity, CheckCircle, Server, HardDrive, Clock, X, Zap } from 'lucide-react';

export const QuotaTelemetryHUD: React.FC = () => {
  const [stats, setStats] = useState<TelemetryStats>(telemetry.getStats());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsub = telemetry.subscribe((updated) => {
      setStats(updated);
    });
    return () => unsub();
  }, []);

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    telemetry.resetCounters();
  };

  return (
    <div className="relative inline-flex items-center text-xs">
      {/* Compact Status Bar Pill */}
      <div className="flex items-center gap-2 bg-slate-950/30 hover:bg-slate-950/40 border border-slate-950/20 rounded-full px-2.5 py-0.5 transition-colors">
        {/* Writes Counter */}
        <span 
          className="flex items-center gap-1 font-bold text-slate-950" 
          title={`Scritture Firestore totali: ${stats.writesCount} operazioni (${stats.documentsWritten} documenti)`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-700 animate-pulse" />
          <span>Scritture:</span>
          <span className="bg-slate-950 text-amber-300 px-1.5 py-0.2 rounded-md font-mono text-[11px]">
            {stats.writesCount}
          </span>
        </span>

        <span className="text-slate-950/40">|</span>

        {/* Server Reads Counter */}
        <span 
          className="flex items-center gap-1 font-bold text-slate-950" 
          title={`Letture remote da Server/Emulatore: ${stats.serverReadsCount} documenti (Cache IndexedDB: ${stats.cacheReadsCount})`}
        >
          <span>Letture:</span>
          <span className="bg-slate-950 text-amber-300 px-1.5 py-0.2 rounded-md font-mono text-[11px]">
            {stats.serverReadsCount}
          </span>
          {stats.cacheReadsCount > 0 && (
            <span className="text-[10px] text-slate-900/80 font-normal">
              (+{stats.cacheReadsCount} cache)
            </span>
          )}
        </span>

        {/* Reset Button */}
        <button
          onClick={handleReset}
          className="p-1 hover:bg-slate-950/20 rounded-full text-slate-950 transition-all hover:scale-110 active:rotate-180 duration-200"
          title="Azzera i contatori a 0 per un nuovo test isolato"
          aria-label="Azzera contatori"
        >
          <RotateCcw size={12} />
        </button>

        {/* Details Toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-slate-950 hover:bg-slate-950/20 transition-colors"
          title="Mostra registro dettagliato operazioni Firestore"
        >
          <Activity size={12} />
          <span>Log</span>
          {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Expanded Operations Drawer Modal */}
      {isOpen && (
        <div className="fixed inset-x-4 top-12 md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 w-auto md:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden text-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-amber-400" />
              <h3 className="font-bold text-sm text-white">Firestore Quota Profiler</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded font-semibold flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={10} /> Azzera
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/50 border-b border-slate-800 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1">
                <Server size={13} />
                <span>Letture Remote</span>
              </div>
              <div className="text-xl font-mono font-bold text-white">
                {stats.serverReadsCount} <span className="text-xs text-slate-400 font-normal">doc</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Cache locale: {stats.cacheReadsCount} doc (gratuite)
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-1">
                <Zap size={13} />
                <span>Scritture Totali</span>
              </div>
              <div className="text-xl font-mono font-bold text-white">
                {stats.writesCount} <span className="text-xs text-slate-400 font-normal">chiamate</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {stats.documentsWritten} doc scritti/aggiornati
              </div>
            </div>
          </div>

          {/* Live Events Stream */}
          <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar space-y-1">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex justify-between">
              <span>Ultime Operazioni ({stats.recentEvents.length})</span>
              <span>Tempo</span>
            </div>

            {stats.recentEvents.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Nessuna operazione registrata. Fai un'azione nell'app per vedere le chiamate in tempo reale!
              </div>
            ) : (
              stats.recentEvents.map((evt) => (
                <div 
                  key={evt.id} 
                  className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-start justify-between gap-2 text-[11px]"
                >
                  <div className="min-w-0 flex items-start gap-2">
                    <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] uppercase shrink-0 mt-0.5 ${
                      evt.type === 'write' || evt.type === 'batch_write'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : evt.fromCache 
                          ? 'bg-blue-950 text-blue-400 border border-blue-800' 
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}>
                      {evt.type === 'read' ? (evt.fromCache ? 'CACHE' : 'SERVER') : evt.type}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-200 truncate">
                        {evt.collection} {evt.docId ? `• ${evt.docId.substring(0, 16)}...` : ''}
                      </div>
                      {evt.details && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {evt.details}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-white">
                      +{evt.docCount} {evt.type === 'read' ? 'read' : 'write'}
                    </div>
                    <div className="text-[9px] text-slate-500 flex items-center justify-end gap-1">
                      <Clock size={9} />
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
