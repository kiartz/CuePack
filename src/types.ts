
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

export interface ItemInstance {
  id: string; // Codice Univoco / QR Code del Seriale (a 7 cifre 1000001+ o custom, stampabile)
  serialNumber?: string; // Serial Number del costruttore (SN)
  notes?: string;
}

export interface ItemDocument {
  id: string;
  name: string;
  url: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  productCode?: string; // Codice Prodotto (parte da 1 in avanti, es. 1, 2, 067, NON stampato)
  qrCode?: string; // Codice QR / Barcode del Prodotto (a 7 cifre 1000001+, stampabile)
  category: Category;
  weight?: number; // in kg
  powerConsumption?: number; // in Watt (0 for non-electrical items)
  description?: string;
  inStock: number;
  accessories?: { itemId: string; quantity: number; prepNote?: string }[]; // Linked items (e.g., cables for a light)
  reminders?: string[];
  documents?: ItemDocument[];
  instances?: ItemInstance[];
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
  reminders?: string[];
}

export interface WarehouseState {
  inDistinta: boolean;
  loaded: boolean;
  returned: boolean;
  isBroken: boolean;
  warehouseNote: string;
  brokenNote?: string;
  changeLog?: {
    previousQuantity: number;
    changedAt: string; // ISO date
  };
}

// For the Packing List Builder
export interface ListComponent {
  uniqueId: string; // unique instance ID in the list
  type: 'item' | 'kit' | 'template';
  referenceId: string; // ID of the inventory item, kit, or template
  name: string;
  quantity: number;
  category: string; // Cached for sorting/display
  // contents stores accessories for items, kit components for kits.
  // For 'template', it might store an unpacked array of these structures (kits and items).
  contents?: { itemId?: string; name: string; quantity: number; category: string; warehouseState?: WarehouseState; prepNote?: string; subContents?: any[] }[]; 
  templateContents?: ListComponent[]; // Dedicated field for Templates to hold fully-formed kits/items
  notes?: string;
  warehouseState?: WarehouseState;
  isExternalRental?: boolean; // Legacy/General flag for overbooked items
  rentalType?: 'internal_shortage' | 'external_rental'; 
  externalRentalVendor?: string;
  isTemporary?: boolean;
}

// --- TEMPLATES ---
export interface TemplateComponent {
  type: 'item' | 'kit';
  referenceId: string;
  quantity: number;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: Category;
  items: TemplateComponent[]; // Can contain both items and kits
  reminders?: string[];
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
  notes?: string;
}

export interface PackingList {
  id: string;
  eventName: string;
  eventDate: string;
  endDate?: string;
  setupDate?: string;
  location: string;
  customer?: string;
  databaseId?: string; // ID del database di inventario a cui appartiene la lista (default: 'default')
  personnel?: string[]; // E.g., 'Mario, Luigi (Audio)'
  
  // Nelle info aggiunte per logistica:
  setupCompany?: string;       // Azienda allestitore
  designAuthor?: string;       // Autore disegno
  executiveManager?: string;   // Responsabile esecutivo
  truckLoadDate?: string;      // Data carico camion
  teardownDate?: string;       // Data smontaggio
  returnDate?: string;         // Data rientro
  hotel?: string;              // Hotel
  technicalDrawingLink?: string; // Link al disegno tecnico
  personnelPasses?: { name: string; link: string; role?: string }[]; // Link ai pass e ruoli
  extraDays?: string[];        // Array di ISO Date (YYYY-MM-DD) per giorni viaggio/extra

  description?: string;
  creationDate: string;
  zones?: ListZone[]; // New structure
  sections?: ListSection[]; // Legacy structure (kept for backward compatibility during migration)
  notes: string;
  // Checklist State Persistence
  checklistEnabledSectors?: string[];
  checklistCheckedItems?: string[];
  reminders?: Reminder[];
  // Versioning
  version?: string; // "1.0", "1.1", etc.
  snapshot?: ListZone[]; // Snapshot of zones when version was last bumped
  completedAt?: string; // ISO date of when the list was marked as completed
  deletedItems?: { // Items removed since last snapshot
    originalComponent: ListComponent;
    zoneName: string;
    sectionName: string;
    deletedAt: string;
  }[];
  isCompleted?: boolean;
  isDraftVisible?: boolean;
  isArchived?: boolean;
}

export interface Reminder {
  id: string;
  text: string;
  isCompleted: boolean;
  createdAt: string;
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

// --- MULTI-DATABASE TYPES ---
export interface InventoryDatabase {
  id: string; // 'default' o id univoco (es. 'db_rentman')
  name: string; // Nome del database (es. "Database Principale", "Rentman Import")
  description?: string;
  isDefault?: boolean;
  createdAt: string;
  itemCount?: number;
  kitCount?: number;
}
