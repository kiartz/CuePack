import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { 
  InventoryItem, 
  Category, 
  ItemDocument, 
  ItemAccessory, 
  PeriodicInspection, 
  ItemInstance 
} from '../types';
import { Modal } from './Modal';
import { 
  Plus, 
  X, 
  Search, 
  Link, 
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
  Info
} from 'lucide-react';
import { generateBarcodeSVG, generateQRCodeSVG, printBarcode, printQRCode } from '../utils/codeGenerators';
import { openDocumentInBrowser } from '../utils/documentViewer';
import { updateItemFields, COLL_INVENTORY, getInventoryCollection } from '../firebase';

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

type ActiveTab = 'data' | 'serials' | 'accessories' | 'inspections' | 'remarks_docs';

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory = [], onCreateAccessory, title, activeDatabaseId 
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('data');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  
  // Numeric Inputs
  const [weightInput, setWeightInput] = useState('0');
  const [powerInput, setPowerInput] = useState('0');
  const [currentInput, setCurrentInput] = useState('0');
  const [lengthInput, setLengthInput] = useState('0');
  const [widthInput, setWidthInput] = useState('0');
  const [heightInput, setHeightInput] = useState('0');
  const [volumeInput, setVolumeInput] = useState('0');
  const [packedPerInput, setPackedPerInput] = useState('1');
  const [rentalPriceInput, setRentalPriceInput] = useState('0');
  const [subrentalCostInput, setSubrentalCostInput] = useState('0');

  // Accessories State
  const [accessorySearch, setAccessorySearch] = useState('');
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [localInventory, setLocalInventory] = useState<InventoryItem[]>([]);
  const [quickForm, setQuickForm] = useState<Partial<InventoryItem>>({});
  const [quickWeightInput, setQuickWeightInput] = useState('0');
  const [quickPowerInput, setQuickPowerInput] = useState('0');

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
  const [isCodePreviewOpen, setIsCodePreviewOpen] = useState(false);

  // Initialize or reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('data');
      if (initialData) {
        let initialProductCode = initialData.productCode || '';
        if (initialProductCode && /^[A-Z]+-\d+$/i.test(initialProductCode.trim())) {
          const numPart = parseInt(initialProductCode.replace(/^[A-Z]+-0*/i, ''), 10);
          if (!isNaN(numPart) && numPart > 0) {
            initialProductCode = numPart.toString();
          } else {
            initialProductCode = generateProductCode(inventory, initialData.id);
          }
        } else if (!initialProductCode.trim()) {
          initialProductCode = generateProductCode(inventory, initialData.id);
        }
        let initialQrCode = initialData.qrCode || '';
        if (!initialQrCode.trim()) {
          initialQrCode = generateProductQrCode(inventory, initialData.id);
        }
        
        setFormData({ 
          ...initialData, 
          productCode: initialProductCode,
          qrCode: initialQrCode,
          stockType: initialData.stockType || (initialData.instances && initialData.instances.length > 0 ? 'serialized' : 'bulk'),
          rentalSaleType: initialData.rentalSaleType || 'rental',
          accessories: initialData.accessories || [], 
          reminders: initialData.reminders || [], 
          documents: initialData.documents || [],
          instances: initialData.instances || [],
          periodicInspections: initialData.periodicInspections || []
        });

        setTempInstances(initialData.instances || []);
        setWeightInput(initialData.weight?.toString() || '0');
        setPowerInput(initialData.powerConsumption?.toString() || '0');
        setCurrentInput(initialData.current?.toString() || '0');
        setLengthInput(initialData.dimensions?.length?.toString() || '0');
        setWidthInput(initialData.dimensions?.width?.toString() || '0');
        setHeightInput(initialData.dimensions?.height?.toString() || '0');
        setVolumeInput(initialData.volume?.toString() || '0');
        setPackedPerInput(initialData.packedPer?.toString() || '1');
        setRentalPriceInput(initialData.rentalPrice?.toString() || '0');
        setSubrentalCostInput(initialData.subrentalCost?.toString() || '0');
      } else {
        const defaultCode = generateProductCode(inventory);
        const defaultQr = generateProductQrCode(inventory);
        setFormData({
          category: Category.AUDIO,
          inStock: 0,
          weight: 0,
          powerConsumption: 0,
          current: 0,
          stockType: 'bulk',
          rentalSaleType: 'rental',
          canHaveContent: false,
          name: '',
          productCode: defaultCode,
          qrCode: defaultQr,
          description: '',
          folder: '',
          alias: '',
          location: '',
          dimensions: { length: 0, width: 0, height: 0 },
          volume: 0,
          packedPer: 1,
          rentalPrice: 0,
          subrentalCost: 0,
          internalRemark: '',
          externalRemark: '',
          accessories: [],
          reminders: [],
          documents: [],
          instances: [],
          periodicInspections: []
        });
        setTempInstances([]);
        setWeightInput('0');
        setPowerInput('0');
        setCurrentInput('0');
        setLengthInput('0');
        setWidthInput('0');
        setHeightInput('0');
        setVolumeInput('0');
        setPackedPerInput('1');
        setRentalPriceInput('0');
        setSubrentalCostInput('0');
      }

      setAccessorySearch('');
      setIsQuickCreateOpen(false);
      setLocalInventory([]);
      setReminderInput('');
      setDocNameInput('');
      setDocUrlInput('');
      setInstanceIdInput('');
      setInstanceSnInput('');
      setInstanceRefInput('');
      setInstancePurchaseDateInput('');
      setInstanceNotesInput('');
      setInspectionNameInput('');
      setInspectionPeriodInput('6');
      setInspectionFrequencyInput('months');
      setInspectionDescInput('');
    }
  }, [isOpen, initialData?.id]);

  // Handle Dimensions & Volume automatic recalculation
  const handleDimensionChange = (field: 'length' | 'width' | 'height', val: string) => {
    if (field === 'length') setLengthInput(val);
    if (field === 'width') setWidthInput(val);
    if (field === 'height') setHeightInput(val);

    const l = field === 'length' ? parseFloat(val) || 0 : parseFloat(lengthInput) || 0;
    const w = field === 'width' ? parseFloat(val) || 0 : parseFloat(widthInput) || 0;
    const h = field === 'height' ? parseFloat(val) || 0 : parseFloat(heightInput) || 0;

    const newDims = { length: l, width: w, height: h };
    // Volume in m3 = (L cm * W cm * H cm) / 1,000,000
    const calcVol = Number(((l * w * h) / 1000000).toFixed(4));
    setVolumeInput(calcVol.toString());

    setFormData(prev => ({
      ...prev,
      dimensions: newDims,
      volume: calcVol
    }));
  };

  const getSuggestedInstanceId = (currentInstancesList?: ItemInstance[]) => {
    const usedNumbers = new Set<number>();

    if (inventory && Array.isArray(inventory)) {
      inventory.forEach(item => {
        if (initialData && item.id === initialData.id) return;
        if (item.qrCode && /^\d{7}$/.test(item.qrCode.trim())) {
          usedNumbers.add(parseInt(item.qrCode.trim(), 10));
        }
        (item.instances || []).forEach(inst => {
          const code = (inst.id || '').trim();
          if (/^\d{7}$/.test(code)) {
            usedNumbers.add(parseInt(code, 10));
          }
        });
      });
    }

    if (formData.qrCode && /^\d{7}$/.test(formData.qrCode.trim())) {
      usedNumbers.add(parseInt(formData.qrCode.trim(), 10));
    }

    const instancesToScan = currentInstancesList !== undefined ? currentInstancesList : (tempInstances || []);
    instancesToScan.forEach(inst => {
      const code = (inst.id || '').trim();
      if (/^\d{7}$/.test(code)) {
        usedNumbers.add(parseInt(code, 10));
      }
    });

    let nextNum = 1000001;
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }

    return nextNum.toString();
  };

  // Pre-fill instance ID when switching to serials tab if empty
  useEffect(() => {
    if (activeTab === 'serials' && !instanceIdInput) {
      setInstanceIdInput(getSuggestedInstanceId(tempInstances));
    }
  }, [activeTab]);

  const handleSubmit = () => {
    if (formData.name && formData.category) {
      const finalFormData = { ...formData };
      if (!finalFormData.productCode || !finalFormData.productCode.trim()) {
        finalFormData.productCode = generateProductCode(inventory, initialData?.id);
      } else {
        finalFormData.productCode = finalFormData.productCode.trim();
      }

      if (finalFormData.productCode.length > 20) {
        alert("Il codice prodotto può avere una lunghezza massima di 20 caratteri.");
        return;
      }

      // If serialized, stock equals active instances count
      if (finalFormData.stockType === 'serialized') {
        finalFormData.instances = tempInstances;
        finalFormData.inStock = tempInstances.filter(i => i.active !== false).length;
      } else {
        finalFormData.instances = tempInstances;
      }

      finalFormData.accessories = Array.isArray(finalFormData.accessories) ? finalFormData.accessories : [];
      finalFormData.reminders = Array.isArray(finalFormData.reminders) ? finalFormData.reminders : [];
      finalFormData.documents = Array.isArray(finalFormData.documents) ? finalFormData.documents : [];
      finalFormData.periodicInspections = Array.isArray(finalFormData.periodicInspections) ? finalFormData.periodicInspections : [];

      onSave(finalFormData as Omit<InventoryItem, 'id'>);
      onClose();
    }
  };

  // --- SERIALS LOGIC ---
  const addInstance = () => {
    const code = instanceIdInput.trim();
    if (!code) return;

    if (code.length > 20) {
      alert("Il codice univoco / QR può avere una lunghezza massima di 20 caratteri.");
      return;
    }

    const isDuplicateLocal = tempInstances.some(inst => inst.id.toLowerCase() === code.toLowerCase());
    if (isDuplicateLocal) {
      alert(`Il codice univoco / QR "${code}" è già stato inserito in questo articolo.`);
      return;
    }

    let duplicateItemName = '';
    if (inventory && Array.isArray(inventory)) {
      for (const item of inventory) {
        if (initialData && item.id === initialData.id) continue;
        if (item.qrCode && item.qrCode.trim().toLowerCase() === code.toLowerCase()) {
          duplicateItemName = item.name;
          break;
        }
        const hasDuplicate = (item.instances || []).some(inst => (inst.id || '').trim().toLowerCase() === code.toLowerCase());
        if (hasDuplicate) {
          duplicateItemName = item.name;
          break;
        }
      }
    }

    if (duplicateItemName) {
      alert(`Errore: Il codice univoco / QR "${code}" è già associato al prodotto "${duplicateItemName}".`);
      return;
    }

    const snCode = instanceSnInput.trim();
    const newInstance: ItemInstance = { 
      id: code, 
      serialNumber: snCode || undefined,
      internalReference: instanceRefInput.trim() || undefined,
      purchaseDate: instancePurchaseDateInput || undefined,
      notes: instanceNotesInput.trim() || undefined,
      active: true
    };

    const updated = [...tempInstances, newInstance];
    setTempInstances(updated);
    setFormData(prev => ({ 
      ...prev, 
      instances: updated,
      inStock: prev.stockType === 'serialized' ? updated.filter(i => i.active !== false).length : prev.inStock
    }));

    const nextCode = getSuggestedInstanceId(updated);
    setInstanceIdInput(nextCode);
    setInstanceSnInput('');
    setInstanceRefInput('');
    setInstanceNotesInput('');
  };

  const removeInstance = (index: number) => {
    const updated = [...tempInstances];
    updated.splice(index, 1);
    setTempInstances(updated);
    setFormData(prev => ({ 
      ...prev, 
      instances: updated,
      inStock: prev.stockType === 'serialized' ? updated.filter(i => i.active !== false).length : prev.inStock
    }));
    const nextCode = getSuggestedInstanceId(updated);
    setInstanceIdInput(nextCode);
  };

  const toggleInstanceActive = (index: number) => {
    const updated = tempInstances.map((inst, idx) => 
      idx === index ? { ...inst, active: inst.active === false ? true : false } : inst
    );
    setTempInstances(updated);
    setFormData(prev => ({ 
      ...prev, 
      instances: updated,
      inStock: prev.stockType === 'serialized' ? updated.filter(i => i.active !== false).length : prev.inStock
    }));
  };

  // --- ACCESSORIES LOGIC ---
  const addAccessory = (item: InventoryItem) => {
    const currentAccessories = formData.accessories || [];
    const existing = currentAccessories.find(a => a.itemId === item.id);
    
    let updatedAccessories: ItemAccessory[];
    if (existing) {
      updatedAccessories = currentAccessories.map(a => 
        a.itemId === item.id ? { ...a, quantity: a.quantity + 1 } : a
      );
    } else {
      updatedAccessories = [...currentAccessories, { itemId: item.id, quantity: 1, automatic: true }];
    }
    setFormData(prev => ({ ...prev, accessories: updatedAccessories }));
    setAccessorySearch('');
  };

  const removeAccessory = (itemId: string) => {
    setFormData(prev => ({ 
      ...prev, 
      accessories: (prev.accessories || []).filter(a => a.itemId !== itemId) 
    }));
  };

  const updateAccessoryQuantity = (itemId: string, qty: number) => {
    if (qty < 1) return;
    setFormData(prev => ({ 
      ...prev, 
      accessories: (prev.accessories || []).map(a => a.itemId === itemId ? { ...a, quantity: qty } : a) 
    }));
  };

  const toggleAccessoryAutomatic = (itemId: string) => {
    setFormData(prev => ({
      ...prev,
      accessories: (prev.accessories || []).map(a => 
        a.itemId === itemId ? { ...a, automatic: a.automatic === false ? true : false } : a
      )
    }));
  };

  // --- PERIODIC INSPECTIONS LOGIC ---
  const addInspection = () => {
    if (!inspectionNameInput.trim()) return;
    const newInsp: PeriodicInspection = {
      id: generateId(),
      name: inspectionNameInput.trim(),
      period: parseInt(inspectionPeriodInput, 10) || 1,
      frequency: inspectionFrequencyInput,
      description: inspectionDescInput.trim() || undefined,
      active: true
    };
    setFormData(prev => ({
      ...prev,
      periodicInspections: [...(prev.periodicInspections || []), newInsp]
    }));
    setInspectionNameInput('');
    setInspectionPeriodInput('6');
    setInspectionDescInput('');
  };

  const removeInspection = (id: string) => {
    setFormData(prev => ({
      ...prev,
      periodicInspections: (prev.periodicInspections || []).filter(i => i.id !== id)
    }));
  };

  const toggleInspectionActive = (id: string) => {
    setFormData(prev => ({
      ...prev,
      periodicInspections: (prev.periodicInspections || []).map(i => 
        i.id === id ? { ...i, active: !i.active } : i
      )
    }));
  };

  // --- REMINDERS & DOCS LOGIC ---
  const addReminder = () => {
    if (!reminderInput.trim()) return;
    setFormData({ ...formData, reminders: [...(formData.reminders || []), reminderInput.trim()] });
    setReminderInput('');
  };

  const removeReminder = (index: number) => {
    const newReminders = [...(formData.reminders || [])];
    newReminders.splice(index, 1);
    setFormData({ ...formData, reminders: newReminders });
  };

  const addDocument = () => {
    if (!docUrlInput.trim()) return;
    const url = docUrlInput.trim();
    const name = docNameInput.trim() ? docNameInput.trim() : url;
    const newDoc: ItemDocument = {
      id: generateId(),
      name,
      url
    };
    setFormData({ ...formData, documents: [...(formData.documents || []), newDoc] });
    setDocNameInput('');
    setDocUrlInput('');
  };

  const removeDocument = (id: string) => {
    const newDocs = (formData.documents || []).filter(d => d.id !== id);
    setFormData({ ...formData, documents: newDocs });
  };

  // Quick Create Accessory Modal
  const openQuickCreate = () => {
    setQuickForm({
      name: accessorySearch,
      category: Category.CABLES,
      inStock: 0,
      weight: 0,
      powerConsumption: 0,
      description: ''
    });
    setQuickWeightInput('0');
    setQuickPowerInput('0');
    setIsQuickCreateOpen(true);
  };

  const handleCreateAndAddAccessory = () => {
    if (!quickForm.name?.trim() || !onCreateAccessory) return;
    
    const newItemData: InventoryItem = {
      id: generateId(),
      name: quickForm.name.trim(),
      category: quickForm.category || Category.CABLES,
      inStock: quickForm.inStock || 0,
      weight: quickForm.weight || 0,
      powerConsumption: quickForm.powerConsumption || 0,
      description: quickForm.description || '',
      accessories: []
    };

    setLocalInventory(prev => [...prev, newItemData]);
    onCreateAccessory(newItemData);
    addAccessory(newItemData);
    
    setIsQuickCreateOpen(false);
    setAccessorySearch(''); 
  };

  const searchResults = useMemo(() => {
    const tokens = accessorySearch.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return [];
    return inventory.filter(i => {
      if (i.id === initialData?.id) return false;
      const combined = `${i.name} ${i.category} ${i.description || ''} ${i.folder || ''} ${i.alias || ''}`.toLowerCase();
      return tokens.every(token => combined.includes(token));
    });
  }, [inventory, accessorySearch, initialData]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="2xl" hideCloseButton={true}>
      <div className="flex flex-col h-full max-h-[85vh]">
        
        {/* HEADER BAR & TABS */}
        <div className="border-b border-slate-800 pb-3 -mt-2">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-slate-800 text-blue-400 font-mono text-xs font-bold rounded-lg border border-slate-700">
                {formData.productCode || '---'}
              </span>
              <h2 className="text-base font-bold text-white truncate max-w-md">
                {formData.name || 'Nuovo Articolo'}
              </h2>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={onClose} 
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors font-medium"
              >
                Annulla
              </button>
              <button 
                type="button" 
                onClick={handleSubmit} 
                disabled={!formData.name} 
                className="px-5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all shadow-md shadow-blue-900/30 active:scale-95"
              >
                Salva Materiale
              </button>
            </div>
          </div>

          {/* TABS NAVIGATION */}
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pt-1">
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'data'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers size={14} /> Dati Generali
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('serials')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'serials'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Barcode size={14} /> Seriali / Matricole 
              {tempInstances.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'serials' ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-800 text-emerald-400'}`}>
                  {tempInstances.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('accessories')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'accessories'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Link size={14} /> Accessori
              {(formData.accessories || []).length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'accessories' ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-cyan-400'}`}>
                  {(formData.accessories || []).length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('inspections')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'inspections'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-900/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wrench size={14} /> Manutenzioni
              {(formData.periodicInspections || []).length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'inspections' ? 'bg-amber-900 text-amber-200' : 'bg-slate-800 text-amber-400'}`}>
                  {(formData.periodicInspections || []).length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('remarks_docs')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'remarks_docs'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText size={14} /> Note & File
              {((formData.documents || []).length > 0 || (formData.reminders || []).length > 0) && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'remarks_docs' ? 'bg-purple-900 text-purple-200' : 'bg-slate-800 text-purple-400'}`}>
                  {(formData.documents || []).length + (formData.reminders || []).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 px-1 space-y-6">

          {/* ========================================================================= */}
          {/* TAB 1: DATI GENERALI */}
          {/* ========================================================================= */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              
              {/* SECTION 1: INFORMAZIONI PRINCIPALI */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Tag size={14} className="text-blue-400" /> Informazioni Principali
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="space-y-1 md:col-span-6">
                    <label className="text-xs text-slate-400 font-medium">Nome Materiale (Database) *</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm placeholder-slate-600" 
                      value={formData.name || ''} 
                      onChange={e => setFormData({ ...formData, name: e.target.value })} 
                      placeholder="Es. Lettore DJ - Pioneer - CDJ-2000" 
                      autoFocus 
                    />
                  </div>

                  <div className="space-y-1 md:col-span-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-400 font-medium">Cod. Prodotto</label>
                      <span className="text-[10px] text-slate-500 font-mono">No Stampa</span>
                    </div>
                    <input 
                      type="text" 
                      maxLength={20}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none font-mono text-sm placeholder-slate-600" 
                      value={formData.productCode || ''} 
                      onChange={e => setFormData({ ...formData, productCode: e.target.value })} 
                      placeholder="Es. 067" 
                    />
                  </div>

                  <div className="space-y-1 md:col-span-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-400 font-medium">QR Code Prodotto</label>
                      {formData.qrCode && (
                        <div className="flex items-center gap-0.5">
                          <button 
                            type="button" 
                            onClick={() => setIsCodePreviewOpen(true)} 
                            className="p-1 text-slate-400 hover:text-blue-400 rounded transition-colors"
                            title="Visualizza Codice"
                          >
                            <Eye size={14} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => printBarcode(formData.qrCode!, formData.name || '')} 
                            className="p-1 text-slate-400 hover:text-emerald-400 rounded transition-colors"
                            title="Stampa Barcode"
                          >
                            <Barcode size={14} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => printQRCode(formData.qrCode!, formData.name || '')} 
                            className="p-1 text-slate-400 hover:text-purple-400 rounded transition-colors"
                            title="Stampa QR Code"
                          >
                            <QrCode size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <input 
                      type="text" 
                      maxLength={20}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-purple-300 font-bold focus:border-purple-500 outline-none font-mono text-sm placeholder-slate-600" 
                      value={formData.qrCode || ''} 
                      onChange={e => setFormData({ ...formData, qrCode: e.target.value })} 
                      placeholder="Es. 1006821" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Categoria</label>
                    <select 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm" 
                      value={formData.category} 
                      onChange={e => setFormData({ ...formData, category: e.target.value as Category })}
                    >
                      {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Cartella / Sottocategoria (Folder)</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm placeholder-slate-600" 
                      value={formData.folder || ''} 
                      onChange={e => setFormData({ ...formData, folder: e.target.value })} 
                      placeholder="Es. Diffusori Passivi, Cavi RCA..." 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Alias / Ricerca Rapida</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm placeholder-slate-600 font-mono" 
                      value={formData.alias || ''} 
                      onChange={e => setFormData({ ...formData, alias: e.target.value })} 
                      placeholder="Es. SB18, CDJ2000" 
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: GESTIONE MAGAZZINO & TIPOLOGIA */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <MapPin size={14} className="text-emerald-400" /> Magazzino & Tipologia Scorte
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Metodo Calcolo Giacenza</label>
                    <select 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                      value={formData.stockType || 'bulk'}
                      onChange={e => setFormData({ ...formData, stockType: e.target.value as 'bulk' | 'serialized' })}
                    >
                      <option value="bulk">Bulk (Quantità Manuale)</option>
                      <option value="serialized">Seriali / Matricole</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Giacenza Totale</label>
                    <input 
                      type="number" 
                      min="0"
                      disabled={formData.stockType === 'serialized'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm text-right disabled:opacity-60" 
                      value={formData.inStock ?? 0} 
                      onChange={e => setFormData({ ...formData, inStock: parseInt(e.target.value, 10) || 0 })} 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Posizione a Magazzino</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm placeholder-slate-600 font-mono" 
                      value={formData.location || ''} 
                      onChange={e => setFormData({ ...formData, location: e.target.value })} 
                      placeholder="Es. T2, R2, A-03" 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Tipo Materiale</label>
                    <select 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                      value={formData.rentalSaleType || 'rental'}
                      onChange={e => setFormData({ ...formData, rentalSaleType: e.target.value as 'rental' | 'sale' })}
                    >
                      <option value="rental">Noleggio (Rientra a magazzino)</option>
                      <option value="sale">Vendita / Consumo (Non rientra)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 select-none">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-700 focus:ring-blue-500 focus:ring-offset-0"
                      checked={formData.canHaveContent || false}
                      onChange={e => setFormData({ ...formData, canHaveContent: e.target.checked })}
                    />
                    <span>È un <strong>Contenitore / Baule / Rack</strong> (può ospitare altro materiale all'interno)</span>
                  </label>
                </div>
              </div>

              {/* SECTION 3: PROPRIETÀ FISICHE & DIMENSIONI */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <PackageOpen size={14} className="text-cyan-400" /> Proprietà Fisiche & Dimensioni
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Lunghezza (cm)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                      value={lengthInput} 
                      onChange={e => handleDimensionChange('length', e.target.value)} 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Larghezza (cm)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                      value={widthInput} 
                      onChange={e => handleDimensionChange('width', e.target.value)} 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Altezza (cm)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                      value={heightInput} 
                      onChange={e => handleDimensionChange('height', e.target.value)} 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Volume (m³)</label>
                    <input 
                      type="number" 
                      step="0.001" 
                      min="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                      value={volumeInput} 
                      onChange={e => {
                        setVolumeInput(e.target.value);
                        setFormData(prev => ({ ...prev, volume: parseFloat(e.target.value) || 0 }));
                      }} 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Peso (kg)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                      value={weightInput} 
                      onChange={e => {
                        setWeightInput(e.target.value);
                        setFormData(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }));
                      }} 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Pezzi per Imballo</label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                      value={packedPerInput} 
                      onChange={e => {
                        setPackedPerInput(e.target.value);
                        setFormData(prev => ({ ...prev, packedPer: parseInt(e.target.value, 10) || 1 }));
                      }} 
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: ELETTRICO ED ECONOMICO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ELETTRICO */}
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" /> Proprietà Elettriche
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 font-medium">Consumo / Potenza (W)</label>
                      <input 
                        type="number" 
                        step="1" 
                        min="0"
                        placeholder="0 se non elettrico"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                        value={powerInput} 
                        onChange={e => {
                          setPowerInput(e.target.value);
                          setFormData(prev => ({ ...prev, powerConsumption: parseFloat(e.target.value) || 0 }));
                        }} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 font-medium">Corrente Assorbita (A)</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        min="0"
                        placeholder="0"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                        value={currentInput} 
                        onChange={e => {
                          setCurrentInput(e.target.value);
                          setFormData(prev => ({ ...prev, current: parseFloat(e.target.value) || 0 }));
                        }} 
                      />
                    </div>
                  </div>
                </div>

                {/* ECONOMICO */}
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <DollarSign size={14} className="text-emerald-400" /> Prezzi di Listino & Noleggio
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 font-medium">Prezzo Noleggio (€)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                        value={rentalPriceInput} 
                        onChange={e => {
                          setRentalPriceInput(e.target.value);
                          setFormData(prev => ({ ...prev, rentalPrice: parseFloat(e.target.value) || 0 }));
                        }} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 font-medium">Costo Subnoleggio (€)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm text-right" 
                        value={subrentalCostInput} 
                        onChange={e => {
                          setSubrentalCostInput(e.target.value);
                          setFormData(prev => ({ ...prev, subrentalCost: parseFloat(e.target.value) || 0 }));
                        }} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* DESCRIZIONE BASE */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Descrizione & Note Tecniche Generali</label>
                <textarea 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-20 resize-none text-sm placeholder-slate-600" 
                  value={formData.description || ''} 
                  onChange={e => setFormData({ ...formData, description: e.target.value })} 
                  placeholder="Specifiche tecniche di base..." 
                />
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: SERIALI / MATRICOLE */}
          {/* ========================================================================= */}
          {activeTab === 'serials' && (
            <div className="space-y-4">
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <Barcode size={16} className="text-emerald-400" /> Censimento Matricole & Pezzi Fisici
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Inserisci i singoli seriali fisici. Il <strong>Codice Univoco / QR Seriale</strong> (7 cifre, es. 1007000) è stampabile con QR e Barcode.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-950 border border-emerald-800/60 text-emerald-300 font-mono text-xs font-bold rounded-lg shrink-0">
                    Totale: {tempInstances.length} (Attivi: {tempInstances.filter(i => i.active !== false).length})
                  </span>
                </div>

                {/* ADD SERIAL ROW FORM */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-3 mt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Codice QR Seriale *</label>
                      <input 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-purple-300 focus:border-purple-500 outline-none font-mono font-bold text-xs"
                        placeholder="Es. 1007001"
                        maxLength={20}
                        value={instanceIdInput}
                        onChange={e => setInstanceIdInput(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">SN Costruttore</label>
                      <input 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none font-mono text-xs"
                        placeholder="Es. JHMP015129YY"
                        maxLength={20}
                        value={instanceSnInput}
                        onChange={e => setInstanceSnInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addInstance()}
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rif. Interno</label>
                      <input 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none text-xs"
                        placeholder="Es. 1, 2, DJ-A"
                        value={instanceRefInput}
                        onChange={e => setInstanceRefInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addInstance()}
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Data Acquisto</label>
                      <input 
                        type="date"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none text-xs"
                        value={instancePurchaseDateInput}
                        onChange={e => setInstancePurchaseDateInput(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-1 flex items-end">
                      <button 
                        type="button"
                        onClick={addInstance} 
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center justify-center h-[36px] transition-all shadow-md shadow-emerald-900/30" 
                        title="Aggiungi Seriale"
                      >
                        <Plus size={18}/> 
                      </button>
                    </div>
                  </div>
                </div>

                {/* TABLE OF SERIALS */}
                <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <div className="col-span-1 text-center">Stato</div>
                    <div className="col-span-3">Codice Univoco / QR</div>
                    <div className="col-span-3">SN Costruttore</div>
                    <div className="col-span-2">Rif. / Acquisto</div>
                    <div className="col-span-3 text-right">Stampa / Azioni</div>
                  </div>

                  {tempInstances.map((inst, idx) => (
                    <div 
                      key={idx} 
                      className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg border text-xs font-mono transition-colors ${
                        inst.active === false 
                          ? 'bg-slate-900/40 border-slate-800/50 opacity-60' 
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* ACTIVE TOGGLE */}
                      <div className="col-span-1 flex justify-center">
                        <button 
                          type="button"
                          onClick={() => toggleInstanceActive(idx)}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                            inst.active !== false 
                              ? 'bg-emerald-600 text-white' 
                              : 'bg-slate-800 text-slate-600'
                          }`}
                          title={inst.active !== false ? 'Matricola Attiva' : 'Matricola Inattiva / Dismessa'}
                        >
                          <CheckCircle2 size={13} />
                        </button>
                      </div>

                      {/* CODICE UNIVOCO QR */}
                      <div className="col-span-3 truncate text-purple-300 font-bold">
                        {inst.id}
                      </div>

                      {/* SN COSTRUTTORE */}
                      <div className="col-span-3 truncate text-slate-200">
                        {inst.serialNumber || <span className="text-slate-600 italic">Nessun SN</span>}
                      </div>

                      {/* RIF / DATA */}
                      <div className="col-span-2 text-[11px] truncate text-slate-400">
                        {inst.internalReference && <span className="mr-1 font-bold text-blue-400">[{inst.internalReference}]</span>}
                        {inst.purchaseDate || '-'}
                      </div>

                      {/* ACTIONS */}
                      <div className="col-span-3 flex items-center justify-end gap-1">
                        <button 
                          type="button"
                          onClick={() => printBarcode(inst.id, `${formData.name || 'Articolo'} (${inst.id})`)} 
                          title="Stampa Barcode Seriale"
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                        >
                          <Barcode size={14} />
                        </button>
                        <button 
                          type="button"
                          onClick={() => printQRCode(inst.id, `${formData.name || 'Articolo'} (${inst.id})`)} 
                          title="Stampa QR Code Seriale"
                          className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors"
                        >
                          <QrCode size={14} />
                        </button>
                        <button 
                          type="button"
                          onClick={() => removeInstance(idx)} 
                          title="Rimuovi Seriale"
                          className="p-1.5 text-slate-500 hover:text-rose-500 hover:bg-slate-800 rounded transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {tempInstances.length === 0 && (
                    <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-2">
                      <Barcode size={32} className="opacity-20" />
                      <span className="text-xs">Nessun seriale registrato. Inserisci il primo qui sopra.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: ACCESSORI */}
          {/* ========================================================================= */}
          {activeTab === 'accessories' && (
            <div className="flex flex-col lg:flex-row gap-4 h-[480px]">
              
              {/* LEFT: INVENTORY SEARCH & SELECTOR */}
              <div className="flex-1 flex flex-col bg-slate-900/60 p-3 rounded-xl border border-slate-800 h-full">
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                    <input 
                      type="text" 
                      placeholder="Cerca accessorio nell'inventario..." 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-blue-500 placeholder-slate-600" 
                      value={accessorySearch} 
                      onChange={(e) => setAccessorySearch(e.target.value)} 
                    />
                  </div>
                  {onCreateAccessory && (
                    <button 
                      type="button"
                      onClick={openQuickCreate} 
                      className="bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 rounded-lg px-2.5 flex items-center justify-center transition-colors text-xs font-bold gap-1 shrink-0" 
                      title="Crea nuovo accessorio rapido"
                    >
                      <Plus size={14} /> Crea
                    </button>
                  )}
                </div>

                <div className="flex-1 bg-slate-950 rounded-lg p-2 overflow-y-auto custom-scrollbar border border-slate-800/80">
                  {searchResults.length > 0 ? (
                    <div className="space-y-1">
                      {searchResults.map(item => (
                        <button 
                          key={item.id} 
                          type="button"
                          onClick={() => addAccessory(item)} 
                          className="w-full text-left p-2 hover:bg-cyan-900/20 border border-transparent hover:border-cyan-500/30 rounded-lg flex justify-between items-center group transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-xs text-slate-200 truncate font-semibold group-hover:text-cyan-300">{item.name}</div>
                            <div className="text-[10px] text-slate-500">{item.category} {item.folder ? `• ${item.folder}` : ''}</div>
                          </div>
                          <Plus size={14} className="text-slate-600 group-hover:text-cyan-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  ) : accessorySearch ? (
                    <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-2">
                      <p className="text-xs">Nessun materiale trovato per "{accessorySearch}"</p>
                      {onCreateAccessory && (
                        <button 
                          type="button"
                          onClick={openQuickCreate} 
                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full inline-flex items-center gap-1 font-semibold"
                        >
                          <Plus size={12} /> Crea "{accessorySearch}"
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-600 flex flex-col items-center gap-2">
                      <Search size={28} className="opacity-20" />
                      <p className="text-xs">Cerca un materiale a sinistra per aggiungerlo come accessorio.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: CONNECTED ACCESSORIES TABLE WITH AUTOMATIC SWITCH */}
              <div className="w-full lg:w-[420px] flex flex-col bg-slate-900/60 p-3 rounded-xl border border-slate-800 h-full">
                <div className="mb-2">
                  <h3 className="font-bold text-white text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Link size={14} className="text-cyan-400" /> Accessori Collegati</span>
                    <span className="text-[10px] text-slate-400">{(formData.accessories || []).length} elementi</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    <strong>Automatico = Sì:</strong> aggiunto subito. <strong>No:</strong> richiesta di conferma.
                  </p>
                </div>

                <div className="flex-1 bg-slate-950 rounded-lg p-2 overflow-y-auto custom-scrollbar border border-slate-800/80 space-y-1.5">
                  {(formData.accessories || []).map((acc, idx) => {
                    const accItem = inventory.find(i => i.id === acc.itemId) || localInventory.find(i => i.id === acc.itemId);
                    const accName = accItem ? accItem.name : 'Articolo...';
                    const isAuto = acc.automatic !== false;

                    return (
                      <div key={idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-white font-semibold truncate">{accName}</div>
                            <div className="text-[10px] text-slate-500">{accItem?.category || 'Accessorio'}</div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => removeAccessory(acc.itemId)} 
                            className="text-slate-500 hover:text-rose-500 p-0.5 transition-colors"
                            title="Rimuovi accessorio"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                          {/* AUTOMATIC SWITCH */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-medium">Automatico:</span>
                            <button
                              type="button"
                              onClick={() => toggleAccessoryAutomatic(acc.itemId)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                isAuto 
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60' 
                                  : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                              }`}
                            >
                              {isAuto ? 'Sì (Auto)' : 'No (Chiedi)'}
                            </button>
                          </div>

                          {/* QUANTITY */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">Qtà:</span>
                            <input 
                              type="number" 
                              min="1" 
                              className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white text-xs outline-none focus:border-blue-500 font-bold" 
                              value={acc.quantity} 
                              onChange={(e) => updateAccessoryQuantity(acc.itemId, parseInt(e.target.value, 10) || 1)} 
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {(!formData.accessories || formData.accessories.length === 0) && (
                    <div className="text-center py-16 text-slate-600 flex flex-col items-center gap-2">
                      <Link size={30} className="opacity-20" />
                      <p className="text-xs">Nessun accessorio collegato.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: ISPEZIONI & MANUTENZIONI */}
          {/* ========================================================================= */}
          {activeTab === 'inspections' && (
            <div className="space-y-4">
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <Wrench size={16} className="text-amber-400" /> Controlli Periodici & Manutenzioni
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Definisci i collaudi e le ispezioni obbligatorie (es. serraggi cavi, verifica quadri elettrici, controllo catene motori).
                    </p>
                  </div>
                </div>

                {/* ADD INSPECTION FORM */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-5 space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nome Controllo *</label>
                      <input 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 outline-none text-xs"
                        placeholder="Es. Serraggi prolunghe, Verifica scatto differenziale"
                        value={inspectionNameInput}
                        onChange={e => setInspectionNameInput(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Periodo</label>
                      <input 
                        type="number"
                        min="1"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 outline-none text-xs text-right font-bold"
                        value={inspectionPeriodInput}
                        onChange={e => setInspectionPeriodInput(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Frequenza</label>
                      <select 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 outline-none text-xs"
                        value={inspectionFrequencyInput}
                        onChange={e => setInspectionFrequencyInput(e.target.value as 'days' | 'months' | 'years')}
                      >
                        <option value="days">Giorni</option>
                        <option value="months">Mesi</option>
                        <option value="years">Anni</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2 flex items-end">
                      <button 
                        type="button"
                        onClick={addInspection} 
                        disabled={!inspectionNameInput.trim()}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-black font-bold rounded-lg flex items-center justify-center gap-1.5 h-[36px] transition-all shadow-md shadow-amber-900/30 text-xs" 
                      >
                        <Plus size={16}/> Aggiungi
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Descrizione / Istruzioni Operative</label>
                    <input 
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 focus:border-amber-500 outline-none text-xs placeholder-slate-600"
                      placeholder="Es. Verifica dei serraggi sui morsetti cavi su prese e spine con dinamometrica..."
                      value={inspectionDescInput}
                      onChange={e => setInspectionDescInput(e.target.value)}
                    />
                  </div>
                </div>

                {/* LIST OF INSPECTIONS */}
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {(formData.periodicInspections || []).map((insp) => (
                    <div 
                      key={insp.id} 
                      className={`p-3 rounded-lg border flex justify-between items-start gap-3 transition-colors ${
                        insp.active 
                          ? 'bg-slate-900 border-slate-800 hover:border-slate-700' 
                          : 'bg-slate-900/40 border-slate-800/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button 
                          type="button"
                          onClick={() => toggleInspectionActive(insp.id)}
                          className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                            insp.active ? 'bg-amber-600 text-black' : 'bg-slate-800 text-slate-600'
                          }`}
                        >
                          <CheckCircle2 size={13} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{insp.name}</span>
                            <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800/50 rounded text-[10px] font-bold">
                              Ogni {insp.period} {insp.frequency === 'days' ? 'Giorni' : insp.frequency === 'months' ? 'Mesi' : 'Anni'}
                            </span>
                          </div>
                          {insp.description && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{insp.description}</p>
                          )}
                        </div>
                      </div>

                      <button 
                        type="button"
                        onClick={() => removeInspection(insp.id)} 
                        className="text-slate-500 hover:text-rose-500 p-1 transition-colors"
                        title="Rimuovi Ispezione"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}

                  {(!formData.periodicInspections || formData.periodicInspections.length === 0) && (
                    <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-2">
                      <Wrench size={32} className="opacity-20" />
                      <span className="text-xs">Nessuna ispezione o controllo periodico configurato.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: NOTE & DOCUMENTI */}
          {/* ========================================================================= */}
          {activeTab === 'remarks_docs' && (
            <div className="space-y-6">
              
              {/* REMARKS (INTERNAL & EXTERNAL) */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Info size={14} className="text-blue-400" /> Note Interne ed Esterne
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Nota Interna (Per personale e magazzinieri)</label>
                    <textarea 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-24 resize-none text-xs placeholder-slate-600" 
                      value={formData.internalRemark || ''} 
                      onChange={e => setFormData({ ...formData, internalRemark: e.target.value })} 
                      placeholder="Note riservate all'uso interno..." 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Nota Esterna (Per schede tecniche e clienti)</label>
                    <textarea 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-24 resize-none text-xs placeholder-slate-600" 
                      value={formData.externalRemark || ''} 
                      onChange={e => setFormData({ ...formData, externalRemark: e.target.value })} 
                      placeholder="Note visibili all'esterno..." 
                    />
                  </div>
                </div>
              </div>

              {/* REMINDERS (LIGHTBULB) */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Lightbulb size={14} className="text-yellow-400" /> Cose da Ricordare (Promemoria Pop-up)
                </h3>
                <p className="text-xs text-slate-400">
                  Note che appariranno con la lampadina gialla quando utilizzerai questo oggetto in lista o in magazzino.
                </p>

                <div className="flex gap-2">
                  <input 
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-yellow-500 outline-none text-xs"
                    placeholder="Es. Richiede sempre il cavo di alimentazione True1..."
                    value={reminderInput}
                    onChange={e => setReminderInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addReminder()}
                  />
                  <button 
                    type="button"
                    onClick={addReminder} 
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg flex items-center gap-1.5 text-xs transition-colors"
                  >
                    <Plus size={16}/> Aggiungi
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {(formData.reminders || []).map((rem, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs">
                      <div className="flex items-center gap-2">
                        <Lightbulb size={14} className="text-yellow-400 shrink-0" />
                        <span className="text-slate-200">{rem}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => removeReminder(idx)} 
                        className="text-slate-500 hover:text-rose-500 transition-colors p-0.5"
                      >
                        <X size={16}/>
                      </button>
                    </div>
                  ))}

                  {(!formData.reminders || formData.reminders.length === 0) && (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      Nessun promemoria lampadina inserito.
                    </div>
                  )}
                </div>
              </div>

              {/* DOCUMENTS & DRIVE LINKS */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <FileText size={14} className="text-blue-400" /> Documenti & File Cloud (Drive, OneDrive, PDF)
                </h3>

                <div className="flex flex-col sm:flex-row gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome File</label>
                    <input 
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:border-blue-500 outline-none text-xs placeholder-slate-600"
                      placeholder="Es. Manuale PDF, Scheda Tecnica"
                      value={docNameInput}
                      onChange={e => setDocNameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addDocument()}
                    />
                  </div>
                  <div className="flex-[1.5] space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Link Esterno (URL) *</label>
                    <input 
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-blue-300 focus:border-blue-500 outline-none text-xs placeholder-slate-600 font-mono"
                      placeholder="https://drive.google.com/..."
                      value={docUrlInput}
                      onChange={e => setDocUrlInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addDocument()}
                    />
                  </div>
                  <div className="flex items-end shrink-0">
                    <button 
                      type="button"
                      onClick={addDocument} 
                      disabled={!docUrlInput.trim()}
                      className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-lg flex items-center justify-center gap-1 text-xs transition-all shadow-md shadow-blue-900/30"
                    >
                      <Plus size={14}/> Aggiungi
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {(formData.documents || []).map((doc) => {
                    const displayName = doc.name && doc.name.trim() ? doc.name.trim() : doc.url;
                    return (
                      <div key={doc.id} className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                          <FileText size={16} className="text-blue-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white truncate">{displayName}</div>
                            <div className="text-[10px] text-slate-500 font-mono truncate">{doc.url}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            type="button"
                            onClick={() => openDocumentInBrowser(doc.url)} 
                            className="px-2 py-1 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Apri e visualizza nel browser"
                          >
                            <Eye size={12} /> Apri
                          </button>
                          <button 
                            type="button"
                            onClick={() => removeDocument(doc.id)} 
                            className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                            title="Rimuovi documento"
                          >
                            <X size={14}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(!formData.documents || formData.documents.length === 0) && (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      Nessun documento o link archiviato.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* QUICK CREATE ACCESSORY MODAL */}
      {renderQuickCreateForm()}

      {/* CODE PREVIEW & PRINT MODAL */}
      <Modal isOpen={isCodePreviewOpen} onClose={() => setIsCodePreviewOpen(false)} title={`QR Code Prodotto: ${formData.qrCode || ''}`} size="md">
        <div className="space-y-6 text-center p-1">
          {formData.name && (
            <div className="text-sm font-semibold text-white truncate max-w-sm mx-auto">
              {formData.name}
            </div>
          )}
          
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Codice a Barre (Code 128)</div>
            <div 
              className="bg-white p-3 rounded-lg flex items-center justify-center overflow-x-auto max-w-full inline-block mx-auto shadow-md" 
              dangerouslySetInnerHTML={{ __html: generateBarcodeSVG(formData.qrCode || '', 60, 2) }} 
            />
            <div>
              <button 
                type="button" 
                onClick={() => printBarcode(formData.qrCode || '', formData.name || '')} 
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 mx-auto transition-all shadow-lg shadow-emerald-900/30 active:scale-95"
              >
                <Printer size={15} /> Stampa Barcode
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">QR Code</div>
            <div 
              className="bg-white p-3 rounded-lg flex items-center justify-center overflow-hidden inline-block mx-auto shadow-md" 
              dangerouslySetInnerHTML={{ __html: generateQRCodeSVG(formData.qrCode || '', 160) }} 
            />
            <div>
              <button 
                type="button" 
                onClick={() => printQRCode(formData.qrCode || '', formData.name || '')} 
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 mx-auto transition-all shadow-lg shadow-purple-900/30 active:scale-95"
              >
                <Printer size={15} /> Stampa QR Code
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-800">
            <button type="button" onClick={() => setIsCodePreviewOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors">Chiudi</button>
          </div>
        </div>
      </Modal>

    </Modal>
  );

  function renderQuickCreateForm() {
    return (
      <Modal isOpen={isQuickCreateOpen} onClose={() => setIsQuickCreateOpen(false)} title="Nuovo Accessorio Rapido" size="lg">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome</label>
            <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none" value={quickForm.name || ''} onChange={e => setQuickForm({...quickForm, name: e.target.value})} placeholder="Es. Gancio Aliscaf" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Categoria</label>
              <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none" value={quickForm.category} onChange={e => setQuickForm({...quickForm, category: e.target.value as Category})}>
                {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Stock Totale</label>
              <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-right" value={quickForm.inStock || 0} onChange={e => setQuickForm({...quickForm, inStock: parseInt(e.target.value, 10) || 0})} />
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse md:flex-row justify-end gap-3 pt-6 border-t border-slate-800 mt-4">
          <button onClick={() => setIsQuickCreateOpen(false)} className="w-full md:w-auto px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-center font-medium">Annulla</button>
          <button onClick={handleCreateAndAddAccessory} disabled={!quickForm.name} className="w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-colors shadow-lg shadow-blue-900/20 text-center">Crea Accessorio</button>
        </div>
      </Modal>
    );
  }
};
