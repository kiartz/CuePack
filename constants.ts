import { Category, InventoryItem, Kit } from './types';

export const INITIAL_INVENTORY: InventoryItem[] = [
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

export const INITIAL_KITS: Kit[] = [
  {
    id: 'k1',
    name: 'PA Tower (Left/Right)',
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
    description: 'Totem 2m con 1 beam e 1 wash',
    items: [
      { itemId: '6', quantity: 1 },
      { itemId: '7', quantity: 1 },
      { itemId: '4', quantity: 1 },
      { itemId: '5', quantity: 1 },
    ]
  }
];
