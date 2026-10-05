import { Category } from '../types';
import { db, COLL_CATEGORIES_CONFIG } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export interface CategoryDefinition {
  id: string;
  name: string;
  subcategories: string[];
  isSystem?: boolean;
}

export const DEFAULT_CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: Category.AUDIO,
    name: Category.AUDIO,
    isSystem: true,
    subcategories: [
      'Diffusori Attivi',
      'Diffusori Passivi',
      'Subwoofer',
      'Mixer',
      'Microfoni e Supporti',
      'In Ear Monitor',
      'Cuffie ed accessori per cuffie',
      'Stagebox',
      'Processori',
      'Equalizzatori',
      'Preamplificatori',
      'DI Box',
      'Cavi PA',
      'Adattatori',
      'Amplificatori',
      'Tour Guide'
    ]
  },
  {
    id: Category.LIGHTS,
    name: Category.LIGHTS,
    isSystem: true,
    subcategories: [
      'Teste Mobili Spot / Beam',
      'Teste Mobili Wash',
      'Par Led',
      'Strip Led & Barre',
      'Fari Teatrali',
      'Proiettori a batteria',
      'Laser',
      'Fumo e Nebbia',
      'CO2',
      'Consolle & Mixer Luci',
      'Controller Effetti',
      'Distributori di Segnale DMX',
      'Splitter DMX',
      'Accessori Luci'
    ]
  },
  {
    id: Category.VIDEO,
    name: Category.VIDEO,
    isSystem: true,
    subcategories: [
      'Ledwall',
      'Monitor',
      'Proiettori',
      'Mixer Video',
      'Convertitori',
      'Media Player',
      'Decoder DVB-T',
      'Telecamere',
      'Cavi BNC',
      'Accessori per video'
    ]
  },
  {
    id: Category.STRUCTURE,
    name: Category.STRUCTURE,
    isSystem: true,
    subcategories: [
      'Americane',
      'Staffe / Supporti',
      'Stativi',
      'Motori & Paranchi',
      'Pedane & Palchi',
      'Zavorre',
      'Cover'
    ]
  },
  {
    id: Category.CONTAINERS,
    name: Category.CONTAINERS,
    isSystem: true,
    subcategories: [
      'Rack',
      'Case',
      'Panaro',
      'Custodia',
      'Baule',
      'Flightcase',
      'Case in ABS',
      'Custodie in nylon'
    ]
  },
  {
    id: Category.CABLES,
    name: Category.CABLES,
    isSystem: true,
    subcategories: [
      'Prese Multiple',
      'Spine e Prese',
      'Cavi / Adattatori',
      'Quadri Elettrici',
      'Prolunghe Monofase',
      'Cavi Pentapolari',
      'Cavi DMX',
      'Cavi BNC',
      'Cavi Audio',
      'Networking & Cavi Rete',
      'Passacavi'
    ]
  },
  {
    id: Category.REGIA,
    name: Category.REGIA,
    isSystem: true,
    subcategories: [
      'Intercom',
      'Media Server',
      'Consolle',
      'Controller',
      'Tablet',
      'Telecomandi',
      'Switch',
      'Access Point'
    ]
  },
  {
    id: Category.TOOLS,
    name: Category.TOOLS,
    isSystem: true,
    subcategories: [
      'Avvitatori',
      'Attrezzature',
      'Strumenti di misura',
      'Periferiche',
      'Scale',
      'Utensili Vari'
    ]
  },
  {
    id: Category.OTHER,
    name: Category.OTHER,
    isSystem: true,
    subcategories: [
      'Varie',
      'Consumabili',
      'Altro'
    ]
  }
];

const STORAGE_KEY_CATEGORIES = 'cuepack_custom_categories_v2';

/**
 * Checks whether a macro category is a protected base/system category (Audio, Luci, Video, Strutture, Contenitori, etc.)
 */
export const isSystemCategory = (categoryName: string): boolean => {
  const normalized = (categoryName || '').trim().toLowerCase();
  return DEFAULT_CATEGORY_DEFINITIONS.some(d => d.name.toLowerCase() === normalized);
};

/**
 * Checks whether a subcategory is a protected base/system subcategory of that macro category
 */
export const isSystemSubcategory = (categoryName: string, subcatName: string): boolean => {
  const catNorm = (categoryName || '').trim().toLowerCase();
  const subNorm = (subcatName || '').trim().toLowerCase();
  const defaultCat = DEFAULT_CATEGORY_DEFINITIONS.find(d => d.name.toLowerCase() === catNorm);
  if (!defaultCat) return false;
  return defaultCat.subcategories.some(s => s.toLowerCase() === subNorm);
};

/**
 * Merges system categories with user categories from local storage.
 * Always guarantees default categories and their system subcategories exist.
 */
export const getCategoryDefinitions = (): CategoryDefinition[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CATEGORIES) || localStorage.getItem('cuepack_custom_categories_v1');
    let currentDefs: CategoryDefinition[] = DEFAULT_CATEGORY_DEFINITIONS;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentDefs = parsed;
      }
    }

    const merged: CategoryDefinition[] = [];
    const processedDefaultNames = new Set<string>();

    // 1. Process items in the exact order they appear in currentDefs
    for (const item of currentDefs) {
      const def = DEFAULT_CATEGORY_DEFINITIONS.find(d => d.name.toLowerCase() === item.name.toLowerCase());
      if (def) {
        processedDefaultNames.add(def.name.toLowerCase());
        const itemSubs = item.subcategories || [];
        const defaultSubs = def.subcategories || [];
        // Append any default subcategories that might be missing in itemSubs
        const missingDefaultSubs = defaultSubs.filter(
          ds => !itemSubs.some(is => is.toLowerCase() === ds.toLowerCase())
        );
        merged.push({
          id: def.id,
          name: def.name,
          isSystem: true,
          subcategories: [...itemSubs, ...missingDefaultSubs]
        });
      } else {
        merged.push({
          ...item,
          isSystem: false,
          subcategories: item.subcategories || []
        });
      }
    }

    // 2. Add any DEFAULT_CATEGORY_DEFINITIONS that weren't in currentDefs (e.g. newly introduced Contenitori)
    for (const def of DEFAULT_CATEGORY_DEFINITIONS) {
      if (!processedDefaultNames.has(def.name.toLowerCase())) {
        merged.push({ ...def, isSystem: true });
      }
    }

    return merged;
  } catch (e) {
    console.error('Error loading custom categories:', e);
  }
  return DEFAULT_CATEGORY_DEFINITIONS;
};

const syncToFirestore = async (defs: CategoryDefinition[]) => {
  try {
    if (db) {
      await setDoc(doc(db, COLL_CATEGORIES_CONFIG, 'master'), { definitions: defs }, { merge: true });
    }
  } catch (err) {
    console.warn('Failed to sync categories to Firestore:', err);
  }
};

export const saveCategoryDefinitions = (defs: CategoryDefinition[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(defs));
    window.dispatchEvent(new CustomEvent('cuepack_categories_updated', { detail: defs }));
    syncToFirestore(defs);
  } catch (e) {
    console.error('Error saving custom categories:', e);
  }
};

export const getSubcategoriesForCategory = (categoryName: string): string[] => {
  const defs = getCategoryDefinitions();
  const found = defs.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
  return found ? found.subcategories : [];
};

export const addCategory = (categoryName: string, initialSubcategories: string[] = ['Generale']): CategoryDefinition[] => {
  const trimmed = categoryName.trim();
  if (!trimmed) return getCategoryDefinitions();

  const defs = getCategoryDefinitions();
  const existing = defs.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    return defs;
  }

  const newCat: CategoryDefinition = {
    id: trimmed,
    name: trimmed,
    isSystem: false,
    subcategories: initialSubcategories && initialSubcategories.length > 0 ? initialSubcategories : ['Generale']
  };

  const updated = [...defs, newCat];
  saveCategoryDefinitions(updated);
  return updated;
};

export const deleteCategory = (categoryId: string): CategoryDefinition[] => {
  const defs = getCategoryDefinitions();
  const catToDelete = defs.find(c => c.id === categoryId);
  if (!catToDelete || isSystemCategory(catToDelete.name)) {
    return defs; // Cannot delete base system categories
  }

  const updated = defs.filter(c => c.id !== categoryId);
  saveCategoryDefinitions(updated);
  return updated;
};

export const moveCategory = (categoryId: string, direction: 'up' | 'down'): CategoryDefinition[] => {
  const defs = getCategoryDefinitions();
  const index = defs.findIndex(c => c.id === categoryId);
  if (index === -1) return defs;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= defs.length) return defs;

  const updated = [...defs];
  const [removed] = updated.splice(index, 1);
  updated.splice(targetIndex, 0, removed);

  saveCategoryDefinitions(updated);
  return updated;
};

export const addSubcategoryToCategory = (categoryName: string, subcatName: string): CategoryDefinition[] => {
  const trimmed = subcatName.trim();
  if (!trimmed) return getCategoryDefinitions();
  
  const defs = [...getCategoryDefinitions()];
  let cat = defs.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
  if (cat) {
    if (!cat.subcategories.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      cat.subcategories.push(trimmed);
    }
  } else {
    cat = {
      id: categoryName,
      name: categoryName,
      isSystem: isSystemCategory(categoryName),
      subcategories: [trimmed]
    };
    defs.push(cat);
  }
  saveCategoryDefinitions(defs);
  return defs;
};

export const deleteSubcategory = (categoryName: string, subcatName: string): CategoryDefinition[] => {
  if (isSystemSubcategory(categoryName, subcatName)) {
    return getCategoryDefinitions(); // Cannot delete system subcategories
  }

  const defs = [...getCategoryDefinitions()];
  const cat = defs.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
  if (cat) {
    cat.subcategories = cat.subcategories.filter(s => s.toLowerCase() !== subcatName.trim().toLowerCase());
    saveCategoryDefinitions(defs);
  }
  return defs;
};

export const moveSubcategory = (
  categoryName: string, 
  subcatName: string, 
  direction: 'up' | 'down'
): CategoryDefinition[] => {
  const defs = getCategoryDefinitions();
  const cat = defs.find(c => c.name.toLowerCase() === categoryName.trim().toLowerCase());
  if (!cat || !cat.subcategories) return defs;

  const subIndex = cat.subcategories.findIndex(s => s.toLowerCase() === subcatName.trim().toLowerCase());
  if (subIndex === -1) return defs;

  const targetIndex = direction === 'up' ? subIndex - 1 : subIndex + 1;
  if (targetIndex < 0 || targetIndex >= cat.subcategories.length) return defs;

  const updatedSubs = [...cat.subcategories];
  const [removed] = updatedSubs.splice(subIndex, 1);
  updatedSubs.splice(targetIndex, 0, removed);

  const updated = defs.map(c => {
    if (c.name.toLowerCase() === categoryName.trim().toLowerCase()) {
      return { ...c, subcategories: updatedSubs };
    }
    return c;
  });

  saveCategoryDefinitions(updated);
  return updated;
};

export const reorderCategories = (sourceIndex: number, targetIndex: number): CategoryDefinition[] => {
  const defs = getCategoryDefinitions();
  if (sourceIndex < 0 || sourceIndex >= defs.length || targetIndex < 0 || targetIndex >= defs.length) return defs;
  if (sourceIndex === targetIndex) return defs;

  const updated = [...defs];
  const [removed] = updated.splice(sourceIndex, 1);
  updated.splice(targetIndex, 0, removed);

  saveCategoryDefinitions(updated);
  return updated;
};

export const reorderSubcategories = (
  categoryName: string, 
  sourceIndex: number, 
  targetIndex: number
): CategoryDefinition[] => {
  const defs = getCategoryDefinitions();
  const cat = defs.find(c => c.name.toLowerCase() === categoryName.trim().toLowerCase());
  if (!cat || !cat.subcategories) return defs;

  if (sourceIndex < 0 || sourceIndex >= cat.subcategories.length || targetIndex < 0 || targetIndex >= cat.subcategories.length) return defs;
  if (sourceIndex === targetIndex) return defs;

  const updatedSubs = [...cat.subcategories];
  const [removed] = updatedSubs.splice(sourceIndex, 1);
  updatedSubs.splice(targetIndex, 0, removed);

  const updated = defs.map(c => {
    if (c.name.toLowerCase() === categoryName.trim().toLowerCase()) {
      return { ...c, subcategories: updatedSubs };
    }
    return c;
  });

  saveCategoryDefinitions(updated);
  return updated;
};
