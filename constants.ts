import { Category, InventoryItem, Kit } from './types';

// Articoli base esistenti
const BASE_INVENTORY: InventoryItem[] = [
  { id: '1', name: 'Line Array Top (K2)', category: Category.AUDIO, weight: 56, inStock: 24, description: 'High power module' },
  { id: '2', name: 'Subwoofer (KS28)', category: Category.AUDIO, weight: 79, inStock: 16, description: 'Dual 18 inch sub' },
  { id: '3', name: 'Amplificatore LA12X', category: Category.AUDIO, weight: 14, inStock: 10, description: '4 channel amp' },
  { id: '4', name: 'Moving Head Beam', category: Category.LIGHTS, weight: 18, inStock: 40, description: 'Sharp beam fixture' },
  { id: '5', name: 'LED Wash', category: Category.LIGHTS, weight: 12, inStock: 30, description: 'RGBW Wash' },
  { id: '6', name: 'Truss 2m (Black)', category: Category.STRUCTURE, weight: 15, inStock: 50, description: 'SQ-30 heavy duty' },
  { id: '7', name: 'Base Plate (Steel)', category: Category.STRUCTURE, weight: 25, inStock: 20, description: '80x80cm' },
  { id: '8', name: 'Video Wall Panel (3.9mm)', category: Category.VIDEO, weight: 8, inStock: 100, description: '50x50cm outdoor' },
  { id: '9', name: 'Power Distro 63A', category: Category.CABLES, weight: 20, inStock: 5, description: '3-phase distro' },
  { id: '10', name: 'Shure SM58', category: Category.AUDIO, weight: 0.3, inStock: 20, description: 'Dynamic Mic' },
];

// Articoli di alimentazione extra (Adattatori base, Ciabatte, VDE)
const POWER_ACCESSORIES: InventoryItem[] = [
  // Ciabatte
  { id: 'pwr-101', name: 'Ciabatta CEE 16A', category: Category.CABLES, weight: 1.2, inStock: 15, description: 'Multipresa standard' },
  { id: 'pwr-102', name: 'Ciabatta CEE Linkabile', category: Category.CABLES, weight: 1.5, inStock: 15, description: 'Con rilancio CEE' },
  
  // Adattatori CEE / Civile (Base)
  { id: 'adp-101', name: 'Adatt. CEE M - Civile F', category: Category.CABLES, weight: 0.3, inStock: 30 },
  { id: 'adp-102', name: 'Adatt. Civile M - CEE F', category: Category.CABLES, weight: 0.3, inStock: 30 },
  
  // Adattatori Mazzeri
  { id: 'adp-201', name: 'Adatt. Mazzeri M - CEE F', category: Category.CABLES, weight: 0.4, inStock: 10 },
  { id: 'adp-202', name: 'Adatt. CEE M - Mazzeri F', category: Category.CABLES, weight: 0.4, inStock: 10 },
  { id: 'adp-203', name: 'Adatt. Mazzeri M - Civile F', category: Category.CABLES, weight: 0.3, inStock: 10 },
  { id: 'adp-204', name: 'Adatt. Civile M - Mazzeri F', category: Category.CABLES, weight: 0.3, inStock: 10 },
  
  // VDE
  { id: 'vde-301', name: 'Cavo VDE Civile', category: Category.CABLES, weight: 0.2, inStock: 50, description: 'Standard 1.5mt' },
  { id: 'vde-302', name: 'Cavo VDE Schuko', category: Category.CABLES, weight: 0.2, inStock: 50, description: 'Standard 1.5mt' },
  { id: 'vde-303', name: 'Cavo VDE CEE', category: Category.CABLES, weight: 0.5, inStock: 20, description: 'Presa CEE blu -> VDE' },
];

// Nuovi Adattatori Powercon, TrueOne, Schuko, 380V
const ADAPTERS_EXPANDED: InventoryItem[] = [
  // --- Adattatori Schuko ---
  { id: 'adp-s01', name: 'Adatt. Schuko M - CEE F', category: Category.CABLES, weight: 0.3, inStock: 20 },
  { id: 'adp-s02', name: 'Adatt. CEE M - Schuko F', category: Category.CABLES, weight: 0.3, inStock: 20 },
  { id: 'adp-s03', name: 'Adatt. Schuko M - Civile F', category: Category.CABLES, weight: 0.2, inStock: 20 },
  { id: 'adp-s04', name: 'Adatt. Civile M - Schuko F', category: Category.CABLES, weight: 0.2, inStock: 20 },

  // --- Adattatori TrueOne (TR1) ---
  { id: 'adp-tr1-01', name: 'Adatt. TR1 M - Schuko F', category: Category.CABLES, weight: 0.4, inStock: 15 },
  { id: 'adp-tr1-02', name: 'Adatt. Schuko M - TR1 F', category: Category.CABLES, weight: 0.4, inStock: 15 },
  { id: 'adp-tr1-03', name: 'Adatt. TR1 M - CEE F', category: Category.CABLES, weight: 0.4, inStock: 10 },
  { id: 'adp-tr1-04', name: 'Adatt. CEE M - TR1 F', category: Category.CABLES, weight: 0.4, inStock: 10 },
  { id: 'adp-tr1-05', name: 'Adatt. TR1 M - Civile F', category: Category.CABLES, weight: 0.3, inStock: 10 },
  { id: 'adp-tr1-06', name: 'Adatt. Civile M - TR1 F', category: Category.CABLES, weight: 0.3, inStock: 10 },

  // --- Adattatori Powercon (PWCon) ---
  // Nota: PWCon Blu è Input (Corrente entra), Grigio è Output (Corrente esce)
  { id: 'adp-pwc-01', name: 'Adatt. PWCon Blu - Schuko F', category: Category.CABLES, weight: 0.4, inStock: 10 },
  { id: 'adp-pwc-02', name: 'Adatt. Schuko M - PWCon Blu', category: Category.CABLES, weight: 0.4, inStock: 10 },
  { id: 'adp-pwc-03', name: 'Adatt. PWCon Grigio - Schuko F', category: Category.CABLES, weight: 0.4, inStock: 10 },
  { id: 'adp-pwc-04', name: 'Adatt. Civile M - PWCon Blu', category: Category.CABLES, weight: 0.3, inStock: 10 },

  // --- Adattatori VDE ---
  { id: 'adp-vde-01', name: 'Adatt. VDE M - Schuko F', category: Category.CABLES, weight: 0.2, inStock: 10, description: 'Da UPS a Schuko' },
  { id: 'adp-vde-02', name: 'Adatt. VDE M - CEE F', category: Category.CABLES, weight: 0.3, inStock: 5 },

  // --- Riduzioni Industriali 380V (Rosse) ---
  { id: 'adp-380-01', name: 'Riduz. CEE 125A M - 63A F', category: Category.CABLES, weight: 2.5, inStock: 4 },
  { id: 'adp-380-02', name: 'Riduz. CEE 63A M - 32A F', category: Category.CABLES, weight: 1.5, inStock: 6 },
  { id: 'adp-380-03', name: 'Riduz. CEE 32A M - 16A F (380V)', category: Category.CABLES, weight: 0.8, inStock: 10 },
  
  // --- Adattatori 380V -> 220V ---
  { id: 'adp-380-04', name: 'Adatt. CEE 16A (380V) M - CEE (Blu) F', category: Category.CABLES, weight: 0.5, inStock: 10, description: 'Fase singola' },
  { id: 'adp-380-05', name: 'Adatt. CEE 32A (380V) M - CEE (Blu) F', category: Category.CABLES, weight: 0.7, inStock: 5 },
];

interface CableDefinition {
  name: string;
  weightPerM: number;
  maxLength?: number; // Se specificato, non genera cavi più lunghi di questo
  extraLengths?: number[]; // Lunghezze aggiuntive specifiche per questo cavo
}

// Generatore di cavi richiesti
const generateCables = (): InventoryItem[] => {
  const standardLengths = [1, 2.5, 5, 10, 15, 20, 50];

  const definitions: CableDefinition[] = [
    // --- Cavi Segnale Audio/DMX/Dati ---
    { name: 'Cavo XLR 3P Audio', weightPerM: 0.1 },
    { name: 'Cavo Jack', weightPerM: 0.1, maxLength: 10 },
    { name: 'Cavo RCA', weightPerM: 0.08, maxLength: 5 },
    { name: 'Cavo DMX 5P', weightPerM: 0.12 },
    { name: 'Cavo DMX 3P', weightPerM: 0.12 },
    { name: 'Cavo Ethercon Nero', weightPerM: 0.06 },
    { name: 'Cavo Rete RJ45', weightPerM: 0.05 },
    
    // --- Cavi Video ---
    { name: 'Cavo BNC', weightPerM: 0.08 },
    { name: 'Cavo HDMI', weightPerM: 0.15, maxLength: 10 }, // Rame standard limitato
    { name: 'Cavo HDMI Fibra', weightPerM: 0.1, extraLengths: [30, 100] }, // Ottico per lunghe distanze
    { name: 'Cavo Fibra MM', weightPerM: 0.04 }, // Multi-Mode
    { name: 'Cavo Fibra SM', weightPerM: 0.04 }, // Single-Mode
    
    // --- Cavi Corrente ---
    { name: 'Cavo Civile', weightPerM: 0.15 }, // Schuko/Prolunghe
    { name: 'Cavo CEE 16A', weightPerM: 0.25 },
    { name: 'Cavo Mazzeri', weightPerM: 0.4 }, // Pesante
    { name: 'Cavo TrueOne Link', weightPerM: 0.2 },
    { name: 'Cavo Powercon Link', weightPerM: 0.2 },
    { name: 'Cavo 32A 380V', weightPerM: 0.8 },
    { name: 'Cavo 63A 380V', weightPerM: 1.5 },
    { name: 'Cavo 125A 380V', weightPerM: 3.5 },
    { name: 'Corde Powerlock (Set)', weightPerM: 5.0 },
    
    // --- Cavi Potenza Audio / Multicore ---
    { name: 'Cavo Speakon NL4', weightPerM: 0.2, maxLength: 25 },
    { name: 'Cavo Socapex', weightPerM: 1.2, maxLength: 25 },

    // --- Cavi Ibridi ---
    { name: 'Cavo Combo TR1 DMX5P', weightPerM: 0.35 },
    { name: 'Cavo Combo PWCON DMX3P', weightPerM: 0.35 },
  ];

  const items: InventoryItem[] = [];
  let idCounter = 1000; // Start higher to avoid conflicts

  definitions.forEach(def => {
    // Uniamo le lunghezze standard con quelle extra, rimuoviamo duplicati e ordiniamo
    let applicableLengths = [...standardLengths];
    if (def.extraLengths) {
      applicableLengths = [...applicableLengths, ...def.extraLengths];
    }
    // Rimuovi duplicati e ordina
    applicableLengths = Array.from(new Set(applicableLengths)).sort((a, b) => a - b);

    applicableLengths.forEach(len => {
      // Salta se supera la lunghezza massima definita
      if (def.maxLength && len > def.maxLength) return;

      idCounter++;
      // Formatta la lunghezza per visualizzazione (es. 2.5mt invece di 2.5)
      const lenLabel = len.toString().replace('.', ','); 
      
      items.push({
        id: `cbl-${idCounter}`, // ID univoco
        name: `${def.name} ${lenLabel}mt`,
        category: Category.CABLES,
        weight: parseFloat((def.weightPerM * len).toFixed(2)), // Calcolo peso approssimativo
        inStock: 20, // Stock di default
        description: `Lunghezza: ${lenLabel} metri`
      });
    });
  });

  return items;
};

// Generatore di Americane (Truss)
const generateTruss = (): InventoryItem[] => {
  const lengths = [0.15, 0.21, 0.4, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  
  const definitions = [
    { baseName: 'Truss 29x29', weightPerM: 5.5 },
    { baseName: 'Truss 29x29 Nera', weightPerM: 5.5 },
    { baseName: 'Truss 40x40', weightPerM: 7.5 },
    { baseName: 'Truss 40x40 Nera', weightPerM: 7.5 },
  ];

  const items: InventoryItem[] = [];
  let idCounter = 5000; // ID range different from cables

  definitions.forEach(def => {
    lengths.forEach(len => {
      idCounter++;
      const lenLabel = len.toString().replace('.', ',');
      
      items.push({
        id: `truss-${idCounter}`,
        name: `${def.baseName} ${lenLabel}mt`,
        category: Category.STRUCTURE,
        weight: parseFloat((def.weightPerM * len).toFixed(2)),
        inStock: 12, // Stock default
        description: `Modulo ${def.baseName} L=${lenLabel}m`
      });
    });
  });

  return items;
};

export const INITIAL_INVENTORY: InventoryItem[] = [
  ...BASE_INVENTORY,
  ...POWER_ACCESSORIES,
  ...ADAPTERS_EXPANDED,
  ...generateCables(),
  ...generateTruss(),
];

export const INITIAL_KITS: Kit[] = [
  {
    id: 'k1',
    name: 'PA Tower (Left/Right)',
    category: Category.AUDIO,
    description: 'Stack standard per lato (6 top + 2 sub)',
    items: [
      { itemId: '1', quantity: 6 },
      { itemId: '2', quantity: 2 },
      { itemId: '3', quantity: 2 },
    ]
  },
  {
    id: 'k2',
    name: 'Totem Luci Standard',
    category: Category.LIGHTS,
    description: 'Totem 2m con 1 beam e 1 wash',
    items: [
      { itemId: '6', quantity: 1 },
      { itemId: '7', quantity: 1 },
      { itemId: '4', quantity: 1 },
      { itemId: '5', quantity: 1 },
    ]
  }
];