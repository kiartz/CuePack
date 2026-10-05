import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  PackingList, 
  ListComponent, 
  WarehouseState 
} from '../types';
import { db, COLL_LISTS } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { isTextMatch } from '../utils/searchUtils';
import { 
  Calendar, 
  MapPin, 
  Search, 
  Filter, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Truck, 
  RotateCcw,
  Check,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export interface MovementOccurrence {
  uniqueId: string;
  quantity: number;
  loaded: boolean;
  returned: boolean;
  inDistinta: boolean;
  isBroken: boolean;
  warehouseNote?: string;
  zoneName?: string;
  sectionName?: string;
  context: string;
}

export interface ItemEventMovement {
  listId: string;
  eventName: string;
  eventDate: string;
  endDate?: string;
  setupDate?: string;
  truckLoadDate?: string;
  returnDate?: string;
  location?: string;
  customer?: string;
  databaseId?: string;
  isCompleted?: boolean;
  isArchived?: boolean;
  totalQuantity: number;
  loadedQuantity: number;
  returnedQuantity: number;
  occurrences: MovementOccurrence[];
}

interface ItemMovementHistoryProps {
  itemId?: string;
  itemName?: string;
  packingLists?: PackingList[];
  className?: string;
}

type TimeRangeFilter = 'all' | '30days' | '3months' | '6months' | 'year' | 'custom';
type StatusFilter = 'all' | 'out' | 'returned' | 'pending';

export const ItemMovementHistory: React.FC<ItemMovementHistoryProps> = ({
  itemId,
  packingLists: propPackingLists,
  className = ''
}) => {
  const [remoteLists, setRemoteLists] = useState<PackingList[]>([]);
  const [loading, setLoading] = useState<boolean>(!propPackingLists || propPackingLists.length === 0);

  // Filter dropdown state
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Filter values
  const [timeFilter, setTimeFilter] = useState<TimeRangeFilter>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedListIds, setExpandedListIds] = useState<Set<string>>(new Set());

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterDropdownOpen]);

  // Subscribe to lists if not passed from parent
  useEffect(() => {
    if (propPackingLists && propPackingLists.length > 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(collection(db, COLL_LISTS), (snap) => {
      const lists = snap.docs.map(d => ({ id: d.id, ...d.data() } as PackingList));
      setRemoteLists(lists);
      setLoading(false);
    }, (err) => {
      console.warn("Error fetching packing lists for history:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [propPackingLists]);

  const effectiveLists = useMemo(() => {
    return (propPackingLists && propPackingLists.length > 0) ? propPackingLists : remoteLists;
  }, [propPackingLists, remoteLists]);

  // Extract all movements for this item
  const allMovements = useMemo<ItemEventMovement[]>(() => {
    if (!itemId) return [];

    const results: ItemEventMovement[] = [];

    const extractOccurrences = (list: PackingList): MovementOccurrence[] => {
      const occs: MovementOccurrence[] = [];

      const checkComponent = (comp: ListComponent, zoneName?: string, sectionName?: string, parentContext?: string) => {
        // Direct item match
        if (comp.type === 'item' && comp.referenceId === itemId) {
          const ws: WarehouseState = comp.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
          occs.push({
            uniqueId: comp.uniqueId,
            quantity: comp.quantity || 1,
            loaded: !!ws.loaded,
            returned: !!ws.returned,
            inDistinta: !!ws.inDistinta,
            isBroken: !!ws.isBroken,
            warehouseNote: ws.warehouseNote || comp.notes || '',
            zoneName,
            sectionName,
            context: parentContext || 'Articolo principale'
          });
        }

        // Contents (accessories or kit items)
        if (comp.contents && Array.isArray(comp.contents)) {
          comp.contents.forEach((sub, subIdx) => {
            if (sub.itemId === itemId) {
              const ws: WarehouseState = sub.warehouseState || { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' };
              const subQty = (comp.quantity || 1) * (sub.quantity || 1);
              const ctx = comp.type === 'kit' 
                ? `Kit: ${comp.name}` 
                : `Acc: ${comp.name}`;
              occs.push({
                uniqueId: `${comp.uniqueId}_sub_${subIdx}`,
                quantity: subQty,
                loaded: !!ws.loaded,
                returned: !!ws.returned,
                inDistinta: !!ws.inDistinta,
                isBroken: !!ws.isBroken,
                warehouseNote: ws.warehouseNote || sub.prepNote || '',
                zoneName,
                sectionName,
                context: ctx
              });
            }
          });
        }

        // Template contents
        if (comp.templateContents && Array.isArray(comp.templateContents)) {
          comp.templateContents.forEach(tc => {
            checkComponent(tc, zoneName, sectionName, `Template: ${comp.name}`);
          });
        }
      };

      if (list.zones && Array.isArray(list.zones) && list.zones.length > 0) {
        list.zones.forEach(zone => {
          (zone.sections || []).forEach(sec => {
            (sec.components || []).forEach(comp => {
              checkComponent(comp, zone.name, sec.name);
            });
          });
        });
      } else if (list.sections && Array.isArray(list.sections) && list.sections.length > 0) {
        list.sections.forEach(sec => {
          (sec.components || []).forEach(comp => {
            checkComponent(comp, undefined, sec.name);
          });
        });
      }

      return occs;
    };

    for (const list of effectiveLists) {
      const occurrences = extractOccurrences(list);
      if (occurrences.length === 0) continue;

      const totalQuantity = occurrences.reduce((sum, o) => sum + (o.quantity || 0), 0);
      const loadedQuantity = occurrences.reduce((sum, o) => o.loaded ? sum + (o.quantity || 0) : sum, 0);
      const returnedQuantity = occurrences.reduce((sum, o) => o.returned ? sum + (o.quantity || 0) : sum, 0);

      results.push({
        listId: list.id,
        eventName: list.eventName || 'Evento senza nome',
        eventDate: list.eventDate || list.truckLoadDate || list.setupDate || list.creationDate || '',
        endDate: list.endDate,
        setupDate: list.setupDate,
        truckLoadDate: list.truckLoadDate,
        returnDate: list.returnDate,
        location: list.location,
        customer: list.customer,
        databaseId: list.databaseId,
        isCompleted: list.isCompleted,
        isArchived: list.isArchived,
        totalQuantity,
        loadedQuantity,
        returnedQuantity,
        occurrences
      });
    }

    return results.sort((a, b) => {
      const timeA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
      const timeB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
      return timeB - timeA;
    });
  }, [effectiveLists, itemId]);

  // Apply filters
  const filteredMovements = useMemo(() => {
    const now = Date.now();
    const query = searchQuery.trim().toLowerCase();

    return allMovements.filter(m => {
      // Time Filter
      const eventTime = m.eventDate ? new Date(m.eventDate).getTime() : 0;

      if (timeFilter === '30days') {
        const threshold = now - 30 * 24 * 60 * 60 * 1000;
        if (eventTime < threshold) return false;
      } else if (timeFilter === '3months') {
        const threshold = now - 90 * 24 * 60 * 60 * 1000;
        if (eventTime < threshold) return false;
      } else if (timeFilter === '6months') {
        const threshold = now - 180 * 24 * 60 * 60 * 1000;
        if (eventTime < threshold) return false;
      } else if (timeFilter === 'year') {
        const currentYear = new Date().getFullYear();
        const evYear = m.eventDate ? new Date(m.eventDate).getFullYear() : 0;
        if (evYear !== currentYear) return false;
      } else if (timeFilter === 'custom') {
        if (customStartDate) {
          const startTime = new Date(customStartDate + 'T00:00:00').getTime();
          if (eventTime < startTime) return false;
        }
        if (customEndDate) {
          const endTime = new Date(customEndDate + 'T23:59:59').getTime();
          if (eventTime > endTime) return false;
        }
      }

      // Status Filter
      if (statusFilter === 'out') {
        if (m.loadedQuantity === 0 || m.returnedQuantity >= m.totalQuantity) return false;
      } else if (statusFilter === 'returned') {
        if (m.returnedQuantity === 0) return false;
      } else if (statusFilter === 'pending') {
        if (m.loadedQuantity > 0) return false;
      }

      // Search Query
      if (query.trim()) {
        const fullContext = `${m.eventName || ''} ${m.location || ''} ${m.customer || ''} ${m.occurrences.map(o => `${o.context} ${o.warehouseNote || ''}`).join(' ')}`;
        if (!isTextMatch(fullContext, query)) return false;
      }

      return true;
    });
  }, [allMovements, timeFilter, customStartDate, customEndDate, statusFilter, searchQuery]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (timeFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    return count;
  }, [timeFilter, statusFilter]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalEvents = filteredMovements.length;
    let totalPiecesUsed = 0;
    let totalPiecesLoaded = 0;
    let totalPiecesReturned = 0;
    let activeOutEvents = 0;

    filteredMovements.forEach(m => {
      totalPiecesUsed += m.totalQuantity;
      totalPiecesLoaded += m.loadedQuantity;
      totalPiecesReturned += m.returnedQuantity;
      if (m.loadedQuantity > 0 && m.returnedQuantity < m.totalQuantity) {
        activeOutEvents++;
      }
    });

    return {
      totalEvents,
      totalPiecesUsed,
      totalPiecesLoaded,
      totalPiecesReturned,
      activeOutEvents
    };
  }, [filteredMovements]);

  const toggleExpand = (listId: string) => {
    setExpandedListIds(prev => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return 'N/D';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleResetFilters = () => {
    setTimeFilter('all');
    setStatusFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  // If item is new
  if (!itemId) {
    return (
      <div className={`p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl ${className}`}>
        <p className="text-xs text-slate-400">
          Salva prima il materiale per visualizzare lo storico dei suoi movimenti.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3.5 ${className}`}>
      
      {/* 1. COMPACT KPI STRIP & TOOLBAR (SEARCH + FILTER BUTTON WITH DROPDOWN) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-2.5 sm:p-3 rounded-2xl">
        
        {/* Left: Quick inline stats counter */}
        <div className="flex items-center gap-3 overflow-x-auto text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 rounded-lg border border-slate-800">
            <span className="text-slate-400">Eventi:</span>
            <span className="font-bold text-white">{stats.totalEvents}</span>
            <span className="text-[11px] text-slate-500">({stats.totalPiecesUsed} pz)</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 rounded-lg border border-slate-800">
            <Truck size={13} className="text-emerald-400" />
            <span className="text-slate-400">Caricati:</span>
            <span className="font-bold text-emerald-400">{stats.totalPiecesLoaded}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 rounded-lg border border-slate-800">
            <RotateCcw size={13} className="text-cyan-400" />
            <span className="text-slate-400">Rientrati:</span>
            <span className="font-bold text-cyan-400">{stats.totalPiecesReturned}</span>
          </div>

          {stats.activeOutEvents > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/40 rounded-lg border border-amber-800/40 text-amber-300">
              <Clock size={13} />
              <span>Fuori:</span>
              <span className="font-bold">{stats.activeOutEvents}</span>
            </div>
          )}
        </div>

        {/* Right: Search Input + Compact Filter Dropdown Button */}
        <div className="flex items-center gap-2 relative" ref={filterDropdownRef}>
          
          {/* Search box */}
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca evento..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter Toggle Button (reduced to icon with badge) */}
          <button
            type="button"
            onClick={() => setIsFilterDropdownOpen(prev => !prev)}
            className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all shrink-0 ${
              isFilterDropdownOpen
                ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/30'
                : activeFiltersCount > 0
                ? 'bg-blue-950 border-blue-500/80 text-blue-400'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Filtri periodo e stato"
          >
            <Filter size={15} />
            <span className="hidden sm:inline">Filtri</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-500 text-white">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown size={13} className={`transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Filter Dropdown Popover ("Tendina") */}
          {isFilterDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-700/80 rounded-2xl p-4 shadow-2xl z-50 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Filter size={14} className="text-blue-400" />
                  Filtri Storico
                </span>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] text-blue-400 hover:underline font-semibold"
                  >
                    Azzera filtri
                  </button>
                )}
              </div>

              {/* Periodo */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Periodo
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'all', label: 'Tutti' },
                    { id: '30days', label: '30 Giorni' },
                    { id: '3months', label: '3 Mesi' },
                    { id: '6months', label: '6 Mesi' },
                    { id: 'year', label: "Quest'anno" },
                    { id: 'custom', label: 'Date...' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setTimeFilter(p.id as TimeRangeFilter)}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        timeFilter === p.id 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Range */}
                {timeFilter === 'custom' && (
                  <div className="mt-2.5 p-2 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold w-6">Da:</span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={e => setCustomStartDate(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold w-6">A:</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={e => setCustomEndDate(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Stato Movimento */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Stato
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: 'all', label: 'Tutti gli stati' },
                    { id: 'out', label: 'Attualmente Fuori' },
                    { id: 'returned', label: 'Rientrati' },
                    { id: 'pending', label: 'Non Caricati' }
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStatusFilter(s.id as StatusFilter)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors truncate ${
                        statusFilter === s.id 
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40' 
                          : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Close button */}
              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsFilterDropdownOpen(false)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  Applica
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* 2. COMPACT MOVEMENTS TABLE / SINGLE-LINE ROWS */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs font-mono">
          <Clock className="animate-spin mx-auto mb-2 text-blue-400" size={20} />
          Caricamento storico movimenti...
        </div>
      ) : filteredMovements.length === 0 ? (
        <div className="py-10 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <p className="text-xs text-slate-400">
            {allMovements.length === 0 
              ? "Nessun movimento registrato per questo materiale."
              : "Nessun evento corrisponde ai filtri impostati."}
          </p>
          {(activeFiltersCount > 0 || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                handleResetFilters();
                setSearchQuery('');
              }}
              className="mt-2 text-xs text-blue-400 hover:underline font-semibold"
            >
              Azzera filtri
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          
          {/* Lightweight Table Header */}
          <div className="hidden sm:flex items-center justify-between px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <div className="w-28 shrink-0">Data Evento</div>
            <div className="flex-1 min-w-0 pl-2">Nome Evento & Dettagli</div>
            <div className="w-16 text-center shrink-0">Quantità</div>
            <div className="w-28 text-center shrink-0">Stato Carico</div>
            <div className="w-28 text-center shrink-0">Stato Rientro</div>
            <div className="w-6 shrink-0"></div>
          </div>

          {/* Single-line movement rows */}
          {filteredMovements.map((movement) => {
            const isExpanded = expandedListIds.has(movement.listId);
            const isFullyLoaded = movement.loadedQuantity >= movement.totalQuantity;
            const isPartiallyLoaded = movement.loadedQuantity > 0 && !isFullyLoaded;
            const isFullyReturned = movement.returnedQuantity >= movement.totalQuantity;
            const isPartiallyReturned = movement.returnedQuantity > 0 && !isFullyReturned;
            const hasMultipleOccurrences = movement.occurrences.length > 1;

            return (
              <div 
                key={movement.listId}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all overflow-hidden"
              >
                {/* STRICTLY SINGLE-LINE ROW */}
                <div 
                  onClick={() => hasMultipleOccurrences && toggleExpand(movement.listId)}
                  className={`px-3 py-2 flex items-center justify-between gap-2.5 text-xs ${
                    hasMultipleOccurrences ? 'cursor-pointer hover:bg-slate-800/40' : ''
                  }`}
                >
                  
                  {/* Column 1: Date */}
                  <div className="w-28 shrink-0 flex items-center gap-1.5 text-slate-300 font-mono text-[11px] font-semibold">
                    <Calendar size={13} className="text-blue-400 shrink-0" />
                    <span>{formatDateDisplay(movement.eventDate)}</span>
                  </div>

                  {/* Column 2: Event Name & Location */}
                  <div className="flex-1 min-w-0 flex items-center gap-2 pl-2">
                    <span className="font-bold text-white truncate text-xs sm:text-sm">
                      {movement.eventName}
                    </span>
                    {movement.location && (
                      <span className="text-[11px] text-slate-400 truncate hidden md:inline flex items-center gap-0.5">
                        <MapPin size={11} className="text-slate-500 shrink-0" />
                        {movement.location}
                      </span>
                    )}
                  </div>

                  {/* Column 3: Quantity */}
                  <div className="w-16 shrink-0 text-center">
                    <span className="font-mono font-bold text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-lg inline-block">
                      {movement.totalQuantity} pz
                    </span>
                  </div>

                  {/* Column 4: Stato Carico */}
                  <div className="w-28 shrink-0 flex justify-center">
                    {isFullyLoaded ? (
                      <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Check size={12} /> Caricato
                      </span>
                    ) : isPartiallyLoaded ? (
                      <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <AlertTriangle size={11} /> {movement.loadedQuantity}/{movement.totalQuantity}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                        Non Caricato
                      </span>
                    )}
                  </div>

                  {/* Column 5: Stato Rientro */}
                  <div className="w-28 shrink-0 flex justify-center">
                    {isFullyReturned ? (
                      <span className="text-[11px] font-semibold text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 size={12} /> Rientrato
                      </span>
                    ) : isPartiallyReturned ? (
                      <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <AlertTriangle size={11} /> {movement.returnedQuantity}/{movement.totalQuantity}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                        Non Rientrato
                      </span>
                    )}
                  </div>

                  {/* Column 6: Expand button for multiple occurrences */}
                  <div className="w-6 shrink-0 flex justify-end text-slate-400">
                    {hasMultipleOccurrences ? (
                      isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <span className="w-3"></span>
                    )}
                  </div>

                </div>

                {/* Sub-row only if expanded */}
                {isExpanded && hasMultipleOccurrences && (
                  <div className="bg-slate-950/70 border-t border-slate-800/80 px-4 py-2 space-y-1.5">
                    {movement.occurrences.map((occ, idx) => (
                      <div key={occ.uniqueId || idx} className="flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 font-medium">• {occ.context}</span>
                          {(occ.zoneName || occ.sectionName) && (
                            <span className="text-slate-500">
                              ({occ.zoneName ? `${occ.zoneName} › ` : ''}{occ.sectionName})
                            </span>
                          )}
                          {occ.warehouseNote && (
                            <span className="text-amber-400/90 italic">"{occ.warehouseNote}"</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-white font-bold">{occ.quantity} pz</span>
                          <span className={occ.loaded ? 'text-emerald-400' : 'text-slate-400'}>
                            {occ.loaded ? 'Caricato' : 'Non Caricato'}
                          </span>
                          <span className="text-slate-600">/</span>
                          <span className={occ.returned ? 'text-cyan-400' : 'text-slate-400'}>
                            {occ.returned ? 'Rientrato' : 'Non Rientrato'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            );
          })}

        </div>
      )}

    </div>
  );
};
