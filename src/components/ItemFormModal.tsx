import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { 
  InventoryItem, 
  Category, 
  ItemDocument, 
  ItemAccessory, 
  PeriodicInspection, 
  ItemInstance,
  InventoryDatabase,
  DEFAULT_DATABASE_ID
} from '../types';
import { 
  Plus, 
  X, 
  Search, 
  Link as LinkIcon, 
  ArrowLeft, 
  Lightbulb, 
  Barcode, 
  Eye, 
  QrCode, 
  Printer, 
  PackageOpen, 
  FileText, 
  ExternalLink,
  Layers,
  Wrench,
  Calendar,
  DollarSign,
  Zap,
  MapPin,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Info,
  Scale,
  Box,
  Hash,
  FileCheck,
  StickyNote,
  Paperclip,
  Trash2,
  Check,
  Settings,
  Database
} from 'lucide-react';
import { getDbBadgeStyle, getDbDotColor } from '../utils/databaseColors';
import { generateBarcodeSVG, generateQRCodeSVG, printBarcode, printQRCode } from '../utils/codeGenerators';
import { openDocumentInBrowser } from '../utils/documentViewer';
import { 
  getCategoryDefinitions, 
  getSubcategoriesForCategory, 
  addSubcategoryToCategory,
  CategoryDefinition 
} from '../utils/categories';
import { CategoryManagerModal } from './CategoryManagerModal';
import { Modal } from './Modal';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Omit<InventoryItem, 'id'>) => void;
  initialData?: InventoryItem | null;
  inventory?: InventoryItem[];
  onCreateAccessory?: (item: InventoryItem) => void;
  title: string;
  initialName?: string;
  activeDatabaseId?: string;
  databases?: InventoryDatabase[];
}

// Generate product code (internal code, e.g. 1, 2, 067..., starts from 1, NOT printed)
export const generateProductCode = (
  existingItems: InventoryItem[],
  targetItemId?: string
): string => {
  const usedNumbers = new Set<number>();
  
  (existingItems || []).forEach(item => {
    if (targetItemId && item.id === targetItemId) return;
    if (item.productCode && item.productCode.trim()) {
      const num = parseInt(item.productCode.trim(), 10);
      if (!isNaN(num) && num > 0) {
        usedNumbers.add(num);
      }
    }
  });

  const unassignedItems = (existingItems || []).filter(
    i => !i.productCode || !i.productCode.trim()
  );

  let targetIndex = 0;
  if (targetItemId) {
    const idx = unassignedItems.findIndex(i => i.id === targetItemId);
    targetIndex = idx !== -1 ? idx : unassignedItems.length;
  } else {
    targetIndex = unassignedItems.length;
  }

  let currentNum = 1;
  let skipped = 0;
  while (true) {
    if (!usedNumbers.has(currentNum)) {
      if (skipped === targetIndex) {
        return currentNum.toString();
      }
      skipped++;
    }
    currentNum++;
  }
};

// Generate product QR / Barcode tag (7-digit starting at 1000001, printed as QR & Barcode)
export const generateProductQrCode = (
  existingItems: InventoryItem[],
  targetItemId?: string
): string => {
  const usedNumbers = new Set<number>();

  (existingItems || []).forEach(item => {
    if (targetItemId && item.id === targetItemId) return;
    if (item.qrCode && item.qrCode.trim()) {
      const val = item.qrCode.trim();
      if (/^\d{7}$/.test(val)) {
        usedNumbers.add(parseInt(val, 10));
      }
    }
    (item.instances || []).forEach(inst => {
      const code = (inst.id || '').trim();
      if (/^\d{7}$/.test(code)) {
        usedNumbers.add(parseInt(code, 10));
      }
    });
  });

  const unassignedItems = (existingItems || []).filter(
    i => !i.qrCode || !i.qrCode.trim()
  );

  let targetIndex = 0;
  if (targetItemId) {
    const idx = unassignedItems.findIndex(i => i.id === targetItemId);
    targetIndex = idx !== -1 ? idx : unassignedItems.length;
  } else {
    targetIndex = unassignedItems.length;
  }

  let currentNum = 1000001;
  let skipped = 0;
  while (true) {
    if (!usedNumbers.has(currentNum)) {
      if (skipped === targetIndex) {
        return currentNum.toString();
      }
      skipped++;
    }
    currentNum++;
  }
};

type ActiveTab = 'data' | 'serials' | 'accessories' | 'inspections' | 'notes' | 'files';

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory = [], onCreateAccessory, title, initialName, activeDatabaseId, databases = [] 
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('data');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});

  const effectiveDatabases = useMemo(() => {
    return (databases && databases.length > 0)
      ? databases
      : [{ id: DEFAULT_DATABASE_ID, name: 'Database Principale', code: 'PRI', color: 'emerald', isDefault: true }];
  }, [databases]);

  const defaultDatabaseId = useMemo(() => {
    return effectiveDatabases.find(d => d.isDefault)?.id || activeDatabaseId || DEFAULT_DATABASE_ID;
  }, [effectiveDatabases, activeDatabaseId]);
  
  // Category management
  const [categoryDefs, setCategoryDefs] = useState<CategoryDefinition[]>(getCategoryDefinitions());
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newSubcatInput, setNewSubcatInput] = useState('');
  const [isAddingSubcat, setIsAddingSubcat] = useState(false);

  // Numeric Inputs
  const [weightInput, setWeightInput] = useState('0');
  const [powerInput, setPowerInput] = useState('0');
  const [currentInput, setCurrentInput] = useState('0');
  const [powerPhase, setPowerPhase] = useState<'monofase' | 'trifase'>('monofase');
  const [powerSupplyRating, setPowerSupplyRating] = useState('16A');
  const [powerConnector, setPowerConnector] = useState('');

  const [lengthInput, setLengthInput] = useState('0');
  const [widthInput, setWidthInput] = useState('0');
  const [heightInput, setHeightInput] = useState('0');
  const [volumeInput, setVolumeInput] = useState('0');
  
  const [purchasePriceInput, setPurchasePriceInput] = useState('0');
  const [rentalPriceInput, setRentalPriceInput] = useState('0');
  const [subrentalCostInput, setSubrentalCostInput] = useState('0');

  // Accessories State
  const [accessorySearch, setAccessorySearch] = useState('');
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [localInventory, setLocalInventory] = useState<InventoryItem[]>([]);
  const [quickForm, setQuickForm] = useState<Partial<InventoryItem>>({});
  const [quickWeightInput, setQuickWeightInput] = useState('0');

  // Reminders & Docs State
  const [reminderInput, setReminderInput] = useState('');
  const [docNameInput, setDocNameInput] = useState('');
  const [docUrlInput, setDocUrlInput] = useState('');

  // Instances (Serial numbers) State
  const [tempInstances, setTempInstances] = useState<ItemInstance[]>([]);
  const [instanceIdInput, setInstanceIdInput] = useState('');
  const [instanceSnInput, setInstanceSnInput] = useState('');
  const [instanceRefInput, setInstanceRefInput] = useState('');
  const [instancePurchaseDateInput, setInstancePurchaseDateInput] = useState('');
  const [instanceNotesInput, setInstanceNotesInput] = useState('');

  // Periodic Inspections State
  const [inspectionNameInput, setInspectionNameInput] = useState('');
  const [inspectionPeriodInput, setInspectionPeriodInput] = useState('6');
  const [inspectionFrequencyInput, setInspectionFrequencyInput] = useState<'days' | 'months' | 'years'>('months');
  const [inspectionDescInput, setInspectionDescInput] = useState('');

  // Code Preview State
  const [previewCodeModal, setPreviewCodeModal] = useState<{ code: string; name: string } | null>(null);

  const refreshCategories = () => {
    setCategoryDefs(getCategoryDefinitions());
  };

  // Initialize or reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('data');
      refreshCategories();
      if (initialData) {
        let initialProductCode = initialData.productCode || '';
        if (initialProductCode && /^[A-Z]+-\d+$/i.test(initialProductCode.trim())) {
          const numPart = parseInt(initialProductCode.replace(/^[A-Z]+-0*/i, ''), 10);
          if (!isNaN(numPart) && numPart > 0) {
            initialProductCode = numPart.toString();
          }
        }
        if (!initialProductCode) {
          initialProductCode = generateProductCode(inventory, initialData.id);
        }

        let initialQrCode = initialData.qrCode || '';
        if (!initialQrCode || !/^\d{7}$/.test(initialQrCode.trim())) {
          initialQrCode = generateProductQrCode(inventory, initialData.id);
        }

        const currentSubcat = initialData.subcategory || initialData.folder || '';
        const initialDbId = initialData.databaseId || defaultDatabaseId;

        setFormData({
          ...initialData,
          databaseId: initialDbId,
          productCode: initialProductCode,
          qrCode: initialQrCode,
          subcategory: currentSubcat,
          folder: currentSubcat
        });

        setWeightInput(initialData.weight?.toString() || '0');
        setPowerInput(initialData.powerConsumption?.toString() || '0');
        setCurrentInput(initialData.current?.toString() || '0');
        setPowerPhase(initialData.powerPhase || 'monofase');
        setPowerSupplyRating(initialData.powerSupplyRating || '16A');
        setPowerConnector(initialData.powerConnector || '');

        setLengthInput(initialData.dimensions?.length?.toString() || '0');
        setWidthInput(initialData.dimensions?.width?.toString() || '0');
        setHeightInput(initialData.dimensions?.height?.toString() || '0');
        setVolumeInput(initialData.volume?.toString() || '0');
        
        setPurchasePriceInput(initialData.purchasePrice?.toString() || '0');
        setRentalPriceInput(initialData.rentalPrice?.toString() || '0');
        setSubrentalCostInput(initialData.subrentalCost?.toString() || '0');

        setTempInstances(initialData.instances || []);
      } else {
        const autoProductCode = generateProductCode(inventory);
        const autoQrCode = generateProductQrCode(inventory);
        
        setFormData({
          name: initialName || '',
          databaseId: defaultDatabaseId,
          productCode: autoProductCode,
          qrCode: autoQrCode,
          category: Category.AUDIO,
          subcategory: '',
          folder: '',
          alias: '',
          location: '',
          inStock: 1,
          rentalSaleType: 'rental',
          canHaveContent: false,
          accessories: [],
          reminders: [],
          documents: [],
          instances: [],
          periodicInspections: [],
          internalRemark: '',
          externalRemark: '',
          description: ''
        });

        setWeightInput('0');
        setPowerInput('0');
        setCurrentInput('0');
        setPowerPhase('monofase');
        setPowerSupplyRating('16A');
        setPowerConnector('');

        setLengthInput('0');
        setWidthInput('0');
        setHeightInput('0');
        setVolumeInput('0');
        
        setPurchasePriceInput('0');
        setRentalPriceInput('0');
        setSubrentalCostInput('0');

        setTempInstances([]);
      }
      setLocalInventory(inventory);
    }
  }, [isOpen, initialData, inventory, initialName, defaultDatabaseId]);

  // Recalculate transport volume (m³) when L x W x H change
  useEffect(() => {
    const l = parseFloat(lengthInput) || 0;
    const w = parseFloat(widthInput) || 0;
    const h = parseFloat(heightInput) || 0;
    if (l > 0 && w > 0 && h > 0) {
      const volM3 = (l * w * h) / 1000000;
      setVolumeInput(volM3 < 0.001 ? volM3.toFixed(4) : volM3.toFixed(3));
    }
  }, [lengthInput, widthInput, heightInput]);

  // Handle Power (W) change -> auto calculate Current (A)
  const handlePowerChange = (wVal: string, phase = powerPhase) => {
    setPowerInput(wVal);
    const watts = parseFloat(wVal);
    if (!isNaN(watts) && watts > 0) {
      const divisor = phase === 'monofase' ? 230 : 692.82;
      const amps = Math.round((watts / divisor) * 100) / 100;
      setCurrentInput(amps.toString());
    } else if (wVal === '' || watts === 0) {
      setCurrentInput('0');
    }
  };

  // Handle Current (A) change -> auto calculate Power (W)
  const handleCurrentChange = (aVal: string, phase = powerPhase) => {
    setCurrentInput(aVal);
    const amps = parseFloat(aVal);
    if (!isNaN(amps) && amps > 0) {
      const multiplier = phase === 'monofase' ? 230 : 692.82;
      const watts = Math.round(amps * multiplier);
      setPowerInput(watts.toString());
    } else if (aVal === '' || amps === 0) {
      setPowerInput('0');
    }
  };

  // Handle Phase switch (Monofase <-> Trifase)
  const handlePhaseChange = (newPhase: 'monofase' | 'trifase') => {
    setPowerPhase(newPhase);
    const watts = parseFloat(powerInput);
    if (!isNaN(watts) && watts > 0) {
      const divisor = newPhase === 'monofase' ? 230 : 692.82;
      const amps = Math.round((watts / divisor) * 100) / 100;
      setCurrentInput(amps.toString());
    }
  };

  // Subcategories available for selected category
  const availableSubcategories = useMemo(() => {
    const catName = formData.category || Category.AUDIO;
    return getSubcategoriesForCategory(catName);
  }, [formData.category, categoryDefs]);

  const currentDbId = formData.databaseId || defaultDatabaseId;
  const currentDb = useMemo(() => {
    return effectiveDatabases.find(d => d.id === currentDbId) || effectiveDatabases[0];
  }, [effectiveDatabases, currentDbId]);

  // Handle adding custom subcategory inline
  const handleAddSubcategoryInline = () => {
    const trimmed = newSubcatInput.trim();
    if (!trimmed) return;
    const catName = (formData.category || Category.AUDIO) as string;
    const updated = addSubcategoryToCategory(catName, trimmed);
    setCategoryDefs(updated);
    setFormData(prev => ({ ...prev, subcategory: trimmed, folder: trimmed }));
    setNewSubcatInput('');
    setIsAddingSubcat(false);
  };

  // Handle Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    let finalProductCode = (formData.productCode || '').trim();
    if (!finalProductCode) {
      finalProductCode = generateProductCode(inventory, initialData?.id);
    }

    let finalQrCode = (formData.qrCode || '').trim();
    if (!finalQrCode || !/^\d{7}$/.test(finalQrCode)) {
      finalQrCode = generateProductQrCode(inventory, initialData?.id);
    }

    const finalSubcat = (formData.subcategory || formData.folder || '').trim();

    onSave({
      name: formData.name,
      databaseId: formData.databaseId || defaultDatabaseId,
      productCode: finalProductCode,
      qrCode: finalQrCode,
      category: formData.category || Category.OTHER,
      subcategory: finalSubcat,
      folder: finalSubcat,
      alias: (formData.alias || '').trim(),
      location: (formData.location || '').trim(),
      stockType: tempInstances.length > 0 ? 'serialized' : 'bulk',
      inStock: parseInt(formData.inStock?.toString() || '1', 10) || 0,
      
      // Fisiche
      weight: parseFloat(weightInput) || 0,
      dimensions: {
        length: parseFloat(lengthInput) || 0,
        width: parseFloat(widthInput) || 0,
        height: parseFloat(heightInput) || 0
      },
      volume: parseFloat(volumeInput) || 0,
      
      // Elettriche
      powerConsumption: parseFloat(powerInput) || 0,
      current: parseFloat(currentInput) || 0,
      powerPhase: powerPhase,
      powerSupplyRating: powerSupplyRating,
      powerConnector: powerConnector.trim(),

      // Prezzi
      purchasePrice: parseFloat(purchasePriceInput) || 0,
      rentalPrice: parseFloat(rentalPriceInput) || 0,
      subrentalCost: parseFloat(subrentalCostInput) || 0,

      // Caratteristiche
      rentalSaleType: formData.rentalSaleType || 'rental',
      canHaveContent: !!formData.canHaveContent,

      // Descrizioni & Note
      description: (formData.description || '').trim(),
      internalRemark: (formData.internalRemark || '').trim(),
      externalRemark: (formData.externalRemark || '').trim(),

      // Relazioni
      accessories: formData.accessories || [],
      reminders: formData.reminders || [],
      documents: formData.documents || [],
      instances: tempInstances,
      periodicInspections: formData.periodicInspections || []
    });
    onClose();
  };

  // --- ACCESSORIES MANAGEMENT ---
  const handleAddAccessory = (itemId: string) => {
    const current = formData.accessories || [];
    if (!current.some(a => a.itemId === itemId)) {
      setFormData({
        ...formData,
        accessories: [...current, { itemId, quantity: 1, automatic: true }]
      });
    }
  };

  const handleUpdateAccessoryQty = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveAccessory(itemId);
      return;
    }
    const current = formData.accessories || [];
    setFormData({
      ...formData,
      accessories: current.map(a => a.itemId === itemId ? { ...a, quantity } : a)
    });
  };

  const handleToggleAccessoryAutomatic = (itemId: string) => {
    const current = formData.accessories || [];
    setFormData({
      ...formData,
      accessories: current.map(a => {
        if (a.itemId === itemId) {
          const isCurrentlyAuto = a.automatic !== false;
          return { ...a, automatic: !isCurrentlyAuto };
        }
        return a;
      })
    });
  };

  const handleRemoveAccessory = (itemId: string) => {
    const current = formData.accessories || [];
    setFormData({
      ...formData,
      accessories: current.filter(a => a.itemId !== itemId)
    });
  };

  const handleCreateAndAddAccessory = () => {
    if (!quickForm.name) return;
    const newId = generateId();
    const autoCode = generateProductCode([...inventory, ...localInventory]);
    const autoQr = generateProductQrCode([...inventory, ...localInventory]);

    const newItem: InventoryItem = {
      id: newId,
      name: quickForm.name,
      productCode: autoCode,
      qrCode: autoQr,
      category: quickForm.category || Category.CABLES,
      weight: parseFloat(quickWeightInput) || 0,
      inStock: quickForm.inStock || 10,
      description: 'Accessorio creato rapidamente'
    };

    setLocalInventory(prev => [...prev, newItem]);
    if (onCreateAccessory) {
      onCreateAccessory(newItem);
    }

    handleAddAccessory(newId);
    setIsQuickCreateOpen(false);
    setQuickForm({});
    setQuickWeightInput('0');
  };

  // --- INSTANCES / SERIALS MANAGEMENT ---
  const handleAddInstance = () => {
    let finalCode = instanceIdInput.trim();
    if (!finalCode) {
      finalCode = generateProductQrCode([...inventory, ...localInventory]);
    }

    const newInst: ItemInstance = {
      id: finalCode,
      serialNumber: instanceSnInput.trim(),
      internalReference: instanceRefInput.trim(),
      purchaseDate: instancePurchaseDateInput || '',
      active: true,
      notes: instanceNotesInput.trim()
    };

    setTempInstances(prev => [...prev, newInst]);
    setInstanceIdInput('');
    setInstanceSnInput('');
    setInstanceRefInput('');
    setInstancePurchaseDateInput('');
    setInstanceNotesInput('');
  };

  const handleToggleInstanceActive = (idx: number) => {
    setTempInstances(prev => prev.map((inst, i) => i === idx ? { ...inst, active: !inst.active } : inst));
  };

  const handleRemoveInstance = (idx: number) => {
    setTempInstances(prev => prev.filter((_, i) => i !== idx));
  };

  // --- PERIODIC INSPECTIONS MANAGEMENT ---
  const handleAddInspection = () => {
    if (!inspectionNameInput.trim()) return;
    const newInspection: PeriodicInspection = {
      id: generateId(),
      name: inspectionNameInput.trim(),
      period: parseInt(inspectionPeriodInput, 10) || 6,
      frequency: inspectionFrequencyInput,
      description: inspectionDescInput.trim(),
      active: true
    };
    setFormData(prev => ({
      ...prev,
      periodicInspections: [...(prev.periodicInspections || []), newInspection]
    }));
    setInspectionNameInput('');
    setInspectionDescInput('');
  };

  const handleRemoveInspection = (id: string) => {
    setFormData(prev => ({
      ...prev,
      periodicInspections: (prev.periodicInspections || []).filter(ins => ins.id !== id)
    }));
  };

  const handleToggleInspectionActive = (id: string) => {
    setFormData(prev => ({
      ...prev,
      periodicInspections: (prev.periodicInspections || []).map(ins => ins.id === id ? { ...ins, active: !ins.active } : ins)
    }));
  };

  // --- REMINDERS & DOCUMENTS ---
  const handleAddReminder = () => {
    if (!reminderInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      reminders: [...(prev.reminders || []), reminderInput.trim()]
    }));
    setReminderInput('');
  };

  const handleRemoveReminder = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      reminders: (prev.reminders || []).filter((_, i) => i !== idx)
    }));
  };

  const handleAddDocument = () => {
    if (!docUrlInput.trim()) return;
    const newDoc: ItemDocument = {
      id: generateId(),
      name: docNameInput.trim() || docUrlInput.trim(),
      url: docUrlInput.trim()
    };
    setFormData(prev => ({
      ...prev,
      documents: [...(prev.documents || []), newDoc]
    }));
    setDocNameInput('');
    setDocUrlInput('');
  };

  const handleRemoveDocument = (id: string) => {
    setFormData(prev => ({
      ...prev,
      documents: (prev.documents || []).filter(d => d.id !== id)
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col overflow-hidden animate-fadeIn select-none">
      
      {/* 1. TOP APP BAR / PAGE HEADER */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs sm:text-sm font-bold transition-all border border-slate-700 active:scale-95 shrink-0"
            title="Torna all'inventario"
          >
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Torna all'Inventario</span>
          </button>
          
          <div className="h-6 w-[1px] bg-slate-800 hidden sm:block"></div>

          <div className="flex items-center gap-2.5 truncate">
            {formData.productCode && (
              <span className="px-2.5 py-1 bg-blue-950 text-blue-400 border border-blue-800/80 rounded-lg text-xs font-mono font-bold shrink-0">
                Cod. {formData.productCode}
              </span>
            )}
            <h1 className="text-sm sm:text-base md:text-lg font-black text-white truncate tracking-tight">
              {formData.name ? formData.name : (title || 'Nuovo Materiale')}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!formData.name}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95"
          >
            <Check size={18} />
            <span>Salva Materiale</span>
          </button>
        </div>
      </header>

      {/* 2. TAB NAVIGATION BAR */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-4 sm:px-6 shrink-0 overflow-x-auto custom-scrollbar z-10">
        <div className="flex items-center gap-1 sm:gap-2 py-2 min-w-max">
          
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'data'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            <Layers size={16} />
            Dati Generali
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('serials')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'serials'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            <QrCode size={16} />
            Seriali / Matricole
            {tempInstances.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'serials' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {tempInstances.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accessories')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'accessories'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            <LinkIcon size={16} />
            Accessori
            {(formData.accessories?.length || 0) > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'accessories' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {formData.accessories?.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inspections')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'inspections'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            <Wrench size={16} />
            Manutenzioni & Ispezioni
            {(formData.periodicInspections?.length || 0) > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'inspections' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {formData.periodicInspections?.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'notes'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            <StickyNote size={16} />
            Note & Promemoria
            {((formData.reminders?.length || 0) > 0 || !!formData.internalRemark || !!formData.externalRemark) && (
              <span className={`w-2 h-2 rounded-full ${activeTab === 'notes' ? 'bg-white' : 'bg-amber-400'}`}></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'files'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            <Paperclip size={16} />
            File & Documenti
            {(formData.documents?.length || 0) > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'files' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {formData.documents?.length}
              </span>
            )}
          </button>

        </div>
      </div>

      {/* 3. SCROLLABLE PAGE BODY */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* ========================================================= */}
          {/* TAB 1: DATI GENERALI (REORGANIZED & COMPACTED) */}
          {/* ========================================================= */}
          {activeTab === 'data' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* TOP ROW: IDENTIFICAZIONE (NOME/ALIAS) + CODICI COMPATTI A DESTRA */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* LEFT: NOME MATERIALE & ALIAS (8 COLS) */}
                <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <Tag size={18} className="text-blue-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Identificazione Articolo</h3>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                      Nome Materiale (Database) <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="Es. Media Server MSI Katana, L-Acoustics SB18, Par Led 18x12W..." 
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-base sm:text-lg font-bold text-white placeholder-slate-600 focus:border-blue-500 outline-none transition-colors shadow-inner" 
                      value={formData.name || ''} 
                      onChange={e => setFormData({...formData, name: e.target.value})} 
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                      Alias / Ricerca Rapida
                    </label>
                    <input 
                      type="text" 
                      placeholder="Es. SB18, CDJ2000, MSI, Fumo..." 
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 outline-none transition-colors" 
                      value={formData.alias || ''} 
                      onChange={e => setFormData({...formData, alias: e.target.value})} 
                    />
                  </div>
                </div>

                {/* RIGHT: CODICI COMPATTI (4 COLS) */}
                <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3.5 flex flex-col justify-between">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <Hash size={18} className="text-cyan-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Codici & Riconoscimento</h3>
                  </div>

                  <div className="space-y-3">
                    {/* Codice Prodotto */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cod. Prodotto</label>
                        <span className="text-[10px] text-slate-500">Non stampato</span>
                      </div>
                      <input 
                        type="text" 
                        placeholder="Es. 530" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-cyan-300 focus:border-cyan-500 outline-none text-right" 
                        value={formData.productCode || ''} 
                        onChange={e => setFormData({...formData, productCode: e.target.value})} 
                      />
                    </div>

                    {/* QR Code Prodotto */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">QR Code / Barcode</label>
                        <span className="text-[10px] text-emerald-400 font-bold">7 cifre univoco</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="text" 
                          placeholder="1000530" 
                          maxLength={7}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-emerald-400 focus:border-emerald-500 outline-none text-right" 
                          value={formData.qrCode || ''} 
                          onChange={e => setFormData({...formData, qrCode: e.target.value})} 
                        />
                        <button
                          type="button"
                          onClick={() => formData.qrCode && setPreviewCodeModal({ code: formData.qrCode, name: formData.name || 'Prodotto' })}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors shrink-0"
                          title="Anteprima Codici"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => formData.qrCode && printQRCode(formData.qrCode, formData.name || 'Prodotto')}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors shrink-0"
                          title="Stampa Etichetta QR"
                        >
                          <Printer size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* MIDDLE ROW: CATEGORIA & MAGAZZINO (LEFT) VS PROPRIETÀ FISICHE (RIGHT) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* LEFT: DATABASE, CATEGORIA & MAGAZZINO (7 COLS) */}
                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <MapPin size={18} className="text-emerald-400" />
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Database, Categoria & Magazzino</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-colors"
                    >
                      <Settings size={13} />
                      Gestisci Categorie
                    </button>
                  </div>

                  {/* Database di Appartenenza (Compatto) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Database size={13} className="text-blue-400" />
                        Database di Appartenenza <span className="text-rose-500">*</span>
                      </label>
                      {currentDb && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${getDbBadgeStyle(currentDb.color)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${getDbDotColor(currentDb.color)}`} />
                          {currentDb.code || currentDb.name.slice(0, 3).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-blue-500 outline-none"
                      value={formData.databaseId || defaultDatabaseId}
                      onChange={e => setFormData({ ...formData, databaseId: e.target.value })}
                    >
                      {effectiveDatabases.map(db => (
                        <option key={db.id} value={db.id}>
                          [{db.code || db.name.slice(0, 3).toUpperCase()}] {db.name} {db.isDefault ? '(Predefinito)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Categoria Macro & Sottocategoria */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Macro Categoria
                      </label>
                      <select 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-emerald-500 outline-none" 
                        value={formData.category || Category.AUDIO} 
                        onChange={e => {
                          const newCat = e.target.value;
                          setFormData({
                            ...formData, 
                            category: newCat as any,
                            subcategory: '',
                            folder: ''
                          });
                        }}
                      >
                        {categoryDefs.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sottocategoria</label>
                        <button
                          type="button"
                          onClick={() => setIsAddingSubcat(!isAddingSubcat)}
                          className="text-[11px] text-emerald-400 hover:underline"
                        >
                          {isAddingSubcat ? 'Annulla' : '+ Nuova'}
                        </button>
                      </div>

                      {isAddingSubcat ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="Es. Diffusori Passivi..."
                            value={newSubcatInput}
                            onChange={e => setNewSubcatInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddSubcategoryInline()}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-emerald-500"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleAddSubcategoryInline}
                            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <select 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-emerald-500 outline-none" 
                          value={formData.subcategory || formData.folder || ''} 
                          onChange={e => setFormData({
                            ...formData, 
                            subcategory: e.target.value,
                            folder: e.target.value
                          })}
                        >
                          <option value="">-- Nessuna sottocategoria --</option>
                          {availableSubcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Giacenza & Posizione */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Giacenza Totale (Quantità)
                      </label>
                      <input 
                        type="number" 
                        min="0" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm font-bold text-white focus:border-emerald-500 outline-none text-right font-mono" 
                        value={formData.inStock ?? 1} 
                        onChange={e => setFormData({...formData, inStock: parseInt(e.target.value, 10) || 0})} 
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Posizione / Ubicazione Magazzino
                      </label>
                      <input 
                        type="text" 
                        placeholder="Es. T2, R2, A-03..." 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-emerald-500 outline-none" 
                        value={formData.location || ''} 
                        onChange={e => setFormData({...formData, location: e.target.value})} 
                      />
                    </div>
                  </div>

                  {/* Tipo Materiale & Flag Contenitore */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-center pt-2">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Tipo Materiale
                      </label>
                      <select 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-emerald-500 outline-none" 
                        value={formData.rentalSaleType || 'rental'} 
                        onChange={e => setFormData({...formData, rentalSaleType: e.target.value as 'rental' | 'sale'})}
                      >
                        <option value="rental">Noleggio (Rientra a magazzino)</option>
                        <option value="sale">Vendita / Consumabile (Non rientra)</option>
                      </select>
                    </div>

                    <div className="sm:pt-5">
                      <label className="flex items-center gap-2.5 cursor-pointer bg-slate-950 p-2.5 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={!!formData.canHaveContent} 
                          onChange={e => setFormData({...formData, canHaveContent: e.target.checked})}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-slate-300">
                          È un Contenitore / Flight Case / Rack
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* RIGHT: PROPRIETÀ FISICHE & DIMENSIONI (RIQUADRO A SÉ STANTE - 5 COLS) */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <Scale size={18} className="text-amber-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Proprietà Fisiche & Dimensioni</h3>
                  </div>

                  {/* PESO IN PRIMO PIANO */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Scale size={14} />
                        Peso Singolo
                      </label>
                      <span className="text-xs font-mono font-bold text-slate-400">kg</span>
                    </div>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-base font-bold text-white focus:border-amber-500 outline-none text-right font-mono" 
                      value={weightInput} 
                      onChange={e => setWeightInput(e.target.value)} 
                    />
                  </div>

                  {/* DIMENSIONI (L x W x H in cm) */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                      Dimensioni Trasporto (cm)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Lunghezza</span>
                        <input 
                          type="number" 
                          min="0" 
                          placeholder="L (cm)" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white focus:border-amber-500 outline-none text-right" 
                          value={lengthInput} 
                          onChange={e => setLengthInput(e.target.value)} 
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Larghezza</span>
                        <input 
                          type="number" 
                          min="0" 
                          placeholder="W (cm)" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white focus:border-amber-500 outline-none text-right" 
                          value={widthInput} 
                          onChange={e => setWidthInput(e.target.value)} 
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Altezza</span>
                        <input 
                          type="number" 
                          min="0" 
                          placeholder="H (cm)" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white focus:border-amber-500 outline-none text-right" 
                          value={heightInput} 
                          onChange={e => setHeightInput(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* VOLUME IN M³ CALCOLATO AUTOMATICAMENTE */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Box size={16} className="text-amber-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Volume di Trasporto</div>
                        <div className="text-[10px] text-slate-500">Calcolato automaticamente (L×W×H)</div>
                      </div>
                    </div>
                    <div className="text-sm font-mono font-black text-amber-400 bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-800/60">
                      {volumeInput || '0'} m³
                    </div>
                  </div>

                </div>

              </div>

              {/* BOTTOM ROW: PROPRIETÀ ELETTRICHE (LEFT) VS PREZZI & COSTI (RIGHT) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* LEFT: PROPRIETÀ ELETTRICHE (7 COLS) */}
                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <Zap size={18} className="text-yellow-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Proprietà Elettriche & Calcolo Automatico</h3>
                  </div>

                  {/* Tipo Presa & Fornitura */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Tipo Linea
                      </label>
                      <select 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-yellow-500 outline-none" 
                        value={powerPhase} 
                        onChange={e => handlePhaseChange(e.target.value as 'monofase' | 'trifase')}
                      >
                        <option value="monofase">Monofase (230V)</option>
                        <option value="trifase">Pentapolare (400V)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Fornitura Richiesta
                      </label>
                      <select 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-yellow-500 outline-none" 
                        value={powerSupplyRating} 
                        onChange={e => setPowerSupplyRating(e.target.value)}
                      >
                        <option value="16A">16 Ampere</option>
                        <option value="32A">32 Ampere</option>
                        <option value="63A">63 Ampere</option>
                        <option value="125A">125 Ampere</option>
                        <option value="Standard">Standard / Libera</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Tipo Connettore
                      </label>
                      <input 
                        type="text" 
                        placeholder={powerPhase === 'monofase' ? 'Es. Schuko, True1' : 'Es. CEE 32A 5P'} 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:border-yellow-500 outline-none" 
                        value={powerConnector} 
                        onChange={e => setPowerConnector(e.target.value)} 
                      />
                    </div>
                  </div>

                  {/* Calcolo Bidirezionale Watt <-> Ampere */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                          Consumo / Potenza (W)
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">Watt</span>
                      </div>
                      <input 
                        type="number" 
                        min="0" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm font-bold text-white focus:border-yellow-500 outline-none text-right font-mono" 
                        value={powerInput} 
                        onChange={e => handlePowerChange(e.target.value)} 
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                          Corrente Assorbita (A)
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">Ampere</span>
                      </div>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm font-bold text-white focus:border-yellow-500 outline-none text-right font-mono" 
                        value={currentInput} 
                        onChange={e => handleCurrentChange(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                {/* RIGHT: PREZZI DI ACQUISTO & NOLEGGIO (5 COLS) */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <DollarSign size={18} className="text-emerald-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prezzi & Costi</h3>
                  </div>

                  <div className="space-y-3">
                    {/* Prezzo Acquisto */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Prezzo di Acquisto
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">€ (Costo Bene)</span>
                      </div>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-white focus:border-emerald-500 outline-none text-right font-mono" 
                        value={purchasePriceInput} 
                        onChange={e => setPurchasePriceInput(e.target.value)} 
                      />
                    </div>

                    {/* Prezzo Noleggio Listino */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Prezzo Noleggio Listino
                        </label>
                        <span className="text-[10px] text-emerald-400 font-mono">€ / giorno</span>
                      </div>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-emerald-400 focus:border-emerald-500 outline-none text-right font-mono" 
                        value={rentalPriceInput} 
                        onChange={e => setRentalPriceInput(e.target.value)} 
                      />
                    </div>

                    {/* Costo Subnoleggio */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Costo Subnoleggio Fornitore
                        </label>
                        <span className="text-[10px] text-rose-400 font-mono">€ / giorno</span>
                      </div>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-300 focus:border-rose-500 outline-none text-right" 
                        value={subrentalCostInput} 
                        onChange={e => setSubrentalCostInput(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* DESCRIZIONE TECNICA GENERALE IN BASSO */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                  Descrizione & Specifiche Tecniche Generali
                </label>
                <textarea 
                  rows={3} 
                  placeholder="Inserisci dettagli, note generali sul materiale o specifiche utili..." 
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 outline-none resize-y" 
                  value={formData.description || ''} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                />
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: SERIALI / MATRICOLE */}
          {/* ========================================================= */}
          {activeTab === 'serials' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <QrCode size={18} className="text-cyan-400" />
                      Censimento Matricole & Seriali Fisici
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Registra ogni pezzo fisico con il proprio codice univoco a 7 cifre (1000001+), serial number del costruttore e stato operativo.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-slate-800 text-cyan-400 rounded-xl text-xs font-mono font-bold border border-slate-700">
                      Totale: {tempInstances.length} matricole
                    </span>
                  </div>
                </div>

                {/* Form Aggiunta Seriale */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 mt-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Codice QR (7 cifre)</label>
                    <input
                      type="text"
                      placeholder="Auto (1000001+)"
                      maxLength={7}
                      value={instanceIdInput}
                      onChange={e => setInstanceIdInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-bold outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Serial Number Produttore</label>
                    <input
                      type="text"
                      placeholder="SN es. SN-8942-X"
                      value={instanceSnInput}
                      onChange={e => setInstanceSnInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Rif. Interno (Sigla / N°)</label>
                    <input
                      type="text"
                      placeholder="Es. #01, Mixer-A"
                      value={instanceRefInput}
                      onChange={e => setInstanceRefInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddInstance}
                      className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-cyan-900/20 transition-all active:scale-95"
                    >
                      <Plus size={15} />
                      Aggiungi Seriale
                    </button>
                  </div>
                </div>

                {/* Tabella Matricole */}
                <div className="mt-4 overflow-x-auto custom-scrollbar">
                  {tempInstances.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
                      Nessuna matricola fisica registrata. L'articolo verrà gestito come materiale Bulk a quantità manuale ({formData.inStock || 1} pz).
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Codice QR (7 cifre)</th>
                          <th className="py-2.5 px-3">Serial Number</th>
                          <th className="py-2.5 px-3">Rif. Interno</th>
                          <th className="py-2.5 px-3 text-center">Stato</th>
                          <th className="py-2.5 px-3 text-right">Azioni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {tempInstances.map((inst, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono font-bold text-emerald-400">{inst.id}</td>
                            <td className="py-2 px-3 text-white font-mono">{inst.serialNumber || '-'}</td>
                            <td className="py-2 px-3 text-slate-300">{inst.internalReference || '-'}</td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleInstanceActive(idx)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                                  inst.active !== false 
                                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800' 
                                    : 'bg-rose-950/80 text-rose-400 border-rose-800'
                                }`}
                              >
                                {inst.active !== false ? 'Attivo' : 'Fuori Uso'}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPreviewCodeModal({ code: inst.id, name: `${formData.name || ''} (#${inst.internalReference || idx + 1})` })}
                                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Visualizza Codici"
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => printQRCode(inst.id, `${formData.name || ''} (#${inst.internalReference || idx + 1})`)}
                                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Stampa Etichetta QR"
                                >
                                  <Printer size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInstance(idx)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                                  title="Elimina"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: ACCESSORI */}
          {/* ========================================================= */}
          {activeTab === 'accessories' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* SINISTRA: RICERCA MATERIALE DA AGGIUNGERE */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col h-[520px]">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Search size={15} className="text-blue-400" />
                      Aggiungi da Inventario
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsQuickCreateOpen(true)}
                      className="text-xs text-emerald-400 hover:underline font-bold"
                    >
                      + Crea Rapido
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
                    <input 
                      type="text" 
                      placeholder="Cerca accessorio per nome..." 
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500" 
                      value={accessorySearch} 
                      onChange={e => setAccessorySearch(e.target.value)} 
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                    {localInventory
                      .filter(i => i.id !== initialData?.id)
                      .filter(i => (i.name || '').toLowerCase().includes(accessorySearch.toLowerCase()) || (i.category || '').toLowerCase().includes(accessorySearch.toLowerCase()))
                      .map(item => {
                        const isAdded = (formData.accessories || []).some(a => a.itemId === item.id);
                        return (
                          <div 
                            key={item.id} 
                            onClick={() => !isAdded && handleAddAccessory(item.id)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                              isAdded 
                                ? 'bg-slate-950 border-slate-800 opacity-50 cursor-not-allowed' 
                                : 'bg-slate-950 hover:bg-slate-800 border-slate-800/80'
                            }`}
                          >
                            <div className="min-w-0 flex-1 mr-2">
                              <div className="text-xs font-semibold text-white truncate">{item.name}</div>
                              <div className="text-[10px] text-slate-500">{item.category} • Disponibili: {item.inStock}</div>
                            </div>
                            <button
                              type="button"
                              disabled={isAdded}
                              className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                                isAdded ? 'text-slate-600' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white'
                              }`}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* DESTRA: TABELLA ACCESSORI COLLEGATI */}
                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col h-[520px]">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <LinkIcon size={15} className="text-emerald-400" />
                      Accessori Collegati ({formData.accessories?.length || 0})
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      Automatico = Inserimento diretto in distinta
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {(!formData.accessories || formData.accessories.length === 0) ? (
                      <div className="text-center py-20 text-slate-500 text-xs">
                        Nessun accessorio collegato a questo materiale. Seleziona gli accessori dalla colonna sinistra per abbinarli.
                      </div>
                    ) : (
                      formData.accessories.map(acc => {
                        const invItem = localInventory.find(i => i.id === acc.itemId);
                        const isAuto = acc.automatic !== false;
                        return (
                          <div 
                            key={acc.itemId}
                            className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-white truncate">{invItem?.name || 'Accessorio rimosso'}</div>
                              <div className="text-[10px] text-slate-500">{invItem?.category || 'Altro'}</div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {/* Toggle Automatico */}
                              <button
                                type="button"
                                onClick={() => handleToggleAccessoryAutomatic(acc.itemId)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                  isAuto 
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800 hover:bg-emerald-900' 
                                    : 'bg-amber-950/80 text-amber-300 border-amber-800 hover:bg-amber-900'
                                }`}
                                title={isAuto ? 'Incluso automaticamente alla distinta' : 'Chiede conferma all\'inserimento in distinta'}
                              >
                                {isAuto ? 'Automatico: Sì' : 'Opzionale (Chiedi)'}
                              </button>

                              {/* Quantità */}
                              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAccessoryQty(acc.itemId, acc.quantity - 1)}
                                  className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800"
                                >
                                  -
                                </button>
                                <span className="w-7 text-center font-mono font-bold text-xs text-white">
                                  {acc.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAccessoryQty(acc.itemId, acc.quantity + 1)}
                                  className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800"
                                >
                                  +
                                </button>
                              </div>

                              {/* Rimuovi */}
                              <button
                                type="button"
                                onClick={() => handleRemoveAccessory(acc.itemId)}
                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                                title="Rimuovi accessorio"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: MANUTENZIONI & ISPEZIONI */}
          {/* ========================================================= */}
          {activeTab === 'inspections' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Wrench size={18} className="text-blue-400" />
                      Piani di Ispezione & Manutenzione Periodica
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Definisci i controlli ciclici obbligatori (es. Collaudo catene motori, Serraggio morsetti, Ispezione cavi) e le scadenze.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-slate-800 text-blue-400 rounded-xl text-xs font-mono font-bold border border-slate-700">
                    {formData.periodicInspections?.length || 0} controlli
                  </span>
                </div>

                {/* Form Nuova Ispezione */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 mt-4">
                  <div className="md:col-span-5">
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Nome Controllo / Ispezione</label>
                    <input
                      type="text"
                      placeholder="Es. Verifica scatto differenziale, Collaudo..."
                      value={inspectionNameInput}
                      onChange={e => setInspectionNameInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Ogni quanti</label>
                    <input
                      type="number"
                      min="1"
                      value={inspectionPeriodInput}
                      onChange={e => setInspectionPeriodInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono font-bold text-center outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Frequenza</label>
                    <select
                      value={inspectionFrequencyInput}
                      onChange={e => setInspectionFrequencyInput(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500"
                    >
                      <option value="days">Giorni</option>
                      <option value="months">Mesi</option>
                      <option value="years">Anni</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddInspection}
                      disabled={!inspectionNameInput.trim()}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95"
                    >
                      <Plus size={14} />
                      Aggiungi
                    </button>
                  </div>
                </div>

                {/* Elenco Ispezioni Configurate */}
                <div className="mt-4 space-y-2">
                  {(!formData.periodicInspections || formData.periodicInspections.length === 0) ? (
                    <div className="text-center py-12 text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                      Nessuna ispezione periodica configurata per questo articolo.
                    </div>
                  ) : (
                    formData.periodicInspections.map(ins => {
                      const freqLabel = ins.frequency === 'days' ? 'giorni' : ins.frequency === 'months' ? 'mesi' : 'anni';
                      return (
                        <div key={ins.id} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white truncate">{ins.name}</span>
                              <span className="px-2 py-0.5 bg-blue-950 text-blue-400 border border-blue-800/80 rounded text-[10px] font-mono font-bold">
                                Ogni {ins.period} {freqLabel}
                              </span>
                            </div>
                            {ins.description && (
                              <p className="text-[11px] text-slate-400 mt-1">{ins.description}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleInspectionActive(ins.id)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                ins.active 
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800' 
                                  : 'bg-slate-900 text-slate-500 border-slate-800'
                              }`}
                            >
                              {ins.active ? 'Attivo' : 'Sospeso'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveInspection(ins.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: NOTE & PROMEMORIA (SEPARATED FROM FILES) */}
          {/* ========================================================= */}
          {activeTab === 'notes' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* NOTE INTERNE */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    <StickyNote size={17} className="text-amber-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Note Interne (Magazzino & Staff)</h3>
                  </div>
                  <p className="text-xs text-slate-500">Visibili solo internamente al personale aziendale:</p>
                  <textarea 
                    rows={4} 
                    placeholder="Es. Attenzione alla ventola sinistra, tenere sempre nel baule n°3..." 
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-amber-500 outline-none resize-y" 
                    value={formData.internalRemark || ''} 
                    onChange={e => setFormData({...formData, internalRemark: e.target.value})} 
                  />
                </div>

                {/* NOTE ESTERNE */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    <FileText size={17} className="text-cyan-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Note Esterne (Schede & Clienti)</h3>
                  </div>
                  <p className="text-xs text-slate-500">Stampabili o visibili nelle schede esterne/offerte:</p>
                  <textarea 
                    rows={4} 
                    placeholder="Es. Fornito con cavo alimentazione 1.5m e staffa standard..." 
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 outline-none resize-y" 
                    value={formData.externalRemark || ''} 
                    onChange={e => setFormData({...formData, externalRemark: e.target.value})} 
                  />
                </div>

              </div>

              {/* PROMEMORIA LAMPADINA ("COSE DA RICORDARE") */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Lightbulb size={18} className="text-amber-400 animate-pulse" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Promemoria Lampadina ("Cose da Ricordare")
                    </h3>
                  </div>
                  <span className="text-xs text-amber-400/90 font-mono">
                    {formData.reminders?.length || 0} promemoria attivi
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  Questi promemoria compariranno automaticamente come pop-up / avviso quando l'articolo viene inserito in una lista o preparato a magazzino.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Es. Ricordarsi di pulire la lente prima del rientro..."
                    value={reminderInput}
                    onChange={e => setReminderInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddReminder()}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddReminder}
                    disabled={!reminderInput.trim()}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
                  >
                    <Plus size={15} />
                    Aggiungi
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  {(!formData.reminders || formData.reminders.length === 0) ? (
                    <div className="text-center py-6 text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                      Nessun promemoria configurato per questo materiale.
                    </div>
                  ) : (
                    formData.reminders.map((rem, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-amber-950/20 border border-amber-900/40 rounded-xl">
                        <div className="flex items-center gap-2.5 text-xs text-amber-200 min-w-0 flex-1 mr-2">
                          <Lightbulb size={14} className="text-amber-400 shrink-0" />
                          <span className="truncate">{rem}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveReminder(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: FILE & DOCUMENTI (SEPARATED FROM NOTES) */}
          {/* ========================================================= */}
          {activeTab === 'files' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Paperclip size={18} className="text-blue-400" />
                      Documenti & File Esterni (Cloud Drive / Schede Tecniche)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Collega PDF, manuali, schede tecniche e file da Google Drive, OneDrive o Dropbox con anteprima diretta nel browser.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-slate-800 text-blue-400 rounded-xl text-xs font-mono font-bold border border-slate-700">
                    {formData.documents?.length || 0} file
                  </span>
                </div>

                {/* Form Inserimento Documento */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="sm:col-span-4">
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Nome / Etichetta File</label>
                    <input
                      type="text"
                      placeholder="Es. Manuale Utente PDF, Scheda Tecnica..."
                      value={docNameInput}
                      onChange={e => setDocNameInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-6">
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Link Esterno / Drive URL</label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/... o https://...pdf"
                      value={docUrlInput}
                      onChange={e => setDocUrlInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddDocument}
                      disabled={!docUrlInput.trim()}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95"
                    >
                      <Plus size={14} />
                      Aggiungi
                    </button>
                  </div>
                </div>

                {/* Elenco Documenti */}
                <div className="space-y-2 pt-2">
                  {(!formData.documents || formData.documents.length === 0) ? (
                    <div className="text-center py-12 text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                      Nessun documento o link esterno allegato a questo articolo.
                    </div>
                  ) : (
                    formData.documents.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-900/30 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
                            <FileText size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">{doc.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono truncate">{doc.url}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDocumentInBrowser(doc.url)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                          >
                            <ExternalLink size={13} />
                            Apri nel Browser
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDocument(doc.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL GESTIONE CATEGORIE */}
      {/* ========================================================= */}
      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          refreshCategories();
        }}
        onCategoriesUpdated={refreshCategories}
      />

      {/* ========================================================= */}
      {/* MODAL CREAZIONE RAPIDA ACCESSORIO */}
      {/* ========================================================= */}
      <Modal isOpen={isQuickCreateOpen} onClose={() => setIsQuickCreateOpen(false)} title="Nuovo Accessorio Rapido" size="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome Accessorio *</label>
            <input 
              type="text" 
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm" 
              value={quickForm.name || ''} 
              onChange={e => setQuickForm({...quickForm, name: e.target.value})} 
              autoFocus 
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Categoria</label>
              <select 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-xs" 
                value={quickForm.category || Category.CABLES} 
                onChange={e => setQuickForm({...quickForm, category: e.target.value as any})}
              >
                {categoryDefs.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Giacenza Iniziale</label>
              <input 
                type="number" 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-right text-xs" 
                value={quickForm.inStock || 10} 
                onChange={e => setQuickForm({...quickForm, inStock: parseInt(e.target.value, 10) || 0})} 
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button 
              type="button"
              onClick={() => setIsQuickCreateOpen(false)} 
              className="px-4 py-2 text-slate-400 hover:text-white rounded-lg text-xs font-semibold"
            >
              Annulla
            </button>
            <button 
              type="button"
              onClick={handleCreateAndAddAccessory} 
              disabled={!quickForm.name} 
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
            >
              Crea & Collega
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL ANTEPRIMA CODICI BARCODE & QR */}
      {/* ========================================================= */}
      <Modal isOpen={!!previewCodeModal} onClose={() => setPreviewCodeModal(null)} title="Anteprima Codici & Etichette" size="md">
        <div className="space-y-6 text-center">
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
            <div className="text-sm font-bold text-white">{previewCodeModal?.name}</div>
            <div className="text-xs font-mono text-emerald-400 mt-0.5">Codice: {previewCodeModal?.code}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Barcode 128 */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase mb-2">Barcode Code 128</span>
              <div dangerouslySetInnerHTML={{ __html: previewCodeModal ? generateBarcodeSVG(previewCodeModal.code) : '' }} />
              <button
                type="button"
                onClick={() => previewCodeModal && printBarcode(previewCodeModal.code, previewCodeModal.name)}
                className="mt-3 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Printer size={13} />
                Stampa Barcode
              </button>
            </div>

            {/* QR Code */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase mb-2">QR Code 2D</span>
              <div dangerouslySetInnerHTML={{ __html: previewCodeModal ? generateQRCodeSVG(previewCodeModal.code) : '' }} />
              <button
                type="button"
                onClick={() => previewCodeModal && printQRCode(previewCodeModal.code, previewCodeModal.name)}
                className="mt-3 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Printer size={13} />
                Stampa QR
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setPreviewCodeModal(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
            >
              Chiudi
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
