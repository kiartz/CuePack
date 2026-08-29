import { Category } from '../types';

export interface CategoryDefinition {
  id: string;
  name: string;
  subcategories: string[];
}

export const DEFAULT_CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: Category.AUDIO,
    name: Category.AUDIO,
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
    subcategories: [
      'Americane',
      'Bauli',
      'Flightcases',
      'Case in ABS',
      'Custodie in nylon',
      'Staffe / Supporti',
      'Stativi',
      'Motori & Paranchi',
      'Pedane & Palchi',
      'Cover'
    ]
  },
  {
    id: Category.CABLES,
    name: Category.CABLES,
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
    subcategories: [
      'Varie',
      'Consumabili',
      'Altro'
    ]
  }
];

const STORAGE_KEY_CATEGORIES = 'cuepack_custom_categories_v1';

export const getCategoryDefinitions = (): CategoryDefinition[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading custom categories:', e);
  }
  return DEFAULT_CATEGORY_DEFINITIONS;
};

export const saveCategoryDefinitions = (defs: CategoryDefinition[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(defs));
  } catch (e) {
    console.error('Error saving custom categories:', e);
  }
};

export const getSubcategoriesForCategory = (categoryName: string): string[] => {
  const defs = getCategoryDefinitions();
  const found = defs.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
  return found ? found.subcategories : [];
};

export const addSubcategoryToCategory = (categoryName: string, subcatName: string): CategoryDefinition[] => {
  const trimmed = subcatName.trim();
  if (!trimmed) return getCategoryDefinitions();
  
  const defs = [...getCategoryDefinitions()];
  let cat = defs.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase());
  if (cat) {
    if (!cat.subcategories.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      cat.subcategories.push(trimmed);
      cat.subcategories.sort((a, b) => a.localeCompare(b));
    }
  } else {
    // Create category if not exists
    cat = {
      id: categoryName,
      name: categoryName,
      subcategories: [trimmed]
    };
    defs.push(cat);
  }
  saveCategoryDefinitions(defs);
  return defs;
};
