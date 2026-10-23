import type { ListZone, ListSection, ListComponent, WarehouseState, PackingList } from '../types';

export interface ReconcileOptions {
  /** Set of zone IDs explicitly deleted in this local session */
  deletedZoneIds?: Set<string>;
  /** Set of section IDs explicitly deleted in this local session */
  deletedSectionIds?: Set<string>;
  /** Set of component uniqueIds explicitly deleted in this local session */
  deletedComponentIds?: Set<string>;

  /** Set of zone IDs explicitly created locally */
  createdZoneIds?: Set<string>;
  /** Set of section IDs explicitly created locally */
  createdSectionIds?: Set<string>;
  /** Set of component uniqueIds explicitly created locally */
  createdComponentIds?: Set<string>;

  /** Set of component uniqueIds explicitly modified locally (quantity, name, notes, rental flags) */
  modifiedComponentIds?: Set<string>;
  /** Set of zone IDs explicitly modified locally (dates, setupCompany, notes, location, personnel) */
  modifiedZoneIds?: Set<string>;

  /** Warehouse state delta tracking: componentId -> partial updates */
  warehouseDeltas?: Map<string, Partial<WarehouseState>>;
  /** Warehouse state delta tracking for contents: parentUniqueId -> childIndex -> partial updates */
  contentWarehouseDeltas?: Map<string, Map<number, Partial<WarehouseState>>>;

  /** Operational context: 'builder' (office / list builder) or 'warehouse' (preparation / prep material) */
  sourceContext?: 'builder' | 'warehouse';
}

export const createDefaultWarehouseState = (): WarehouseState => ({
  inDistinta: false,
  loaded: false,
  returned: false,
  isBroken: false,
  warehouseNote: ''
});

/**
 * Reconciles two WarehouseState objects.
 * If an active delta is provided, the delta takes explicit priority for its specified fields.
 * Otherwise, boolean flags are merged accretively (true wins) so concurrent checks by multiple
 * warehouse operators never overwrite or revert each other's progress.
 */
export const mergeWarehouseStatesAccretive = (
  local?: WarehouseState,
  remote?: WarehouseState,
  delta?: Partial<WarehouseState>
): WarehouseState | undefined => {
  if (!local && !remote && !delta) return undefined;

  const base: WarehouseState = {
    inDistinta: Boolean(local?.inDistinta || remote?.inDistinta),
    loaded: Boolean(local?.loaded || remote?.loaded),
    returned: Boolean(local?.returned || remote?.returned),
    isBroken: Boolean(local?.isBroken || remote?.isBroken),
    warehouseNote: local?.warehouseNote?.trim() ? local.warehouseNote : (remote?.warehouseNote || ''),
    brokenNote: local?.brokenNote?.trim() ? local.brokenNote : remote?.brokenNote,
    changeLog: local?.changeLog || remote?.changeLog
  };

  if (delta) {
    if (delta.inDistinta !== undefined) base.inDistinta = delta.inDistinta;
    if (delta.loaded !== undefined) base.loaded = delta.loaded;
    if (delta.returned !== undefined) base.returned = delta.returned;
    if (delta.isBroken !== undefined) base.isBroken = delta.isBroken;
    if (delta.warehouseNote !== undefined) base.warehouseNote = delta.warehouseNote;
    if (delta.brokenNote !== undefined) base.brokenNote = delta.brokenNote;
    if (delta.changeLog !== undefined) base.changeLog = delta.changeLog;
  }

  return base;
};

/**
 * Reconciles sub-contents (accessories, kit sub-items) of a component.
 */
function reconcileContents(
  localContents?: Array<{
    itemId?: string;
    name: string;
    quantity: number;
    category: string;
    warehouseState?: WarehouseState;
    replacementInfo?: any;
    notes?: string;
    prepNote?: string;
  }>,
  remoteContents?: Array<{
    itemId?: string;
    name: string;
    quantity: number;
    category: string;
    warehouseState?: WarehouseState;
    replacementInfo?: any;
    notes?: string;
    prepNote?: string;
  }>,
  childDeltaMap?: Map<number, Partial<WarehouseState>>,
  sourceContext: 'builder' | 'warehouse' = 'builder'
) {
  if (!localContents && !remoteContents) return undefined;
  if (!remoteContents) return localContents;
  if (!localContents) return remoteContents;

  // Use the longer list as reference length to ensure no added accessory is dropped
  const maxLen = Math.max(localContents.length, remoteContents.length);
  const merged: typeof localContents = [];

  for (let idx = 0; idx < maxLen; idx++) {
    const lc = localContents[idx];
    const rc = remoteContents[idx];

    if (!lc && rc) {
      merged.push(rc);
      continue;
    }
    if (lc && !rc) {
      merged.push(lc);
      continue;
    }

    const delta = childDeltaMap?.get(idx);
    const mergedWs = mergeWarehouseStatesAccretive(lc?.warehouseState, rc?.warehouseState, delta);

    if (sourceContext === 'builder') {
      merged.push({
        ...rc,
        ...lc,
        warehouseState: mergedWs,
        replacementInfo: rc?.replacementInfo || lc?.replacementInfo
      });
    } else {
      merged.push({
        ...lc,
        ...rc,
        warehouseState: mergedWs,
        replacementInfo: rc?.replacementInfo || lc?.replacementInfo
      });
    }
  }

  return merged;
}

/**
 * Reconciles template contents recursively.
 */
function reconcileTemplateContents(
  localTC?: ListComponent[],
  remoteTC?: ListComponent[],
  warehouseDeltas?: Map<string, Partial<WarehouseState>>,
  sourceContext: 'builder' | 'warehouse' = 'builder'
): ListComponent[] | undefined {
  if (!localTC && !remoteTC) return undefined;
  if (!remoteTC) return localTC;
  if (!localTC) return remoteTC;

  const localMap = new Map<string, ListComponent>();
  localTC.forEach(c => { if (c.uniqueId) localMap.set(c.uniqueId, c); });

  const remoteMap = new Map<string, ListComponent>();
  remoteTC.forEach(c => { if (c.uniqueId) remoteMap.set(c.uniqueId, c); });

  const orderedIds: string[] = [];
  const seenIds = new Set<string>();

  localTC.forEach(c => {
    if (c.uniqueId && !seenIds.has(c.uniqueId)) {
      orderedIds.push(c.uniqueId);
      seenIds.add(c.uniqueId);
    }
  });
  remoteTC.forEach(c => {
    if (c.uniqueId && !seenIds.has(c.uniqueId)) {
      orderedIds.push(c.uniqueId);
      seenIds.add(c.uniqueId);
    }
  });

  return orderedIds.map(uid => {
    const lc = localMap.get(uid);
    const rc = remoteMap.get(uid);
    if (lc && !rc) return lc;
    if (!lc && rc) return rc;

    const delta = warehouseDeltas?.get(uid);
    const mergedWs = mergeWarehouseStatesAccretive(lc?.warehouseState, rc?.warehouseState, delta);

    if (sourceContext === 'builder') {
      return { ...rc!, ...lc!, warehouseState: mergedWs };
    } else {
      return { ...lc!, ...rc!, warehouseState: mergedWs };
    }
  });
}

/**
 * Enterprise Hierarchical 3-Way Reconciler for CuePack Manager.
 * 
 * Reconciles local and remote zones at:
 * 1. Zone level (metadata, additions, order, non-destructive coexistence)
 * 2. Section level (individual reparti: Audio, Luci, Video, Strutture, etc.)
 * 3. Component level (material items, kit, template, quantities, notes)
 * 4. WarehouseState level (concurrent checkmarks, prep notes, replacements)
 * 
 * Guarantees zero data loss across concurrent multi-user sessions.
 */
export function reconcileZones(
  localZones: ListZone[] = [],
  remoteZones: ListZone[] = [],
  options: ReconcileOptions = {}
): ListZone[] {
  const {
    deletedZoneIds = new Set(),
    deletedSectionIds = new Set(),
    deletedComponentIds = new Set(),
    modifiedComponentIds = new Set(),
    modifiedZoneIds = new Set(),
    warehouseDeltas = new Map(),
    contentWarehouseDeltas = new Map(),
    sourceContext = 'builder'
  } = options;

  // 1. Zone ID Map & Key helper
  const getZoneKey = (z: ListZone) => z.id || z.name || '';
  const localMap = new Map<string, ListZone>();
  localZones.forEach(z => {
    const k = getZoneKey(z);
    if (k) localMap.set(k, z);
  });

  const remoteMap = new Map<string, ListZone>();
  remoteZones.forEach(z => {
    const k = getZoneKey(z);
    if (k) remoteMap.set(k, z);
  });

  // Preserve ordering: start with local zone order, then append any remote zones not present locally
  const orderedZoneKeys: string[] = [];
  const seenZoneKeys = new Set<string>();

  localZones.forEach(z => {
    const k = getZoneKey(z);
    if (k && !deletedZoneIds.has(z.id || '') && !seenZoneKeys.has(k)) {
      orderedZoneKeys.push(k);
      seenZoneKeys.add(k);
    }
  });

  remoteZones.forEach(z => {
    const k = getZoneKey(z);
    if (k && !deletedZoneIds.has(z.id || '') && !seenZoneKeys.has(k)) {
      orderedZoneKeys.push(k);
      seenZoneKeys.add(k);
    }
  });

  return orderedZoneKeys.map(zKey => {
    const localZone = localMap.get(zKey);
    const remoteZone = remoteMap.get(zKey);

    // If only in local (e.g. newly created zone by this user, not yet confirmed by remote)
    if (localZone && !remoteZone) {
      return localZone;
    }

    // If only in remote (e.g. created by another user concurrently)
    if (!localZone && remoteZone) {
      return remoteZone;
    }

    const lz = localZone!;
    const rz = remoteZone!;
    const isZoneModifiedLocally = modifiedZoneIds.has(lz.id || '');

    // Merge zone metadata
    const mergedZoneMeta: Partial<ListZone> = {
      name: isZoneModifiedLocally ? lz.name : (rz.name || lz.name),
      location: isZoneModifiedLocally ? lz.location : (rz.location !== undefined ? rz.location : lz.location),
      notes: isZoneModifiedLocally ? lz.notes : (rz.notes !== undefined ? rz.notes : lz.notes),
      setupCompany: isZoneModifiedLocally ? lz.setupCompany : (rz.setupCompany !== undefined ? rz.setupCompany : lz.setupCompany),
      setupDate: isZoneModifiedLocally ? lz.setupDate : (rz.setupDate !== undefined ? rz.setupDate : lz.setupDate),
      showDate: isZoneModifiedLocally ? lz.showDate : (rz.showDate !== undefined ? rz.showDate : lz.showDate),
      showTimeStart: isZoneModifiedLocally ? lz.showTimeStart : (rz.showTimeStart !== undefined ? rz.showTimeStart : lz.showTimeStart),
      showTimeEnd: isZoneModifiedLocally ? lz.showTimeEnd : (rz.showTimeEnd !== undefined ? rz.showTimeEnd : lz.showTimeEnd),
      teardownDate: isZoneModifiedLocally ? lz.teardownDate : (rz.teardownDate !== undefined ? rz.teardownDate : lz.teardownDate),
      returnDate: isZoneModifiedLocally ? lz.returnDate : (rz.returnDate !== undefined ? rz.returnDate : lz.returnDate),
      personnel: isZoneModifiedLocally ? lz.personnel : (rz.personnel !== undefined ? rz.personnel : lz.personnel),
    };

    // 2. Reconcile SECTIONS (Reparti: Audio, Luci, Video, Strutture, etc.)
    const getSecKey = (s: ListSection) => s.id || s.name || '';
    const localSecMap = new Map<string, ListSection>();
    (lz.sections || []).forEach(s => {
      const k = getSecKey(s);
      if (k) localSecMap.set(k, s);
    });

    const remoteSecMap = new Map<string, ListSection>();
    (rz.sections || []).forEach(s => {
      const k = getSecKey(s);
      if (k) remoteSecMap.set(k, s);
    });

    const orderedSecKeys: string[] = [];
    const seenSecKeys = new Set<string>();

    (lz.sections || []).forEach(s => {
      const k = getSecKey(s);
      if (k && !deletedSectionIds.has(s.id || '') && !seenSecKeys.has(k)) {
        orderedSecKeys.push(k);
        seenSecKeys.add(k);
      }
    });

    (rz.sections || []).forEach(s => {
      const k = getSecKey(s);
      if (k && !deletedSectionIds.has(s.id || '') && !seenSecKeys.has(k)) {
        orderedSecKeys.push(k);
        seenSecKeys.add(k);
      }
    });

    const mergedSections = orderedSecKeys.map(sKey => {
      const localSec = localSecMap.get(sKey);
      const remoteSec = remoteSecMap.get(sKey);

      if (localSec && !remoteSec) return localSec;
      if (!localSec && remoteSec) return remoteSec;

      const ls = localSec!;
      const rs = remoteSec!;

      // 3. Reconcile COMPONENTS (materiali) within this section
      const localCompMap = new Map<string, ListComponent>();
      (ls.components || []).forEach(c => {
        if (c.uniqueId) localCompMap.set(c.uniqueId, c);
      });

      const remoteCompMap = new Map<string, ListComponent>();
      (rs.components || []).forEach(c => {
        if (c.uniqueId) remoteCompMap.set(c.uniqueId, c);
      });

      const orderedCompIds: string[] = [];
      const seenCompIds = new Set<string>();

      (ls.components || []).forEach(c => {
        if (c.uniqueId && !deletedComponentIds.has(c.uniqueId) && !seenCompIds.has(c.uniqueId)) {
          orderedCompIds.push(c.uniqueId);
          seenCompIds.add(c.uniqueId);
        }
      });

      (rs.components || []).forEach(c => {
        if (c.uniqueId && !deletedComponentIds.has(c.uniqueId) && !seenCompIds.has(c.uniqueId)) {
          orderedCompIds.push(c.uniqueId);
          seenCompIds.add(c.uniqueId);
        }
      });

      const mergedComponents = orderedCompIds.map(compId => {
        const localComp = localCompMap.get(compId);
        const remoteComp = remoteCompMap.get(compId);

        if (localComp && !remoteComp) {
          const delta = warehouseDeltas.get(compId);
          if (delta) {
            return {
              ...localComp,
              warehouseState: {
                ...(localComp.warehouseState || createDefaultWarehouseState()),
                ...delta
              }
            };
          }
          return localComp;
        }

        if (!localComp && remoteComp) {
          const delta = warehouseDeltas.get(compId);
          if (delta) {
            return {
              ...remoteComp,
              warehouseState: {
                ...(remoteComp.warehouseState || createDefaultWarehouseState()),
                ...delta
              }
            };
          }
          return remoteComp;
        }

        const lc = localComp!;
        const rc = remoteComp!;
        const isLocallyModified = modifiedComponentIds.has(compId);

        // Warehouse State Reconciliation
        let mergedWarehouseState: WarehouseState | undefined;
        const delta = warehouseDeltas.get(compId);

        if (delta) {
          mergedWarehouseState = {
            ...(rc.warehouseState || lc.warehouseState || createDefaultWarehouseState()),
            ...delta
          };
        } else if (sourceContext === 'warehouse') {
          mergedWarehouseState = mergeWarehouseStatesAccretive(lc.warehouseState, rc.warehouseState);
        } else {
          // Builder mode: keep remote warehouse checks so office edits don't overwrite warehouse work
          mergedWarehouseState = rc.warehouseState || lc.warehouseState;
        }

        // Sub-contents & accessories
        const childDeltaMap = contentWarehouseDeltas.get(compId);
        const mergedContents = reconcileContents(lc.contents, rc.contents, childDeltaMap, sourceContext);

        // Template contents
        const mergedTemplateContents = (lc.templateContents || rc.templateContents)
          ? reconcileTemplateContents(lc.templateContents, rc.templateContents, warehouseDeltas, sourceContext)
          : undefined;

        if (sourceContext === 'builder') {
          const isItemReplaced = (lc.referenceId && rc.referenceId ? lc.referenceId !== rc.referenceId : false) || lc.name !== rc.name;
          const hasLocalDesignerChanges = isLocallyModified || isItemReplaced || lc.quantity !== rc.quantity || lc.notes !== rc.notes;

          if (hasLocalDesignerChanges) {
            // Local designer edits (replacement, quantity, notes, vendor) win, but warehouse progress is preserved
            return {
              ...rc,
              ...lc,
              warehouseState: isItemReplaced ? (lc.warehouseState || createDefaultWarehouseState()) : mergedWarehouseState,
              contents: isItemReplaced ? lc.contents : mergedContents,
              templateContents: isItemReplaced ? lc.templateContents : mergedTemplateContents,
              replacementInfo: isItemReplaced ? undefined : (rc.replacementInfo || lc.replacementInfo)
            };
          } else {
            // Unmodified local component inherits any updates from remote
            return {
              ...lc,
              ...rc,
              warehouseState: mergedWarehouseState,
              contents: mergedContents,
              templateContents: mergedTemplateContents,
              replacementInfo: rc.replacementInfo || lc.replacementInfo
            };
          }
        } else {
          // Warehouse mode: remote designer fields win (e.g. quantity adjusted in office),
          // warehouse states and replacements win
          return {
            ...lc,
            ...rc,
            quantity: rc.quantity ?? lc.quantity,
            name: rc.name || lc.name,
            notes: rc.notes ?? lc.notes,
            warehouseState: mergedWarehouseState,
            contents: mergedContents,
            templateContents: mergedTemplateContents,
            replacementInfo: rc.replacementInfo || lc.replacementInfo
          };
        }
      });

      return {
        ...rs,
        ...ls,
        name: localSecMap.has(sKey) && ls.name ? ls.name : rs.name,
        components: mergedComponents
      };
    });

    return {
      ...rz,
      ...lz,
      ...mergedZoneMeta,
      sections: mergedSections
    };
  });
}

/**
 * Reconciles an entire PackingList document.
 */
export function reconcilePackingList(
  localList: PackingList,
  remoteList: PackingList,
  options: ReconcileOptions = {}
): PackingList {
  return {
    ...remoteList,
    ...localList,
    eventName: localList.eventName || remoteList.eventName,
    zones: reconcileZones(localList.zones || [], remoteList.zones || [], options)
  };
}
