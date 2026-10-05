import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PackingList, InventoryDatabase } from '../types';
import { Calendar as CalendarIcon, MapPin, ChevronLeft, ChevronRight, Clock, Truck, Wrench, Star, Anchor } from 'lucide-react';
import { EventSummaryModal } from './EventSummaryModal';
import { EventFormModal } from './EventFormModal';
import { addOrUpdateItem, COLL_LISTS } from '../firebase';

interface CalendarViewProps {
  lists: PackingList[];
  onOpenEvent: (id: string) => void;
  databases?: InventoryDatabase[];
  activeDatabaseId?: string;
}

const COLUMN_WIDTH = 120;

const parseLocalDate = (dateStr?: string): Date => {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return new Date();
  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month, day, 0, 0, 0, 0);
      return isNaN(d.getTime()) ? new Date() : d;
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

export const CalendarView: React.FC<CalendarViewProps> = ({ lists, onOpenEvent, databases, activeDatabaseId }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [summaryEventId, setSummaryEventId] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);

  // 1. Process active events and determine global date range
  const { activeEvents, timelineStart, days } = useMemo(() => {
    const filtered = lists
      .filter(l => !l.isArchived)
      .sort((a, b) => {
        const dateA = parseLocalDate(a.truckLoadDate || a.setupDate || a.eventDate || a.creationDate).getTime();
        const dateB = parseLocalDate(b.truckLoadDate || b.setupDate || b.eventDate || b.creationDate).getTime();
        return dateA - dateB;
      });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filtered.length === 0) {
      const end = new Date(today);
      end.setDate(today.getDate() + 14);
      return { activeEvents: [], timelineStart: today, days: [] };
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

    if (!isFinite(minTime)) minTime = today.getTime();
    if (!isFinite(maxTime)) maxTime = today.getTime() + 14 * 86400000;

    // Safety clamp: prevent ancient or distant future dates from creating thousands of DOM columns
    const minAllowed = today.getTime() - 60 * 86400000;  // max 60 days in the past
    const maxAllowed = today.getTime() + 180 * 86400000; // max 180 days in the future
    minTime = Math.max(minAllowed, minTime);
    maxTime = Math.min(maxAllowed, maxTime);

    if (maxTime < minTime) {
      maxTime = minTime + 14 * 86400000;
    }

    const start = new Date(minTime);
    start.setDate(start.getDate() - 2); // Buffer
    start.setHours(0, 0, 0, 0);

    const end = new Date(maxTime);
    end.setDate(end.getDate() + 5); // Buffer
    end.setHours(23, 59, 59, 999);

    // Generate days array (capped at max 180 days for extreme performance)
    const dayList: Date[] = [];
    let current = new Date(start);
    let count = 0;
    while (current <= end && count < 180) {
      dayList.push(new Date(current));
      current.setDate(current.getDate() + 1);
      count++;
    }

    return { activeEvents: filtered, timelineStart: start, days: dayList };
  }, [lists]);

  // Center scroll on today
  useEffect(() => {
    if (scrollContainerRef.current && days.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTime = today.getTime();
      const todayIndex = days.findIndex(d => d.getTime() === todayTime);
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

  const todayStr = new Date().toDateString();

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
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div>
              <span className="text-slate-400">Completato</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-amber-500 rounded-sm"></div>
              <span className="text-slate-400">In Corso</span>
            </div>
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
                const isToday = todayStr === day.toDateString();
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
                );
              })}
            </div>

            {/* 2. Grid Vertical Lines */}
            <div className="absolute inset-0 pointer-events-none flex">
              {days.map((day, i) => (
                <div 
                  key={i} 
                  className={`h-full border-r border-slate-800/20 shrink-0
                    ${todayStr === day.toDateString() ? 'bg-blue-500/5 border-r-blue-500/20' : ''}
                  `} 
                  style={{ width: COLUMN_WIDTH }}
                />
              ))}
            </div>

            {/* 3. Event Rows (Ultra-light rendering, no nested grids) */}
            <div className="relative py-8 space-y-4">
              {activeEvents.map((event) => {
                const eventStart = parseLocalDate(event.truckLoadDate || event.setupDate || event.eventDate || event.creationDate);
                const eventEnd = parseLocalDate(event.returnDate || event.teardownDate || event.endDate || event.eventDate || event.creationDate);
                
                eventStart.setHours(0, 0, 0, 0);
                eventEnd.setHours(0, 0, 0, 0);

                const diffStart = Math.round((eventStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                const duration = Math.max(1, Math.round((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

                const left = Math.max(0, diffStart * COLUMN_WIDTH);
                const width = Math.max(COLUMN_WIDTH, duration * COLUMN_WIDTH);

                return (
                  <div 
                    key={event.id} 
                    className="relative h-20 group/row"
                    style={{ width: days.length * COLUMN_WIDTH }}
                  >
                    {/* The Segmented Event Bar */}
                    <div 
                      onClick={(e) => { e.stopPropagation(); setSummaryEventId(event.id); }}
                      className="absolute h-full flex items-center cursor-pointer transition-all duration-200 z-10"
                      style={{ left, width }}
                    >
                      <div className="relative w-full h-[calc(100%-16px)] flex overflow-hidden rounded-xl border border-slate-700/50 shadow-xl shadow-black/40 group/bar hover:border-slate-500 transition-colors">
                        {(() => {
                          const segments = [];
                          const truckStart = event.truckLoadDate || event.setupDate || event.eventDate;
                          const setupStart = event.setupDate || event.eventDate;
                          const showStart = event.eventDate;
                          const showEnd = event.endDate || event.eventDate;
                          const teardownStart = event.teardownDate || showEnd;
                          const returnEnd = event.returnDate || teardownStart;

                          const getDays = (s?: string, e?: string) => {
                            const d1 = parseLocalDate(s); d1.setHours(0, 0, 0, 0);
                            const d2 = parseLocalDate(e); d2.setHours(0, 0, 0, 0);
                            return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                          };

                          // 1. Carico (Loading)
                          if (truckStart && setupStart && truckStart !== setupStart) {
                            segments.push({
                              label: 'Carico',
                              days: getDays(truckStart, setupStart),
                              className: 'bg-slate-800/80 border-r border-slate-700/50 text-slate-400',
                              icon: <Truck size={10} />
                            });
                          }

                          // 2. Montaggio (Setup)
                          if (setupStart && showStart && setupStart !== showStart) {
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
                          if (teardownStart && returnEnd && (teardownStart !== returnEnd || teardownStart !== showEnd)) {
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

                          const totalSegDays = segments.reduce((acc, s) => acc + s.days, 0) || 1;

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
                            <Clock size={16} className="text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
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
                );
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
          databases={databases}
          activeDatabaseId={activeDatabaseId}
          onSave={async (data) => {
            await addOrUpdateItem(COLL_LISTS, data as PackingList);
            setEditEventId(null);
            setSummaryEventId(data.id);
          }}
        />

        {/* Floating Nav Hints */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur border border-slate-800 p-2 rounded-2xl shadow-2xl z-50">
          <ChevronLeft size={16} className="text-slate-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Scorri Timeline</span>
          <ChevronRight size={16} className="text-slate-500" />
        </div>
      </div>
    </div>
  );
};
