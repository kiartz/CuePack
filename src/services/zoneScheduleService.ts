import { doc, runTransaction } from 'firebase/firestore';
import { db, updateItemFields, COLL_LISTS } from '../firebase';
import type { ListZone, PackingList } from '../types';
import {
  buildZoneSchedulePayload,
  diffAgainstZone,
  isScheduleableZoneId,
  patchZoneMetaInArray,
  pickMetaFields,
  pickScheduleFields,
  type ZoneScheduleField
} from './zoneSchedule';

/**
 * Atomically saves zone dates into `zoneSchedules.<zoneId>.*` (dot-path update).
 * Never touches `zones`, `draftZones` or `snapshot` → cannot overwrite warehouse checkmarks,
 * and cannot be reverted by full-array `zones` writes from other devices.
 */
export async function saveZoneSchedule(
  listId: string,
  zoneId: string,
  fields: Partial<Record<ZoneScheduleField, string>>
): Promise<boolean> {
  const payload = buildZoneSchedulePayload(zoneId, fields);
  if (!payload) return false;
  await updateItemFields(COLL_LISTS, listId, payload as any);
  return true;
}

/**
 * Updates non-date zone metadata (name, notes, location, personnel, setupCompany)
 * inside a transaction on the LATEST server document, patching only the target zone.
 * Sections / warehouseState of every zone are preserved exactly as they are on the server.
 */
export async function updateZoneMetaSafely(
  listId: string,
  zoneId: string | undefined,
  zoneName: string | undefined,
  meta: Record<string, any>
): Promise<void> {
  if (Object.keys(meta).length === 0) return;
  const ref = doc(db, COLL_LISTS, listId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data() as PackingList;
    const updates: Partial<PackingList> = {};
    const zones = patchZoneMetaInArray(data.zones, zoneId, zoneName, meta);
    if (zones !== data.zones) updates.zones = zones;
    const draft = patchZoneMetaInArray(data.draftZones, zoneId, zoneName, meta);
    if (draft !== data.draftZones) updates.draftZones = draft;
    const snapshot = patchZoneMetaInArray(data.snapshot, zoneId, zoneName, meta);
    if (snapshot !== data.snapshot) updates.snapshot = snapshot;
    if (Object.keys(updates).length > 0) {
      tx.update(ref, JSON.parse(JSON.stringify(updates)));
    }
  });
}

/**
 * Persists a zone edit coming from ZoneEditModal / EventSummaryModal / Calendar:
 * - date/time fields  → `zoneSchedules` (atomic dot-path)
 * - other metadata    → transactional single-zone patch (only if actually changed)
 * Returns the schedule fields that were written (for optimistic UI).
 */
export async function persistZoneEdit(
  list: PackingList,
  zone: Pick<ListZone, 'id' | 'name'> & Partial<ListZone>,
  updatedFields: Partial<ListZone> & Record<string, any>
): Promise<Partial<Record<ZoneScheduleField, string>>> {
  const currentZone = zone as ListZone;
  const scheduleFields = diffAgainstZone(pickScheduleFields(updatedFields), currentZone) as Partial<Record<ZoneScheduleField, string>>;
  const metaFields = diffAgainstZone(pickMetaFields(updatedFields), currentZone);

  if (!isScheduleableZoneId(zone.id)) {
    // Legacy zone without a safe id: fall back to transactional patch for everything
    await updateZoneMetaSafely(list.id, zone.id, zone.name, { ...metaFields, ...scheduleFields });
    return {};
  }

  if (Object.keys(scheduleFields).length > 0) {
    await saveZoneSchedule(list.id, zone.id, scheduleFields);
  }
  if (Object.keys(metaFields).length > 0) {
    await updateZoneMetaSafely(list.id, zone.id, zone.name, metaFields);
  }
  return scheduleFields;
}
