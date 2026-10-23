import React, { useState, useEffect, useRef } from 'react';
import { Database, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { QuotaTelemetryHUD } from './QuotaTelemetryHUD';

export const EmulatorBanner: React.FC = () => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Default initial position: top center floating
    const defaultY = 8;
    const bannerWidth = bannerRef.current ? bannerRef.current.offsetWidth : 400;
    const defaultX = Math.max(8, (window.innerWidth - bannerWidth) / 2);
    setPosition({ x: defaultX, y: defaultY });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => {
        if (!prev || !bannerRef.current) return prev;
        const maxX = Math.max(0, window.innerWidth - bannerRef.current.offsetWidth - 8);
        const maxY = Math.max(0, window.innerHeight - bannerRef.current.offsetHeight - 8);
        return {
          x: Math.min(Math.max(8, prev.x), maxX),
          y: Math.min(Math.max(8, prev.y), maxY)
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setIsDragging(true);
    const currentX = position?.x ?? 8;
    const currentY = position?.y ?? 8;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentX,
      initialY: currentY
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || !bannerRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    const newX = dragStartRef.current.initialX + dx;
    const newY = dragStartRef.current.initialY + dy;

    const maxX = Math.max(0, window.innerWidth - bannerRef.current.offsetWidth - 8);
    const maxY = Math.max(0, window.innerHeight - bannerRef.current.offsetHeight - 8);

    setPosition({
      x: Math.min(Math.max(8, newX), maxX),
      y: Math.min(Math.max(8, newY), maxY)
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsDragging(false);
      dragStartRef.current = null;
    }
  };

  return (
    <div 
      ref={bannerRef}
      style={position ? { left: `${position.x}px`, top: `${position.y}px` } : { top: '8px', left: '50%', transform: 'translateX(-50%)' }}
      className={`fixed z-[9999] select-none shadow-2xl rounded-2xl border border-amber-600/50 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 p-1.5 sm:px-3 sm:py-2 backdrop-blur-md max-w-[calc(100vw-16px)] transition-shadow duration-150 ${
        isDragging ? 'shadow-amber-500/30 ring-2 ring-amber-400/80 cursor-grabbing' : 'shadow-xl'
      }`}
      role="status"
      aria-label="Avviso Simulazione Database Attiva"
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
        {/* DRAG HANDLE: The badge itself as requested */}
        <div 
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="cursor-grab active:cursor-grabbing touch-none flex items-center gap-1.5 bg-slate-950/20 hover:bg-slate-950/30 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-black tracking-wider uppercase shrink-0 transition-all active:scale-95"
          title="Trascina per spostare questo banner"
        >
          <GripVertical size={13} className="opacity-70 shrink-0" />
          <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse shrink-0" />
          <Database size={13} className="shrink-0" />
          <span>EMULATORE ATTIVO</span>
        </div>

        {!isMinimized && (
          <>
            <span className="text-xs sm:text-sm font-extrabold tracking-tight truncate hidden sm:inline">
              Stiamo simulando il database
            </span>

            {/* Live Quota Telemetry HUD */}
            <div className="shrink-0">
              <QuotaTelemetryHUD />
            </div>
          </>
        )}

        {/* Minimize / Expand Toggle */}
        <button 
          type="button"
          onClick={() => setIsMinimized(prev => !prev)}
          className="p-1 rounded-lg hover:bg-slate-950/20 text-slate-950/80 hover:text-slate-950 transition-colors shrink-0 ml-auto"
          title={isMinimized ? "Espandi banner" : "Riduci a pillola compatta"}
          aria-label={isMinimized ? "Espandi banner" : "Riduci a pillola"}
        >
          {isMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
    </div>
  );
};
