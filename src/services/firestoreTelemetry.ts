// Telemetry & Quota Profiler for Firestore Operations
// Accurately tracks reads (server vs cache) and writes to monitor and optimize Firebase Spark quotas.

export interface TelemetryEvent {
  id: string;
  type: 'write' | 'read' | 'delete' | 'batch_write';
  collection: string;
  docId?: string;
  docCount: number;
  fromCache?: boolean;
  timestamp: number;
  details?: string;
}

export interface TelemetryStats {
  writesCount: number;
  documentsWritten: number;
  serverReadsCount: number;
  cacheReadsCount: number;
  deletesCount: number;
  recentEvents: TelemetryEvent[];
}

let stats: TelemetryStats = {
  writesCount: 0,
  documentsWritten: 0,
  serverReadsCount: 0,
  cacheReadsCount: 0,
  deletesCount: 0,
  recentEvents: []
};

type Listener = (stats: TelemetryStats) => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  const snapshot = { ...stats, recentEvents: [...stats.recentEvents] };
  listeners.forEach(cb => {
    try {
      cb(snapshot);
    } catch (e) {
      console.warn("Telemetry listener error:", e);
    }
  });
}

const MAX_RECENT_EVENTS = 50;

function addEvent(event: Omit<TelemetryEvent, 'id' | 'timestamp'>) {
  const fullEvent: TelemetryEvent = {
    ...event,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: Date.now()
  };

  stats.recentEvents = [fullEvent, ...stats.recentEvents.slice(0, MAX_RECENT_EVENTS - 1)];

  // Console output in dev
  if (typeof window !== 'undefined' && (window as any).__CUEPACK_TELEMETRY_CONSOLE__) {
    const icon = event.type === 'read' 
      ? (event.fromCache ? '💾' : '🌐') 
      : '✏️';
    console.log(
      `%c[QUOTA HUD] ${icon} ${event.type.toUpperCase()} | Coll: ${event.collection} | Docs: ${event.docCount} | Cache: ${Boolean(event.fromCache)}`,
      'color: #f59e0b; font-weight: bold;'
    );
  }

  notifyListeners();
}

export const telemetry = {
  recordWrite(collection: string, docId?: string, count: number = 1, details?: string) {
    stats.writesCount += 1;
    stats.documentsWritten += count;
    addEvent({
      type: 'write',
      collection,
      docId,
      docCount: count,
      details
    });
  },

  recordBatchWrite(collection: string, docCount: number, details?: string) {
    stats.writesCount += 1;
    stats.documentsWritten += docCount;
    addEvent({
      type: 'batch_write',
      collection,
      docCount,
      details
    });
  },

  recordDelete(collection: string, docId?: string) {
    stats.deletesCount += 1;
    addEvent({
      type: 'delete',
      collection,
      docId,
      docCount: 1
    });
  },

  recordRead(collection: string, docCount: number, fromCache: boolean, details?: string) {
    if (fromCache) {
      stats.cacheReadsCount += docCount;
    } else {
      stats.serverReadsCount += docCount;
    }
    addEvent({
      type: 'read',
      collection,
      docCount,
      fromCache,
      details
    });
  },

  getStats(): TelemetryStats {
    return { ...stats, recentEvents: [...stats.recentEvents] };
  },

  resetCounters() {
    stats = {
      writesCount: 0,
      documentsWritten: 0,
      serverReadsCount: 0,
      cacheReadsCount: 0,
      deletesCount: 0,
      recentEvents: []
    };
    notifyListeners();
  },

  subscribe(callback: Listener): () => void {
    listeners.add(callback);
    callback({ ...stats, recentEvents: [...stats.recentEvents] });
    return () => {
      listeners.delete(callback);
    };
  }
};

/**
 * Accurately tracks collection listener reads according to Firestore billing:
 * - Initial load: charges all documents in snapshot
 * - Subsequent updates: charges only docChanges()
 */
export function trackCollectionSnapshot(
  collectionName: string,
  snapshot: any,
  hasLoadedInitialRef: { current: boolean }
) {
  const fromCache = Boolean(snapshot.metadata?.fromCache);
  let count = 0;
  if (!hasLoadedInitialRef.current) {
    count = snapshot.docs?.length || 0;
    hasLoadedInitialRef.current = true;
  } else {
    count = snapshot.docChanges ? snapshot.docChanges().length : (snapshot.docs?.length || 0);
  }

  if (count > 0) {
    telemetry.recordRead(collectionName, count, fromCache);
  }
}

/**
 * Accurately tracks single document listener reads
 */
export function trackDocSnapshot(collectionName: string, snapshot: any) {
  const fromCache = Boolean(snapshot.metadata?.fromCache);
  const exists = typeof snapshot.exists === 'function' ? snapshot.exists() : Boolean(snapshot.exists);
  telemetry.recordRead(collectionName, exists ? 1 : 0, fromCache, snapshot.id);
}

