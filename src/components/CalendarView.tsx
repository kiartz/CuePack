import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PackingList } from '../types';
import { Calendar as CalendarIcon, User, MapPin, ChevronLeft, ChevronRight, Clock, Plus, Trash2, Truck, Wrench, Star, Anchor } from 'lucide-react';
import { EventSummaryModal } from './EventSummaryModal';
import { EventFormModal } from './EventFormModal';
import { addOrUpdateItem, COLL_LISTS } from '../firebase';

interface CalendarViewProps {
  lists: PackingList[];
  onOpenEvent: (id: string) => void;
}

const COLUMN_WIDTH = 120;
const ROW_HEIGHT = 80;

const parseLocalDate = (dateStr?: string) => {
  if (!dateStr) return new Date();
  // If it's already a full ISO string (contains T), use standard parsing
  if (dateStr.includes('T')) return new Date(dateStr);
  
  // For YYYY-MM-DD, parse as local date components to avoid UTC shift
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  return new Date(dateStr);
};

export const CalendarView: React.FC<CalendarViewProps> = ({ lists, onOpenEvent }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [summaryEventId, setSummaryEventId] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);

  const toggleExtraDay = async (event: PackingList, date: Date) => {
      const dateStr = date.toISOString().split('T')[0]; // Use YYYY-MM-DD for stability
      const currentExtras = event.extraDays || [];
      
      let newExtras: string[];
      if (currentExtras.includes(dateStr)) {
          newExtras = currentExtras.filter(d => d !== dateStr);
      } else {
          // Don't add if it's already in the main range (check simple overlap)
          const start = parseLocalDate(event.truckLoadDate || event.setupDate || event.eventDate || '');
          const end = parseLocalDate(event.returnDate || event.teardownDate || event.endDate || '');
          start.setHours(0,0,0,0);
          end.setHours(23,59,59,999);
          
          if (date >= start && date <= end) return;
          
          newExtras = [...currentExtras, dateStr];
      }
      
      await addOrUpdateItem(COLL_LISTS, { ...event, extraDays: newExtras });
  };

  // 1. Process active events and determine global date range
  const { activeEvents, timelineStart, timelineEnd, days } = useMemo(() => {
    const filtered = lists
      .filter(l => !l.isArchived)
      .sort((a, b) => {
        const dateA = parseLocalDate(a.truckLoadDate || a.setupDate || a.eventDate || a.creationDate).getTime();
        const dateB = parseLocalDate(b.truckLoadDate || b.setupDate || b.eventDate || b.creationDate).getTime();
        return dateA - dateB;
      });

    if (filtered.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setDate(today.getDate() + 14);
      return { activeEvents: [], timelineStart: today, timelineEnd: end, days: [] };
    }

    // Find min and max dates
    let minTime = Infinity;
    let maxTime = -Infinity;

    filtered.forEach(e => {
        const start = parseLocalDate(e.truckLoadDate || e.setupDate || e.eventDate || e.creationDate).getTime();
        const end = parseLocalDate(e.returnDate || e.teardownDate || e.endDate || e.eventDate || e.creationDate).getTime();
        if (start < minTime) minTime = start;
        if (end > maxTime) maxTime = end;
    });

    const start = new Date(minTime);
    start.setDate(start.getDate() - 3); // Buffer
    start.setHours(0, 0, 0, 0);

    const end = new Date(maxTime);
    end.setDate(end.getDate() + 7); // Buffer
    end.setHours(23, 59, 59, 999);

    // Generate days array
    const dayList: Date[] = [];
    let current = new Date(start);
    while (current <= end) {
      dayList.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return { activeEvents: filtered, timelineStart: start, timelineEnd: end, days: dayList };
  }, [lists]);

  // Center scroll on today if applicable
  useEffect(() => {
    if (scrollContainerRef.current && days.length > 0) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const todayIndex = days.findIndex(d => d.getTime() === today.getTime());
      if (todayIndex !== -1) {
        scrollContainerRef.current.scrollLeft = Math.max(0, todayIndex * COLUMN_WIDTH - 200);
      }
    }
  }, [days]);

  if (activeEvents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 p-8">
        <div className="text-center space-y-4">
           <CalendarIcon size={64} className="mx-auto text-slate-800" />
           <h2 className="text-xl font-bold text-slate-500 uppercase tracking-widest">Nessun Evento Attivo</h2>
           <p className="text-slate-600">Inserisci un evento o imposta le date per vederlo qui.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      {/* Header Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <CalendarIcon size={20} className="text-emerald-500" />
          </div>
          <h1 className="text-lg font-black text-white uppercase tracking-tight">Timeline Eventi</h1>
        </div>

        <div className="flex items-center gap-6">
           <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div> <span className="text-slate-400">Completato</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-amber-500 rounded-sm"></div> <span className="text-slate-400">In Corso</span></div>
           </div>
           <div className="text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">
              {activeEvents.length} Eventi
           </div>
        </div>
      </div>

      {/* Timeline Wrapper */}
      <div className="relative flex-1 flex flex-col overflow-hidden">
        
        {/* Scrollable Container */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative"
        >
          {/* Timeline Surface */}
          <div 
            className="relative"
            style={{ 
              width: days.length * COLUMN_WIDTH, 
              minHeight: '100%',
              paddingBottom: 40
            }}
          >
            {/* 1. Date Headers (Sticky) */}
            <div className="sticky top-0 z-40 flex bg-slate-900/90 backdrop-blur border-b border-slate-800">
              {days.map((day, i) => {
                const isToday = new Date().toDateString() === day.toDateString();
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                
                return (
                  <div 
                    key={i} 
                    className={`flex flex-col items-center justify-center h-14 border-r border-slate-800/40 shrink-0
                      ${isToday ? 'bg-blue-600/10' : ''}
                      ${isWeekend ? 'bg-slate-900/40' : ''}
                    `}
                    style={{ width: COLUMN_WIDTH }}
                  >
                    <span className={`text-[10px] font-black uppercase ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>
                      {day.toLocaleDateString('it-IT', { weekday: 'short' })}
                    </span>
                    <span className={`text-sm font-bold ${isToday ? 'text-white underline decoration-blue-500 decoration-2' : 'text-slate-300'}`}>
                      {day.getDate()} {day.toLocaleDateString('it-IT', { month: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 2. Grid Vertical Lines */}
            <div className="absolute inset-0 pointer-events-none flex">
                {days.map((day, i) => (
                    <div 
                        key={i} 
                        className={`h-full border-r border-slate-800/20 shrink-0
                            ${new Date().toDateString() === day.toDateString() ? 'bg-blue-500/5 border-r-blue-500/20' : ''}
                        `} 
                        style={{ width: COLUMN_WIDTH }}
                    />
                ))}
            </div>

            {/* 3. Event Rows */}
            <div className="relative py-8 space-y-4">
                {activeEvents.map((event, rowIndex) => {
                    const eventStart = parseLocalDate(event.truckLoadDate || event.setupDate || event.eventDate || event.creationDate);
                    const eventEnd = parseLocalDate(event.returnDate || event.teardownDate || event.endDate || event.eventDate || event.creationDate);
                    
                    // Normalize times to midnight for layout calculation
                    eventStart.setHours(0,0,0,0);
                    eventEnd.setHours(0,0,0,0);

                    const diffStart = Math.round((eventStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                    const duration = Math.max(1, Math.round((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

                    const left = diffStart * COLUMN_WIDTH;
                    const width = duration * COLUMN_WIDTH;

                    const extraDaysSet = new Set(event.extraDays || []);

                    const personnelTags = Array.isArray(event.personnel) 
                        ? event.personnel.filter(Boolean) 
                        : typeof event.personnel === 'string' 
                             ? (event.personnel as string).split(',').map(s => s.trim()).filter(Boolean)
                             : [];

                    return (
                        <div 
                          key={event.id} 
                          className="relative h-20 group/row"
                          style={{ width: days.length * COLUMN_WIDTH }}
                        >
                            {/* Interactive Interaction Grid */}
                            <div className="absolute inset-0 flex pointer-events-none">
                                {days.map((day, i) => {
                                    const dayStr = day.toISOString().split('T')[0];
                                    const isExtra = extraDaysSet.has(dayStr);
                                    
                                    // Check if this day is within logic core bar
                                    const coreStart = parseLocalDate(event.truckLoadDate || event.setupDate || event.eventDate || '');
                                    const coreEnd = parseLocalDate(event.returnDate || event.teardownDate || event.endDate || '');
                                    coreStart.setHours(0,0,0,0);
                                    coreEnd.setHours(23,59,59,999);
                                    const isCore = day >= coreStart && day <= coreEnd;

                                    return (
                                        <div 
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); toggleExtraDay(event, day); }}
                                            className={`h-full border-r border-slate-800/10 shrink-0 transition-colors flex items-center justify-center relative pointer-events-auto
                                                ${!isCore ? 'hover:bg-emerald-500/5 cursor-pointer group/cell' : ''}
                                                ${isExtra ? 'bg-indigo-600/10' : ''}
                                            `}
                                            style={{ width: COLUMN_WIDTH }}
                                        >
                                            {!isCore && !isExtra && (
                                                <div className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-1 bg-emerald-500/20 rounded-full">
                                                    <Plus size={10} className="text-emerald-500" />
                                                </div>
                                            )}
                                            {isExtra && (
                                                <div className="w-full h-full flex items-center justify-center relative">
                                                    {/* Visual Marker for Extra Day */}
                                                    <div className="w-[calc(100%-8px)] h-[calc(100%-20px)] bg-indigo-600/30 border border-indigo-500/40 rounded-lg flex flex-col items-center justify-center shadow-lg shadow-indigo-950/20">
                                                        <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">Extra</span>
                                                        <Plus size={10} className="text-indigo-300 mt-0.5" />
                                                    </div>
                                                    
                                                    {/* Hover Delete */}
                                                    <div className="absolute inset-0 bg-rose-600/20 opacity-0 group-hover/cell:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                                                        <Trash2 size={14} className="text-rose-400" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 4. The Segmented Event Bar */}
                            <div 
                                onClick={(e) => { e.stopPropagation(); setSummaryEventId(event.id); }}
                                className="absolute h-full flex items-center cursor-pointer transition-all duration-300 z-10"
                                style={{ 
                                    left: left,
                                    width: width
                                }}
                            >
                                <div className="relative w-full h-[calc(100%-16px)] flex overflow-hidden rounded-xl border border-slate-700/50 shadow-xl shadow-black/40 group/bar">
                                    {(() => {
                                        const segments = [];
                                        const truckStart = event.truckLoadDate || event.setupDate || event.eventDate;
                                        const setupStart = event.setupDate || event.eventDate;
                                        const showStart = event.eventDate;
                                        const showEnd = event.endDate || event.eventDate;
                                        const teardownStart = event.teardownDate || showEnd;
                                        const returnEnd = event.returnDate || teardownStart;

                                        const getDays = (s: string, e: string) => {
                                            const d1 = parseLocalDate(s); d1.setHours(0,0,0,0);
                                            const d2 = parseLocalDate(e); d2.setHours(0,0,0,0);
                                            return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                                        };

                                        // 1. Carico (Loading)
                                        if (truckStart !== setupStart) {
                                            segments.push({
                                                label: 'Carico',
                                                days: getDays(truckStart, setupStart),
                                                className: 'bg-slate-800/80 border-r border-slate-700/50 text-slate-400',
                                                icon: <Truck size={10} />
                                            });
                                        }

                                        // 2. Montaggio (Setup)
                                        if (setupStart !== showStart) {
                                            segments.push({
                                                label: 'Setup',
                                                days: getDays(setupStart, showStart),
                                                className: 'bg-amber-600/30 border-r border-amber-500/30 text-amber-400',
                                                icon: <Wrench size={10} />
                                            });
                                        }

                                        // 3. Evento (Show)
                                        const showDays = getDays(showStart, showEnd) + 1;
                                        segments.push({
                                            label: event.eventName || 'Evento',
                                            days: showDays,
                                            className: event.isCompleted 
                                                ? 'bg-emerald-600/50 border-r border-emerald-400/30 text-emerald-100 font-black' 
                                                : 'bg-blue-600/50 border-r border-blue-400/30 text-blue-100 font-black',
                                            icon: <Star size={10} />,
                                            isMain: true
                                        });

                                        // 4. Smontaggio / Rientro (Teardown/Return)
                                        if (teardownStart !== returnEnd || teardownStart !== showEnd) {
                                            const teardownDays = getDays(teardownStart, returnEnd) + (teardownStart === showEnd ? 0 : 1);
                                            if (teardownDays > 0) {
                                                segments.push({
                                                    label: 'Smont.',
                                                    days: teardownDays,
                                                    className: 'bg-rose-600/30 text-rose-400',
                                                    icon: <Anchor size={10} />
                                                });
                                            }
                                        }

                                        const totalSegDays = segments.reduce((acc, s) => acc + s.days, 0);

                                        return segments.map((seg, idx) => (
                                            <div 
                                                key={idx}
                                                className={`h-full flex flex-col justify-center px-2 min-w-0 relative ${seg.className}`}
                                                style={{ width: `${(seg.days / totalSegDays) * 100}%` }}
                                            >
                                                <div className="flex items-center gap-1 overflow-hidden">
                                                    <span className="shrink-0 opacity-70">{seg.icon}</span>
                                                    <span className="text-[9px] uppercase tracking-tighter truncate font-bold">
                                                        {seg.label}
                                                    </span>
                                                </div>
                                                {seg.isMain && (
                                                    <div className="flex items-center gap-1.5 mt-0.5 opacity-80">
                                                        <MapPin size={8} />
                                                        <span className="text-[8px] truncate italic">{event.location || 'N/D'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ));
                                    })()}
                                    
                                    {/* Overlay Status Icon */}
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                        {event.isCompleted ? (
                                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                                                <ChevronRight size={12} className="text-emerald-950" />
                                            </div>
                                        ) : (
                                            <Clock size={16} className="text-amber-400 animate-pulse drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Current Time Indicator */}
            {(() => {
                const now = new Date();
                const diffNow = (now.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
                if (diffNow >= 0 && diffNow <= days.length) {
                    return (
                        <div 
                            className="absolute top-0 bottom-0 z-30 pointer-events-none"
                            style={{ left: diffNow * COLUMN_WIDTH }}
                        >
                            <div className="h-full border-l-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] bg-blue-500/10"></div>
                            <div className="absolute top-14 -left-1.5 w-3 h-3 rounded-full bg-blue-500"></div>
                        </div>
                    )
                }
                return null;
            })()}
          </div>
        </div>

        {/* Modals */}
        <EventSummaryModal 
             event={lists.find(l => l.id === summaryEventId) || null}
             isOpen={!!summaryEventId}
             onClose={() => setSummaryEventId(null)}
             onEdit={() => {
                 setEditEventId(summaryEventId);
                 setSummaryEventId(null);
             }}
             onOpenList={() => {
                 if (summaryEventId) onOpenEvent(summaryEventId);
                 setSummaryEventId(null);
             }}
        />

        <EventFormModal 
            isOpen={!!editEventId}
            onClose={() => setEditEventId(null)}
            initialData={lists.find(l => l.id === editEventId) || {}}
            onSave={async (data) => {
                await addOrUpdateItem(COLL_LISTS, data as PackingList);
                setEditEventId(null);
                setSummaryEventId(data.id);
            }}
        />

        {/* Floating Nav Hints */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur border border-slate-800 p-2 rounded-2xl shadow-2xl z-50 animate-bounce">
            <ChevronLeft size={16} className="text-slate-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Scorri Timeline</span>
            <ChevronRight size={16} className="text-slate-500" />
        </div>
      </div>
    </div>
  );
};

