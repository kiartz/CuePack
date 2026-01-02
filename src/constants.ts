import { Category, InventoryItem, Kit, ChecklistCategory } from './types';

// =============================================================================
// 1. ACCESSORI GENERICI (Minuteria, Ganci, Sicure)
// =============================================================================
const COMMON_ACCESSORIES: InventoryItem[] = [
  // Rigging Lights
  { id: 'acc-clamp-omega', name: 'Gancio Aliscaf + Omega', category: Category.STRUCTURE, weight: 0.8, inStock: 200, description: 'Per Fari' },
  { id: 'acc-clamp-double', name: 'Doppio Aliscaf (Gancio-Gancio)', category: Category.STRUCTURE, weight: 1.5, inStock: 50, description: 'Per unire truss o tubi' },
  { id: 'acc-safety', name: 'Cavetto di Sicurezza (Safety)', category: Category.STRUCTURE, weight: 0.2, inStock: 200, description: 'Acciaio sicurezza' },
  { id: 'acc-umbrella', name: 'Ombrellino Parapioggia (Soft)', category: Category.LIGHTS, weight: 0.5, inStock: 30, description: 'Protezione pioggia fari' },
  
  // Truss
  { id: 'truss-acc-spigot', name: 'Conico (Ovetto)', category: Category.STRUCTURE, weight: 0.2, inStock: 600, description: 'Spigot per truss' },
  { id: 'truss-acc-pin', name: 'Spina Conica (Pin)', category: Category.STRUCTURE, weight: 0.05, inStock: 1200, description: 'Pin per truss' },
  { id: 'truss-acc-clip', name: 'Coppiglia (R-Clip)', category: Category.STRUCTURE, weight: 0.01, inStock: 1200, description: 'Safety clip' },
  { id: 'truss-acc-spacer', name: 'Kit Distanziatori Truss', category: Category.STRUCTURE, weight: 0.5, inStock: 20 },
  { id: 'truss-acc-hammer', name: 'Martello Rame/Gomma', category: Category.TOOLS, weight: 1, inStock: 10 },
  
  // Stage
  { id: 'stg-acc-clamp', name: 'Morsetto Pedana (KDC/Clamp)', category: Category.STRUCTURE, weight: 0.5, inStock: 100, description: 'Blocco unione pedane' },
  { id: 'stg-acc-pin', name: 'Pipotto Giunzione Riser', category: Category.STRUCTURE, weight: 0.1, inStock: 200, description: 'Pin per unione riser' },

  // Ledwall Links (Legacy/Generici)
  { id: 'cbl-led-pwr-link', name: 'Link Corrente Led Generico', category: Category.CABLES, weight: 0.2, inStock: 50, description: 'Cabinet to Cabinet' },
  { id: 'cbl-led-data-link', name: 'Link Segnale Led Generico', category: Category.CABLES, weight: 0.1, inStock: 50, description: 'Cabinet to Cabinet' },
];

// =============================================================================
// 2. MATERIALE LUCI (Fixtures & Control)
// =============================================================================
const LIGHTING_FIXTURES: InventoryItem[] = [
  // Console
  { id: 'lgt-ctrl-ma3-full', name: 'GrandMA 3 Full-Size', category: Category.LIGHTS, weight: 80, inStock: 1, accessories: [{itemId: 'ad-tr1-schuko', quantity: 1}, {itemId: 'vid-monitor-24', quantity: 2}] },
  { id: 'lgt-ctrl-ma3-cxt', name: 'GrandMA 3 Compact XT', category: Category.LIGHTS, weight: 45, inStock: 2, accessories: [{itemId: 'ad-tr1-schuko', quantity: 1}] },
  { id: 'lgt-ctrl-w-dmx', name: 'Wireless Solution F1 G5', category: Category.LIGHTS, weight: 1, inStock: 6, accessories: [{itemId: 'ad-tr1-schuko', quantity: 1}] },

  // Robe
  { 
    id: 'lgt-robe-esprite', name: 'Robe Esprite', category: Category.LIGHTS, weight: 28, inStock: 24, 
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 2 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },
  { 
    id: 'lgt-robe-megapointe', name: 'Robe MegaPointe', category: Category.LIGHTS, weight: 22, inStock: 24,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 2 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },
  { 
    id: 'lgt-robe-350-spot', name: 'Robe LEDBeam 350', category: Category.LIGHTS, weight: 10, inStock: 36,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 1 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },
  { 
    id: 'lgt-robe-ibeam-350', name: 'Robe iBeam 350 (IP65)', category: Category.LIGHTS, weight: 12, inStock: 12,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 1 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },

  // Claypaky
  {
    id: 'lgt-cp-sharpy', name: 'Claypaky Sharpy', category: Category.LIGHTS, weight: 19, inStock: 24,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 2 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-pcon-schuko', quantity: 1 }]
  },
  {
    id: 'lgt-cp-minib', name: 'Claypaky Mini-B', category: Category.LIGHTS, weight: 7, inStock: 24,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 1 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },
  {
    id: 'lgt-cp-k10', name: 'Claypaky B-EYE K10', category: Category.LIGHTS, weight: 15, inStock: 16,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 2 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },

  // Generici / Teatrali
  { 
    id: 'lgt-ledko', name: 'Coemar LEDko D (Sagomatore)', category: Category.LIGHTS, weight: 14, inStock: 20,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 1 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-pcon-schuko', quantity: 1 }]
  },
  { id: 'lgt-opt-2550', name: 'Ottica LEDko 25-50°', category: Category.LIGHTS, weight: 2, inStock: 20 },
  
  { 
    id: 'lgt-helix', name: 'Showtec Helix S5000', category: Category.LIGHTS, weight: 12, inStock: 48,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 2 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },
  { id: 'lgt-opt-helix-40', name: 'Ottica Helix 40°', category: Category.LIGHTS, weight: 0.5, inStock: 48 },
  { id: 'lgt-opt-helix-20', name: 'Ottica Helix 20°', category: Category.LIGHTS, weight: 0.5, inStock: 24 },
  { id: 'lgt-opt-helix-1560', name: 'Ottica Helix 15x60°', category: Category.LIGHTS, weight: 0.5, inStock: 24 },
  { id: 'lgt-opt-helix-90', name: 'Ottica Helix 90°', category: Category.LIGHTS, weight: 0.5, inStock: 24 },

  // Strobo / Blinder
  { 
    id: 'lgt-sgm-q8', name: 'SGM Q8', category: Category.LIGHTS, weight: 15, inStock: 12,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 2 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },
  { 
    id: 'lgt-chauvet-strike', name: 'Chauvet Color Strike M', category: Category.LIGHTS, weight: 12, inStock: 16,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 2 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },
  { 
    id: 'lgt-acme-blinder', name: 'Acme Stage Blinder IP', category: Category.LIGHTS, weight: 8, inStock: 12,
    accessories: [{ itemId: 'acc-clamp-omega', quantity: 1 }, { itemId: 'acc-safety', quantity: 1 }, { itemId: 'ad-tr1-schuko', quantity: 1 }]
  },

  // Followspot
  { id: 'lgt-rj-merlin', name: 'Robert Juliat Merlin 2500W', category: Category.LIGHTS, weight: 70, inStock: 2, description: 'Followspot + Tripod + PSU' },
  
  // Battery
  { id: 'lgt-batt-par', name: 'Faro a Batteria (EventSpot)', category: Category.LIGHTS, weight: 4, inStock: 24 },
];

// =============================================================================
// 3. AUDIO & INTERCOM
// =============================================================================
const AUDIO_EQUIPMENT: InventoryItem[] = [
  // Consoles & Processing
  { id: 'aud-digico-sd21', name: 'Digico SD21 Console', category: Category.AUDIO, weight: 30, inStock: 1, accessories: [{itemId: 'cbl-vde-schuko', quantity: 2}] },
  { id: 'aud-digico-stagebox', name: 'Digico D-Rack Stagebox', category: Category.AUDIO, weight: 15, inStock: 1 },
  { id: 'aud-digico-dante', name: 'Scheda Dante x Digico', category: Category.AUDIO, weight: 0.5, inStock: 1 },
  { id: 'aud-focusrite', name: 'Focusrite Scarlett 18i20', category: Category.AUDIO, weight: 4, inStock: 2 },
  
  // Speakers
  { id: 'aud-k2', name: 'L-Acoustics K2', category: Category.AUDIO, weight: 56, inStock: 24 },
  { id: 'aud-ks28', name: 'L-Acoustics KS28', category: Category.AUDIO, weight: 79, inStock: 16 },
  { id: 'aud-la12x', name: 'Amplificatore LA12X', category: Category.AUDIO, weight: 14, inStock: 10 },
  { id: 'aud-spk-batt', name: 'Cassa a Batteria + Mic', category: Category.AUDIO, weight: 10, inStock: 4 },

  // Stands
  { id: 'aud-mic-stand-premium', name: 'Asta Microfonica BELLA (K&M)', category: Category.AUDIO, weight: 3, inStock: 20 },

  // Intercom GreenGo
  { id: 'com-ggo-switch', name: 'GreenGo Switch 6', category: Category.REGIA, weight: 2, inStock: 2 },
  { id: 'com-ggo-antenna', name: 'GreenGo Stride Antenna', category: Category.REGIA, weight: 1, inStock: 4 },
  { id: 'com-ggo-bpx', name: 'GreenGo Wireless BPX', category: Category.REGIA, weight: 0.3, inStock: 8 },
  { id: 'com-ggo-bp', name: 'GreenGo Wired BP', category: Category.REGIA, weight: 0.3, inStock: 8 },
  { id: 'com-radio', name: 'Radio Midland C1180', category: Category.REGIA, weight: 0.3, inStock: 30 },
];

// =============================================================================
// 4. VIDEO & NETWORK & IT
// =============================================================================
const VIDEO_NETWORK: InventoryItem[] = [
  // --- ABSEN POLARIS PL2.5 ---
  { 
    id: 'vid-abs-pl25', name: 'Absen Polaris PL2.5', category: Category.VIDEO, weight: 8, inStock: 100,
    accessories: [{ itemId: 'cbl-link-true1-100', quantity: 1 }, { itemId: 'cbl-eth-100', quantity: 1 }]
  },
  { id: 'vid-abs-pl25-l', name: 'Absen PL2.5 Angolo SX', category: Category.VIDEO, weight: 8, inStock: 8 },
  { id: 'vid-abs-pl25-r', name: 'Absen PL2.5 Angolo DX', category: Category.VIDEO, weight: 8, inStock: 8 },
  { id: 'vid-abs-fly-100', name: 'Absen PL Flybar 100cm', category: Category.VIDEO, weight: 5, inStock: 10, accessories: [{ itemId: 'rig-steelflex-2', quantity: 1 }, { itemId: 'rig-shackle-black', quantity: 1 }] },
  { id: 'vid-abs-fly-50', name: 'Absen PL Flybar 50cm', category: Category.VIDEO, weight: 3, inStock: 10, accessories: [{ itemId: 'rig-steelflex-2', quantity: 1 }, { itemId: 'rig-shackle-black', quantity: 1 }] },

  // --- ABSEN D2V & YESTECH & INFILED ---
  { id: 'vid-abs-d2v', name: 'Absen D2V Plus 2.9', category: Category.VIDEO, weight: 7.5, inStock: 60, accessories: [{ itemId: 'cbl-link-true1-100', quantity: 1 }, { itemId: 'cbl-eth-100', quantity: 1 }] },
  { id: 'vid-inf-26', name: 'Infiled 2.6mm', category: Category.VIDEO, weight: 8, inStock: 120, accessories: [{ itemId: 'cbl-link-pcon-050', quantity: 1 }, { itemId: 'cbl-eth-050', quantity: 1 }] },
  { id: 'vid-inf-fly', name: 'Infiled Flybar 50cm', category: Category.VIDEO, weight: 4, inStock: 20, accessories: [{ itemId: 'rig-steelflex-2', quantity: 1 }, { itemId: 'rig-shackle-black', quantity: 1 }] },
  { id: 'vid-yes-39', name: 'Yestech 3.9mm', category: Category.VIDEO, weight: 9, inStock: 80, accessories: [{ itemId: 'cbl-led-pwr-link', quantity: 1 }, { itemId: 'cbl-led-data-link', quantity: 1 }] },
  { id: 'vid-yes-fly', name: 'Yestech Flybar 50cm', category: Category.VIDEO, weight: 4, inStock: 10, accessories: [{ itemId: 'rig-steelflex-2', quantity: 1 }, { itemId: 'rig-shackle-black', quantity: 1 }] },

  // --- PROCESSORI ---
  { id: 'vid-novastar', name: 'MCTRL 4K Processor', category: Category.VIDEO, weight: 6, inStock: 2 },
  { id: 'vid-vx4s', name: 'Novastar VX4S', category: Category.VIDEO, weight: 4, inStock: 2 },

  // Controllo & Regia
  { id: 'vid-msi', name: 'Laptop MSI (Resolume/Araneo)', category: Category.REGIA, weight: 3, inStock: 4 },
  { id: 'vid-mac-studio', name: 'Mac Studio', category: Category.REGIA, weight: 3, inStock: 2 },
  { id: 'vid-mini-mac', name: 'Mac Mini', category: Category.REGIA, weight: 1.5, inStock: 2 },
  { id: 'vid-monitor-24', name: 'Monitor 24" HDMI', category: Category.REGIA, weight: 4, inStock: 6 },
  { id: 'vid-streamdeck', name: 'Elgato Streamdeck XL', category: Category.REGIA, weight: 0.5, inStock: 2 },
  { id: 'vid-splitter-hdmi', name: 'Splitter HDMI 1x5 4K 60hz', category: Category.VIDEO, weight: 1, inStock: 4 },
  { id: 'vid-opticis', name: 'Opticis HDMI Fiber Kit', category: Category.VIDEO, weight: 1, inStock: 4 },
  { id: 'it-usb-hub', name: 'Hub USB-C / USB', category: Category.REGIA, weight: 0.2, inStock: 5 },
  { id: 'it-mouse-key', name: 'Mouse + Tastiera + Batterie', category: Category.REGIA, weight: 1, inStock: 5 },

  // Networking Luminex
  { id: 'net-luminex-16', name: 'Luminex Gigacore 16Xt/16Tf', category: Category.REGIA, weight: 4, inStock: 2 },
  { id: 'net-luminex-10', name: 'Luminex Gigacore 10/10i', category: Category.REGIA, weight: 3, inStock: 4 },
  { id: 'net-luminode-12', name: 'Luminex Luminode 12', category: Category.REGIA, weight: 3, inStock: 2 },
  { id: 'net-switch-8', name: 'Switch Gigabit 8 Porte', category: Category.REGIA, weight: 0.5, inStock: 5 },
];

// =============================================================================
// 5. STRIP LED & PIXEL (Custom)
// =============================================================================
const PIXEL_LED: InventoryItem[] = [
  { id: 'pix-ama-175', name: 'Stripled Doppia AMA 1.75mt', category: Category.LIGHTS, weight: 2, inStock: 20 },
  { id: 'pix-ama-200', name: 'Stripled Doppia AMA 2.00mt', category: Category.LIGHTS, weight: 2.5, inStock: 20 },
  { id: 'pix-ama-250', name: 'Stripled Doppia AMA 2.50mt', category: Category.LIGHTS, weight: 3, inStock: 10 },
  { id: 'pix-ama-300', name: 'Stripled Doppia AMA 3.00mt', category: Category.LIGHTS, weight: 3.5, inStock: 10 },
  
  { id: 'pix-psu-12v', name: 'Alimentatore PSU 12V + CEE', category: Category.LIGHTS, weight: 2, inStock: 20 },
  { id: 'pix-advatek', name: 'Advatek PixLite A4-S MK3', category: Category.REGIA, weight: 1, inStock: 4 },
  { id: 'pix-cbl-flat', name: 'Piattina 4mm / 0.75mm', category: Category.CABLES, weight: 1, inStock: 100, description: 'Al metro' },
  { id: 'pix-cbl-adv', name: 'Cavo 3x2.5 50cm x Advatek', category: Category.CABLES, weight: 0.5, inStock: 20 },
];

// =============================================================================
// 6. ADATTATORI E CAVI SPECIFICI
// =============================================================================
const SPECIFIC_CABLES: InventoryItem[] = [
  // --- KIT LEDWALL CABLES ---
  { id: 'cbl-link-true1-100', name: 'Link True1 1mt', category: Category.CABLES, weight: 0.3, inStock: 100 },
  { id: 'cbl-eth-100', name: 'Cavo Ethercon Nero 1mt', category: Category.CABLES, weight: 0.1, inStock: 100 },
  { id: 'cbl-link-pcon-050', name: 'Link Powercon 0.5mt', category: Category.CABLES, weight: 0.2, inStock: 100 },
  { id: 'cbl-eth-050', name: 'Cavo Ethercon Nero 0.5mt', category: Category.CABLES, weight: 0.1, inStock: 100 },

  // --- Adattatori Alimentazione Standard ---
  { id: 'ad-tr1-schuko', name: 'Alim. Schuko M - True1', category: Category.CABLES, weight: 0.3, inStock: 100 },
  { id: 'ad-pcon-schuko', name: 'Alim. Schuko M - Powercon Blu', category: Category.CABLES, weight: 0.3, inStock: 50 },
  { id: 'ad-pcon-cee', name: 'Alim. CEE M - Powercon Blu', category: Category.CABLES, weight: 0.4, inStock: 20 },
  { id: 'ad-cee-tr1', name: 'Alim. CEE M - True1', category: Category.CABLES, weight: 0.4, inStock: 30 },
  { id: 'ad-tr1-cee-f', name: 'Adatt. True1 M - CEE F', category: Category.CABLES, weight: 0.4, inStock: 30 },
  { id: 'ad-tr1-m-pcon-blu', name: 'Adatt. True1 M - Powercon Blu', category: Category.CABLES, weight: 0.3, inStock: 20 },
  { id: 'ad-tr1-f-pcon-wht', name: 'Adatt. True1 F - Powercon Bianco', category: Category.CABLES, weight: 0.3, inStock: 20 },
  { id: 'ad-tr1-m-cee-f', name: 'Adatt. True1 M - CEE F', category: Category.CABLES, weight: 0.3, inStock: 20 },
  { id: 'ad-cee-schuko', name: 'Adatt. CEE M - Schuko F', category: Category.CABLES, weight: 0.3, inStock: 20 },
  { id: 'ad-schuko-cee', name: 'Adatt. Schuko M - CEE F', category: Category.CABLES, weight: 0.3, inStock: 20 },
  
  // --- Adattatori Civili & Mazzeri (Ripristinati) ---
  { id: 'ad-cee-civile', name: 'Adatt. CEE M - Civile F (Bipasso)', category: Category.CABLES, weight: 0.2, inStock: 20 },
  { id: 'ad-civile-cee', name: 'Adatt. Civile M - CEE F', category: Category.CABLES, weight: 0.2, inStock: 20 },
  { id: 'ad-mazz-cee', name: 'Adatt. Mazzeri M - CEE F', category: Category.CABLES, weight: 0.3, inStock: 10 },
  { id: 'ad-cee-mazz', name: 'Adatt. CEE M - Mazzeri F', category: Category.CABLES, weight: 0.3, inStock: 10 },
  { id: 'ad-mazz-civ', name: 'Adatt. Mazzeri M - Civile F', category: Category.CABLES, weight: 0.2, inStock: 10 },
  { id: 'ad-civ-mazz', name: 'Adatt. Civile M - Mazzeri F', category: Category.CABLES, weight: 0.2, inStock: 10 },
  
  // --- VDE Variants (Ripristinati) ---
  { id: 'cbl-vde-schuko', name: 'Alim. Schuko M - VDE', category: Category.CABLES, weight: 0.2, inStock: 50 },
  { id: 'cbl-vde-civile', name: 'Alim. Civile M - VDE', category: Category.CABLES, weight: 0.2, inStock: 20 },
  { id: 'cbl-vde-cee', name: 'Alim. CEE M - VDE', category: Category.CABLES, weight: 0.3, inStock: 10 },

  // --- Splitters & Special Power ---
  { id: 'ad-split-cee', name: 'Sdoppia CEE (T o Y)', category: Category.CABLES, weight: 0.6, inStock: 30 },
  { id: 'ad-split-tr1', name: 'Sdoppia True1 (Ciabatta/Y)', category: Category.CABLES, weight: 0.6, inStock: 20 },
  { id: 'ad-split-tr1-hybrid', name: 'Sdoppia Ibrida TR1 M -> TR1 F + PCON Blu', category: Category.CABLES, weight: 0.5, inStock: 10 },
  { id: 'cbl-ciabatta-cee', name: 'Ciabatta CEE Nera (Stage)', category: Category.CABLES, weight: 1.5, inStock: 20 },
  { id: 'cbl-ciabatta-nice', name: 'Ciabatta CEE "Bella" (Cliente)', category: Category.CABLES, weight: 1.5, inStock: 10 },
  { id: 'cbl-ciabatta-civil', name: 'Ciabatta Civile (Bianca/Nera)', category: Category.CABLES, weight: 0.5, inStock: 20 },

  // --- Audio/Data Adapters ---
  { id: 'ad-xlr-3-5', name: 'Kit Adattatori XLR 3p-5p / 5p-3p', category: Category.CABLES, weight: 0.5, inStock: 10 },
  { id: 'ad-jack-xlr', name: 'Adatt. Jack - XLR M', category: Category.CABLES, weight: 0.1, inStock: 10 },
  { id: 'ad-minijack-xlr', name: 'Adatt. Mini Jack - XLR M', category: Category.CABLES, weight: 0.1, inStock: 10 },
  { id: 'ad-usbc-hdmi', name: 'Adatt. USB-C - HDMI', category: Category.CABLES, weight: 0.1, inStock: 5 },
  { id: 'ad-eth-barrel', name: 'Barilotto Ethercon F-F', category: Category.CABLES, weight: 0.1, inStock: 20 },

  // --- Link & Combo Specifici (I generici sono sotto) ---
  { id: 'cbl-fiber-opt-150', name: 'Rulla Fibra OpticalCon 150mt', category: Category.CABLES, weight: 10, inStock: 2 },
  { id: 'cbl-fiber-lc-100', name: 'Rulla Fibra 4xLC 100mt', category: Category.CABLES, weight: 6, inStock: 2 },
  
  // --- Fiber HDMI Special Lengths ---
  { id: 'cbl-hdmi-fib-30', name: 'Cavo HDMI Fibra 30mt', category: Category.VIDEO, weight: 1.5, inStock: 4 },
  { id: 'cbl-hdmi-fib-50', name: 'Cavo HDMI Fibra 50mt', category: Category.VIDEO, weight: 2.5, inStock: 4 },
  { id: 'cbl-hdmi-fib-100', name: 'Cavo HDMI Fibra 100mt', category: Category.VIDEO, weight: 5, inStock: 2 },

  // --- Socapex & Sfrangi ---
  { id: 'cbl-soca-bin', name: 'Sfrangio Socapex -> 6x CEE M', category: Category.CABLES, weight: 2, inStock: 10 },
  { id: 'cbl-soca-bout', name: 'Sfrangio Socapex -> 6x CEE F', category: Category.CABLES, weight: 2, inStock: 10 },
];

// =============================================================================
// 7. DISTRIBUZIONE ELETTRICA (Power)
// =============================================================================
const POWER_DISTRO: InventoryItem[] = [
  { id: 'pwr-frig-400', name: 'Powerbox Friggeri 400A Powerlock', category: Category.CABLES, weight: 60, inStock: 1 },
  { id: 'pwr-events-125', name: 'Powerbox Power4Events 125A Socapex', category: Category.CABLES, weight: 40, inStock: 1 },
  { id: 'pwr-frig-125-soca', name: 'Powerbox Friggeri 125A -> Socapex', category: Category.CABLES, weight: 35, inStock: 2 },
  { id: 'pwr-frig-63-soca', name: 'Powerbox Friggeri 63A -> Socapex', category: Category.CABLES, weight: 25, inStock: 2 },
  { id: 'pwr-quadro-63', name: 'Quadro 63A (Prese CEE)', category: Category.CABLES, weight: 20, inStock: 2 },
  { id: 'pwr-menn-63', name: 'Powerbox Mennekes 63A', category: Category.CABLES, weight: 15, inStock: 4 },
  { id: 'pwr-quadro-32-soca', name: 'Quadro 32A -> Socapex', category: Category.CABLES, weight: 10, inStock: 4 },
  { id: 'pwr-val-32', name: 'Powerbox Valigetta 32A con CEE', category: Category.CABLES, weight: 5, inStock: 8 },
  { id: 'pwr-quadro-32-mono', name: 'Quadro 32A Monofase', category: Category.CABLES, weight: 5, inStock: 2 },
  { id: 'pwr-sdoppio-63', name: 'Quadro Sdoppio 63A -> 2x32A', category: Category.CABLES, weight: 8, inStock: 2 },
  { id: 'pwr-ups-1500', name: 'UPS 1500VA Rack', category: Category.CABLES, weight: 15, inStock: 2 },
  { id: 'pwr-ups-3000', name: 'UPS Legrand 3000VA', category: Category.CABLES, weight: 30, inStock: 1 },
];

// =============================================================================
// 8. RIGGING & STRUCTURE SPECIALS
// =============================================================================
const SPECIAL_RIGGING: InventoryItem[] = [
  // Steels
  { id: 'rig-soft-1', name: 'Softsteel 1mt (Spanset Acciaio)', category: Category.STRUCTURE, weight: 1, inStock: 20 },
  { id: 'rig-soft-2', name: 'Softsteel 2mt (Spanset Acciaio)', category: Category.STRUCTURE, weight: 2, inStock: 20 },
  { id: 'rig-steelflex-2', name: 'Steelflex 2mt (Spanset Acciaio)', category: Category.STRUCTURE, weight: 2, inStock: 20 },
  { id: 'rig-reutlinger', name: 'Reutlinger Type 50 + Cavo', category: Category.STRUCTURE, weight: 0.5, inStock: 40 },
  { id: 'rig-shackle-big', name: 'Grillo 3.25T (Grosso)', category: Category.STRUCTURE, weight: 0.5, inStock: 50 },
  { id: 'rig-shackle-black', name: 'Grillo Nero (Medio)', category: Category.STRUCTURE, weight: 0.3, inStock: 100 },
  { id: 'rig-moschettoni', name: 'Moschettoni', category: Category.STRUCTURE, weight: 0.1, inStock: 50 },
  { id: 'rig-fascia-5m', name: 'Fascia Crick 5mt Piccola', category: Category.STRUCTURE, weight: 0.5, inStock: 20 },
  { id: 'rig-corda-30', name: 'Corda Nera 30mt', category: Category.STRUCTURE, weight: 2, inStock: 10 },
  
  // Truss Accessories
  { id: 'rig-base-steel', name: 'Base Ferro Pesante 80x80', category: Category.STRUCTURE, weight: 35, inStock: 12 },
  { id: 'rig-cube', name: 'Cubo (Dado) Truss', category: Category.STRUCTURE, weight: 8, inStock: 8 },
  { id: 'rig-book-corner', name: 'Book Corner (Cerniera)', category: Category.STRUCTURE, weight: 10, inStock: 4 },
  { id: 'rig-inclinator', name: 'Inclinatore 8° Truss', category: Category.STRUCTURE, weight: 2, inStock: 8 },
  
  // Pipes & Clamps
  { id: 'rig-pipe-black-150', name: 'Palo Nero 1.5mt', category: Category.STRUCTURE, weight: 3, inStock: 20 },
  { id: 'rig-pipe-black-200', name: 'Palo Nero 2.0mt (Conn. Truss)', category: Category.STRUCTURE, weight: 4, inStock: 10 },
  { id: 'rig-pipe-black-350', name: 'Palo Nero 3.5mt', category: Category.STRUCTURE, weight: 7, inStock: 10 },
  { id: 'rig-pipe-black-400', name: 'Palo Nero 4.0mt', category: Category.STRUCTURE, weight: 8, inStock: 10 },
  { id: 'rig-altalena', name: 'Altalena Unirig Regolabile', category: Category.STRUCTURE, weight: 5, inStock: 10 },
  { id: 'rig-carrucola', name: 'Carrucola x Tiro', category: Category.STRUCTURE, weight: 1, inStock: 10 },
  
  // Extra
  { id: 'rig-water-tank', name: 'Tanica Acqua (Zavorra) + Attacchi', category: Category.STRUCTURE, weight: 2, inStock: 20, description: 'Vuota' },
  { id: 'rig-wood-shim', name: 'Assette Legno (Spessori)', category: Category.STRUCTURE, weight: 0.5, inStock: 50 },
  { id: 'rig-water-hose', name: 'Kit Tubi Acqua 20mt', category: Category.TOOLS, weight: 3, inStock: 2 },
];

// =============================================================================
// 9. ATMOSPHERE (FX)
// =============================================================================
const ATMOSPHERE: InventoryItem[] = [
  { 
    id: 'fx-hazer-tour', name: 'Smoke Factory Tour Hazer II', category: Category.LIGHTS, weight: 18, inStock: 4, 
    accessories: [{itemId: 'ad-pcon-schuko', quantity: 1}, {itemId: 'cons-liq-hazer', quantity: 1}] 
  },
  { 
    id: 'fx-antari-f7', name: 'Antari F7 Smaze', category: Category.LIGHTS, weight: 45, inStock: 2,
    accessories: [{itemId: 'cons-liq-hazer', quantity: 1}]
  },
  { 
    id: 'fx-spok', name: 'Smoke Factory Spok', category: Category.LIGHTS, weight: 10, inStock: 2,
    accessories: [{itemId: 'cons-liq-hazer', quantity: 1}]
  },
  { id: 'fx-fan', name: 'Ventola Chiocciola', category: Category.LIGHTS, weight: 8, inStock: 6 },
  { id: 'cons-liq-hazer', name: 'Liquido Fumo/Hazer (5L)', category: Category.OTHER, weight: 5, inStock: 10 },
];

// =============================================================================
// GENERATORS (Truss, Risers, Cables)
// =============================================================================

const generateAllCables = (): InventoryItem[] => {
  const standardLengths = [1, 2.5, 5, 10, 15, 20, 50];
  
  const cableTypes = [
    // --- Audio ---
    { name: 'Cavo XLR 3P', category: Category.AUDIO, maxLen: 100, weightM: 0.1 },
    { name: 'Cavo Jack TS', category: Category.AUDIO, maxLen: 10, weightM: 0.1 },
    { name: 'Cavo RCA', category: Category.AUDIO, maxLen: 5, weightM: 0.05 },
    { name: 'Cavo Speakon NL4', category: Category.AUDIO, maxLen: 25, weightM: 0.2 },
    
    // --- Lights / Data ---
    { name: 'Cavo DMX 5P', category: Category.LIGHTS, maxLen: 100, weightM: 0.12 },
    { name: 'Cavo DMX 3P', category: Category.LIGHTS, maxLen: 100, weightM: 0.12 },
    
    // --- Network / Video ---
    { name: 'Cavo Ethercon Nero', category: Category.CABLES, maxLen: 100, weightM: 0.08 },
    { name: 'Cavo Rete RJ45', category: Category.CABLES, maxLen: 100, weightM: 0.05 },
    { name: 'Cavo BNC (SDI)', category: Category.VIDEO, maxLen: 100, weightM: 0.06 },
    { name: 'Cavo HDMI (Rame)', category: Category.VIDEO, maxLen: 10, weightM: 0.1 },
    { name: 'Cavo Fibra MM', category: Category.CABLES, maxLen: 100, weightM: 0.02 },
    { name: 'Cavo Fibra SM', category: Category.CABLES, maxLen: 100, weightM: 0.02 },

    // --- Power Links / Combos ---
    { name: 'Link True1', category: Category.CABLES, maxLen: 100, weightM: 0.2 },
    { name: 'Link Powercon (Blu/White)', category: Category.CABLES, maxLen: 100, weightM: 0.2 },
    { name: 'Combo True1 + DMX', category: Category.CABLES, maxLen: 100, weightM: 0.35 },
    { name: 'Combo PCON + DMX', category: Category.CABLES, maxLen: 100, weightM: 0.35 },
    
    // --- Power Main ---
    { name: 'Prolunga CEE 16A (Blu)', category: Category.CABLES, maxLen: 100, weightM: 0.25 },
    { name: 'Prolunga CEE 32A (Rossa)', category: Category.CABLES, maxLen: 100, weightM: 0.5 },
    { name: 'Prolunga CEE 63A (Rossa)', category: Category.CABLES, maxLen: 100, weightM: 0.9 },
    { name: 'Prolunga CEE 125A (Rossa)', category: Category.CABLES, maxLen: 100, weightM: 2.5 },
    { name: 'Corda Powerlock (Singola)', category: Category.CABLES, maxLen: 100, weightM: 1.5 },
    { name: 'Cavo Socapex 19p', category: Category.CABLES, maxLen: 25, weightM: 0.8 },
    { name: 'Cavo Mazzeri', category: Category.CABLES, maxLen: 50, weightM: 0.15 },
    { name: 'Cavo Civile', category: Category.CABLES, maxLen: 50, weightM: 0.15 },
  ];

  const items: InventoryItem[] = [];
  let idCounter = 10000;

  cableTypes.forEach(type => {
    standardLengths.forEach(len => {
      // Skip if length exceeds specific type limit
      if (len > type.maxLen) return;

      idCounter++;
      const lenLabel = len.toString().replace('.', ',');
      items.push({
        id: `gen-cbl-${idCounter}`,
        name: `${type.name} ${lenLabel}mt`,
        category: type.category,
        weight: parseFloat((type.weightM * len).toFixed(2)),
        inStock: 20, // Default generous stock
        description: `Generato automatico ${lenLabel}m`
      });
    });
  });
  return items;
};

const generateTruss = (): InventoryItem[] => {
  const lengths = [0.15, 0.21, 0.4, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  const items: InventoryItem[] = [];
  let idCounter = 5000;

  // Standard 29x29 and 40x40 (Silver & Black)
  const types = [
      { code: 'sq30', name: 'Truss 29x29', weightM: 6 },
      { code: 'sq30-blk', name: 'Truss 29x29 Nera', weightM: 6 },
      { code: 'sq40', name: 'Truss 40x40', weightM: 10 },
      { code: 'sq40-blk', name: 'Truss 40x40 Nera', weightM: 10 },
  ];

  types.forEach(type => {
      lengths.forEach(len => {
          idCounter++;
          const lenLabel = len.toString().replace('.', ',');
          items.push({
            id: `truss-${type.code}-${idCounter}`,
            name: `${type.name} ${lenLabel}mt`,
            category: Category.STRUCTURE,
            weight: parseFloat((type.weightM * len).toFixed(2)),
            inStock: 12,
            accessories: [
                { itemId: 'truss-acc-spigot', quantity: 4 },
                { itemId: 'truss-acc-pin', quantity: 8 },
                { itemId: 'truss-acc-clip', quantity: 8 }
            ]
          });
      });
  });
  
  return items;
};

const generateStage = (): InventoryItem[] => {
    const items: InventoryItem[] = [];
    // Pedane Titan
    items.push({ id: 'stg-titan-21', name: 'Pedana Titan 2x1m', category: Category.STRUCTURE, weight: 32, inStock: 40, accessories: [{itemId: 'stg-acc-clamp', quantity: 2}] });
    items.push({ id: 'stg-titan-21-nice', name: 'Pedana "Bella" 2x1m', category: Category.STRUCTURE, weight: 32, inStock: 20, accessories: [{itemId: 'stg-acc-clamp', quantity: 2}] });
    items.push({ id: 'stg-titan-11', name: 'Pedana Titan 1x1m', category: Category.STRUCTURE, weight: 18, inStock: 20, accessories: [{itemId: 'stg-acc-clamp', quantity: 2}] });
    items.push({ id: 'stg-titan-105', name: 'Pedana Titan 1x0.5m', category: Category.STRUCTURE, weight: 12, inStock: 10, accessories: [{itemId: 'stg-acc-clamp', quantity: 2}] });
    items.push({ id: 'stg-mammut-21', name: 'Pedana Mammut 2x1m', category: Category.STRUCTURE, weight: 40, inStock: 10 });
    
    // Riser
    const heights = [20, 40, 60, 80, 100];
    const sizes = ['2x1', '1x1', '1x0.5'];
    
    heights.forEach(h => {
        sizes.forEach(s => {
            items.push({
                id: `stg-riser-${s.replace('.','')}-${h}`,
                name: `Riser Titan ${s}m H${h}cm`,
                category: Category.STRUCTURE,
                weight: 3,
                inStock: 20,
                accessories: [{itemId: 'stg-acc-pin', quantity: 6}]
            });
        });
    });

    // Accessori Palco
    items.push({ id: 'stg-leg-tele', name: 'Gamba Telescopica 60-100cm', category: Category.STRUCTURE, weight: 1, inStock: 100 });
    items.push({ id: 'stg-skirt', name: 'Skirting Nero (TNT)', category: Category.OTHER, weight: 1, inStock: 100 });
    items.push({ id: 'stg-moquette-21', name: 'Moquette 2x1 Nera', category: Category.OTHER, weight: 1, inStock: 50 });
    items.push({ id: 'stg-moquette-11', name: 'Moquette 1x1 Nera', category: Category.OTHER, weight: 0.5, inStock: 20 });
    
    return items;
};

// =============================================================================
// CONSUMABLES & TOOLS (Essentials)
// =============================================================================
const ESSENTIALS: InventoryItem[] = [
  { id: 'cons-gaffa-blk', name: 'Gaffa Nero Opaco', category: Category.OTHER, weight: 0.5, inStock: 50 },
  { id: 'cons-gaffa-wht', name: 'Gaffa Bianco', category: Category.OTHER, weight: 0.5, inStock: 20 },
  { id: 'cons-gaffa-col', name: 'Gaffa Colorato (Mix)', category: Category.OTHER, weight: 0.5, inStock: 20 },
  { id: 'cons-iso', name: 'Nastro Isolante Nero (Mix)', category: Category.OTHER, weight: 0.1, inStock: 50 },
  { id: 'cons-iso-grey', name: 'Nastro Isolante Grigio', category: Category.OTHER, weight: 0.1, inStock: 20 },
  { id: 'cons-iso-col', name: 'Nastro Isolante Colorato', category: Category.OTHER, weight: 0.1, inStock: 20 },
  
  { id: 'cons-zip-big', name: 'Fascette Grandi Nere', category: Category.OTHER, weight: 0.5, inStock: 50 },
  { id: 'cons-zip-med', name: 'Fascette Medie Nere', category: Category.OTHER, weight: 0.3, inStock: 50 },
  { id: 'cons-batt-aa', name: 'Batterie AA', category: Category.OTHER, weight: 0.1, inStock: 100 },
  { id: 'cons-batt-9v', name: 'Batterie 9V', category: Category.OTHER, weight: 0.1, inStock: 30 },
  { id: 'cons-tnt-blk', name: 'TNT Nero (Bobina)', category: Category.OTHER, weight: 5, inStock: 10 },
  { id: 'cons-biades', name: 'Biadesivo', category: Category.OTHER, weight: 0.2, inStock: 20 },
  { id: 'cons-marker', name: 'Pennarello Indelebile', category: Category.OTHER, weight: 0.05, inStock: 20 },
  
  { id: 'tool-box', name: 'Scatola Attrezzi Completa (USAG)', category: Category.TOOLS, weight: 15, inStock: 4 },
  { id: 'tool-drill', name: 'Avvitatore + Batterie', category: Category.TOOLS, weight: 4, inStock: 4 },
  { id: 'tool-ladder', name: 'Scala 7 Pioli', category: Category.TOOLS, weight: 10, inStock: 2 },
  { id: 'tool-ladder-high', name: 'Scala Alta', category: Category.TOOLS, weight: 15, inStock: 2 },
  { id: 'tool-transpallet', name: 'Transpallet', category: Category.TOOLS, weight: 60, inStock: 2 },
];


export const INITIAL_INVENTORY: InventoryItem[] = [
  ...COMMON_ACCESSORIES,
  ...LIGHTING_FIXTURES,
  ...AUDIO_EQUIPMENT,
  ...VIDEO_NETWORK,
  ...PIXEL_LED,
  ...SPECIFIC_CABLES,
  ...POWER_DISTRO,
  ...SPECIAL_RIGGING,
  ...ATMOSPHERE,
  ...ESSENTIALS,
  ...generateAllCables(), // NEW GENERATOR
  ...generateTruss(),
  ...generateStage(),
];

export const INITIAL_KITS: Kit[] = [
  // --- VIDEO KITS ---
  {
    id: 'k-vid-abs-6', name: 'Baule Absen PL2.5 (6pz)', category: Category.VIDEO,
    items: [
      { itemId: 'vid-abs-pl25', quantity: 6 },
      { itemId: 'cbl-link-true1-100', quantity: 6 },
      { itemId: 'cbl-eth-100', quantity: 6 }
    ]
  },
  {
    id: 'k-vid-abs-cnr-6', name: 'Baule Absen Angolari (3L+3R)', category: Category.VIDEO,
    items: [
      { itemId: 'vid-abs-pl25-l', quantity: 3 },
      { itemId: 'vid-abs-pl25-r', quantity: 3 },
      { itemId: 'cbl-link-true1-100', quantity: 6 },
      { itemId: 'cbl-eth-100', quantity: 6 }
    ]
  },
  {
    id: 'k-vid-inf-10', name: 'Baule Infiled 2.6 (10pz)', category: Category.VIDEO,
    items: [
      { itemId: 'vid-inf-26', quantity: 10 },
      { itemId: 'cbl-link-pcon-050', quantity: 10 },
      { itemId: 'cbl-eth-050', quantity: 10 }
    ]
  },
  {
    id: 'k-vid-yes-10', name: 'Baule Yestech 3.9 (10pz)', category: Category.VIDEO,
    items: [
      { itemId: 'vid-yes-39', quantity: 10 },
      { itemId: 'ad-eth-barrel', quantity: 1 }
    ]
  },

  // --- LIGHTS KITS ---
  {
    id: 'k-lgt-mega-4', name: 'Baule Robe MegaPointe (4pz)', category: Category.LIGHTS,
    items: [
      { itemId: 'lgt-robe-megapointe', quantity: 4 },
      { itemId: 'ad-tr1-schuko', quantity: 4 },
      { itemId: 'acc-safety', quantity: 4 },
      { itemId: 'acc-clamp-omega', quantity: 8 }
    ]
  },
  {
    id: 'k-lgt-350-4', name: 'Baule Robe LEDBeam 350 (4pz)', category: Category.LIGHTS,
    items: [
      { itemId: 'lgt-robe-350-spot', quantity: 4 },
      { itemId: 'ad-tr1-schuko', quantity: 4 },
      { itemId: 'acc-safety', quantity: 4 },
      { itemId: 'acc-clamp-omega', quantity: 4 }
    ]
  },
  {
    id: 'k-lgt-esp-2', name: 'Baule Robe Esprite (2pz)', category: Category.LIGHTS,
    items: [
      { itemId: 'lgt-robe-esprite', quantity: 2 },
      { itemId: 'ad-tr1-schuko', quantity: 2 },
      { itemId: 'acc-safety', quantity: 2 },
      { itemId: 'acc-clamp-omega', quantity: 4 }
    ]
  },
  {
    id: 'k-lgt-hel-4', name: 'Baule Showtec Helix (4pz)', category: Category.LIGHTS,
    items: [
      { itemId: 'lgt-helix', quantity: 4 },
      { itemId: 'lgt-opt-helix-1560', quantity: 4 },
      { itemId: 'ad-tr1-schuko', quantity: 4 },
      { itemId: 'acc-safety', quantity: 4 },
      { itemId: 'acc-clamp-omega', quantity: 8 }
    ]
  },
  {
    id: 'k-lgt-shp-4', name: 'Baule CP Sharpy (4pz)', category: Category.LIGHTS,
    items: [
      { itemId: 'lgt-cp-sharpy', quantity: 4 },
      { itemId: 'ad-pcon-schuko', quantity: 4 },
      { itemId: 'acc-safety', quantity: 4 },
      { itemId: 'acc-clamp-omega', quantity: 8 }
    ]
  },
  {
    id: 'k-lgt-k10-4', name: 'Baule CP B-EYE K10 (4pz)', category: Category.LIGHTS,
    items: [
      { itemId: 'lgt-cp-k10', quantity: 4 },
      { itemId: 'ad-tr1-schuko', quantity: 4 },
      { itemId: 'acc-safety', quantity: 4 },
      { itemId: 'acc-clamp-omega', quantity: 8 }
    ]
  },
  {
    id: 'k-lgt-minib-6', name: 'Baule CP Mini-B (6pz)', category: Category.LIGHTS,
    items: [
      { itemId: 'lgt-cp-minib', quantity: 6 },
      { itemId: 'ad-tr1-schuko', quantity: 6 },
      { itemId: 'acc-safety', quantity: 6 },
      { itemId: 'acc-clamp-omega', quantity: 6 }
    ]
  },
];

export const MASTER_CHECKLIST: ChecklistCategory[] = [
  {
    id: '1',
    title: '1. SETTORE STRUTTURE & RIGGING',
    subtitle: 'Scheletro - La base fisica dell\'evento',
    groups: [
      {
        title: 'Americane (Truss)',
        items: [
          'Truss Lineare 300 cm',
          'Truss Lineare 200 cm',
          'Truss Lineare 100 cm',
          'Truss Lineare 50 cm / 25 cm (Spessori)',
          'Truss Angolo 2 vie (90°)',
          'Truss Angolo 3 vie (T-Joint o Angolo + discesa)',
          'Truss Angolo 4 vie (Croce)',
          'Cube / Dadi universali (+ relative "mezze uova")',
          'Truss Cerchio (diametro specificato)'
        ]
      },
      {
        title: 'Basi & Zavorre',
        items: [
          'Basi a terra leggere (Alluminio)',
          'Basi a terra pesanti (Ferro/Acciaio) per colonne alte',
          'Zavorre aggiuntive (Acqua o Cemento) per outdoor',
          'Outrigger (Stabilizzatori laterali per torri)'
        ]
      },
      {
        title: 'Connessioni Truss (Minuteria critica)',
        items: [
          'Spine (Pins)',
          'Coppiglie (R-Clips)',
          'Conici (Ovetto/Spigot)',
          'App Logic: Calcolare sempre +10% extra per smarrimenti',
          'Martello in Rame o Gomma dura'
        ]
      },
      {
        title: 'Sollevamento (Rigging)',
        items: [
          'Motori a catena (250kg / 500kg / 1T / 2T)',
          'Lunghezza catena (10m / 20m / 24m)',
          'Paranchi manuali a catena',
          'Sollevatori a forche (Genie / Fenwick / Clark)',
          'Torri di elevazione (Wind-up stands)'
        ]
      },
      {
        title: 'Controller Motori',
        items: [
          'Motor Controller (4ch / 8ch)',
          'Frusta comando (Pickle) per singolo motore',
          'Cavi Harting/Soca per motori (Potenza + Comando)',
          'Link cavi motori'
        ]
      },
      {
        title: 'Appenderia & Hardware',
        items: [
          'Grilli (Shackles) da 3.25T o superiori',
          'Fasce in poliestere (Spanset) - Nere per teatro, Viola/Verdi industriali',
          'Acciai (Steels) con anima in metallo (Obbligatori come Secondary Safety)',
          'O-Ring / Anelli master',
          'Beam Clamps (Morsetti per travi IPE edili)',
          'Tent Clamps (Morsetti per tensostrutture)'
        ]
      },
      {
        title: 'Palco (Stage)',
        items: [
          'Pedane modulari (2x1m, 1x1m, 2x0.5m)',
          'Gambe per pedane (Fisse 20/40/60/80cm o Telescopiche)',
          'Morsetti ferma-pedane (Deck clamps - 2 vie e 4 vie)',
          'Scaletta modulare accesso palco (+ corrimano)',
          'Parapetti di sicurezza (Railings)',
          'Skirting (Gonnella/Tessuto nero) + Velcro o Clips',
          'Scivolo di carico (Ramp) se necessario'
        ]
      }
    ]
  },
  {
    id: '2',
    title: '2. SETTORE ELETTRICO (Power)',
    subtitle: 'Distribuzione e Cablaggio di potenza',
    groups: [
      {
        title: 'Main Power (L\'arrivo)',
        items: [
          'Cavi Powerlock (Single core - Terra/Neutro/L1/L2/L3) - Per carichi >63A',
          'Cavo CEE 125A (5 poli)',
          'Cavo CEE 63A (5 poli)',
          'Cavo CEE 32A (5 poli)',
          'Cavo CEE 16A (5 poli - Rossa) - Da non confondere con la blu!'
        ]
      },
      {
        title: 'Quadri & Distribuzione',
        items: [
          'Power Box Generale (Input Powerlock/125/63 -> Output vari)',
          'Distro di Settore (es. Rack 32A -> 6x o 12x Schuko/Socapex)',
          'Adattatori "T" o "Y" (Sdoppiatori CEE)',
          'Adattatori CEE -> Schuko (Funghi/Ragni)'
        ]
      },
      {
        title: 'Cablaggio Minuto (Dirty power)',
        items: [
          'Cavi 16A Blu (Prolunghe industriali)',
          'Cavi Schuko/VDE (3m, 5m, 10m, 20m)',
          'Ciabatte (Multiprese) Nere',
          'Cavi Link Powercon (Blu/Bianco o True1)'
        ]
      },
      {
        title: 'Sicurezza Cavi',
        items: [
          'Passacavi carrabili (Yellow Jackets/Cable Cross)',
          'Pedanine leggere da interno (Office friendly)',
          'Tappetini in gomma (Rubber mats)'
        ]
      }
    ]
  },
  {
    id: '3',
    title: '3. SETTORE AUDIO',
    subtitle: 'Sound Reinforcement',
    groups: [
      {
        title: 'P.A. (Public Address)',
        items: [
          'Line Array Module (Top)',
          'Subwoofers',
          'Point Source (Casse su stativo)',
          'Front Fill / Lip Fill (Casse piccole bordo palco)',
          'Delay Towers (Rilanci)',
          'Amplificatori (se impianto passivo)',
          'Processori di sistema (Lake, Galaxy, Matrix)'
        ]
      },
      {
        title: 'Monitoraggio',
        items: [
          'Spie da terra (Wedges)',
          'Side Fills (Casse laterali palco)',
          'Drum Fill (Sub + Top per batterista)',
          'In-Ear Monitors (Trasmettitori + Bodypack + Cuffie + Combiner Antenna + Antennas)'
        ]
      },
      {
        title: 'F.O.H. & Controllo',
        items: [
          'Console Mixer (Digitale)',
          'Cover antipolvere/sole per mixer',
          'Stagebox / I/O Rack (Posizionato sul palco)',
          'Tablet per controllo remoto Wi-Fi'
        ]
      },
      {
        title: 'Microfoni & Input',
        items: [
          'Kit Batteria (Cassa, Rullante, Tom, Overhead, HiHat)',
          'Microfoni Voce Filo (SM58, Beta58, ecc.)',
          'Microfoni Strumento (SM57, e609, Condensatori matita)',
          'Radiomicrofoni Handheld (Gelato)',
          'Radiomicrofoni Beltpack + Archetto (Headset) o Lavalier',
          'Batterie di scorta (AA / AAA / 9V) - Check Livello!',
          'D.I. Box (Attive / Passive / Stereo)'
        ]
      },
      {
        title: 'Supporti (Stands)',
        items: [
          'Aste microfoniche alte a giraffa',
          'Aste microfoniche basse (nane)',
          'Aste dritte (ritte) con base tonda pesante',
          'Clip microfoniche (Standard e Grandi per radio)',
          'Stativi per casse (Treppiedi o Pali distanziatori)'
        ]
      },
      {
        title: 'Cablaggio Audio',
        items: [
          'Cavi XLR (Signal) - Corti/Medi/Lunghi',
          'Cavi Jack-Jack (Strumenti)',
          'Cavi Speakon (Potenza casse) - 2 poli / 4 poli / 8 poli',
          'Fruste analogiche (Sub-snakes)',
          'Cavi CAT5e/CAT6 o Fibra per Stagebox (Main + Backup)'
        ]
      }
    ]
  },
  {
    id: '4',
    title: '4. SETTORE LUCI',
    subtitle: 'Lighting & Atmosphere',
    groups: [
      {
        title: 'Fixtures (Corpi illuminanti)',
        items: [
          'Moving Head SPOT',
          'Moving Head WASH',
          'Moving Head BEAM',
          'Moving Head HYBRID / PROFILE',
          'Battery LED Lights (Astera, ecc.) per eventi corporate/buffet',
          'Barre LED (Battens)',
          'Blinder (2-lite / 4-lite)',
          'Strobo',
          'Sagomatori (Profiles) + Portagobo + Lame',
          'Fresnel / PC (Teatrali) + Bandiere (Barndoors)'
        ]
      },
      {
        title: 'Controllo',
        items: [
          'Console Luci (GrandMA, Chamsys, Avolites, Hog)',
          'Fader Wing (Espansioni)',
          'UPS dedicato Console',
          'Lampada da tavolo (Littlite)'
        ]
      },
      {
        title: 'Distribuzione Dati',
        items: [
          'Splitter DMX',
          'Nodi ArtNet / sACN',
          'Cavi DMX 5 poli (Standard pro)',
          'Cavi DMX 3 poli (Spesso per fari economici o fumo)',
          'Terminatori DMX (Tappi di chiusura)'
        ]
      },
      {
        title: 'Rigging Luci',
        items: [
          'Ganci (Clamps/Couplers) - Controllare compatibilità col tubo!',
          'Staffe Omega (Già montate sotto i fari?)',
          'Cavetti di sicurezza (Safety bonds) - Obbligatori per legge'
        ]
      }
    ]
  },
  {
    id: '5',
    title: '5. SETTORE VIDEO',
    subtitle: 'Proiezione e Ledwall',
    groups: [
      {
        title: 'Proiezione',
        items: [
          'Videoproiettori',
          'Ottiche (Lens): Standard / Wide (Grandangolo) / Tele (Lunga distanza)',
          'Staffe per appendimento (Clamps dedicate)',
          'Gabbie di protezione/impilaggio (Frames)',
          'Teli di proiezione (Superficie Frontale o Retro?)',
          'Struttura Telo (Fast-fold) + Piedi + Zavorre'
        ]
      },
      {
        title: 'Ledwall',
        items: [
          'Moduli Led (Cabinets)',
          'Sending Cards / Processori Video (Novastar, Brompton)',
          'Bumpers / Flying Bars (Barre per appendere)',
          'Ground Stack System (Struttura per appoggio a terra)',
          'Spare Parts (Moduli, alimentatori e cavetti di scorta)',
          'Cavi rete corti (Cabinet to Cabinet)',
          'Cavi alimentazione corti (Powercon link)'
        ]
      },
      {
        title: 'Regia Video',
        items: [
          'Switcher / Mixer Video (Roland, Blackmagic, Barco, Analog Way)',
          'Scaler / Convertitori di formato',
          'Laptop Regia (Play, Resolume, PowerPoint) + Caricabatterie',
          'Puntatore Laser / Clicker Slide (Master + Backup)',
          'Monitor di confidenza (per palco)'
        ]
      },
      {
        title: 'Segnale Video',
        items: [
          'Cavi HDMI (Corti <10m)',
          'Cavi SDI (BNC) - Bobine 50m/100m',
          'Fibra Ottica Video',
          'Extender HDMI (su cavo CAT)',
          'Barilotti (Femmina-Femmina) HDMI e BNC',
          'Adattatori USB-C -> HDMI'
        ]
      }
    ]
  },
  {
    id: '6',
    title: '6. SETTORE IT & COMMS',
    subtitle: 'Infrastruttura di rete e comunicazione',
    groups: [
      {
        title: 'Intercom',
        items: [
          'Stazione Base (Main station)',
          'Beltpack a filo',
          'Beltpack Wireless + Antenne',
          'Cuffie (Headset): Singolo padiglione / Doppio padiglione (rumore forte)'
        ]
      },
      {
        title: 'Networking',
        items: [
          'Switch di Rete (GigaBit)',
          'Access Points Wi-Fi (per controllo iPad)',
          'Bobine Cavo CAT5e / CAT6 (Shielded)',
          'Plug RJ45 di scorta + Crimpatrice (non si sa mai)'
        ]
      }
    ]
  },
  {
    id: '7',
    title: '7. SETTORE STRIP LED & PIXEL',
    subtitle: 'Illuminazione custom lineare',
    groups: [
      {
        title: 'Hardware',
        items: [
          'Bobine Strip Led (Verificare: Voltaggio e Colore)',
          'Profili alluminio (Incasso / Superficie / Angolo)',
          'Diffusori (Cover opali)',
          'Tappi di chiusura e Clip di fissaggio'
        ]
      },
      {
        title: 'Elettronica',
        items: [
          'Alimentatori (PSU) - 12V / 24V / 5V',
          'Decoder DMX (per strip analogiche)',
          'Pixel Controller SPI (per strip digitali)'
        ]
      },
      {
        title: 'Connessioni',
        items: [
          'Saldatore a stagno + Rocchetto stagno',
          'Morsetti Wago / Mammut',
          'Cavo multipolare sottile (piattina rosso/nera o 4 poli)',
          'Guaina termorestringente',
          'Nastro Biadesivo VHB (Extra forte)'
        ]
      }
    ]
  },
  {
    id: '8',
    title: '8. SETTORE FX (Effetti Speciali)',
    subtitle: 'Pyrotech, Co2 e Atmosfera',
    groups: [
      {
        title: 'Macchine',
        items: [
          'Hazer (Nebbia sottile, oil o water based)',
          'Fog Machine (Fumo getto)',
          'Low Fog (Fumo basso - Ghiaccio o Acqua?)',
          'Sparkulars (Scintille a freddo)',
          'Flame Jets (Lanciafiamme)',
          'CO2 Jets / Gun',
          'Confetti Cannons / Blaster',
          'Ventilatori (AF-1, ecc.)'
        ]
      },
      {
        title: 'Consumabili (Check Bloccante)',
        items: [
          'Liquido Fumo / Haze (Taniche piene?)',
          'Polvere Titanio (Bustine per Sparkulars)',
          'Bombole CO2 (Con pescante/tubo immersione per liquidi!)',
          'Coriandoli (Confetti) e Stelle filanti (Streamers)',
          'Ghiaccio secco (Dry Ice) se richiesto'
        ]
      },
      {
        title: 'Accessori FX',
        items: [
          'Cavi Alta Pressione per CO2',
          'Raccordi bombole',
          'Cavi di sparo / DMX dedicato',
          'Tasto E-Stop (Emergenza)'
        ]
      }
    ]
  },
  {
    id: '9',
    title: '9. SETTORE REGIA FOH (Generale)',
    subtitle: 'Front of House setup',
    groups: [
      {
        title: 'Infrastruttura',
        items: [
          'Tavoli Regia (Pieghevoli o Flight case tables)',
          'Sedie / Sgabelli alti',
          'Gazebo / Tenda regia (se outdoor) + Pesi',
          'Pedana rialzata (Riser)',
          'Illuminazione cortesia (Led usb, Littlite)'
        ]
      },
      {
        title: 'Link Sala-Palco (Multicores)',
        items: [
          'Frusta Audio principale',
          'Linee DMX (Universe 1, 2, 3, 4...)',
          'Fibre Ottiche Video',
          'Cavi Rete (Internet/Controllo)'
        ]
      },
      {
        title: 'Power Safety',
        items: [
          'UPS Regia Video',
          'UPS Regia Luci',
          'UPS Regia Audio'
        ]
      }
    ]
  },
  {
    id: '10',
    title: '10. ALLESTIMENTO, CONSUMABILI & TOOLBOX',
    subtitle: 'Materiale di consumo e attrezzi',
    groups: [
      {
        title: 'Nastri adesivi',
        items: [
          'Gaffa Tape Nero (Opaco)',
          'Gaffa Tape Bianco (Scrivibile)',
          'Gaffa Tape Colorato (per segnare posizioni)',
          'Nastro Isolante elettrico',
          'Nastro Carta',
          'Biadesivo (Moquette e Standard)'
        ]
      },
      {
        title: 'Fissaggio',
        items: [
          'Fascette di plastica (Zip ties) - Nere e Bianche',
          'Fascette Velcro riutilizzabili',
          'Elastici con gancio (Bungees)',
          'Cordinio nero (Tie-line)'
        ]
      },
      {
        title: 'Accessori Vari',
        items: [
          'Batterie (Scorta massiccia AA, AAA, 9V)',
          'Moquette / Tappeto danza',
          'Scale (Doppia salita, Telescopica)',
          'Trabattello'
        ]
      },
      {
        title: 'Toolbox (La valigia attrezzi)',
        items: [
          'Cacciaviti, Pinze, Tronchesi',
          'Chiavi inglesi, Chiavi a rullino',
          'Set brugole / Chiavi Torx',
          'Tester / Multimetro',
          'Prova-cavi (Cable tester)',
          'Saldatore gas/elettrico'
        ]
      }
    ]
  },
  {
    id: '11',
    title: '11. SCENARI & RICHIESTE CLIENTE',
    subtitle: 'Oggetti specifici per tipologia evento',
    groups: [
      {
        title: 'Conferenza / Corporate',
        items: [
          'Leggio (Plexi o Legno)',
          'Microfoni a collo d\'oca (Gooseneck)',
          'Monitor Timer/Countdown',
          'Laptop Ospite kit (Adattatori video + Audio jack)'
        ]
      },
      {
        title: 'DJ Set',
        items: [
          'Tavolo DJ alto (100cm) stabile',
          'Monitor cassa spia potente',
          'Hub di rete per linkare i CDJ'
        ]
      },
      {
        title: 'Live Band',
        items: [
          'Leggii musicali + Lampade clip',
          'Stand Chitarra / Basso / Tastiera (X-stand)',
          'Tappeto per batteria (Drum carpet)',
          'Trasformatore 110V-220V (Step-down)'
        ]
      },
      {
        title: 'Gala / Luxury',
        items: [
          'Copri-cavi bianchi o passacavi verniciati',
          'Calzini per stativi (Tripod covers) bianchi/neri',
          'Casse audio bianche (se disponibili)'
        ]
      },
      {
        title: 'Panic Box (Kit Emergenza Cliente)',
        items: [
          'Caricabatterie telefono (Lightning, USB-C, Micro-USB)',
          'Adattatore Minijack -> iPhone/USB-C',
          'Pennarelli indelebili',
          'Chiavette USB vuote (formattate FAT32 e ExFat)',
          'Carta e penne'
        ]
      }
    ]
  }
];