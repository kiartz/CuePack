
export enum Category {
  AUDIO = 'Audio',
  LIGHTS = 'Luci',
  VIDEO = 'Video',
  STRUCTURE = 'Strutture',
  CABLES = 'Cablaggi',
  REGIA = 'Regia',
  TOOLS = 'Attrezzi',
  OTHER = 'Altro'
}

export interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  weight?: number; // in kg
  powerConsumption?: number; // in Watt (0 for non-electrical items)
  description?: string;
  inStock: number;
  accessories?: { itemId: string; quantity: number }[]; // Linked items (e.g., cables for a light)
}

export interface KitComponent {
  itemId: string;
  quantity: number;
}

export interface Kit {
  id: string;
  name: string;
  category: Category;
  description?: string;
  items: KitComponent[];
}

// For the Packing List Builder
export interface ListComponent {
  uniqueId: string; // unique instance ID in the list
  type: 'item' | 'kit';
  referenceId: string; // ID of the inventory item or kit
  name: string;
  quantity: number;
  category: string; // Cached for sorting/display
  contents?: { itemId?: string; name: string; quantity: number; category: string }[]; // Snapshot of contents (Kit items OR Item accessories)
  notes?: string;
}

export interface ListSection {
  id: string;
  name: string;
  components: ListComponent[];
}

export interface ListZone {
  id: string;
  name: string;
  sections: ListSection[];
}

export interface PackingList {
  id: string;
  // 'name' removed in favor of eventName to avoid ambiguity
  eventName: string;
  eventDate: string;
  location: string;
  creationDate: string;
  zones?: ListZone[]; // New structure
  sections?: ListSection[]; // Legacy structure (kept for backward compatibility during migration)
  notes: string;
  // Checklist State Persistence
  checklistEnabledSectors?: string[];
  checklistCheckedItems?: string[];
}

// --- CHECKLIST TYPES ---
export interface ChecklistGroup {
  title: string;
  items: string[];
}

export interface ChecklistCategory {
  id: string;
  title: string;
  subtitle: string;
  groups: ChecklistGroup[];
}
