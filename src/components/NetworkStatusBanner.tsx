import React, { useState } from 'react';
import { useNetworkStatus } from '../context/NetworkContext';
import { WifiOff, Wifi, AlertTriangle, RefreshCcw, Volume2, VolumeX, ChevronUp, ChevronDown, CheckCircle2, X, Loader2 } from 'lucide-react';

export const NetworkStatusBanner: React.FC = () => {
  const {
    isOnline,
    wasOffline,
    isSyncing,
    isChecking,
    checkConnection,
    soundEnabled,
    toggleSound,
    dismissReconnectedBanner,
    isCollapsed,
    setIsCollapsed
  } = useNetworkStatus();

  // If online and not in the "just reconnected" transition, render nothing
  if (isOnline && !wasOffline) {
    return null;
  }

  // --- RECONNECTED BANNER (GREEN) ---
  if (isOnline && wasOffline) {
    return (
      <div 
        className="fixed top-0 left-0 right-0 z-[99999] bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 text-white shadow-2xl border-b-2 border-emerald-300/80 animate-in slide-in-from-top duration-300 select-none pt-[env(safe-area-inset-top)]"
        role="alert"
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 ring-1 ring-white/40">
              {isSyncing ? (
                <Loader2 className="animate-spin text-white" size={18} />
              ) : (
                <CheckCircle2 className="text-white" size={18} />
              )}
            </div>
            <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="font-bold text-sm tracking-wide flex items-center gap-1.5 uppercase">
                🟢 Connessione Ripristinata
              </span>
              <span className="text-xs text-emerald-100 truncate">
                {isSyncing 
                  ? 'Sincronizzazione dati al cloud in corso...' 
                  : 'Tutti i dati e le spunte salvati in locale sono sincronizzati con il server!'}
              </span>
            </div>
          </div>

          <button
            onClick={dismissReconnectedBanner}
            className="p-1.5 hover:bg-white/20 rounded-lg text-emerald-100 hover:text-white transition-colors shrink-0"
            title="Chiudi avviso"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  // --- OFFLINE BANNER (RED ALERT) ---
  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[99999] bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-2xl border-b-2 border-red-300 dark:border-red-400 select-none pt-[env(safe-area-inset-top)] animate-in slide-in-from-top duration-300"
      role="alert"
    >
      {/* Top Warning Glow Line */}
      <div className="h-1 w-full bg-amber-400/90 animate-pulse" />

      {/* COMPACT / COLLAPSED VIEW */}
      {isCollapsed ? (
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping shrink-0" />
            <span className="font-extrabold tracking-wide uppercase text-amber-200 shrink-0">
              ⚠️ SEI OFFLINE:
            </span>
            <span className="truncate text-white font-medium">
              Dati salvati in locale. Fai attenzione a non fare modifiche critiche!
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => checkConnection()}
              disabled={isChecking}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
              title="Verifica connessione"
            >
              <RefreshCcw size={12} className={isChecking ? 'animate-spin' : ''} />
              <span>{isChecking ? 'Verifica...' : 'Verifica'}</span>
            </button>

            <button
              onClick={() => setIsCollapsed(false)}
              className="p-1 hover:bg-white/20 rounded-md transition-colors"
              title="Espandi avviso completo"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* EXPANDED FULL WARNING VIEW */
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            {/* Warning Message Block */}
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              {/* Pulsing Icon */}
              <div className="relative shrink-0 mt-0.5 sm:mt-0">
                <div className="w-10 h-10 rounded-xl bg-black/25 flex items-center justify-center ring-2 ring-white/30 shadow-lg">
                  <WifiOff size={22} className="text-white animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center ring-2 ring-red-700">
                  <AlertTriangle size={10} className="text-slate-900 stroke-[3]" />
                </div>
              </div>

              {/* Text Description */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="font-black text-sm sm:text-base tracking-wide uppercase text-white drop-shadow-sm">
                    ⚠️ MODALITÀ OFFLINE - CONNESSIONE INTERNET ASSENTE
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/25 border border-amber-300/40 text-amber-200 tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-ping" />
                    SALVATAGGIO LOCALE ATTIVO
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-red-100 leading-relaxed font-medium">
                  I dati inseriti e le spunte effettuate vengono salvati in sicurezza sul dispositivo e caricati automaticamente non appena tornerai online.{' '}
                  <strong className="text-amber-200 font-extrabold underline decoration-amber-300 underline-offset-2">
                    ATTENZIONE: per evitare conflitti o anomalie, fermati o evita modifiche critiche finché la connessione non viene ripristinata!
                  </strong>
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t border-red-500/50 md:border-0">
              {/* Check Connection Button */}
              <button
                onClick={() => checkConnection()}
                disabled={isChecking}
                className="px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50 min-h-[40px]"
                title="Controlla se la connessione è tornata"
              >
                <RefreshCcw size={14} className={isChecking ? 'animate-spin' : ''} />
                <span>{isChecking ? 'Controllo rete...' : 'Verifica Connessione'}</span>
              </button>

              {/* Sound Toggle */}
              <button
                onClick={toggleSound}
                className={`p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center ${soundEnabled ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-black/20 text-red-200 hover:text-white'}`}
                title={soundEnabled ? 'Disattiva segnali acustici' : 'Attiva segnali acustici'}
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>

              {/* Collapse Button */}
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                title="Riduci avviso a barra sottile"
              >
                <ChevronUp size={16} />
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
