import { ElectricalConnectorDefinition } from '../types';
import { db, COLL_CONNECTORS_CONFIG, cleanData } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export type { ElectricalConnectorDefinition };

export const STANDARD_AMPERAGES = [
  '6A',
  '10A',
  '16A',
  '20A',
  '25A',
  '32A',
  '50A',
  '63A',
  '80A',
  '100A',
  '125A',
  '160A',
  '200A',
  '250A',
  '315A',
  '400A'
] as const;

export const DEFAULT_CONNECTORS: ElectricalConnectorDefinition[] = [
  {
    id: 'civile-ita',
    name: 'Civile ITA',
    amperage: '16A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'schuko',
    name: 'Schuko',
    amperage: '16A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'vde-16a',
    name: 'VDE 16A',
    amperage: '16A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'vde-20a',
    name: 'VDE 20A',
    amperage: '16A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'powercon',
    name: 'Powercon',
    amperage: '16A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'true-one',
    name: 'True One',
    amperage: '16A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'cee-16a-mono',
    name: 'CEE 16A Monofase',
    amperage: '16A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'cee-32a-mono',
    name: 'CEE 32A Monofase',
    amperage: '32A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'cee-63a-mono',
    name: 'CEE 63A Monofase',
    amperage: '63A',
    phase: 'monofase',
    voltage: '230V',
    isSystem: true
  },
  {
    id: 'cee-16a-penta',
    name: 'CEE 16A Pentapolare',
    amperage: '16A',
    phase: 'trifase',
    voltage: '400V',
    isSystem: true
  },
  {
    id: 'cee-32a-penta',
    name: 'CEE 32A Pentapolare',
    amperage: '32A',
    phase: 'trifase',
    voltage: '400V',
    isSystem: true
  },
  {
    id: 'cee-63a-penta',
    name: 'CEE 63A Pentapolare',
    amperage: '63A',
    phase: 'trifase',
    voltage: '400V',
    isSystem: true
  },
  {
    id: 'cee-125a-penta',
    name: 'CEE 125A Pentapolare',
    amperage: '125A',
    phase: 'trifase',
    voltage: '400V',
    isSystem: true
  },
  {
    id: 'powerlock',
    name: 'Powerlock',
    amperage: '400A',
    phase: 'trifase',
    voltage: '400V',
    isSystem: true
  }
];

export const STORAGE_KEY_CONNECTORS = 'cuepack_custom_connectors_v1';

export const isSystemConnector = (nameOrId: string): boolean => {
  const norm = (nameOrId || '').trim().toLowerCase();
  return DEFAULT_CONNECTORS.some(
    d => d.id.toLowerCase() === norm || d.name.toLowerCase() === norm
  );
};

export const getConnectorDefinitions = (): ElectricalConnectorDefinition[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONNECTORS) || localStorage.getItem('cuepack_electrical_connectors_v1');
    let currentDefs: ElectricalConnectorDefinition[] = [];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentDefs = parsed;
      }
    }

    const merged: ElectricalConnectorDefinition[] = [];
    const processedIds = new Set<string>();

    // 1. Process items in the exact order saved in currentDefs
    for (const item of currentDefs) {
      const defaultItem = DEFAULT_CONNECTORS.find(
        d => d.id.toLowerCase() === (item.id || '').toLowerCase() || d.name.toLowerCase() === (item.name || '').toLowerCase()
      );
      if (defaultItem) {
        processedIds.add(defaultItem.id);
        merged.push({
          ...defaultItem,
          isSystem: true
        });
      } else if (item.name && item.name.trim()) {
        processedIds.add(item.id || item.name);
        merged.push({
          ...item,
          isSystem: false
        });
      }
    }

    // 2. Add any default connectors that weren't present in currentDefs
    for (const d of DEFAULT_CONNECTORS) {
      if (!processedIds.has(d.id)) {
        merged.push({ ...d, isSystem: true });
      }
    }

    return merged;
  } catch (e) {
    console.error('Error loading custom connectors:', e);
  }
  return DEFAULT_CONNECTORS;
};

export const syncToFirestore = async (defs: ElectricalConnectorDefinition[]) => {
  try {
    if (db) {
      const cleaned = cleanData(defs);
      await setDoc(doc(db, COLL_CONNECTORS_CONFIG, 'master'), { definitions: cleaned }, { merge: true });
    }
  } catch (err) {
    console.error('Failed to sync connectors to Firestore:', err);
  }
};

export const saveConnectorDefinitions = async (defs: ElectricalConnectorDefinition[]): Promise<void> => {
  try {
    localStorage.setItem(STORAGE_KEY_CONNECTORS, JSON.stringify(defs));
    window.dispatchEvent(new CustomEvent('cuepack_connectors_updated', { detail: defs }));
    await syncToFirestore(defs);
  } catch (e) {
    console.error('Error saving connectors:', e);
  }
};

export const addConnector = async (
  name: string,
  amperage: string,
  phase: 'monofase' | 'trifase',
  voltage: '230V' | '400V'
): Promise<ElectricalConnectorDefinition[]> => {
  const trimmed = name.trim();
  if (!trimmed) return getConnectorDefinitions();

  const defs = getConnectorDefinitions();
  if (defs.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
    return defs;
  }

  const newConnector: ElectricalConnectorDefinition = {
    id: `custom-${Date.now()}`,
    name: trimmed,
    amperage: (amperage || '16A').toUpperCase().trim(),
    phase: phase || (voltage === '400V' ? 'trifase' : 'monofase'),
    voltage: voltage || (phase === 'trifase' ? '400V' : '230V'),
    isSystem: false
  };

  const updated = [...defs, newConnector];
  await saveConnectorDefinitions(updated);
  return updated;
};

export const deleteConnector = async (id: string): Promise<ElectricalConnectorDefinition[]> => {
  const defs = getConnectorDefinitions();
  const conn = defs.find(c => c.id === id);
  if (!conn || conn.isSystem || isSystemConnector(conn.name)) {
    return defs; // Cannot delete system connectors
  }

  const updated = defs.filter(c => c.id !== id);
  await saveConnectorDefinitions(updated);
  return updated;
};

export const reorderConnectors = async (sourceIndex: number, targetIndex: number): Promise<ElectricalConnectorDefinition[]> => {
  const defs = getConnectorDefinitions();
  if (sourceIndex < 0 || sourceIndex >= defs.length || targetIndex < 0 || targetIndex >= defs.length) return defs;
  if (sourceIndex === targetIndex) return defs;

  const updated = [...defs];
  const [removed] = updated.splice(sourceIndex, 1);
  updated.splice(targetIndex, 0, removed);

  await saveConnectorDefinitions(updated);
  return updated;
};

export const findConnectorByName = (name: string): ElectricalConnectorDefinition | undefined => {
  const norm = (name || '').trim().toLowerCase();
  return getConnectorDefinitions().find(c => c.name.toLowerCase() === norm);
};
