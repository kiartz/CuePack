import type { ListZone, PackingList, ZoneSchedule } from '../types';

/**
 * ZONE SCHEDULES — Per-zone date storage isolated from the `zones` array.
 *
 * WHY: `zones` is a single big array field that is rewritten in full by many writers
 * (warehouse ticks in Preparazione Eventi, Crea Liste autosave, offline-queued writes replayed
 * minutes later by tablets). Any of those full-array writes carried the OLD zone dates and
 * silently reverted the dates set from the Calendar.
 *
 * FIX: zone dates are stored in `zoneSchedules.<zoneId>.<field>` and written with atomic
 * Firestore dot-path updates. No other writer ever touches `zoneSchedules`, and Calendar date
 * edits never touch `zones` (so they can never overwrite warehouse checkmarks either).
 * At read time the schedule is overlaid on `zones`, `draftZones` and `snapshot`.
 */

export const ZONE_SCHEDULE_FIELDS = [
  'setupDate',
  'showDate',
  'showTimeStart',
  'showTimeEnd',
  'endDate',
  'teardownDate',
  'returnDate'
] as const;

export type ZoneScheduleField = typeof ZONE_SCHEDULE_FIELDS[number];

const SAFE_ZONE_ID = /^[A-Za-z0-9_-]+$/;

/** Zone IDs must be safe Firestore field-path segments to be used as map keys. */
export const isScheduleableZoneId = (zoneId?: string): zoneId is string =>
  !!zoneId && SAFE_ZONE_ID.test(zoneId);

const overlayZone = (zone: ListZone, schedules: Record<string, ZoneSchedule>): ListZone => {
  const sched = zone.id ? schedules[zone.id] : undefined;
  if (!sched) return zone;
  let changed = false;
  const patched: any = { ...zone };
  for (const f of ZONE_SCHEDULE_FIELDS) {
    const v = (sched as any)[f];
    if (typeof v === 'string' && patched[f] !== v) {
      patched[f] = v;
      changed = true;
    }
  }
  return changed ? (patched as ListZone) : zone;
};

const overlayZones = (zones: ListZone[] | undefined, schedules: Record<string, ZoneSchedule>) =>
  Array.isArray(zones) ? zones.map(z => overlayZone(z, schedules)) : zones;

/**
 * Returns the list with `zoneSchedules` overlaid onto `zones`, `draftZones` and `snapshot`.
 * Returns the SAME object reference when there is nothing to overlay.
 */
export function applyZoneSchedules<T extends PackingList>(list: T): T {
  const schedules = list?.zoneSchedules;
  if (!schedules || Object.keys(schedules).length === 0) return list;
  return {
    ...list,
    zones: overlayZones(list.zones, schedules),
    draftZones: overlayZones(list.draftZones, schedules),
    snapshot: overlayZones(list.snapshot, schedules)
  };
}

/** Extracts only the schedule (date/time) fields from a partial zone update. */
export function pickScheduleFields(fields: Record<string, any>): Partial<Record<ZoneScheduleField, string>> {
  const out: Partial<Record<ZoneScheduleField, string>> = {};
  for (const f of ZONE_SCHEDULE_FIELDS) {
    if (fields[f] !== undefined && fields[f] !== null) out[f] = String(fields[f]);
  }
  return out;
}

/** Extracts the non-schedule metadata fields (name, notes, location, ...) from a partial zone update. */
export function pickMetaFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  Object.keys(fields).forEach(k => {
    if ((ZONE_SCHEDULE_FIELDS as readonly string[]).includes(k)) return;
    if (k === 'id' || k === 'sections') return;
    if (fields[k] !== undefined) out[k] = fields[k];
  });
  return out;
}

/** Keeps only the fields whose value differs from the current zone. */
export function diffAgainstZone<V>(fields: Record<string, V>, zone?: ListZone | null): Record<string, V> {
  const out: Record<string, V> = {};
  Object.keys(fields).forEach(k => {
    const cur = zone ? (zone as any)[k] : undefined;
    if ((cur ?? '') !== (fields[k] ?? '')) out[k] = fields[k];
  });
  return out;
}

/**
 * Builds the Firestore dot-path update payload for a zone schedule.
 * e.g. { 'zoneSchedules.z1.setupDate': '2026-10-29', 'zoneSchedules.z1.updatedAt': 123 }
 */
export function buildZoneSchedulePayload(
  zoneId: string,
  fields: Partial<Record<ZoneScheduleField, string>>,
  now: number = Date.now()
): Record<string, string | number> | null {
  if (!isScheduleableZoneId(zoneId)) return null;
  const keys = Object.keys(fields) as ZoneScheduleField[];
  if (keys.length === 0) return null;
  const payload: Record<string, string | number> = {};
  keys.forEach(k => {
    payload[`zoneSchedules.${zoneId}.${k}`] = fields[k] ?? '';
  });
  payload[`zoneSchedules.${zoneId}.updatedAt`] = now;
  return payload;
}

/** Merges schedule fields into a local `zoneSchedules` map (for optimistic UI). */
export function mergeZoneScheduleLocal(
  current: Record<string, ZoneSchedule> | undefined,
  zoneId: string,
  fields: Partial<Record<ZoneScheduleField, string>>,
  now: number = Date.now()
): Record<string, ZoneSchedule> {
  return {
    ...(current || {}),
    [zoneId]: { ...((current || {})[zoneId] || {}), ...fields, updatedAt: now }
  };
}

/**
 * Applies non-schedule metadata to a single zone inside an array, by id (or name fallback).
 * Leaves every other zone and all sections/warehouse state untouched.
 */
export function patchZoneMetaInArray(
  zones: ListZone[] | undefined,
  zoneId: string | undefined,
  zoneName: string | undefined,
  meta: Record<string, any>
): ListZone[] | undefined {
  if (!Array.isArray(zones)) return zones;
  let touched = false;
  const next = zones.map(z => {
    const match = (z.id && zoneId) ? z.id === zoneId : z.name === zoneName;
    if (!match) return z;
    touched = true;
    return { ...z, ...meta };
  });
  return touched ? next : zones;
}
