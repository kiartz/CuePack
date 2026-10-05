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
  DEFAULT_DATABASE_ID,
  PackingList,
  Kit
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
  Database,
  ChevronUp,
  ChevronDown,
  History,
  GripVertical,
  ArrowLeftRight,
  Package,
  Edit2
} from 'lucide-react';
import { db, COLL_KITS, addOrUpdateItem } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { getDbBadgeStyle, getDbDotColor } from '../utils/databaseColors';
import { searchAndSortItems } from '../utils/searchUtils';
import { generateBarcodeSVG, generateQRCodeSVG, printBarcode, printQRCode } from '../utils/codeGenerators';
import { openDocumentInBrowser } from '../utils/documentViewer';
import { 
  getCategoryDefinitions, 
  getSubcategoriesForCategory, 
  addSubcategoryToCategory,
  addCategory,
  CategoryDefinition 
} from '../utils/categories';
import { CategoryManagerModal } from './CategoryManagerModal';
import { 
  getConnectorDefinitions, 
  addConnector, 
  ElectricalConnectorDefinition,
  STANDARD_AMPERAGES
} from '../utils/connectors';
import { Modal } from './Modal';
import { ItemMovementHistory } from './ItemMovementHistory';
import { KitFormModal } from './KitFormModal';

const getTargetInsertIndex = (sourceIndex: number, targetIndex: number, position: 'before' | 'after'): number => {
  if (sourceIndex === targetIndex) return sourceIndex;
  if (sourceIndex < targetIndex) {
    return position === 'after' ? targetIndex : targetIndex - 1;
  } else {
    return position === 'before' ? targetIndex : targetIndex + 1;
  }
};

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Omit<InventoryItem, 'id'>) => void;
  initialData?: InventoryItem | null;
  inventory?: InventoryItem[];
  onCreateAccessory?: (item: InventoryItem) => void;
  title?: string;
  initialName?: string;
  activeDatabaseId?: string;
  defaultDatabaseId?: string;
  databases?: InventoryDatabase[];
  isQuickMode?: boolean;
  packingLists?: PackingList[];
  backButtonLabel?: string;
  kits?: Kit[];
}

// Generate product code (internal code, customizable prefix and total digits per database, e.g. 2001, 2002...)
export const generateProductCode = (
  existingItems: InventoryItem[],
  targetItemId?: string,
  dbConfig?: { productCodePrefix?: string; productCodeDigits?: number }
): string => {
  const rawPrefix = (dbConfig?.productCodePrefix || '2').replace(/\D/g, '').slice(0, 3) || '2';
  const totalDigits = Math.max(rawPrefix.length + 1, Math.min(8, dbConfig?.productCodeDigits || 4));

  const minNum = parseInt(rawPrefix.padEnd(totalDigits, '0'), 10) + 1;
  const maxNum = parseInt(rawPrefix.padEnd(totalDigits, '9'), 10);

  const usedNumbers = new Set<number>();
  
  (existingItems || []).forEach(item => {
    if (targetItemId && item.id === targetItemId) return;
    if (item.productCode && item.productCode.trim()) {
      const num = parseInt(item.productCode.trim(), 10);
      if (!isNaN(num) && num >= minNum && num <= maxNum) {
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

  let currentNum = minNum;
  let skipped = 0;
  while (currentNum <= maxNum) {
    if (!usedNumbers.has(currentNum)) {
      if (skipped === targetIndex) {
        return currentNum.toString().padStart(totalDigits, '0');
      }
      skipped++;
    }
    currentNum++;
  }

  // Fallback if range exhausted
  return (maxNum + 1 + targetIndex).toString().padStart(totalDigits, '0');
};

// Generate product QR / Barcode tag (7-digit unique starting at prefix, default 2000001, printed as QR & Barcode)
export const generateProductQrCode = (
  existingItems: InventoryItem[],
  targetItemId?: string,
  dbConfig?: { barcodePrefix?: string }
): string => {
  const rawPrefix = (dbConfig?.barcodePrefix || '20').replace(/\D/g, '').slice(0, 3) || '20';
  const minNum = parseInt(rawPrefix.padEnd(7, '0'), 10) + 1;
  const maxNum = parseInt(rawPrefix.padEnd(7, '9'), 10);

  const usedNumbers = new Set<number>();

  (existingItems || []).forEach(item => {
    if (targetItemId && item.id === targetItemId) return;
    if (item.qrCode && item.qrCode.trim()) {
      const val = item.qrCode.trim();
      if (/^\d{7}$/.test(val)) {
        const num = parseInt(val, 10);
        if (num >= minNum && num <= maxNum) {
          usedNumbers.add(num);
        }
      }
    }
    (item.instances || []).forEach(inst => {
      const code = (inst.id || '').trim();
      if (/^\d{7}$/.test(code)) {
        const num = parseInt(code, 10);
        if (num >= minNum && num <= maxNum) {
          usedNumbers.add(num);
        }
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

  let currentNum = minNum;
  let skipped = 0;
  while (currentNum <= maxNum) {
    if (!usedNumbers.has(currentNum)) {
      if (skipped === targetIndex) {
        return currentNum.toString().padStart(7, '0');
      }
      skipped++;
    }
    currentNum++;
  }

  return (maxNum + 1 + targetIndex).toString().padStart(7, '0');
};

type ActiveTab = 'data' | 'serials' | 'accessories' | 'inspections' | 'notes' | 'files' | 'kits' | 'history';

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory = [], onCreateAccessory, title, initialName, activeDatabaseId, defaultDatabaseId: propDefaultDatabaseId, databases = [], isQuickMode = false, packingLists = [], backButtonLabel, kits: propKits
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('data');
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});

  const effectiveDatabases = useMemo(() => {
    return (databases && databases.length > 0)
      ? databases
      : [{ id: DEFAULT_DATABASE_ID, name: 'Database Principale', code: 'PRI', color: 'emerald', isDefault: true }];
  }, [databases]);

  const defaultDatabaseId = useMemo(() => {
    return propDefaultDatabaseId || effectiveDatabases.find(d => d.isDefault)?.id || activeDatabaseId || DEFAULT_DATABASE_ID;
  }, [propDefaultDatabaseId, effectiveDatabases, activeDatabaseId]);
  
  // Category management
  const [categoryDefs, setCategoryDefs] = useState<CategoryDefinition[]>(getCategoryDefinitions());
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newSubcatInput, setNewSubcatInput] = useState('');
  const [isAddingSubcat, setIsAddingSubcat] = useState(false);

  // Numeric Inputs
  const [weightInput, setWeightInput] = useState('0');
  const [powerInput, setPowerInput] = useState('0');
  const [currentInput, setCurrentInput] = useState('0');
  const [powerPhase, setPowerPhase] = useState<'monofase' | 'trifase'>('monofase');
  const [powerSupplyRating, setPowerSupplyRating] = useState('16A');
  const [powerConnector, setPowerConnector] = useState('');

  // Connectors State
  const [connectors, setConnectors] = useState<ElectricalConnectorDefinition[]>(getConnectorDefinitions());
  const [isAddingConnector, setIsAddingConnector] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnPhase, setNewConnPhase] = useState<'monofase' | 'trifase'>('monofase');
  const [newConnAmperage, setNewConnAmperage] = useState('16A');

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
  const [replacingAccessoryIndex, setReplacingAccessoryIndex] = useState<number | null>(null);

  // Accessories Drag and Drop State & Refs
  const [draggedAccIndex, setDraggedAccIndex] = useState<number | null>(null);
  const [dropAccTarget, setDropAccTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  const draggedAccIndexRef = useRef<number | null>(null);
  const dropAccTargetRef = useRef<{ index: number; position: 'before' | 'after' } | null>(null);

  // Kits State and Handlers
  const [remoteKits, setRemoteKits] = useState<Kit[]>([]);
  const [isKitEditModalOpen, setIsKitEditModalOpen] = useState(false);
  const [editingKitForModal, setEditingKitForModal] = useState<Kit | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (propKits !== undefined) return;

    const unsubscribe = onSnapshot(collection(db, COLL_KITS), (snapshot) => {
      const fetched: Kit[] = [];
      snapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() } as Kit);
      });
      setRemoteKits(fetched);
    }, (error) => {
      console.error('Error fetching kits for ItemFormModal:', error);
    });

    return () => unsubscribe();
  }, [isOpen, propKits]);

  const effectiveKits = useMemo(() => {
    return propKits !== undefined ? propKits : remoteKits;
  }, [propKits, remoteKits]);

  const effectiveDatabasesMap = useMemo(() => {
    const map = new Map<string, InventoryDatabase>();
    for (const dbItem of effectiveDatabases) {
      map.set(dbItem.id, dbItem);
    }
    return map;
  }, [effectiveDatabases]);

  const allInventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of inventory) {
      map.set(item.id, item);
    }
    for (const item of localInventory) {
      map.set(item.id, item);
    }
    return map;
  }, [inventory, localInventory]);

  // Find all kits containing the current item (direct or as accessory)
  const kitMatchDetails = useMemo(() => {
    if (!initialData?.id) return [];
    const targetId = initialData.id;
    const matches: {
      kit: Kit;
      directQuantity: number;
      accessoryOccurrences: { parentName: string; quantity: number }[];
      totalItemQuantity: number;
      databaseIds: string[];
    }[] = [];

    for (const kit of effectiveKits) {
      if (!kit.items || !Array.isArray(kit.items)) continue;

      let directQuantity = 0;
      const accessoryOccurrences: { parentName: string; quantity: number }[] = [];
      const dbSet = new Set<string>();

      for (const comp of kit.items) {
        const compItem = allInventoryMap.get(comp.itemId);
        if (compItem?.databaseId) dbSet.add(compItem.databaseId);
        else dbSet.add(DEFAULT_DATABASE_ID);

        if (comp.itemId === targetId) {
          directQuantity += (comp.quantity || 1);
        }

        if (comp.accessories && Array.isArray(comp.accessories)) {
          for (const acc of comp.accessories) {
            const accItem = allInventoryMap.get(acc.itemId);
            if (accItem?.databaseId) dbSet.add(accItem.databaseId);
            else dbSet.add(DEFAULT_DATABASE_ID);

            if (acc.itemId === targetId) {
              accessoryOccurrences.push({
                parentName: compItem?.name || 'Componente',
                quantity: acc.quantity || 1
              });
            }
          }
        }
      }

      if (directQuantity > 0 || accessoryOccurrences.length > 0) {
        const totalItemQuantity = directQuantity + accessoryOccurrences.reduce((sum, a) => sum + a.quantity, 0);
        matches.push({
          kit,
          directQuantity,
          accessoryOccurrences,
          totalItemQuantity,
          databaseIds: Array.from(dbSet)
        });
      }
    }

    return matches;
  }, [effectiveKits, initialData?.id, allInventoryMap]);

  const handleCreateKitWithCurrentItem = () => {
    const currentItemId = initialData?.id || '';
    const newKit: Kit = {
      id: generateId(),
      name: `${formData.name || initialData?.name || 'Nuovo Kit'} Kit`,
      category: (formData.category as Category) || Category.OTHER,
      description: '',
      items: [
        {
          itemId: currentItemId,
          quantity: 1,
          accessories: (formData.accessories || []).map(acc => ({
            itemId: acc.itemId,
            quantity: acc.quantity || 1
          }))
        }
      ],
      reminders: []
    };
    setEditingKitForModal(newKit);
    setIsKitEditModalOpen(true);
  };

  const handleSaveKitFromModal = async (savedKit: Kit) => {
    await addOrUpdateItem(COLL_KITS, savedKit);
    setIsKitEditModalOpen(false);
    setEditingKitForModal(null);
  };

  const handleCloseKitModal = () => {
    setIsKitEditModalOpen(false);
    setEditingKitForModal(null);
  };

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

  // Nested Accessory Prompt State
  const [nestedAccessoryPrompt, setNestedAccessoryPrompt] = useState<{
    targetItem: InventoryItem;
    subAccessories: { item: InventoryItem; quantity: number }[];
  } | null>(null);

  // Unsaved Changes Tracking State
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const getCurrentSnapshot = useCallback(() => {
    return JSON.stringify({
      formData,
      weightInput,
      powerInput,
      currentInput,
      powerPhase,
      powerSupplyRating,
      powerConnector,
      lengthInput,
      widthInput,
      heightInput,
      volumeInput,
      purchasePriceInput,
      rentalPriceInput,
      subrentalCostInput,
      tempInstances
    });
  }, [
    formData,
    weightInput,
    powerInput,
    currentInput,
    powerPhase,
    powerSupplyRating,
    powerConnector,
    lengthInput,
    widthInput,
    heightInput,
    volumeInput,
    purchasePriceInput,
    rentalPriceInput,
    subrentalCostInput,
    tempInstances
  ]);

  const isFormDirty = useCallback(() => {
    if (!initialSnapshot) return false;
    return getCurrentSnapshot() !== initialSnapshot;
  }, [getCurrentSnapshot, initialSnapshot]);

  const handleAttemptClose = () => {
    if (isFormDirty()) {
      setShowUnsavedPrompt(true);
    } else {
      onClose();
    }
  };

  const refreshCategories = () => {
    setCategoryDefs(getCategoryDefinitions());
  };

  useEffect(() => {
    const handleCategoriesUpdated = () => {
      setCategoryDefs(getCategoryDefinitions());
    };
    const handleConnectorsUpdated = (e: any) => {
      setConnectors(e?.detail || getConnectorDefinitions());
    };
    window.addEventListener('cuepack_categories_updated', handleCategoriesUpdated);
    window.addEventListener('cuepack_connectors_updated', handleConnectorsUpdated);
    return () => {
      window.removeEventListener('cuepack_categories_updated', handleCategoriesUpdated);
      window.removeEventListener('cuepack_connectors_updated', handleConnectorsUpdated);
    };
  }, []);

  // Handle ESC key to close modal in quick mode
  useEffect(() => {
    if (!isOpen || !isQuickMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleAttemptClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isQuickMode, handleAttemptClose]);

  // Track previous isOpen and item ID so we only initialize on actual open or item switch
  const prevIsOpenRef = useRef(false);
  const prevItemIdRef = useRef<string | undefined>(undefined);

  // Initialize or reset form state when modal opens
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      prevItemIdRef.current = undefined;
      return;
    }

    const currentItemId = initialData ? (initialData.id || '__editing_item__') : '__new_item__';
    const isFirstOpen = !prevIsOpenRef.current;
    const isDifferentItem = currentItemId !== prevItemIdRef.current;

    prevIsOpenRef.current = true;
    prevItemIdRef.current = currentItemId;

    if (!isFirstOpen && !isDifferentItem) {
      // Modal is already open for this exact item, user is actively editing.
      // Do NOT reset form state!
      // Synchronize localInventory with updated inventory (e.g. newly created accessories)
      setLocalInventory(prev => {
        const existingIds = new Set(inventory.map(i => i.id));
        const localOnly = prev.filter(p => !existingIds.has(p.id));
        return [...inventory, ...localOnly];
      });
      return;
    }

    setActiveTab('data');
    setShowUnsavedPrompt(false);
    setNestedAccessoryPrompt(null);
    setReplacingAccessoryIndex(null);
    setDraggedAccIndex(null);
    setDropAccTarget(null);
    setIsKitEditModalOpen(false);
    setEditingKitForModal(null);
    refreshCategories();
    setConnectors(getConnectorDefinitions());
    setIsAddingConnector(false);
    if (initialData) {
        const initialDbId = initialData.databaseId || defaultDatabaseId;
        const currentDbConfig = effectiveDatabases.find(d => d.id === initialDbId);

        let initialProductCode = initialData.productCode || '';
        if (initialProductCode && /^[A-Z]+-\d+$/i.test(initialProductCode.trim())) {
          const numPart = parseInt(initialProductCode.replace(/^[A-Z]+-0*/i, ''), 10);
          if (!isNaN(numPart) && numPart > 0) {
            initialProductCode = numPart.toString();
          }
        }
        if (!initialProductCode) {
          initialProductCode = generateProductCode(inventory, initialData.id, currentDbConfig);
        }

        let initialQrCode = initialData.qrCode || '';
        if (!initialQrCode || !/^\d{7}$/.test(initialQrCode.trim())) {
          initialQrCode = generateProductQrCode(inventory, initialData.id, currentDbConfig);
        }

        const currentSubcat = initialData.subcategory || initialData.folder || '';

        const initForm = {
          ...initialData,
          databaseId: initialDbId,
          productCode: initialProductCode,
          qrCode: initialQrCode,
          subcategory: currentSubcat,
          folder: currentSubcat
        };
        setFormData(initForm);

        const initWeight = initialData.weight?.toString() || '0';
        const initPower = initialData.powerConsumption?.toString() || '0';
        const initCurrent = initialData.current?.toString() || '0';
        const initPhase = initialData.powerPhase || 'monofase';
        const initRating = initialData.powerSupplyRating || '16A';
        const initConnector = initialData.powerConnector || '';

        const initL = initialData.dimensions?.length?.toString() || '0';
        const initW = initialData.dimensions?.width?.toString() || '0';
        const initH = initialData.dimensions?.height?.toString() || '0';
        const initVol = initialData.volume?.toString() || '0';
        
        const initPurchase = initialData.purchasePrice?.toString() || '0';
        const initRental = initialData.rentalPrice?.toString() || '0';
        const initSubrental = initialData.subrentalCost?.toString() || '0';

        const initInstances = initialData.instances || [];

        setWeightInput(initWeight);
        setPowerInput(initPower);
        setCurrentInput(initCurrent);
        setPowerPhase(initPhase);
        setPowerSupplyRating(initRating);
        setPowerConnector(initConnector);

        setLengthInput(initL);
        setWidthInput(initW);
        setHeightInput(initH);
        setVolumeInput(initVol);
        
        setPurchasePriceInput(initPurchase);
        setRentalPriceInput(initRental);
        setSubrentalCostInput(initSubrental);

        setTempInstances(initInstances);

        setInitialSnapshot(JSON.stringify({
          formData: initForm,
          weightInput: initWeight,
          powerInput: initPower,
          currentInput: initCurrent,
          powerPhase: initPhase,
          powerSupplyRating: initRating,
          powerConnector: initConnector,
          lengthInput: initL,
          widthInput: initW,
          heightInput: initH,
          volumeInput: initVol,
          purchasePriceInput: initPurchase,
          rentalPriceInput: initRental,
          subrentalCostInput: initSubrental,
          tempInstances: initInstances
        }));
      } else {
        const defaultDbConfig = effectiveDatabases.find(d => d.id === defaultDatabaseId);
        const autoProductCode = generateProductCode(inventory, undefined, defaultDbConfig);
        const autoQrCode = generateProductQrCode(inventory, undefined, defaultDbConfig);
        
        const initForm = {
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
          rentalSaleType: 'rental' as const,
          canHaveContent: false,
          accessories: [],
          reminders: [],
          documents: [],
          instances: [],
          periodicInspections: [],
          internalRemark: '',
          externalRemark: '',
          description: ''
        };
        setFormData(initForm);

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

        setInitialSnapshot(JSON.stringify({
          formData: initForm,
          weightInput: '0',
          powerInput: '0',
          currentInput: '0',
          powerPhase: 'monofase',
          powerSupplyRating: '16A',
          powerConnector: '',
          lengthInput: '0',
          widthInput: '0',
          heightInput: '0',
          volumeInput: '0',
          purchasePriceInput: '0',
          rentalPriceInput: '0',
          subrentalCostInput: '0',
          tempInstances: []
        }));
      }
      setLocalInventory(inventory);
  }, [isOpen, initialData, inventory, initialName, defaultDatabaseId]);

  // Helper to calculate volume (m³) from length, width, height (in cm)
  const calculateVolumeFromDimensions = (lStr: string, wStr: string, hStr: string): string => {
    const l = parseFloat(lStr.replace(',', '.')) || 0;
    const w = parseFloat(wStr.replace(',', '.')) || 0;
    const h = parseFloat(hStr.replace(',', '.')) || 0;
    if (l > 0 && w > 0 && h > 0) {
      const volM3 = (l * w * h) / 1000000;
      return volM3 < 0.001 
        ? Number(volM3.toFixed(6)).toString() 
        : Number(volM3.toFixed(4)).toString();
    }
    return '0';
  };

  const handleDimensionChange = (field: 'l' | 'w' | 'h', val: string) => {
    let nextL = lengthInput;
    let nextW = widthInput;
    let nextH = heightInput;
    if (field === 'l') {
      nextL = val;
      setLengthInput(val);
    } else if (field === 'w') {
      nextW = val;
      setWidthInput(val);
    } else if (field === 'h') {
      nextH = val;
      setHeightInput(val);
    }
    const computedVol = calculateVolumeFromDimensions(nextL, nextW, nextH);
    setVolumeInput(computedVol);
  };

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

  // Handle connector selection from dropdown -> auto-populate Tipo Linea & Ampere Connettore
  const handleConnectorSelect = (selectedName: string) => {
    setPowerConnector(selectedName);
    if (!selectedName) return;

    const found = connectors.find(c => c.name.toLowerCase() === selectedName.toLowerCase());
    if (found) {
      handlePhaseChange(found.phase);
      setPowerSupplyRating(found.amperage);
    }
  };

  // Handle adding custom connector inline
  const handleAddConnectorInline = async () => {
    const trimmed = newConnName.trim();
    if (!trimmed) return;
    const voltage = newConnPhase === 'trifase' ? '400V' : '230V';
    const updated = await addConnector(trimmed, newConnAmperage, newConnPhase, voltage);
    setConnectors(updated);
    setPowerConnector(trimmed);
    handlePhaseChange(newConnPhase);
    setPowerSupplyRating(newConnAmperage);
    setNewConnName('');
    setIsAddingConnector(false);
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

  const renderDbBadge = (dbId?: string) => {
    const effectiveId = dbId || DEFAULT_DATABASE_ID;
    const db = effectiveDatabases.find(d => d.id === effectiveId);
    const code = db?.code || (effectiveId === DEFAULT_DATABASE_ID ? 'PRI' : effectiveId.slice(0, 3).toUpperCase());
    const color = db?.color || (effectiveId === DEFAULT_DATABASE_ID ? 'emerald' : 'blue');
    return (
      <span 
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${getDbBadgeStyle(color)}`}
        title={`Database: ${db?.name || effectiveId}`}
      >
        <span className={`w-1 h-1 rounded-full ${getDbDotColor(color)}`} />
        {code}
      </span>
    );
  };

  // Handle adding custom macro category inline
  const handleAddCategoryInline = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    const updated = addCategory(trimmed, ['Generale']);
    setCategoryDefs(updated);
    setFormData(prev => ({
      ...prev,
      category: trimmed as any,
      subcategory: '',
      folder: ''
    }));
    setNewCatInput('');
    setIsAddingCat(false);
  };

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
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name) return;

    let finalProductCode = (formData.productCode || '').trim();
    if (!finalProductCode) {
      finalProductCode = generateProductCode(inventory, initialData?.id, currentDb);
    }

    let finalQrCode = (formData.qrCode || '').trim();
    if (!finalQrCode || !/^\d{7}$/.test(finalQrCode)) {
      finalQrCode = generateProductQrCode(inventory, initialData?.id, currentDb);
    }

    const finalSubcat = (formData.subcategory || formData.folder || '').trim();

    // Track user modified fields if editing or creating
    const modifiedFieldsSet = new Set<string>(initialData?.userModifiedFields || []);
    if (initialData) {
      if (formData.name !== initialData.name) modifiedFieldsSet.add('name');
      if ((formData.category || Category.OTHER) !== initialData.category) modifiedFieldsSet.add('category');
      if (finalSubcat !== (initialData.subcategory || initialData.folder || '')) {
        modifiedFieldsSet.add('subcategory');
        modifiedFieldsSet.add('folder');
      }
      if ((formData.alias || '').trim() !== (initialData.alias || '').trim()) modifiedFieldsSet.add('alias');
      if ((formData.location || '').trim() !== (initialData.location || '').trim()) modifiedFieldsSet.add('location');
      if ((parseInt(formData.inStock?.toString() || '0', 10) || 0) !== (initialData.inStock || 0)) modifiedFieldsSet.add('inStock');
      if ((parseFloat(weightInput) || 0) !== (initialData.weight || 0)) modifiedFieldsSet.add('weight');
      if ((parseFloat(powerInput) || 0) !== (initialData.powerConsumption || 0)) modifiedFieldsSet.add('powerConsumption');
      if ((parseFloat(currentInput) || 0) !== (initialData.current || 0)) modifiedFieldsSet.add('current');
      if (powerPhase !== initialData.powerPhase) modifiedFieldsSet.add('powerPhase');
      if (powerSupplyRating !== initialData.powerSupplyRating) modifiedFieldsSet.add('powerSupplyRating');
      if (powerConnector.trim() !== (initialData.powerConnector || '').trim()) modifiedFieldsSet.add('powerConnector');
      if ((parseFloat(purchasePriceInput) || 0) !== (initialData.purchasePrice || 0)) modifiedFieldsSet.add('purchasePrice');
      if ((parseFloat(rentalPriceInput) || 0) !== (initialData.rentalPrice || 0)) modifiedFieldsSet.add('rentalPrice');
      if ((parseFloat(subrentalCostInput) || 0) !== (initialData.subrentalCost || 0)) modifiedFieldsSet.add('subrentalCost');
      if ((formData.description || '').trim() !== (initialData.description || '').trim()) modifiedFieldsSet.add('description');
      if ((formData.internalRemark || '').trim() !== (initialData.internalRemark || '').trim()) modifiedFieldsSet.add('internalRemark');
      if ((formData.externalRemark || '').trim() !== (initialData.externalRemark || '').trim()) modifiedFieldsSet.add('externalRemark');
      if (finalProductCode !== (initialData.productCode || '')) modifiedFieldsSet.add('productCode');
      if (finalQrCode !== (initialData.qrCode || '')) modifiedFieldsSet.add('qrCode');
      if (JSON.stringify(tempInstances) !== JSON.stringify(initialData.instances || [])) modifiedFieldsSet.add('instances');
      if (JSON.stringify(formData.accessories || []) !== JSON.stringify(initialData.accessories || [])) modifiedFieldsSet.add('accessories');
    } else {
      modifiedFieldsSet.add('name');
      if (formData.category) modifiedFieldsSet.add('category');
      if (finalSubcat) modifiedFieldsSet.add('subcategory');
      if (formData.location) modifiedFieldsSet.add('location');
      if (parseFloat(weightInput) > 0) modifiedFieldsSet.add('weight');
      if (parseInt(formData.inStock?.toString() || '0', 10) > 0) modifiedFieldsSet.add('inStock');
    }

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
      canHaveContent: (formData.category === Category.CONTAINERS || String(formData.category).toLowerCase() === 'contenitori') || !!formData.canHaveContent,

      // Descrizioni & Note
      description: (formData.description || '').trim(),
      internalRemark: (formData.internalRemark || '').trim(),
      externalRemark: (formData.externalRemark || '').trim(),

      // Relazioni
      accessories: formData.accessories || [],
      reminders: formData.reminders || [],
      documents: formData.documents || [],
      instances: tempInstances,
      periodicInspections: formData.periodicInspections || [],

      // Tracciamento Modifiche Manuali Utente su CuePack
      userModifiedFields: Array.from(modifiedFieldsSet),
      lastModifiedByUserAt: new Date().toISOString(),
      isCustomized: modifiedFieldsSet.size > 0 || !initialData
    });
    onClose();
  };

  // --- ACCESSORIES MANAGEMENT ---
  const handleAddAccessory = (itemId: string, quantity = 1) => {
    setFormData(prev => {
      const current = prev.accessories || [];
      if (!current.some(a => a.itemId === itemId)) {
        return {
          ...prev,
          accessories: [...current, { itemId, quantity, automatic: true }]
        };
      }
      return prev;
    });
  };

  const handleRequestAddAccessory = (item: InventoryItem) => {
    if ((formData.accessories || []).some(a => a.itemId === item.id)) return;

    // Check if this accessory has its own sub-accessories
    const childAccessories = (item.accessories || []).filter(a => a.itemId !== item.id && a.itemId !== initialData?.id);
    if (childAccessories.length > 0) {
      const subs = childAccessories.map(a => {
        const found = localInventory.find(i => i.id === a.itemId) || inventory.find(i => i.id === a.itemId);
        return {
          item: found || ({ id: a.itemId, name: 'Accessorio', inStock: 0, category: '' } as InventoryItem),
          quantity: a.quantity || 1
        };
      });

      setNestedAccessoryPrompt({
        targetItem: item,
        subAccessories: subs
      });
    } else {
      handleAddAccessory(item.id, 1);
    }
  };

  const handleConfirmNestedAccessory = (includeSubAccessories: boolean) => {
    if (!nestedAccessoryPrompt) return;
    const { targetItem, subAccessories } = nestedAccessoryPrompt;
    const current = formData.accessories || [];
    let updated = [...current];

    if (!updated.some(a => a.itemId === targetItem.id)) {
      updated.push({ itemId: targetItem.id, quantity: 1, automatic: true });
    }

    if (includeSubAccessories) {
      subAccessories.forEach(sub => {
        const existingIdx = updated.findIndex(a => a.itemId === sub.item.id);
        if (existingIdx !== -1) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + sub.quantity
          };
        } else {
          updated.push({
            itemId: sub.item.id,
            quantity: sub.quantity,
            automatic: true
          });
        }
      });
    }

    setFormData({
      ...formData,
      accessories: updated
    });
    setNestedAccessoryPrompt(null);
  };

  // --- ACCESSORIES DRAG AND DROP REORDERING ---
  const handleAccDragStart = (e: React.DragEvent, index: number) => {
    draggedAccIndexRef.current = index;
    setDraggedAccIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleAccDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const sourceIdx = draggedAccIndexRef.current;
    if (sourceIdx === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const isBelow = (e.clientY - rect.top) > (rect.height / 2);
    const position: 'before' | 'after' = isBelow ? 'after' : 'before';

    const targetObj: { index: number; position: 'before' | 'after' } = { index, position };
    dropAccTargetRef.current = targetObj;

    const finalTarget = getTargetInsertIndex(sourceIdx, index, position);
    if (finalTarget !== sourceIdx) {
      setDropAccTarget(targetObj);
    } else {
      setDropAccTarget(null);
    }
  };

  const handleAccDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceIdx = draggedAccIndexRef.current;
    if (sourceIdx === null) {
      setDraggedAccIndex(null);
      setDropAccTarget(null);
      return;
    }

    let finalTargetIndex: number;
    if (targetIndex !== undefined) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isBelow = (e.clientY - rect.top) > (rect.height / 2);
      const position: 'before' | 'after' = isBelow ? 'after' : 'before';
      finalTargetIndex = getTargetInsertIndex(sourceIdx, targetIndex, position);
    } else if (dropAccTargetRef.current) {
      finalTargetIndex = getTargetInsertIndex(
        sourceIdx, 
        dropAccTargetRef.current.index, 
        dropAccTargetRef.current.position
      );
    } else {
      finalTargetIndex = (formData.accessories?.length || 1) - 1;
    }

    const currentAccs = [...(formData.accessories || [])];
    if (sourceIdx !== finalTargetIndex && finalTargetIndex >= 0 && finalTargetIndex < currentAccs.length) {
      const [moved] = currentAccs.splice(sourceIdx, 1);
      currentAccs.splice(finalTargetIndex, 0, moved);
      setFormData(prev => ({ ...prev, accessories: currentAccs }));
    }

    draggedAccIndexRef.current = null;
    dropAccTargetRef.current = null;
    setDraggedAccIndex(null);
    setDropAccTarget(null);
  };

  const handleAccDragEnd = () => {
    draggedAccIndexRef.current = null;
    dropAccTargetRef.current = null;
    setDraggedAccIndex(null);
    setDropAccTarget(null);
  };

  const handleReplaceAccessory = (index: number, newItem: InventoryItem) => {
    const current = [...(formData.accessories || [])];
    const oldAcc = current[index];
    if (!oldAcc) return;

    if (newItem.id === initialData?.id) return;

    const existingIdx = current.findIndex((a, i) => i !== index && a.itemId === newItem.id);
    if (existingIdx !== -1) {
      current[existingIdx] = {
        ...current[existingIdx],
        quantity: current[existingIdx].quantity + oldAcc.quantity
      };
      current.splice(index, 1);
    } else {
      current[index] = {
        ...oldAcc,
        itemId: newItem.id
      };
    }

    setFormData(prev => ({ ...prev, accessories: current }));
    setReplacingAccessoryIndex(null);
  };

  const handleUpdateAccessoryQty = (itemId: string, quantity: number, index?: number) => {
    if (quantity <= 0) {
      handleRemoveAccessory(itemId, index);
      return;
    }
    setFormData(prev => {
      const current = prev.accessories || [];
      return {
        ...prev,
        accessories: current.map(a => a.itemId === itemId ? { ...a, quantity } : a)
      };
    });
  };

  const handleToggleAccessoryAutomatic = (itemId: string) => {
    setFormData(prev => {
      const current = prev.accessories || [];
      return {
        ...prev,
        accessories: current.map(a => {
          if (a.itemId === itemId) {
            const isCurrentlyAuto = a.automatic !== false;
            return { ...a, automatic: !isCurrentlyAuto };
          }
          return a;
        })
      };
    });
  };

  const handleRemoveAccessory = (itemId: string, index?: number) => {
    setFormData(prev => {
      const current = prev.accessories || [];
      return {
        ...prev,
        accessories: current.filter(a => a.itemId !== itemId)
      };
    });
    if (index !== undefined) {
      if (replacingAccessoryIndex === index) {
        setReplacingAccessoryIndex(null);
      } else if (replacingAccessoryIndex !== null && replacingAccessoryIndex > index) {
        setReplacingAccessoryIndex(replacingAccessoryIndex - 1);
      }
    }
  };

  // --- INSTANCES / SERIALS MANAGEMENT ---
  const handleAddInstance = () => {
    let finalCode = instanceIdInput.trim();
    if (!finalCode) {
      finalCode = generateProductQrCode([...inventory, ...localInventory], undefined, currentDb);
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
    <div 
      className={
        isQuickMode
          ? "fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn select-none"
          : "fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col overflow-hidden animate-fadeIn select-none"
      }
      onClick={(e) => {
        if (isQuickMode && e.target === e.currentTarget) handleAttemptClose();
      }}
    >
      <div 
        className={
          isQuickMode
            ? "bg-slate-950 border border-slate-700/80 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in text-slate-100"
            : "flex flex-col w-full h-full overflow-hidden"
        }
      >
        {/* 1. TOP APP BAR / PAGE HEADER */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-lg z-20">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={handleAttemptClose}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs sm:text-sm font-bold transition-all border border-slate-700 active:scale-95 shrink-0"
              title={backButtonLabel || (isQuickMode ? "Annulla e chiudi" : "Torna all'Inventario")}
            >
              {isQuickMode ? <X size={18} /> : <ArrowLeft size={18} />}
              <span className="hidden sm:inline">{backButtonLabel || (isQuickMode ? "Annulla" : "Torna all'Inventario")}</span>
            </button>
            
            <div className="h-6 w-[1px] bg-slate-800 hidden sm:block"></div>

            <div className="flex items-center gap-2.5 truncate">
              {isQuickMode && (
                <span className="px-2.5 py-1 bg-cyan-950/80 text-cyan-400 border border-cyan-800/80 rounded-lg text-xs font-mono font-bold shrink-0">
                  Accessorio Rapido
                </span>
              )}
              {formData.productCode && (
                <span className="px-2.5 py-1 bg-blue-950 text-blue-400 border border-blue-800/80 rounded-lg text-xs font-mono font-bold shrink-0">
                  Cod. {formData.productCode}
                </span>
              )}
              <h1 className="text-sm sm:text-base md:text-lg font-black text-white truncate tracking-tight">
                {formData.name ? formData.name : (title || (isQuickMode ? 'Nuovo Accessorio Rapido' : 'Nuovo Materiale'))}
              </h1>
            </div>
          </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={handleAttemptClose}
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
            <span>{isQuickMode ? 'Crea & Collega' : 'Salva Materiale'}</span>
          </button>
        </div>
      </header>

      {/* 2. TAB NAVIGATION BAR */}
      {!isQuickMode && (
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

            <button
              type="button"
              onClick={() => setActiveTab('kits')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'kits'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
              }`}
            >
              <Package size={16} />
              Kit
              {kitMatchDetails.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'kits' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                  {kitMatchDetails.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
              }`}
            >
              <History size={16} />
              Storico
            </button>

          </div>
        </div>
      )}

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
                      onChange={e => {
                        const newDbId = e.target.value;
                        const newDbConfig = effectiveDatabases.find(d => d.id === newDbId);
                        if (!initialData) {
                          const autoProductCode = generateProductCode(inventory, undefined, newDbConfig);
                          const autoQrCode = generateProductQrCode(inventory, undefined, newDbConfig);
                          setFormData({ 
                            ...formData, 
                            databaseId: newDbId,
                            productCode: autoProductCode,
                            qrCode: autoQrCode
                          });
                        } else {
                          setFormData({ ...formData, databaseId: newDbId });
                        }
                      }}
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
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Macro Categoria
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsAddingCat(!isAddingCat)}
                          className="text-[11px] text-blue-400 hover:underline font-semibold"
                        >
                          {isAddingCat ? 'Annulla' : '+ Nuova'}
                        </button>
                      </div>

                      {isAddingCat ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="Es. Generatori, Effetti..."
                            value={newCatInput}
                            onChange={e => setNewCatInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddCategoryInline()}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleAddCategoryInline}
                            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
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
                      )}
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

                  {/* Tipo Materiale */}
                  <div className="pt-2">
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
                </div>

                {/* RIGHT: PROPRIETÀ FISICHE & DIMENSIONI (RIQUADRO A SÉ STANTE - 5 COLS) */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <Scale size={18} className="text-amber-400" />
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Proprietà Fisiche & Dimensioni</h3>
                  </div>

                  {/* PESO IN PRIMO PIANO */}
                  <div>
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
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-base font-bold text-white focus:border-amber-500 outline-none text-right font-mono" 
                      value={weightInput} 
                      onChange={e => setWeightInput(e.target.value)} 
                    />
                  </div>

                  {/* DIMENSIONI (Larghezza, Profondità, Altezza in cm) */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
                      Dimensioni Trasporto (cm)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Larghezza</span>
                        <input 
                          type="number" 
                          step="any"
                          min="0" 
                          placeholder="Larghezza (cm)" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white focus:border-amber-500 outline-none text-right" 
                          value={widthInput} 
                          onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                          onChange={e => handleDimensionChange('w', e.target.value)} 
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Profondità</span>
                        <input 
                          type="number" 
                          step="any"
                          min="0" 
                          placeholder="Profondità (cm)" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white focus:border-amber-500 outline-none text-right" 
                          value={lengthInput} 
                          onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                          onChange={e => handleDimensionChange('l', e.target.value)} 
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Altezza</span>
                        <input 
                          type="number" 
                          step="any"
                          min="0" 
                          placeholder="Altezza (cm)" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white focus:border-amber-500 outline-none text-right" 
                          value={heightInput} 
                          onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                          onChange={e => handleDimensionChange('h', e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* VOLUME IN M³ (SPAZIO UTILIZZATO) CALCOLATO AUTOMATICAMENTE / EDITABILE */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Box size={16} className="text-amber-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-white">Spazio Utilizzato / Volume</div>
                        <div className="text-[10px] text-slate-500">Auto-calcolato da L×P×A o manuale</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-amber-950/30 px-2.5 py-1 rounded-lg border border-amber-800/60">
                      <input 
                        type="number"
                        step="any"
                        min="0"
                        className="w-20 bg-transparent text-sm font-mono font-black text-amber-400 outline-none text-right"
                        value={volumeInput}
                        onFocus={e => { if (e.target.value === '0') e.target.select(); }}
                        onChange={e => setVolumeInput(e.target.value)}
                      />
                      <span className="text-xs font-bold text-amber-400/80 font-mono">m³</span>
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
                    
                    {/* 1. TIPO CONNETTORE */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Tipo Connettore
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsAddingConnector(!isAddingConnector)}
                          className="text-[11px] text-yellow-400 hover:underline font-semibold"
                        >
                          {isAddingConnector ? 'Annulla' : '+ Nuovo'}
                        </button>
                      </div>

                      {isAddingConnector ? (
                        <div className="space-y-1.5 p-2 bg-slate-950 border border-slate-700 rounded-xl">
                          <input
                            type="text"
                            placeholder="Nome connettore..."
                            value={newConnName}
                            onChange={e => setNewConnName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddConnectorInline()}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-yellow-500"
                            autoFocus
                          />
                          <div className="flex items-center gap-1.5">
                            <select
                              value={newConnPhase}
                              onChange={e => setNewConnPhase(e.target.value as 'monofase' | 'trifase')}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                            >
                              <option value="monofase">Mono (230V)</option>
                              <option value="trifase">Penta (400V)</option>
                            </select>
                            <select
                              value={newConnAmperage}
                              onChange={e => setNewConnAmperage(e.target.value)}
                              className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] text-white outline-none font-mono text-center"
                            >
                              {STANDARD_AMPERAGES.map(amp => (
                                <option key={amp} value={amp}>{amp}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={handleAddConnectorInline}
                              disabled={!newConnName.trim()}
                              className="p-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-slate-950 rounded-lg text-xs font-bold shrink-0 transition-colors"
                              title="Salva connettore"
                            >
                              <Check size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <select 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-yellow-500 outline-none" 
                          value={powerConnector} 
                          onChange={e => handleConnectorSelect(e.target.value)}
                        >
                          <option value="">Seleziona connettore...</option>
                          {powerConnector && !connectors.some(c => c.name.toLowerCase() === powerConnector.toLowerCase()) && (
                            <option value={powerConnector}>{powerConnector} (Personalizzato)</option>
                          )}
                          {connectors.map(c => (
                            <option key={c.id} value={c.name}>
                              {c.name} ({c.amperage} - {c.voltage})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 2. TIPO LINEA (Solo visibile / Non modificabile, determinato dal connettore) */}
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Tipo Linea
                      </label>
                      <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-bold text-slate-300">
                        {powerPhase === 'monofase' ? 'Monofase (230V)' : 'Pentapolare (400V)'}
                      </div>
                    </div>

                    {/* 3. AMPERE CONNETTORE (Solo visibile / Non modificabile, determinato dal connettore) */}
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Ampere Connettore
                      </label>
                      <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-bold text-yellow-400 font-mono">
                        {powerSupplyRating || '16A'}
                      </div>
                    </div>

                  </div>

                  {/* Calcolo Bidirezionale Watt <-> Ampere */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm font-bold text-white focus:border-yellow-500 outline-none text-right font-mono" 
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
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm font-bold text-white focus:border-yellow-500 outline-none text-right font-mono" 
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
                
                {/* SINISTRA (7 COLS): ACCESSORI COLLEGATI */}
                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col h-[520px]">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <LinkIcon size={16} className="text-cyan-400" />
                      Accessori Collegati ({formData.accessories?.length || 0})
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Trascina la riga per ordinare
                    </span>
                  </div>

                  <div 
                    className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => handleAccDrop(e)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDropAccTarget(null);
                        dropAccTargetRef.current = null;
                      }
                    }}
                  >
                    {(!formData.accessories || formData.accessories.length === 0) ? (
                      <div className="text-center py-20 text-slate-500 text-xs">
                        Nessun accessorio collegato. Seleziona gli articoli dall'elenco a destra per aggiungerli.
                      </div>
                    ) : (
                      formData.accessories.map((acc, idx) => {
                        const invItem = localInventory.find(i => i.id === acc.itemId) || inventory.find(i => i.id === acc.itemId);
                        const hasSubAccessories = (invItem?.accessories && invItem.accessories.length > 0) || false;
                        const isAuto = acc.automatic !== false;
                        const isBeingDragged = draggedAccIndex === idx;

                        return (
                          <div 
                            key={`${acc.itemId}-${idx}`}
                            className="relative"
                            onDragOver={(e) => handleAccDragOver(e, idx)}
                            onDrop={(e) => handleAccDrop(e, idx)}
                          >
                            {/* Highlight Line BEFORE */}
                            {dropAccTarget?.index === idx && dropAccTarget.position === 'before' && (
                              <div className="absolute -top-1 left-0 right-0 h-[3px] bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7] ring-1 ring-purple-400 z-30 pointer-events-none" />
                            )}

                            {/* Highlight Line AFTER */}
                            {dropAccTarget?.index === idx && dropAccTarget.position === 'after' && (
                              <div className="absolute -bottom-1 left-0 right-0 h-[3px] bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7] ring-1 ring-purple-400 z-30 pointer-events-none" />
                            )}

                            {/* Accessory Card Container (Compact Height py-1.5 px-2.5) */}
                            <div 
                              className={`rounded-xl border transition-all ${
                                replacingAccessoryIndex === idx
                                  ? 'border-amber-500 bg-amber-950/20 ring-1 ring-amber-500/60 shadow-lg shadow-amber-950/40'
                                  : isBeingDragged
                                    ? 'opacity-30 border-dashed border-purple-400 bg-slate-900/60'
                                    : hasSubAccessories
                                      ? 'bg-cyan-950/20 border-cyan-700/70 hover:border-cyan-500/80 shadow-sm shadow-cyan-950/30'
                                      : 'bg-slate-950 border-slate-800/90 hover:border-slate-700/80'
                              }`}
                            >
                              <div 
                                draggable
                                onDragStart={(e) => handleAccDragStart(e, idx)}
                                onDragEnd={handleAccDragEnd}
                                className="py-1.5 px-2.5 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing select-none"
                              >
                                {/* Grip Handle, Icon, DB Badge, Name */}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-slate-600 hover:text-slate-400 shrink-0 p-0.5" title="Trascina per ordinare">
                                    <GripVertical size={14} />
                                  </span>

                                  <Box size={16} className={hasSubAccessories ? "text-cyan-400 shrink-0" : "text-slate-400 shrink-0"} />
                                  {renderDbBadge(invItem?.databaseId)}
                                  
                                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                                    <span className="text-xs sm:text-sm font-bold text-white truncate" title={invItem?.name}>
                                      {invItem?.name || 'Accessorio rimosso'}
                                    </span>
                                    {hasSubAccessories && (
                                      <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded font-bold shrink-0">
                                        Con acc.
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Controls: Auto Toggle + Stepper + Replace + Delete */}
                                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                  {/* Toggle Automatico */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAccessoryAutomatic(acc.itemId)}
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${
                                      isAuto 
                                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800 hover:bg-emerald-900' 
                                        : 'bg-amber-950/80 text-amber-300 border-amber-800 hover:bg-amber-900'
                                    }`}
                                    title={isAuto ? 'Incluso automaticamente alla distinta' : "Chiede conferma all'inserimento in distinta"}
                                  >
                                    {isAuto ? 'Auto' : 'Opz.'}
                                  </button>

                                  {/* Stepper Compatto */}
                                  <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateAccessoryQty(acc.itemId, acc.quantity - 1, idx)}
                                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 text-xs font-bold hover:bg-slate-700 transition-colors"
                                    >
                                      -
                                    </button>
                                    <input 
                                      type="number"
                                      min="1"
                                      value={acc.quantity}
                                      onChange={e => handleUpdateAccessoryQty(acc.itemId, Math.max(1, parseInt(e.target.value) || 1), idx)}
                                      className="w-8 text-center font-mono font-bold text-xs text-white bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateAccessoryQty(acc.itemId, acc.quantity + 1, idx)}
                                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 text-xs font-bold hover:bg-slate-700 transition-colors"
                                    >
                                      +
                                    </button>
                                  </div>

                                  {/* Sostituisci */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (replacingAccessoryIndex === idx) {
                                        setReplacingAccessoryIndex(null);
                                      } else {
                                        setReplacingAccessoryIndex(idx);
                                      }
                                    }}
                                    className={`p-1 rounded-lg transition-colors ${
                                      replacingAccessoryIndex === idx
                                        ? 'text-amber-400 bg-amber-950/80 border border-amber-500/60 shadow-sm shadow-amber-900/30'
                                        : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'
                                    }`}
                                    title={replacingAccessoryIndex === idx ? "Annulla sostituzione" : "Sostituisci accessorio con un altro dall'elenco"}
                                  >
                                    <ArrowLeftRight size={14} />
                                  </button>

                                  {/* Rimuovi */}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAccessory(acc.itemId, idx)}
                                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                                    title="Rimuovi accessorio"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* DESTRA (5 COLS): RICERCA MATERIALE DA AGGIUNGERE */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col h-[520px]">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Search size={16} className="text-blue-400" />
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

                  {/* Replacement Mode Alert Banner */}
                  {replacingAccessoryIndex !== null && (
                    <div className="bg-amber-950/40 border border-amber-500/60 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs text-amber-200 shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <ArrowLeftRight size={14} className="text-amber-400 shrink-0" />
                        <span className="truncate">
                          Sostituzione in corso: seleziona articolo per rimpiazzare <strong>{(() => {
                            const repAcc = (formData.accessories || [])[replacingAccessoryIndex];
                            const repItem = localInventory.find(i => i.id === repAcc?.itemId) || inventory.find(i => i.id === repAcc?.itemId);
                            return repItem?.name || 'accessorio';
                          })()}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplacingAccessoryIndex(null)}
                        className="px-2 py-0.5 bg-amber-900/80 hover:bg-amber-800 text-amber-200 border border-amber-700/60 rounded text-[11px] font-bold shrink-0 transition-colors"
                      >
                        Annulla
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                    <input 
                      type="text" 
                      placeholder="Cerca accessorio per nome..." 
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500" 
                      value={accessorySearch} 
                      onChange={e => setAccessorySearch(e.target.value)} 
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                    {searchAndSortItems(
                      localInventory.filter(i => i.id !== initialData?.id),
                      accessorySearch
                    )
                      .slice(0, 50)
                      .map(item => {
                        const isAdded = (formData.accessories || []).some(a => a.itemId === item.id);
                        const hasAccessories = item.accessories && item.accessories.length > 0;
                        return (
                          <div 
                            key={item.id} 
                            onClick={() => {
                              if (replacingAccessoryIndex !== null) {
                                handleReplaceAccessory(replacingAccessoryIndex, item);
                              } else if (!isAdded) {
                                handleRequestAddAccessory(item);
                              }
                            }}
                            className={`py-1.5 px-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isAdded && replacingAccessoryIndex === null
                                ? 'bg-slate-950 border-slate-800 opacity-40 cursor-not-allowed' 
                                : hasAccessories
                                  ? 'bg-cyan-950/20 hover:bg-cyan-900/30 border-cyan-800/50'
                                  : 'bg-slate-950 hover:bg-slate-900 border-slate-800/80'
                            }`}
                          >
                            <div className="min-w-0 flex-1 mr-2 flex items-center gap-2">
                              <Box size={16} className={hasAccessories ? "text-cyan-400 shrink-0" : "text-slate-400 shrink-0"} />
                              {renderDbBadge(item.databaseId)}
                              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                                <span className="text-xs sm:text-sm font-bold text-white truncate" title={item.name}>
                                  {item.name}
                                </span>
                                {hasAccessories && (
                                  <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded font-bold shrink-0">
                                    Con acc.
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isAdded && replacingAccessoryIndex === null}
                              className={`p-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                                replacingAccessoryIndex !== null
                                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-black'
                                  : isAdded 
                                    ? 'text-slate-600' 
                                    : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white'
                              }`}
                              title={replacingAccessoryIndex !== null ? 'Sostituisci con questo' : isAdded ? 'Già aggiunto' : 'Aggiungi accessorio'}
                            >
                              {replacingAccessoryIndex !== null ? (
                                <ArrowLeftRight size={14} />
                              ) : isAdded ? (
                                <Check size={14} />
                              ) : (
                                <Plus size={14} />
                              )}
                            </button>
                          </div>
                        );
                      })}
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

          {/* ========================================================= */}
          {/* TAB 7: KIT DI APPARTENENZA */}
          {/* ========================================================= */}
          {activeTab === 'kits' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header card with Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 sm:p-5 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-950/60 text-purple-400 border border-purple-800/50 rounded-xl">
                    <Package size={22} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      Kit con questo Materiale
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                        {kitMatchDetails.length}
                      </span>
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400">
                      Elenco di tutti i kit in cui questo articolo è presente come componente diretto o accessorio.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateKitWithCurrentItem}
                  disabled={!initialData?.id}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-purple-900/30 transition-all active:scale-95 shrink-0"
                >
                  <Plus size={16} />
                  <span>Nuovo Kit con questo materiale</span>
                </button>
              </div>

              {/* Notice if item not yet saved */}
              {!initialData?.id && (
                <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <Info size={24} />
                  </div>
                  <h4 className="text-base font-bold text-white">Articolo non ancora salvato</h4>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                    Salva prima questo articolo nell'inventario per visualizzare o gestire i Kit in cui è inserito.
                  </p>
                </div>
              )}

              {/* Empty state: item is saved but not in any kit */}
              {initialData?.id && kitMatchDetails.length === 0 && (
                <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-purple-950/40 border border-purple-800/40 flex items-center justify-center mx-auto text-purple-400 shadow-inner">
                    <Package size={32} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base sm:text-lg font-bold text-white">Nessun Kit include questo materiale</h4>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                      Questo articolo non fa parte di nessun kit al momento. Puoi creare subito un nuovo kit pre-compilato con questo materiale e i suoi accessori.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCreateKitWithCurrentItem}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition-all active:scale-95"
                    >
                      <Plus size={18} />
                      <span>Crea il primo Kit con questo materiale</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Kit list */}
              {initialData?.id && kitMatchDetails.length > 0 && (
                <div className="grid grid-cols-1 gap-3">
                  {kitMatchDetails.map(match => {
                    const kit = match.kit;
                    const kitDatabases = match.databaseIds.map(dbId => 
                      effectiveDatabasesMap.get(dbId) || {
                        id: dbId,
                        name: 'Database',
                        code: dbId === DEFAULT_DATABASE_ID ? 'PRI' : dbId.slice(0, 3).toUpperCase(),
                        color: dbId === DEFAULT_DATABASE_ID ? 'emerald' : 'blue'
                      }
                    );

                    return (
                      <div
                        key={kit.id}
                        className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-5 transition-all duration-150 flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                      >
                        {/* Main Info */}
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingKitForModal(kit);
                                setIsKitEditModalOpen(true);
                              }}
                              className="text-base font-bold text-white hover:text-purple-400 transition-colors text-left flex items-center gap-2 group-hover:underline"
                            >
                              <Package size={18} className="text-purple-400 shrink-0" />
                              <span className="truncate">{kit.name}</span>
                            </button>

                            {/* Category Badge */}
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                              {kit.category}
                            </span>

                            {/* Database Badges */}
                            {kitDatabases.map(dbItem => (
                              <span
                                key={dbItem.id}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 ${getDbBadgeStyle(dbItem.color)}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${getDbDotColor(dbItem.color)}`}></span>
                                {dbItem.code}
                              </span>
                            ))}
                          </div>

                          {kit.description && (
                            <p className="text-xs text-slate-400 line-clamp-1">
                              {kit.description}
                            </p>
                          )}

                          {/* Role of current item in this kit */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {match.directQuantity > 0 && (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                Componente Diretto (x{match.directQuantity})
                              </span>
                            )}

                            {match.accessoryOccurrences.map((acc, aIdx) => (
                              <span
                                key={aIdx}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 flex items-center gap-1.5"
                              >
                                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                                Accessorio in "{acc.parentName}" (x{acc.quantity})
                              </span>
                            ))}

                            <span className="text-xs text-slate-400 ml-auto font-mono">
                              Componenti totali nel kit: <strong className="text-slate-200">{kit.items?.length || 0}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Action button */}
                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKitForModal(kit);
                              setIsKitEditModalOpen(true);
                            }}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-purple-600 text-slate-200 hover:text-white rounded-lg border border-slate-700 hover:border-purple-500 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                          >
                            <Edit2 size={14} />
                            <span>Modifica Kit</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: STORICO MOVIMENTI MATERIALE */}
          {/* ========================================================= */}
          {activeTab === 'history' && (
            <ItemMovementHistory
              itemId={initialData?.id}
              itemName={formData.name || initialData?.name}
              packingLists={packingLists}
            />
          )}

        </div>
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
      {/* MODAL CREAZIONE RAPIDA ACCESSORIO (SCHEDA PRINCIPALE COMPLETA) */}
      {/* ========================================================= */}
      {isQuickCreateOpen && (
        <ItemFormModal
          isOpen={isQuickCreateOpen}
          onClose={() => setIsQuickCreateOpen(false)}
          onSave={(itemData) => {
            const newId = generateId();
            const newFullItem: InventoryItem = {
              ...itemData,
              id: newId
            } as InventoryItem;

            setLocalInventory(prev => [...prev, newFullItem]);
            if (onCreateAccessory) {
              onCreateAccessory(newFullItem);
            }
            if (replacingAccessoryIndex !== null) {
              handleReplaceAccessory(replacingAccessoryIndex, newFullItem);
            } else {
              handleAddAccessory(newFullItem.id);
            }
            setIsQuickCreateOpen(false);
          }}
          inventory={[...inventory, ...localInventory]}
          defaultDatabaseId={formData.databaseId || defaultDatabaseId}
          databases={databases}
          isQuickMode={true}
          title="Nuovo Accessorio Rapido"
          kits={effectiveKits}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL EDIT / CREATE KIT DALL'ARTICOLO */}
      {/* ========================================================= */}
      {isKitEditModalOpen && (
        <KitFormModal
          isOpen={isKitEditModalOpen}
          onClose={handleCloseKitModal}
          onSave={handleSaveKitFromModal}
          initialData={editingKitForModal}
          inventory={[...inventory, ...localInventory]}
          title={editingKitForModal && effectiveKits.some(k => k.id === editingKitForModal.id) ? "Modifica Kit" : "Nuovo Kit"}
          databases={databases}
          activeDatabaseId={formData.databaseId || activeDatabaseId}
          kits={effectiveKits}
        />
      )}

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

      {/* NESTED ACCESSORIES PROMPT MODAL */}
      {nestedAccessoryPrompt && (
        <Modal
          isOpen={true}
          onClose={() => setNestedAccessoryPrompt(null)}
          title="Aggiungi con i suoi accessori?"
          size="md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-cyan-950/30 border border-cyan-800/50 p-3.5 rounded-xl">
              <div className="p-2.5 bg-cyan-900/40 text-cyan-400 rounded-lg shrink-0">
                <Box size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white truncate">{nestedAccessoryPrompt.targetItem.name}</span>
                  <span className="text-xs bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 px-1.5 py-0.5 rounded font-bold shrink-0">
                    Con accessori
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Questo articolo contiene al suo interno altri accessori collegati. Desideri aggiungere anche i suoi accessori o aggiungere soltanto l'oggetto principale?
                </p>
              </div>
            </div>

            {/* Sub-accessories list preview */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Accessori inclusi in questo oggetto:
              </div>
              <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                {nestedAccessoryPrompt.subAccessories.map((sub, sIdx) => (
                  <div key={sIdx} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-900 last:border-0">
                    <span className="font-semibold text-white truncate mr-2">• {sub.item.name}</span>
                    <span className="font-mono text-cyan-400 font-bold shrink-0">x{sub.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleConfirmNestedAccessory(false)}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors text-center"
              >
                Aggiungi solo l'oggetto
              </button>
              <button
                type="button"
                onClick={() => handleConfirmNestedAccessory(true)}
                className="flex-1 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-colors text-center shadow-lg shadow-cyan-600/30"
              >
                Aggiungi tutto (con accessori)
              </button>
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setNestedAccessoryPrompt(null)}
                className="text-xs text-slate-500 hover:text-slate-300 underline"
              >
                Annulla
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* UNSAVED CHANGES CONFIRMATION PROMPT MODAL */}
      {showUnsavedPrompt && (
        <Modal
          isOpen={showUnsavedPrompt}
          onClose={() => setShowUnsavedPrompt(false)}
          title="Modifiche non salvate"
          size="md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3.5 bg-amber-950/30 border border-amber-800/60 p-4 rounded-xl">
              <div className="p-2.5 bg-amber-900/40 text-amber-400 rounded-lg shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-white mb-1">Vuoi salvare prima di uscire?</h4>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Hai apportato delle modifiche a questo materiale che non sono ancora state salvate. Se esci senza salvare, le modifiche andranno perse.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowUnsavedPrompt(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors"
              >
                Continua a modificare
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedPrompt(false);
                  onClose();
                }}
                className="px-4 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-200 hover:text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors"
              >
                Esci senza salvare
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedPrompt(false);
                  handleSubmit();
                }}
                disabled={!formData.name}
                className="flex items-center justify-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95"
              >
                <Check size={16} />
                <span>Salva ed Esci</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};
