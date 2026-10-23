import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { PackingList, InventoryDatabase, ListZone } from '../types';
import { 
  Calendar as CalendarIcon, MapPin, ChevronLeft, ChevronRight, 
  Clock, Truck, Wrench, Star, Anchor, Layers, ZoomIn, ZoomOut
} from 'lucide-react';
import { EventSummaryModal } from './EventSummaryModal';
import { EventFormModal } from './EventFormModal';
import { ZoneInfoModal } from './ZoneInfoModal';
import { ZoneEditModal } from './ZoneEditModal';
import { addOrUpdateItem, updateItemFields, COLL_LISTS } from '../firebase';
import { formatItalianDate } from '../utils';

interface CalendarViewProps {
  lists: PackingList[];
  onOpenEvent: (id: string) => void;
  databases?: InventoryDatabase[];
  activeDatabaseId?: string;
}

const DEFAULT_COLUMN_WIDTH = 120;
const MIN_COLUMN_WIDTH = 48;
const MAX_COLUMN_WIDTH = 240;
const ZOOM_STEP = 20;

// Parse date string without timezone shifts; if invalid or empty, fall back to fallback Date (not today)
const parseLocalDate = (dateStr?: string, fallback?: Date): Date => {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
    return fallback ? new Date(fallback) : new Date();
  }
  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? (fallback ? new Date(fallback) : new Date()) : d;
  }
  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month, day, 0, 0, 0, 0);
      return isNaN(d.getTime()) ? (fallback ? new Date(fallback) : new Date()) : d;
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? (fallback ? new Date(fallback) : new Date()) : d;
};

// Calculate exact whole calendar days difference between two local dates, immune to DST transitions (Ora Legale / Solare)
const getCalendarDayDiff = (d1: Date, d2: Date): number => {
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((utc2 - utc1) / 86400000);
};

// Add whole calendar days to a local date, preserving 00:00:00 local time across DST boundaries
const addCalendarDays = (baseDate: Date, daysToAdd: number): Date => {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + daysToAdd, 0, 0, 0, 0);
};

interface ZoneSegment {
  label: string;
  days: number;
  className: string;
  icon: React.ReactNode;
  isMain?: boolean;
  tooltip: string;
}

// Compute zone segments strictly anchored to parent event dates as fallback (never jumping to today!)
const computeZoneSegments = (
  zone: ListZone, 
  event: PackingList, 
  eventStart: Date, 
  eventEnd: Date
) => {
  // Base event dates as strict defaults if zone dates are empty
  const defaultSetupStr = event.setupDate?.trim() || event.truckLoadDate?.trim() || event.eventDate?.trim() || event.creationDate?.trim();
  const defaultShowStr = event.eventDate?.trim() || defaultSetupStr;
  const defaultShowEndStr = event.endDate?.trim() || defaultShowStr;
  const defaultTeardownStr = event.teardownDate?.trim() || event.returnDate?.trim() || defaultShowEndStr;
  const defaultReturnStr = event.returnDate?.trim() || defaultTeardownStr;

  // Zone dates falling back to event dates if empty
  const setupStr = zone.setupDate?.trim() || defaultSetupStr;
  const showStr = zone.showDate?.trim() || defaultShowStr;
  const zoneShowEndStr = (zone as any).endDate?.trim() || (zone.showDate?.trim() ? zone.showDate.trim() : defaultShowEndStr);
  const teardownStr = zone.teardownDate?.trim() || defaultTeardownStr;
  const returnStr = zone.returnDate?.trim() || defaultReturnStr;

  const dSetup = parseLocalDate(setupStr, eventStart); dSetup.setHours(0, 0, 0, 0);
  const dShow = parseLocalDate(showStr, eventStart); dShow.setHours(0, 0, 0, 0);
  const dTeardown = parseLocalDate(teardownStr, dShow); dTeardown.setHours(0, 0, 0, 0);
  const dReturn = parseLocalDate(returnStr, dTeardown); dReturn.setHours(0, 0, 0, 0);

  // Chronological anchor
  const zoneStartTime = Math.min(dSetup.getTime(), dShow.getTime());
  const zoneStartDate = new Date(zoneStartTime);
  
  const zoneEndTime = Math.max(dTeardown.getTime(), dReturn.getTime(), dShow.getTime());
  const zoneEndDate = new Date(zoneEndTime);

  const getDaysDiff = (d1: Date, d2: Date) => {
    return Math.max(0, getCalendarDayDiff(d1, d2));
  };

  const totalZoneDays = Math.max(1, getCalendarDayDiff(zoneStartDate, zoneEndDate) + 1);

  const hasExplicitSetup = !!(zone.setupDate?.trim() || event.setupDate?.trim() || event.truckLoadDate?.trim());
  const diffSetupShow = getDaysDiff(dSetup, dShow);
  const extraReturnDays = getDaysDiff(dTeardown, zoneEndDate);
  
  // Half-days can ONLY exist on the FIRST day (setup/show same day) or LAST day (teardown/return same day):
  const isTeardownOnLastDay = extraReturnDays === 0;
  const isSameDayTeardown = (teardownStr === zoneShowEndStr) || (teardownStr === showStr);
  const isLastDayHalfTeardown = isSameDayTeardown && isTeardownOnLastDay;

  let setupDays = 0;
  if (diffSetupShow > 0) {
    setupDays = diffSetupShow;
  } else if (hasExplicitSetup) {
    // Setup is on the same day as show start (First Day)
    if (totalZoneDays === 1 && isLastDayHalfTeardown) {
      setupDays = 1 / 3;
    } else {
      setupDays = 0.5;
    }
  }

  const segments: ZoneSegment[] = [];

  // 1. Montaggio / Allestimento (Setup -> Show)
  if (setupDays > 0) {
    segments.push({
      label: 'Mont.',
      days: setupDays,
      className: 'bg-amber-600/35 border-r border-amber-500/40 text-amber-300 font-semibold',
      icon: <Wrench size={9} />,
      tooltip: `Montaggio ${zone.name}: ${dSetup.toLocaleDateString()}`
    });
  }

  // 2. Smontaggio / Rientro (Teardown -> Return)
  // Half-day split (0.5) ONLY on the LAST day when show and teardown finish on that same last day!
  // In middle days or when teardown continues across days, teardown starts at midnight (full days)!
  let teardownDays = 0;
  if (isLastDayHalfTeardown) {
    if (totalZoneDays === 1 && setupDays > 0) {
      teardownDays = 1 / 3;
    } else {
      teardownDays = 0.5;
    }
  } else {
    teardownDays = extraReturnDays + 1;
  }

  // 3. Show / Evento (Show -> Teardown)
  const showDays = Math.max(0.2, totalZoneDays - setupDays - teardownDays);

  segments.push({
    label: zone.name,
    days: showDays,
    className: 'bg-indigo-600/45 border-r border-indigo-400/30 text-indigo-100 font-bold',
    icon: <Star size={9} />,
    isMain: true,
    tooltip: `Show ${zone.name}: ${dShow.toLocaleDateString()}${zone.showTimeStart ? ` (${zone.showTimeStart} - ${zone.showTimeEnd || ''})` : ''}`
  });

  segments.push({
    label: 'Smont.',
    days: teardownDays,
    className: 'bg-rose-600/35 text-rose-300 font-semibold',
    icon: <Anchor size={9} />,
    tooltip: `Smontaggio ${zone.name}: ${dTeardown.toLocaleDateString()}${dReturn.getTime() > dTeardown.getTime() ? ` - ${dReturn.toLocaleDateString()}` : ''}`
  });

  const totalSegDays = totalZoneDays;

  return {
    zoneStartDate,
    zoneEndDate,
    segments,
    totalSegDays,
    dSetup,
    dShow,
    dTeardown,
    dReturn
  };
};

export const CalendarView: React.FC<CalendarViewProps> = ({ lists, onOpenEvent, databases, activeDatabaseId }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [summaryEventId, setSummaryEventId] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  
  // State for zone visibility and interaction
  const [showZones, setShowZones] = useState<boolean>(true);
  const [collapsedEventZoneIds, setCollapsedEventZoneIds] = useState<Set<string>>(new Set());
  const [selectedZone, setSelectedZone] = useState<{ zone: ListZone; event: PackingList } | null>(null);
  const [editZoneData, setEditZoneData] = useState<{ zone: ListZone; eventId: string } | null>(null);

  // Zoom State (persisted in localStorage)
  const [columnWidth, setColumnWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('cuepack_calendar_zoom');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_COLUMN_WIDTH && val <= MAX_COLUMN_WIDTH) {
          return val;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_COLUMN_WIDTH;
  });

  const columnWidthRef = useRef(columnWidth);
  useEffect(() => {
    columnWidthRef.current = columnWidth;
    try {
      localStorage.setItem('cuepack_calendar_zoom', String(columnWidth));
    } catch {
      // ignore
    }
  }, [columnWidth]);

  const pendingFocalPointRef = useRef<{ dayRatio: number; viewportX: number } | null>(null);

  // Smooth focal-point Zoom handler (maintains cursor/center position synchronously)
  const handleZoom = (newWidth: number, focalPointX?: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const clamped = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(newWidth)));
    const currentW = columnWidthRef.current;
    if (clamped === currentW) return;

    // Viewport focal position: cursor position if provided, else center of viewport
    const viewportX = focalPointX !== undefined ? focalPointX : container.clientWidth / 2;
    const currentTimelineX = container.scrollLeft + viewportX;
    const dayRatio = currentTimelineX / currentW;

    pendingFocalPointRef.current = { dayRatio, viewportX };
    columnWidthRef.current = clamped;
    setColumnWidth(clamped);
  };

  // Synchronously adjust scrollLeft BEFORE the browser paints (eliminates any 1-frame jitter/flicker)
  useLayoutEffect(() => {
    if (pendingFocalPointRef.current && scrollContainerRef.current) {
      const { dayRatio, viewportX } = pendingFocalPointRef.current;
      scrollContainerRef.current.scrollLeft = Math.max(0, (dayRatio * columnWidth) - viewportX);
      pendingFocalPointRef.current = null;
    }
  }, [columnWidth]);

  const handleZoomRef = useRef(handleZoom);
  handleZoomRef.current = handleZoom;

  // Helper to format Date as local YYYY-MM-DD
  const toDateInputString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Strictly Desktop Detection (excludes phones, tablets, iPads)
  const isDesktop = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet/i.test(navigator.userAgent);
    const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const hasFinePointer = window.matchMedia && window.matchMedia('(pointer: fine) and (hover: hover)').matches;
    return !isMobileUA && !isIPad && hasFinePointer;
  }, []);

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

    // Find min and max dates across events and explicitly dated zones
    let minTime = Infinity;
    let maxTime = -Infinity;

    filtered.forEach(e => {
      const eStart = parseLocalDate(e.truckLoadDate || e.setupDate || e.eventDate || e.creationDate);
      const eEnd = parseLocalDate(e.returnDate || e.teardownDate || e.endDate || e.eventDate || e.creationDate, eStart);
      
      let start = eStart.getTime();
      let end = eEnd.getTime();

      // Only check custom explicit zone dates if zones > 1 AND the string is not empty
      if (e.zones && e.zones.length > 1) {
        e.zones.forEach(z => {
          if (z.setupDate && z.setupDate.trim()) {
            const zs = parseLocalDate(z.setupDate, eStart).getTime();
            if (zs < start) start = zs;
          }
          if (z.teardownDate && z.teardownDate.trim()) {
            const ze = parseLocalDate(z.teardownDate, eEnd).getTime();
            if (ze > end) end = ze;
          }
          if (z.returnDate && z.returnDate.trim()) {
            const zr = parseLocalDate(z.returnDate, eEnd).getTime();
            if (zr > end) end = zr;
          }
          if (z.showDate && z.showDate.trim()) {
            const zshow = parseLocalDate(z.showDate, eStart).getTime();
            if (zshow < start) start = zshow;
            if (zshow > end) end = zshow;
          }
        });
      }

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
    const current = new Date(start);
    let count = 0;
    while (current <= end && count < 180) {
      dayList.push(new Date(current));
      current.setDate(current.getDate() + 1);
      count++;
    }

    return { activeEvents: filtered, timelineStart: start, days: dayList };
  }, [lists]);

  // Resize Drag State & Refs
  interface ResizeDragState {
    targetType: 'event' | 'zone';
    eventId: string;
    zoneId?: string;
    handleType: string;
    fieldToUpdate: string;
    label: string;
    minDate: Date;
    maxDate: Date;
    currentDateStr: string;
    previewDateStr: string;
    initialHandleTimelineX: number;
    grabOffsetX: number;
    currentHandleTimelineX: number;
    isHalfDay?: boolean;
  }

  const activeResizeRef = useRef<ResizeDragState | null>(null);
  const [activeResizeState, setActiveResizeState] = useState<ResizeDragState | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Helper to compute exact timeline X for a given date and handle type (supports same-day sub-column positioning)
  const getHandleTimelineX = (
    dateStr: string, 
    handle: string, 
    targetEvent?: PackingList, 
    targetZoneId?: string,
    forceHalfDay?: boolean
  ): number => {
    const d = parseLocalDate(dateStr);
    const dayDiff = getCalendarDayDiff(timelineStart, d);
    const isInclusiveEnd = handle === 'end' || handle === 'zone-return';
    if (isInclusiveEnd) {
      return (dayDiff + 1) * columnWidthRef.current;
    }
    if (handle === 'start' || handle === 'zone-setup') {
      return dayDiff * columnWidthRef.current;
    }

    // Internal dividing handle between Setup and Show:
    // Can be half-day ONLY on the FIRST day (when setup and show start on the same day)
    if (handle === 'show-start' || handle === 'zone-show') {
      const zone = targetZoneId && targetEvent?.zones ? targetEvent.zones.find(z => z.id === targetZoneId) : undefined;
      const setupStr = zone ? (zone.setupDate || targetEvent?.setupDate || targetEvent?.truckLoadDate) : (targetEvent?.setupDate || targetEvent?.truckLoadDate);
      const isFirstDay = setupStr && toDateInputString(parseLocalDate(setupStr)) === dateStr;
      const isSameDaySetup = isFirstDay && (forceHalfDay !== undefined ? forceHalfDay : true);
      if (isSameDaySetup) {
        const teardownStr = zone ? (zone.teardownDate || targetEvent?.teardownDate) : targetEvent?.teardownDate;
        const isSameDayTeardown = teardownStr && toDateInputString(parseLocalDate(teardownStr)) === dateStr;
        const split = isSameDayTeardown ? (1 / 3) : 0.5;
        return (dayDiff + split) * columnWidthRef.current;
      }
      return dayDiff * columnWidthRef.current;
    }

    // Internal dividing handle between Show and Teardown:
    // Can be half-day ONLY on the LAST day (when show end and teardown occur on the exact same final day)
    if (handle === 'show-end' || handle === 'zone-teardown-start') {
      const zone = targetZoneId && targetEvent?.zones ? targetEvent.zones.find(z => z.id === targetZoneId) : undefined;
      const defaultShowEndStr = targetEvent?.endDate?.trim() || targetEvent?.eventDate?.trim() || '';
      const zoneShowEndStr = (zone as any)?.endDate?.trim() || zone?.showDate?.trim() || defaultShowEndStr;
      
      const defaultReturnStr = targetEvent?.returnDate?.trim() || targetEvent?.teardownDate?.trim() || defaultShowEndStr;
      const zoneReturnStr = zone?.returnDate?.trim() || zone?.teardownDate?.trim() || defaultReturnStr;
      const isLastDay = (dateStr === zoneReturnStr) || (dateStr === defaultReturnStr);

      const isSameDayTeardown = isLastDay && (forceHalfDay !== undefined
        ? forceHalfDay
        : ((dateStr === zoneShowEndStr) || (dateStr === defaultShowEndStr)));

      if (isSameDayTeardown) {
        const setupStr = zone ? (zone.setupDate || targetEvent?.setupDate || targetEvent?.truckLoadDate) : (targetEvent?.setupDate || targetEvent?.truckLoadDate);
        const isSameDaySetup = setupStr && toDateInputString(parseLocalDate(setupStr)) === dateStr;
        const split = isSameDaySetup ? (2 / 3) : 0.5;
        return (dayDiff + split) * columnWidthRef.current;
      }
      // When teardown is on a subsequent day or middle day, handle sits on the midnight boundary (start of dateStr column)
      return dayDiff * columnWidthRef.current;
    }

    return dayDiff * columnWidthRef.current;
  };

  // Optimistic overrides to prevent any UI flicker when releasing drag before Firestore confirms
  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, Partial<PackingList>>>(new Map());

  // Prune optimistic overrides once Firestore snapshot updates
  useEffect(() => {
    if (optimisticOverrides.size === 0) return;
    setOptimisticOverrides(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const [eventId, override] of prev.entries()) {
        const current = lists.find(l => l.id === eventId);
        if (!current) {
          next.delete(eventId);
          changed = true;
          continue;
        }
        let matches = true;
        if (override.setupDate && current.setupDate !== override.setupDate) matches = false;
        if (override.truckLoadDate && current.truckLoadDate !== override.truckLoadDate) matches = false;
        if (override.returnDate && current.returnDate !== override.returnDate) matches = false;
        if (override.endDate && current.endDate !== override.endDate) matches = false;
        if (override.teardownDate && current.teardownDate !== override.teardownDate) matches = false;
        if (override.zones && current.zones) {
          for (const oz of override.zones) {
            const cz = current.zones.find(z => z.id === oz.id);
            if (!cz || cz.setupDate !== oz.setupDate || cz.showDate !== oz.showDate || cz.teardownDate !== oz.teardownDate || cz.returnDate !== oz.returnDate) {
              matches = false;
              break;
            }
          }
        }
        if (matches) {
          next.delete(eventId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [lists]);

  // Lock cursor on document.body during resize
  useEffect(() => {
    if (activeResizeState) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [activeResizeState]);

  // Drag-and-pan & click suppression state/refs
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartScroll = useRef({ left: 0, top: 0 });
  const hasDraggedRef = useRef(false);
  const suppressClickRef = useRef(false);

  // Handle Mouse Down for panning (supports Middle Mouse Button / Rotellina AND Left Button on background)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // If resize is active, do not pan
    if (activeResizeRef.current) return;

    const isMiddleClick = e.button === 1; // Middle button / Mouse wheel click
    const isLeftClick = e.button === 0;

    if (!isMiddleClick && !isLeftClick) return;

    const target = e.target as HTMLElement;
    // For left-click, do not initiate background drag if clicking buttons, links, inputs or handles
    if (isLeftClick && target.closest('button, a, input, select, textarea, [data-resize-handle="true"]')) {
      return;
    }

    if (isMiddleClick) {
      e.preventDefault(); // Stop native browser auto-scroll icon
    }

    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    if (scrollContainerRef.current) {
      dragStartScroll.current = {
        left: scrollContainerRef.current.scrollLeft,
        top: scrollContainerRef.current.scrollTop
      };
    }
  };

  // Global mousemove and mouseup listeners for drag pan & edge resize
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // 1. If actively resizing an event or zone:
      if (activeResizeRef.current && scrollContainerRef.current) {
        setMousePos({ x: e.clientX, y: e.clientY });
        const container = scrollContainerRef.current;
        const rect = container.getBoundingClientRect();
        const currentMouseTimelineX = e.clientX - rect.left + container.scrollLeft;
        const targetHandleTimelineX = currentMouseTimelineX - (activeResizeRef.current.grabOffsetX || 0);

        const handleType = activeResizeRef.current.handleType;
        let rawDayIndex: number;
        let isHalfDay = false;

        if (handleType === 'end' || handleType === 'zone-return') {
          // When dragging the right edge of return/teardown:
          // Boundary B is at (dayIndex + 1) * colWidth.
          // Snapping closest boundary B gives rawDayIndex = B - 1:
          const boundaryIndex = Math.round(targetHandleTimelineX / columnWidthRef.current);
          rawDayIndex = boundaryIndex - 1;
        } else if (handleType === 'show-end' || handleType === 'zone-teardown-start') {
          // Half day can ONLY be on the LAST day (return/envelope end date)
          const targetEv = lists.find(l => l.id === activeResizeRef.current?.eventId);
          const zone = activeResizeRef.current?.zoneId && targetEv?.zones 
            ? targetEv.zones.find(z => z.id === activeResizeRef.current?.zoneId) 
            : undefined;
          const endStr = zone 
            ? (zone.returnDate || zone.teardownDate || targetEv?.returnDate || targetEv?.teardownDate || targetEv?.endDate || targetEv?.eventDate)
            : (targetEv?.returnDate || targetEv?.teardownDate || targetEv?.endDate || targetEv?.eventDate);
          const lastDayIndex = endStr ? getCalendarDayDiff(timelineStart, parseLocalDate(endStr)) : 0;

          const rawIndexFloat = targetHandleTimelineX / columnWidthRef.current;
          // Half day is permitted ONLY when dragging on the last day:
          if (Math.abs(rawIndexFloat - (lastDayIndex + 0.5)) < 0.35) {
            rawDayIndex = lastDayIndex;
            isHalfDay = true;
          } else {
            rawDayIndex = Math.round(rawIndexFloat);
            isHalfDay = false;
          }
        } else if (handleType === 'show-start' || handleType === 'zone-show') {
          // Half day can ONLY be on the FIRST day (setup date)
          const targetEv = lists.find(l => l.id === activeResizeRef.current?.eventId);
          const zone = activeResizeRef.current?.zoneId && targetEv?.zones 
            ? targetEv.zones.find(z => z.id === activeResizeRef.current?.zoneId) 
            : undefined;
          const setupStr = zone 
            ? (zone.setupDate || targetEv?.setupDate || targetEv?.truckLoadDate || targetEv?.eventDate) 
            : (targetEv?.setupDate || targetEv?.truckLoadDate || targetEv?.eventDate);
          const firstDayIndex = setupStr ? getCalendarDayDiff(timelineStart, parseLocalDate(setupStr)) : 0;

          const rawIndexFloat = targetHandleTimelineX / columnWidthRef.current;
          // Half day is permitted ONLY when dragging on the first day:
          if (Math.abs(rawIndexFloat - (firstDayIndex + 0.5)) < 0.35) {
            rawDayIndex = firstDayIndex;
            isHalfDay = true;
          } else {
            rawDayIndex = Math.round(rawIndexFloat);
            isHalfDay = false;
          }
        } else {
          // Left edge (start, zone-setup):
          rawDayIndex = Math.round(targetHandleTimelineX / columnWidthRef.current);
        }

        const candidateDate = addCalendarDays(timelineStart, rawDayIndex);

        const minDate = activeResizeRef.current.minDate;
        const maxDate = activeResizeRef.current.maxDate;
        let clampedDate = candidateDate;
        if (clampedDate.getTime() < minDate.getTime()) {
          clampedDate = new Date(minDate);
          isHalfDay = false;
        } else if (clampedDate.getTime() > maxDate.getTime()) {
          clampedDate = new Date(maxDate);
          isHalfDay = false;
        }
        clampedDate.setHours(0, 0, 0, 0);

        const yyyyMmDd = toDateInputString(clampedDate);

        // Snap the green guide line directly onto the exact same position as the handle notch
        const targetEv = lists.find(l => l.id === activeResizeRef.current?.eventId);
        const snappedHandleTimelineX = getHandleTimelineX(
          yyyyMmDd, 
          handleType, 
          targetEv, 
          activeResizeRef.current?.zoneId,
          isHalfDay
        );

        activeResizeRef.current.currentHandleTimelineX = snappedHandleTimelineX;
        activeResizeRef.current.previewDateStr = yyyyMmDd;
        activeResizeRef.current.isHalfDay = isHalfDay;
        setActiveResizeState({ ...activeResizeRef.current });
        return;
      }

      // 2. Normal timeline canvas pan:
      if (!isDraggingRef.current || !scrollContainerRef.current) return;

      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;

      if (!hasDraggedRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }

      if (hasDraggedRef.current) {
        scrollContainerRef.current.scrollLeft = dragStartScroll.current.left - dx;
        scrollContainerRef.current.scrollTop = dragStartScroll.current.top - dy;
      }
    };

    const handleGlobalMouseUp = async () => {
      // 1. If finished resizing an event or zone:
      if (activeResizeRef.current) {
        const resize = activeResizeRef.current;
        const originalYmd = toDateInputString(parseLocalDate(resize.currentDateStr));
        const newYmd = resize.previewDateStr;
        const isHalfDay = !!resize.isHalfDay;

        if (newYmd && (newYmd !== originalYmd || resize.isHalfDay !== undefined)) {
          const targetEvent = lists.find(l => l.id === resize.eventId);
          let eventUpdates: Partial<PackingList> = {};

          if (resize.targetType === 'event') {
            if (resize.handleType === 'show-end') {
              if (isHalfDay) {
                // Same-day: show ends at midday, teardown starts at midday on newYmd
                eventUpdates.endDate = newYmd;
                eventUpdates.teardownDate = newYmd;
              } else {
                // Midnight: teardown starts on newYmd, show ended on previous day
                const prevDate = addCalendarDays(parseLocalDate(newYmd), -1);
                eventUpdates.endDate = toDateInputString(prevDate);
                eventUpdates.teardownDate = newYmd;
              }
              if (targetEvent?.returnDate && targetEvent.returnDate < newYmd) {
                eventUpdates.returnDate = newYmd;
              }
            } else if (resize.handleType === 'show-start') {
              eventUpdates.eventDate = newYmd;
              // Never mutate setupDate when moving show-start!
            } else {
              eventUpdates = {
                [resize.fieldToUpdate]: newYmd
              };
            }
          } else if (resize.targetType === 'zone' && resize.zoneId && targetEvent && targetEvent.zones) {
            const updatedZones = targetEvent.zones.map(z => {
              if (z.id !== resize.zoneId) return z;
              const updated: any = { ...z };
              if (resize.handleType === 'zone-teardown-start') {
                if (isHalfDay) {
                  updated.endDate = newYmd;
                  updated.teardownDate = newYmd;
                } else {
                  const prevDate = addCalendarDays(parseLocalDate(newYmd), -1);
                  updated.endDate = toDateInputString(prevDate);
                  updated.teardownDate = newYmd;
                }
                if (z.returnDate && z.returnDate < newYmd) {
                  updated.returnDate = newYmd;
                }
              } else if (resize.handleType === 'zone-show') {
                updated.showDate = newYmd;
                // Never mutate setupDate when moving zone-show!
              } else {
                updated[resize.fieldToUpdate] = newYmd;
              }
              return updated;
            });
            // Update ONLY the zones array so other zones keep their own dates without jumping!
            eventUpdates = { zones: updatedZones };
          }

          // Apply optimistic override synchronously to eliminate any release flicker
          setOptimisticOverrides(prev => {
            const next = new Map(prev);
            const existing = next.get(resize.eventId) || {};
            next.set(resize.eventId, { ...existing, ...eventUpdates });
            return next;
          });

          // Clear active drag state
          activeResizeRef.current = null;
          setActiveResizeState(null);

          try {
            await updateItemFields(COLL_LISTS, resize.eventId, eventUpdates);
          } catch (err) {
            console.error('Errore durante salvataggio ridimensionamento timeline:', err);
          }
        } else {
          activeResizeRef.current = null;
          setActiveResizeState(null);
        }

        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 150);
        return;
      }

      // 2. Normal timeline canvas pan:
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);

        if (hasDraggedRef.current) {
          suppressClickRef.current = true;
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 120);
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [lists, timelineStart]);

  // Native non-passive Wheel & Touch listeners (Ctrl+Wheel Zoom, Shift/Wheel Pan, Touch Pinch)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // 1. Ctrl or Meta + Wheel -> Zoom in/out
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const focalX = e.clientX - rect.left;
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        handleZoomRef.current(columnWidthRef.current + delta, focalX);
        return;
      }

      // 2. Shift + Wheel or vertical wheel on timeline without vertical scroll -> Horizontal pan
      if (e.shiftKey) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const hasVerticalOverflow = container.scrollHeight > container.clientHeight + 10;
        if (!hasVerticalOverflow) {
          e.preventDefault();
          container.scrollLeft += e.deltaY;
        }
      }
    };

    // Mobile Pinch-to-zoom
    let pinchStartDist = 0;
    let pinchStartWidth = DEFAULT_COLUMN_WIDTH;
    let pinchFocalX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchStartWidth = columnWidthRef.current;
        const rect = container.getBoundingClientRect();
        pinchFocalX = ((t1.clientX + t2.clientX) / 2) - rect.left;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        if (e.cancelable) e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scale = dist / pinchStartDist;
        const newWidth = Math.round(pinchStartWidth * scale);
        handleZoomRef.current(newWidth, pinchFocalX);
      }
    };

    const handleTouchEnd = () => {
      pinchStartDist = 0;
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Mobile single touch gesture tracking to prevent accidental clicks when swiping/scrolling
  const touchStartPos = useRef({ x: 0, y: 0 });
  const onSingleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      hasDraggedRef.current = false;
    }
  };

  const onSingleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
      if (dx > 8 || dy > 8) {
        hasDraggedRef.current = true;
      }
    }
  };

  const onSingleTouchEnd = () => {
    if (hasDraggedRef.current) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 120);
    }
  };

  const toggleEventZones = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedEventZoneIds(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const hasInitialCentered = useRef(false);

  // Center scroll on today on initial load
  useEffect(() => {
    if (!hasInitialCentered.current && scrollContainerRef.current && days.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTime = today.getTime();
      const todayIndex = days.findIndex(d => d.getTime() === todayTime);
      if (todayIndex !== -1) {
        scrollContainerRef.current.scrollLeft = Math.max(0, todayIndex * columnWidth - 200);
        hasInitialCentered.current = true;
      }
    }
  }, [days]);

  const scrollToToday = () => {
    if (!scrollContainerRef.current || days.length === 0) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIndex = days.findIndex(d => d.getTime() === today.getTime());
    if (todayIndex !== -1) {
      const container = scrollContainerRef.current;
      const targetScroll = Math.max(0, (todayIndex * columnWidth) - (container.clientWidth / 2) + (columnWidth / 2));
      container.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  };

  const scrollByAmount = (amount: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Start drag-resizing an event edge (Desktop only)
  const startDragEvent = (
    event: PackingList,
    handle: 'start' | 'show-start' | 'show-end' | 'end',
    e: React.MouseEvent
  ) => {
    if (!isDesktop) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = true;

    const eventStart = parseLocalDate(event.truckLoadDate || event.setupDate || event.eventDate || event.creationDate);
    const eventEnd = parseLocalDate(event.returnDate || event.teardownDate || event.endDate || event.eventDate || event.creationDate, eventStart);

    let fieldToUpdate = 'setupDate';
    let label = 'Inizio Montaggio';
    let initialDateStr = event.setupDate || event.truckLoadDate || event.eventDate || '';
    let minDate = new Date(timelineStart);
    let maxDate = new Date(eventEnd);

    if (handle === 'start') {
      if (event.truckLoadDate && event.truckLoadDate !== event.setupDate) {
        fieldToUpdate = 'truckLoadDate';
        label = 'Inizio Carico';
        initialDateStr = event.truckLoadDate;
      } else if (event.setupDate) {
        fieldToUpdate = 'setupDate';
        label = 'Inizio Montaggio';
        initialDateStr = event.setupDate;
      } else {
        fieldToUpdate = 'eventDate';
        label = 'Inizio Evento';
        initialDateStr = event.eventDate || '';
      }
      maxDate = parseLocalDate(event.eventDate || event.setupDate);
    } else if (handle === 'show-start') {
      fieldToUpdate = 'eventDate';
      label = 'Inizio Show';
      initialDateStr = event.eventDate || '';
      minDate = parseLocalDate(event.setupDate || event.truckLoadDate || event.eventDate);
      maxDate = parseLocalDate(event.teardownDate || event.endDate || event.eventDate);
    } else if (handle === 'show-end') {
      fieldToUpdate = 'teardownDate';
      label = 'Fine Show / Inizio Smontaggio';
      initialDateStr = event.teardownDate || event.endDate || event.eventDate || '';
      minDate = parseLocalDate(event.eventDate || event.setupDate || event.creationDate);
      maxDate = addCalendarDays(new Date(), 180);
    } else if (handle === 'end') {
      fieldToUpdate = 'returnDate';
      label = 'Fine Smontaggio';
      initialDateStr = event.returnDate || event.teardownDate || event.endDate || event.eventDate || '';
      minDate = parseLocalDate(event.teardownDate || event.endDate || event.eventDate);
      maxDate = addCalendarDays(new Date(), 180);
    }
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(0, 0, 0, 0);

    let initialIsHalfDay = false;
    if (handle === 'show-end') {
      const showEndStr = event.endDate?.trim() || event.eventDate?.trim() || '';
      const teardownStr = event.teardownDate?.trim() || '';
      const returnStr = event.returnDate?.trim() || teardownStr;
      initialIsHalfDay = (teardownStr === showEndStr) && (teardownStr === returnStr);
    } else if (handle === 'show-start') {
      const setupStr = event.setupDate?.trim() || event.truckLoadDate?.trim() || '';
      const showStr = event.eventDate?.trim() || '';
      initialIsHalfDay = setupStr === showStr;
    }

    const initialHandleTimelineX = getHandleTimelineX(initialDateStr, handle, event, undefined, initialIsHalfDay);
    const container = scrollContainerRef.current;
    const rect = container ? container.getBoundingClientRect() : { left: 0 };
    const scrollLeft = container ? container.scrollLeft : 0;
    const clickTimelineX = e.clientX - rect.left + scrollLeft;
    const grabOffsetX = clickTimelineX - initialHandleTimelineX;

    const state: ResizeDragState = {
      targetType: 'event',
      eventId: event.id,
      handleType: handle,
      fieldToUpdate,
      label,
      minDate,
      maxDate,
      currentDateStr: initialDateStr,
      previewDateStr: toDateInputString(parseLocalDate(initialDateStr)),
      initialHandleTimelineX,
      grabOffsetX,
      currentHandleTimelineX: initialHandleTimelineX,
      isHalfDay: initialIsHalfDay
    };

    activeResizeRef.current = state;
    setActiveResizeState(state);
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // Start drag-resizing a zone edge (Desktop only)
  const startDragZone = (
    event: PackingList,
    zone: ListZone,
    handle: 'zone-setup' | 'zone-show' | 'zone-teardown-start' | 'zone-return',
    e: React.MouseEvent
  ) => {
    if (!isDesktop) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = true;

    const defaultSetupStr = event.setupDate?.trim() || event.truckLoadDate?.trim() || event.eventDate?.trim() || event.creationDate?.trim();
    const defaultShowStr = event.eventDate?.trim() || defaultSetupStr;
    const defaultTeardownStr = event.teardownDate?.trim() || event.returnDate?.trim() || event.endDate?.trim() || defaultShowStr;
    const defaultReturnStr = event.returnDate?.trim() || defaultTeardownStr;

    const curSetupStr = zone.setupDate || defaultSetupStr || '';
    const curShowStr = zone.showDate || defaultShowStr || '';
    const curTeardownStr = zone.teardownDate || defaultTeardownStr || '';
    const curReturnStr = zone.returnDate || defaultReturnStr || '';

    let fieldToUpdate = 'setupDate';
    let label = `Inizio Allestimento ${zone.name}`;
    let initialDateStr = curSetupStr;
    let minDate = new Date(timelineStart);
    let maxDate = parseLocalDate(curShowStr);

    if (handle === 'zone-setup') {
      fieldToUpdate = 'setupDate';
      label = `Inizio Allestimento ${zone.name}`;
      initialDateStr = curSetupStr;
      minDate = new Date(timelineStart);
      maxDate = parseLocalDate(curShowStr);
    } else if (handle === 'zone-show') {
      fieldToUpdate = 'showDate';
      label = `Inizio Show ${zone.name}`;
      initialDateStr = curShowStr;
      minDate = parseLocalDate(curSetupStr);
      maxDate = parseLocalDate(curTeardownStr || curReturnStr || curShowStr);
    } else if (handle === 'zone-teardown-start') {
      fieldToUpdate = 'teardownDate';
      label = `Fine Show / Inizio Smontaggio ${zone.name}`;
      initialDateStr = curTeardownStr;
      minDate = parseLocalDate(curShowStr);
      maxDate = addCalendarDays(new Date(), 180);
    } else if (handle === 'zone-return') {
      fieldToUpdate = 'returnDate';
      label = `Fine Smontaggio ${zone.name}`;
      initialDateStr = curReturnStr;
      minDate = parseLocalDate(curTeardownStr);
      maxDate = addCalendarDays(new Date(), 180);
    }
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(0, 0, 0, 0);

    let initialIsHalfDay = false;
    if (handle === 'zone-teardown-start') {
      const defaultShowEndStr = event.endDate?.trim() || defaultShowStr;
      const zoneShowEndStr = (zone as any).endDate?.trim() || curShowStr || defaultShowEndStr;
      const zoneReturnStr = curReturnStr || curTeardownStr;
      initialIsHalfDay = (curTeardownStr === zoneShowEndStr) && (curTeardownStr === zoneReturnStr);
    } else if (handle === 'zone-show') {
      initialIsHalfDay = curShowStr === curSetupStr;
    }

    const initialHandleTimelineX = getHandleTimelineX(initialDateStr, handle, event, zone.id, initialIsHalfDay);
    const container = scrollContainerRef.current;
    const rect = container ? container.getBoundingClientRect() : { left: 0 };
    const scrollLeft = container ? container.scrollLeft : 0;
    const clickTimelineX = e.clientX - rect.left + scrollLeft;
    const grabOffsetX = clickTimelineX - initialHandleTimelineX;

    const state: ResizeDragState = {
      targetType: 'zone',
      eventId: event.id,
      zoneId: zone.id,
      handleType: handle,
      fieldToUpdate,
      label,
      minDate,
      maxDate,
      currentDateStr: initialDateStr,
      previewDateStr: toDateInputString(parseLocalDate(initialDateStr)),
      initialHandleTimelineX,
      grabOffsetX,
      currentHandleTimelineX: initialHandleTimelineX,
      isHalfDay: initialIsHalfDay
    };

    activeResizeRef.current = state;
    setActiveResizeState(state);
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // Reusable Resize Handle component (Desktop Only)
  const ResizeHandle: React.FC<{
    position: 'left' | 'right';
    label: string;
    onStartDrag: (e: React.MouseEvent) => void;
    className?: string;
    isDraggingThis?: boolean;
  }> = ({ position, label, onStartDrag, className = '', isDraggingThis = false }) => {
    if (!isDesktop) return null;
    return (
      <div
        data-resize-handle="true"
        onMouseDown={onStartDrag}
        onClick={(e) => {
          e.stopPropagation();
        }}
        title={`Trascina per modificare data (${label})`}
        className={`absolute top-0 bottom-0 w-6 z-40 cursor-col-resize flex items-center justify-center group/handle select-none ${
          position === 'left' ? '-left-3' : '-right-3'
        } ${className}`}
      >
        <div className={`w-1 rounded-full transition-all shadow-md pointer-events-none ${
          isDraggingThis 
            ? 'h-full bg-emerald-400 w-1.5 shadow-[0_0_8px_rgba(52,211,153,0.9)]' 
            : 'h-5 bg-white/40 group-hover/handle:bg-emerald-400 group-hover/handle:w-1.5 group-hover/handle:h-full'
        }`} />
      </div>
    );
  };

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
      <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <CalendarIcon size={20} className="text-emerald-500" />
          </div>
          <h1 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">Timeline Eventi</h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <div className="hidden md:flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div>
              <span className="text-slate-400">Completato</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-amber-500 rounded-sm"></div>
              <span className="text-slate-400">In Corso</span>
            </div>
          </div>

          {/* Zoom Controls Bar */}
          <div className="flex items-center bg-slate-800/90 rounded-lg p-0.5 border border-slate-700/80 shadow-sm">
            <button
              type="button"
              onClick={() => handleZoom(columnWidth - ZOOM_STEP)}
              disabled={columnWidth <= MIN_COLUMN_WIDTH}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/80 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
              title="Riduci Zoom (Ctrl + Rotellina Giù)"
              aria-label="Riduci Zoom"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(DEFAULT_COLUMN_WIDTH)}
              className="px-2 py-0.5 text-[11px] font-mono font-bold text-slate-300 hover:text-emerald-400 hover:bg-slate-700/60 rounded transition-colors"
              title="Reimposta Zoom al 100%"
            >
              {Math.round((columnWidth / DEFAULT_COLUMN_WIDTH) * 100)}%
            </button>
            <button
              type="button"
              onClick={() => handleZoom(columnWidth + ZOOM_STEP)}
              disabled={columnWidth >= MAX_COLUMN_WIDTH}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/80 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
              title="Aumenta Zoom (Ctrl + Rotellina Su)"
              aria-label="Aumenta Zoom"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          {/* Centra su Oggi Button */}
          <button
            type="button"
            onClick={scrollToToday}
            className="px-2.5 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
            title="Centra su Oggi"
          >
            <CalendarIcon size={14} className="text-blue-400" />
            <span className="hidden sm:inline">Oggi</span>
          </button>

          {/* Toggle Zone Visibility Button (Strictly Icon Only) */}
          <button
            type="button"
            onClick={() => setShowZones(prev => !prev)}
            className={`p-2 rounded-lg border transition-all active:scale-95 flex items-center justify-center ${
              showZones 
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40 shadow-sm' 
                : 'bg-slate-800 text-slate-400 border-slate-700/80 hover:text-white hover:bg-slate-700'
            }`}
            title={showZones ? "Nascondi Zone Eventi" : "Mostra Zone Eventi"}
            aria-label={showZones ? "Nascondi Zone Eventi" : "Mostra Zone Eventi"}
          >
            <Layers size={18} />
          </button>

          <div className="text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">
            {activeEvents.length} Eventi
          </div>
        </div>
      </div>

      {/* Timeline Wrapper */}
      <div className="relative flex-1 flex flex-col overflow-hidden">
        {/* Scrollable Container with Drag-and-pan & Native Mobile Touch Scroll */}
        <div 
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={onSingleTouchStart}
          onTouchMove={onSingleTouchMove}
          onTouchEnd={onSingleTouchEnd}
          className={`flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative touch-pan-x touch-pan-y overscroll-x-contain ${
            isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
          }`}
        >
          {/* Timeline Surface */}
          <div 
            className="relative"
            style={{ 
              width: days.length * columnWidth, 
              minHeight: '100%',
              paddingBottom: 40
            }}
          >
            {/* 1. Date Headers (Sticky) */}
            <div className="sticky top-0 z-40 flex bg-slate-900/90 backdrop-blur border-b border-slate-800 select-none">
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
                    style={{ width: columnWidth }}
                  >
                    <span className={`text-[10px] font-black uppercase ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>
                      {columnWidth < 65 
                        ? day.toLocaleDateString('it-IT', { weekday: 'narrow' }) 
                        : day.toLocaleDateString('it-IT', { weekday: 'short' })}
                    </span>
                    <span className={`text-sm font-bold ${isToday ? 'text-white underline decoration-blue-500 decoration-2' : 'text-slate-300'}`}>
                      {columnWidth < 75 
                        ? day.getDate() 
                        : `${day.getDate()} ${day.toLocaleDateString('it-IT', { month: 'short' })}`}
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
                  style={{ width: columnWidth }}
                />
              ))}
            </div>

            {/* 3. Event Rows with Directly Attached Accordion Sub-Zones (Unified Window) */}
            <div className="relative py-6 space-y-4">
              {activeEvents.map((rawEvent) => {
                // Live preview override during drag resize + optimistic overrides
                const event = (() => {
                  let ev = rawEvent;
                  const opt = optimisticOverrides.get(rawEvent.id);
                  if (opt) {
                    ev = { ...ev, ...opt };
                  }
                  if (!activeResizeState || activeResizeState.eventId !== rawEvent.id) return ev;

                  if (activeResizeState.targetType === 'event') {
                    const updated: any = {
                      ...ev,
                      [activeResizeState.fieldToUpdate]: activeResizeState.previewDateStr
                    };
                    if (activeResizeState.handleType === 'show-end') {
                      if (activeResizeState.isHalfDay) {
                        updated.endDate = activeResizeState.previewDateStr;
                        updated.teardownDate = activeResizeState.previewDateStr;
                      } else {
                        const prevDate = addCalendarDays(parseLocalDate(activeResizeState.previewDateStr), -1);
                        updated.endDate = toDateInputString(prevDate);
                        updated.teardownDate = activeResizeState.previewDateStr;
                      }
                      if (ev.returnDate && ev.returnDate < activeResizeState.previewDateStr) {
                        updated.returnDate = activeResizeState.previewDateStr;
                      }
                    } else if (activeResizeState.handleType === 'show-start') {
                      updated.eventDate = activeResizeState.previewDateStr;
                    }
                    return updated;
                  }

                  if (activeResizeState.targetType === 'zone' && ev.zones) {
                    const updatedZones = ev.zones.map(z => {
                      if (z.id !== activeResizeState.zoneId) return z;
                      const updated: any = {
                        ...z,
                        [activeResizeState.fieldToUpdate]: activeResizeState.previewDateStr
                      };
                      if (activeResizeState.handleType === 'zone-teardown-start') {
                        if (activeResizeState.isHalfDay) {
                          updated.endDate = activeResizeState.previewDateStr;
                          updated.teardownDate = activeResizeState.previewDateStr;
                        } else {
                          const prevDate = addCalendarDays(parseLocalDate(activeResizeState.previewDateStr), -1);
                          updated.endDate = toDateInputString(prevDate);
                          updated.teardownDate = activeResizeState.previewDateStr;
                        }
                        if (z.returnDate && z.returnDate < activeResizeState.previewDateStr) {
                          updated.returnDate = activeResizeState.previewDateStr;
                        }
                      } else if (activeResizeState.handleType === 'zone-show') {
                        updated.showDate = activeResizeState.previewDateStr;
                      }
                      return updated;
                    });

                    // Only update zones array: do not mutate event.setupDate or event.returnDate
                    // so other zones don't shift!
                    return {
                      ...ev,
                      zones: updatedZones
                    };
                  }

                  return ev;
                })();

                const rawEventStart = parseLocalDate(event.truckLoadDate || event.setupDate || event.eventDate || event.creationDate);
                const rawEventEnd = parseLocalDate(event.returnDate || event.teardownDate || event.endDate || event.eventDate || event.creationDate, rawEventStart);
                rawEventStart.setHours(0, 0, 0, 0);
                rawEventEnd.setHours(0, 0, 0, 0);

                // Multiple zones check: ONLY IF zones.length > 1
                const hasMultipleZones = !!(event.zones && event.zones.length > 1);
                const isShowingEventZones = showZones && hasMultipleZones && !collapsedEventZoneIds.has(event.id);
                const zoneRowsCount = isShowingEventZones ? (event.zones?.length || 0) : 0;

                // Precompute zone segments if zones exist
                const zoneSegmentsList = (event.zones && event.zones.length > 0) 
                  ? event.zones.map(z => computeZoneSegments(z, event, rawEventStart, rawEventEnd))
                  : [];

                // Unified Window Bounding Box (Encompasses event and its zone dates)
                let groupStartTime = rawEventStart.getTime();
                let groupEndTime = rawEventEnd.getTime();

                // When an event has zones, the event bar spans from the earliest zone start to the latest zone end!
                // "In pratica se non ci sono zone all'inizio o alla fine non ci deve essere neanche la riga principale dell'evento."
                if (zoneSegmentsList.length > 0) {
                  const zoneStartTimes = zoneSegmentsList.map(zs => zs.zoneStartDate.getTime());
                  const zoneEndTimes = zoneSegmentsList.map(zs => zs.zoneEndDate.getTime());
                  groupStartTime = Math.min(...zoneStartTimes);
                  groupEndTime = Math.max(...zoneEndTimes);
                }

                const groupStart = new Date(groupStartTime);
                const groupEnd = new Date(groupEndTime);

                // Event bar visually spans the full envelope of its zones
                const eventStart = groupStart;
                const eventEnd = groupEnd;

                const diffGroupStart = getCalendarDayDiff(timelineStart, groupStart);
                const groupDuration = Math.max(1, getCalendarDayDiff(groupStart, groupEnd) + 1);

                const groupLeft = Math.max(0, diffGroupStart * columnWidth);
                const groupWidth = Math.max(columnWidth, groupDuration * columnWidth);

                // The event bar at the top spans the full width of the unified window (no gaps!)
                const eventRelLeft = 0;
                const eventRelWidth = groupWidth;
                
                // Heights: Main row 44px; Zone rows 28px each
                const mainBarHeight = 44;
                const zoneBarHeight = 28;
                const containerHeight = isShowingEventZones 
                  ? mainBarHeight + (zoneRowsCount * zoneBarHeight) + 4
                  : mainBarHeight + 4;

                return (
                  <div 
                    key={event.id} 
                    className="relative group/row"
                    style={{ 
                      width: days.length * columnWidth,
                      minHeight: containerHeight 
                    }}
                  >
                    {/* The Unified Event Window (Exploded downward when zones are opened) */}
                    <div 
                      className={`absolute z-10 overflow-hidden ${
                        isShowingEventZones 
                          ? 'rounded-xl border border-slate-600/90 bg-slate-900/95 shadow-2xl shadow-black/80 ring-1 ring-white/10' 
                          : 'rounded-xl border border-slate-700/60 bg-slate-900/90 shadow-xl shadow-black/40 hover:border-slate-400'
                      }`}
                      style={{ 
                        left: groupLeft, 
                        width: groupWidth, 
                        top: 0 
                      }}
                    >
                      {/* 1. Window Header: Main Event Timeline Bar */}
                      <div 
                        onClick={(e) => {
                          if (suppressClickRef.current) return;
                          e.stopPropagation();
                          setSummaryEventId(event.id);
                        }}
                        className="relative w-full cursor-pointer group/bar transition-colors select-none"
                        style={{ height: mainBarHeight }}
                      >
                        <div 
                          className="relative h-full"
                          style={{
                            marginLeft: eventRelLeft,
                            width: eventRelWidth
                          }}
                        >
                          {/* Inner segments container with overflow-hidden and rounded corners */}
                          <div className="relative h-full flex overflow-hidden rounded-lg">
                            {(() => {
                              const segments = [];
                              const truckStart = event.truckLoadDate ? parseLocalDate(event.truckLoadDate, eventStart) : null;
                              if (truckStart) truckStart.setHours(0, 0, 0, 0);

                              // Setup begins at groupStartTime if any zone starts earlier
                              const baseSetupDate = parseLocalDate(event.setupDate || event.eventDate || event.creationDate, eventStart);
                              baseSetupDate.setHours(0, 0, 0, 0);
                              const setupStart = new Date(Math.min(baseSetupDate.getTime(), groupStartTime));

                              const showStart = parseLocalDate(event.eventDate || event.creationDate, eventStart);
                              showStart.setHours(0, 0, 0, 0);

                              const showEnd = parseLocalDate(event.endDate || event.eventDate || event.creationDate, showStart);
                              showEnd.setHours(0, 0, 0, 0);

                              const teardownStart = parseLocalDate(event.teardownDate || event.endDate || event.eventDate || event.creationDate, showEnd);
                              teardownStart.setHours(0, 0, 0, 0);

                              // Smontaggio ends at groupEndTime if any zone ends later
                              const baseReturnDate = parseLocalDate(event.returnDate || event.teardownDate || event.endDate || event.eventDate, teardownStart);
                              baseReturnDate.setHours(0, 0, 0, 0);
                              const returnEnd = new Date(Math.max(baseReturnDate.getTime(), groupEndTime));

                              const getDays = (d1: Date, d2: Date) => {
                                return Math.max(0, getCalendarDayDiff(d1, d2));
                              };

                              // 1. Carico (Loading)
                              let truckDays = 0;
                              if (truckStart && truckStart.getTime() < setupStart.getTime()) {
                                truckDays = getDays(truckStart, setupStart);
                                if (truckDays > 0) {
                                  segments.push({
                                    type: 'truck',
                                    label: 'Carico',
                                    days: truckDays,
                                    className: 'bg-slate-800/80 border-r border-slate-700/50 text-slate-400',
                                    icon: <Truck size={10} />
                                  });
                                }
                              }

                              const hasExplicitSetup = !!(event.setupDate?.trim() || event.truckLoadDate?.trim());
                              const diffSetupShow = getDays(setupStart, showStart);
                              const showEndStr = toDateInputString(showEnd);
                              const teardownStartStr = toDateInputString(teardownStart);
                              const extraReturnDays = getDays(teardownStart, groupEnd);
                              const isSameDayTeardown = teardownStartStr === showEndStr;
                              const isTeardownOnLastDay = extraReturnDays === 0;
                              const isLastDayHalfTeardown = isSameDayTeardown && isTeardownOnLastDay;

                              // 2. Montaggio (Setup)
                              let setupDays = 0;
                              if (diffSetupShow > 0) {
                                setupDays = diffSetupShow;
                              } else if (hasExplicitSetup) {
                                if (groupDuration === 1 && isLastDayHalfTeardown) {
                                  setupDays = 1 / 3;
                                } else {
                                  setupDays = 0.5;
                                }
                              }

                              if (setupDays > 0) {
                                segments.push({
                                  type: 'setup',
                                  label: 'Setup',
                                  days: setupDays,
                                  className: 'bg-amber-600/30 border-r border-amber-500/30 text-amber-400',
                                  icon: <Wrench size={10} />
                                });
                              }

                              // 4. Smontaggio / Rientro (Teardown -> Return)
                              // Half-day split (0.5) ONLY on the LAST day when show and teardown finish on that same last day!
                              // In middle days or when teardown continues across days, teardown starts at midnight (full days)!
                              let teardownDays = 0;
                              if (isLastDayHalfTeardown) {
                                if (groupDuration === 1 && setupDays > 0) {
                                  teardownDays = 1 / 3;
                                } else {
                                  teardownDays = 0.5;
                                }
                              } else {
                                teardownDays = extraReturnDays + 1;
                              }

                              // 3. Evento (Show -> Teardown)
                              const showDays = Math.max(0.2, groupDuration - truckDays - setupDays - teardownDays);

                              segments.push({
                                type: 'show',
                                label: event.eventName || 'Evento',
                                days: showDays,
                                className: event.isCompleted 
                                  ? 'bg-emerald-600/50 border-r border-emerald-400/30 text-emerald-100 font-black' 
                                  : 'bg-blue-600/50 border-r border-blue-400/30 text-blue-100 font-black',
                                icon: <Star size={10} />,
                                isMain: true
                              });

                              segments.push({
                                type: 'teardown',
                                label: 'Smont.',
                                days: teardownDays,
                                className: 'bg-rose-600/30 text-rose-400',
                                icon: <Anchor size={10} />
                              });

                              const totalSegDays = groupDuration;
                              const hasSetupOrTruck = segments.some(s => s.type === 'setup' || s.type === 'truck');
                              const hasTeardown = segments.some(s => s.type === 'teardown');

                              return segments.map((seg, idx) => {
                                return (
                                  <div 
                                    key={idx}
                                    className={`h-full flex flex-col justify-center px-2 min-w-0 relative ${seg.className}`}
                                    style={{ width: `${(seg.days / totalSegDays) * 100}%` }}
                                    title={`${event.eventName || 'Evento'} - ${seg.label}`}
                                  >
                                    {/* Subtle Day Boundary Lines inside segments */}
                                    {(() => {
                                      const lines: number[] = [];
                                      for (let day = 1; day < seg.days; day += 1) {
                                        lines.push(day);
                                      }
                                      // If segment ends with a half-day before a boundary (e.g. 2.5 days),
                                      // the last full day boundary is at day = seg.days - 0.5:
                                      const lastFullDay = seg.days - 0.5;
                                      if (lastFullDay > 0 && Number.isInteger(lastFullDay) && !lines.includes(lastFullDay)) {
                                        lines.push(lastFullDay);
                                      }
                                      return lines.map((dayNum, dIdx) => (
                                        <div 
                                          key={dIdx}
                                          className="absolute top-0 bottom-0 pointer-events-none border-r border-white/20"
                                          style={{ left: `${(dayNum / seg.days) * 100}%` }}
                                        />
                                      ));
                                    })()}

                                    <div className="flex items-center gap-1 overflow-hidden relative z-10">
                                      <span className="shrink-0 opacity-70">{seg.icon}</span>
                                      <span className="text-[10px] uppercase tracking-tighter truncate font-bold">
                                        {seg.label}
                                      </span>
                                    </div>
                                    {seg.isMain && (
                                      <div className="flex items-center gap-1.5 mt-0.5 opacity-80 relative z-10">
                                        <MapPin size={8} />
                                        <span className="text-[8px] truncate italic">{event.location || 'N/D'}</span>
                                      </div>
                                    )}

                                    {/* Internal split handle between Setup and Show */}
                                    {isDesktop && (seg.type === 'setup' || (seg.type === 'truck' && !hasSetupOrTruck)) && (
                                      <ResizeHandle 
                                        position="right" 
                                        label="Inizio Show" 
                                        onStartDrag={(e) => startDragEvent(event, 'show-start', e)} 
                                        isDraggingThis={activeResizeState?.targetType === 'event' && activeResizeState?.eventId === event.id && activeResizeState?.handleType === 'show-start'}
                                      />
                                    )}

                                    {/* Internal split handle between Show and Teardown */}
                                    {isDesktop && seg.type === 'show' && hasTeardown && (
                                      <ResizeHandle 
                                        position="right" 
                                        label="Fine Show / Inizio Smontaggio" 
                                        onStartDrag={(e) => startDragEvent(event, 'show-end', e)} 
                                        isDraggingThis={activeResizeState?.targetType === 'event' && activeResizeState?.eventId === event.id && activeResizeState?.handleType === 'show-end'}
                                      />
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Outer handles on the Left and Right edges of the event */}
                          {isDesktop && (
                            <>
                              <ResizeHandle 
                                position="left" 
                                label="Inizio Allestimento" 
                                onStartDrag={(e) => startDragEvent(event, 'start', e)} 
                                isDraggingThis={activeResizeState?.targetType === 'event' && activeResizeState?.eventId === event.id && activeResizeState?.handleType === 'start'}
                              />
                              <ResizeHandle 
                                position="right" 
                                label="Fine Smontaggio" 
                                onStartDrag={(e) => startDragEvent(event, 'end', e)} 
                                isDraggingThis={activeResizeState?.targetType === 'event' && activeResizeState?.eventId === event.id && activeResizeState?.handleType === 'end'}
                              />
                            </>
                          )}
                        </div>
                        
                        {/* Overlay Controls & Status Icon */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 z-20">
                          {/* Toggle Tendina Zone (Only if zones > 1) */}
                          {hasMultipleZones && (
                            <button
                              type="button"
                              onClick={(e) => toggleEventZones(event.id, e)}
                              className={`px-1.5 py-0.5 rounded-md border flex items-center gap-1 text-[10px] font-bold shadow-sm transition-all active:scale-95 ${
                                isShowingEventZones
                                  ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400 shadow-emerald-950/40'
                                  : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white'
                              }`}
                              title={isShowingEventZones ? "Chiudi tendina zone" : "Apri tendina zone"}
                              aria-label={isShowingEventZones ? "Chiudi tendina zone" : "Apri tendina zone"}
                            >
                              <Layers size={11} />
                              <span>{event.zones!.length}</span>
                            </button>
                          )}

                          {event.isCompleted ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                              <ChevronRight size={12} className="text-emerald-950" />
                            </div>
                          ) : (
                            <Clock size={16} className="text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" />
                          )}
                        </div>
                      </div>

                      {/* 2. Window Body: Zone Rows directly joined to the event row with ZERO gap, ZERO padding, ZERO separation line */}
                      {isShowingEventZones && event.zones && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          className="w-full flex flex-col"
                        >
                          {event.zones.map((zone, zIdx) => {
                            const zs = zoneSegmentsList[zIdx];
                            if (!zs) return null;
                            const { zoneStartDate, segments, totalSegDays } = zs;

                            const curZoneRelLeft = getCalendarDayDiff(groupStart, zoneStartDate) * columnWidth;
                            const curZoneWidth = totalSegDays * columnWidth;

                            return (
                              <div
                                key={zone.id}
                                className="relative w-full flex items-center transition-colors group/zonerow hover:bg-white/5"
                                style={{ height: zoneBarHeight }}
                              >
                                <div
                                  onClick={(e) => {
                                    if (suppressClickRef.current) return;
                                    e.stopPropagation();
                                    setSelectedZone({ zone, event });
                                  }}
                                  className="absolute h-full cursor-pointer"
                                  style={{ 
                                    left: curZoneRelLeft, 
                                    width: curZoneWidth 
                                  }}
                                >
                                  <div className="relative h-full flex overflow-hidden rounded-md">
                                    {segments.map((seg, sIdx) => {
                                      return (
                                        <div
                                          key={sIdx}
                                          className={`h-full flex flex-col justify-center px-2 min-w-0 relative ${seg.className}`}
                                          style={{ width: `${(seg.days / totalSegDays) * 100}%` }}
                                          title={seg.tooltip}
                                        >
                                          {/* Subtle Day Boundary Lines inside zone segments */}
                                          {(() => {
                                            const lines: number[] = [];
                                            for (let day = 1; day < seg.days; day += 1) {
                                              lines.push(day);
                                            }
                                            const lastFullDay = seg.days - 0.5;
                                            if (lastFullDay > 0 && Number.isInteger(lastFullDay) && !lines.includes(lastFullDay)) {
                                              lines.push(lastFullDay);
                                            }
                                            return lines.map((dayNum, dIdx) => (
                                              <div 
                                                key={dIdx}
                                                className="absolute top-0 bottom-0 pointer-events-none border-r border-white/20"
                                                style={{ left: `${(dayNum / seg.days) * 100}%` }}
                                              />
                                            ));
                                          })()}

                                          <div className="flex items-center gap-1 overflow-hidden relative z-10">
                                            <span className="shrink-0 opacity-80">{seg.icon}</span>
                                            <span className="text-[9px] uppercase tracking-tighter truncate font-bold">
                                              {seg.label}
                                            </span>
                                          </div>
                                          {seg.isMain && (
                                            <div className="flex items-center gap-1 opacity-75 text-[8px] truncate relative z-10">
                                              {zone.location && (
                                                <>
                                                  <MapPin size={7} className="shrink-0" />
                                                  <span className="truncate italic">{zone.location}</span>
                                                </>
                                              )}
                                              {zone.showTimeStart && (
                                                <span className="text-cyan-300 font-mono ml-auto">
                                                  {zone.showTimeStart}
                                                </span>
                                              )}
                                            </div>
                                          )}

                                          {/* Internal handle between Montaggio and Show for Zone */}
                                          {isDesktop && sIdx === 0 && !seg.isMain && (
                                            <ResizeHandle
                                              position="right"
                                              label={`Inizio Show ${zone.name}`}
                                              onStartDrag={(e) => startDragZone(event, zone, 'zone-show', e)}
                                              isDraggingThis={activeResizeState?.targetType === 'zone' && activeResizeState?.zoneId === zone.id && activeResizeState?.handleType === 'zone-show'}
                                            />
                                          )}

                                          {/* Internal handle between Show and Smontaggio for Zone */}
                                          {isDesktop && seg.isMain && (
                                            <ResizeHandle
                                              position="right"
                                              label={`Fine Show / Inizio Smontaggio ${zone.name}`}
                                              onStartDrag={(e) => startDragZone(event, zone, 'zone-teardown-start', e)}
                                              isDraggingThis={activeResizeState?.targetType === 'zone' && activeResizeState?.zoneId === zone.id && activeResizeState?.handleType === 'zone-teardown-start'}
                                            />
                                          )}
                                        </div>
                                      );
                                    })}

                                    {/* Zone Tag Badge */}
                                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-60 group-hover/zonerow:opacity-100 transition-opacity pointer-events-none">
                                      <span className="p-0.5 rounded bg-slate-950/80 text-emerald-400 border border-slate-800 flex items-center">
                                        <Layers size={9} />
                                      </span>
                                    </div>
                                  </div>

                                  {/* Outer Left & Right handles for Zone */}
                                  {isDesktop && (
                                    <>
                                      <ResizeHandle
                                        position="left"
                                        label={`Inizio Allestimento ${zone.name}`}
                                        onStartDrag={(e) => startDragZone(event, zone, 'zone-setup', e)}
                                        isDraggingThis={activeResizeState?.targetType === 'zone' && activeResizeState?.zoneId === zone.id && activeResizeState?.handleType === 'zone-setup'}
                                      />
                                      <ResizeHandle
                                        position="right"
                                        label={`Fine Smontaggio ${zone.name}`}
                                        onStartDrag={(e) => startDragZone(event, zone, 'zone-return', e)}
                                        isDraggingThis={activeResizeState?.targetType === 'zone' && activeResizeState?.zoneId === zone.id && activeResizeState?.handleType === 'zone-return'}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Current Time Indicator */}
            {(() => {
              const now = new Date();
              const wholeDayDiff = getCalendarDayDiff(timelineStart, now);
              const fraction = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
              const diffNow = wholeDayDiff + fraction;
              if (diffNow >= 0 && diffNow <= days.length) {
                return (
                  <div 
                    className="absolute top-0 bottom-0 z-30 pointer-events-none"
                    style={{ left: diffNow * columnWidth }}
                  >
                    <div className="h-full border-l-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] bg-blue-500/10"></div>
                    <div className="absolute top-14 -left-1.5 w-3 h-3 rounded-full bg-blue-500"></div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Drag Alignment Guide Line directly under mouse/handle */}
            {activeResizeState && (
              <div 
                className="absolute top-0 bottom-0 z-30 pointer-events-none"
                style={{ left: activeResizeState.currentHandleTimelineX }}
              >
                <div className="h-full border-l-2 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)] bg-emerald-400/5"></div>
                <div className="sticky top-14 -left-1.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-900 shadow-md"></div>
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        {(() => {
          const rawEv = lists.find(l => l.id === summaryEventId);
          const opt = summaryEventId ? optimisticOverrides.get(summaryEventId) : undefined;
          const summaryEv = rawEv ? (opt ? { ...rawEv, ...opt } : rawEv) : null;
          return (
            <EventSummaryModal 
              event={summaryEv}
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
              onUpdateZone={async (zoneId, updatedFields) => {
                if (summaryEv && summaryEv.zones) {
                  const updatedZones = summaryEv.zones.map(z => 
                    (z.id && zoneId ? z.id === zoneId : z.name === zoneId) ? { ...z, ...updatedFields } : z
                  );
                  let updatedSnapshot = summaryEv.snapshot;
                  if (updatedSnapshot && updatedSnapshot.length > 0) {
                    updatedSnapshot = updatedSnapshot.map(sz => 
                      (sz.id && zoneId ? sz.id === zoneId : sz.name === zoneId) ? { ...sz, ...updatedFields } : sz
                    );
                  }
                  setOptimisticOverrides(prev => {
                    const next = new Map(prev);
                    next.set(summaryEv.id, { 
                      ...(next.get(summaryEv.id) || {}), 
                      zones: updatedZones,
                      ...(updatedSnapshot ? { snapshot: updatedSnapshot } : {})
                    });
                    return next;
                  });
                  const payload: Partial<PackingList> = { zones: updatedZones };
                  if (updatedSnapshot) payload.snapshot = updatedSnapshot;
                  await updateItemFields(COLL_LISTS, summaryEv.id, payload);
                }
              }}
            />
          );
        })()}

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

        {/* Zone Details Modal (When clicking a zone bar) */}
        {selectedZone && (() => {
          const rawEv = selectedZone.event;
          const opt = optimisticOverrides.get(rawEv.id);
          const currentEvent = opt ? { ...rawEv, ...opt } : rawEv;
          const currentZone = currentEvent.zones?.find(z => 
            (z.id && selectedZone.zone.id ? z.id === selectedZone.zone.id : z.name === selectedZone.zone.name)
          ) || selectedZone.zone;

          return (
            <ZoneInfoModal
              zone={currentZone}
              event={currentEvent}
              isOpen={!!selectedZone}
              onClose={() => setSelectedZone(null)}
              onEdit={() => {
                const currZone = currentZone;
                const evId = currentEvent.id;
                setSelectedZone(null);
                setEditZoneData({ zone: currZone, eventId: evId });
              }}
            />
          );
        })()}

        {/* Zone Edit Modal (When editing a zone from info modal) */}
        {editZoneData && (() => {
          const rawTarget = lists.find(l => l.id === editZoneData.eventId);
          const opt = optimisticOverrides.get(editZoneData.eventId);
          const targetEvent = rawTarget ? (opt ? { ...rawTarget, ...opt } : rawTarget) : null;
          const currentZone = targetEvent?.zones?.find(z => 
            (z.id && editZoneData.zone.id ? z.id === editZoneData.zone.id : z.name === editZoneData.zone.name)
          ) || editZoneData.zone;

          return (
            <ZoneEditModal
              zone={currentZone}
              event={targetEvent}
              isOpen={!!editZoneData}
              onClose={() => setEditZoneData(null)}
              onSave={async (updatedFields) => {
                if (targetEvent && targetEvent.zones) {
                  const updatedZones = targetEvent.zones.map(z => 
                    (z.id && editZoneData.zone.id ? z.id === editZoneData.zone.id : z.name === editZoneData.zone.name)
                      ? { ...z, ...updatedFields }
                      : z
                  );
                  let updatedSnapshot = targetEvent.snapshot;
                  if (updatedSnapshot && updatedSnapshot.length > 0) {
                    updatedSnapshot = updatedSnapshot.map(sz => 
                      (sz.id && editZoneData.zone.id ? sz.id === editZoneData.zone.id : sz.name === editZoneData.zone.name)
                        ? { ...sz, ...updatedFields }
                        : sz
                    );
                  }
                  setOptimisticOverrides(prev => {
                    const next = new Map(prev);
                    next.set(targetEvent.id, { 
                      ...(next.get(targetEvent.id) || {}), 
                      zones: updatedZones,
                      ...(updatedSnapshot ? { snapshot: updatedSnapshot } : {})
                    });
                    return next;
                  });
                  const payload: Partial<PackingList> = { zones: updatedZones };
                  if (updatedSnapshot) payload.snapshot = updatedSnapshot;
                  await updateItemFields(COLL_LISTS, targetEvent.id, payload);
                }
                setEditZoneData(null);
              }}
            />
          );
        })()}

        {/* Floating Nav Hints */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-full shadow-2xl z-40 select-none">
          <button
            type="button"
            onClick={() => scrollByAmount(-300)}
            className="p-1 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-800 active:scale-90"
            title="Scorri a sinistra"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={scrollToToday}
            className="text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-blue-400 transition-colors px-1"
            title="Centra su Oggi"
          >
            Centra Oggi
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount(300)}
            className="p-1 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-800 active:scale-90"
            title="Scorri a destra"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Live Drag Resize Floating Tooltip (Desktop Only) */}
        {activeResizeState && (
          <div 
            className="fixed z-[9999] pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 px-3 py-1.5 bg-slate-900/95 text-white border border-emerald-500/80 rounded-xl shadow-2xl backdrop-blur text-xs font-bold flex items-center gap-2 whitespace-nowrap ring-1 ring-white/10"
            style={{ left: mousePos.x, top: mousePos.y - 12 }}
          >
            <CalendarIcon size={14} className="text-emerald-400 shrink-0" />
            <span className="text-slate-300 font-normal">{activeResizeState.label}:</span>
            <span className="text-emerald-400 font-mono font-bold tracking-wide">
              {formatItalianDate(activeResizeState.previewDateStr)}
              {activeResizeState.isHalfDay ? ' (Metà Giornata)' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
