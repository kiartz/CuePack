import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateId } from '../utils';
import { InventoryItem, Category, ItemDocument } from '../types';
import { Modal } from './Modal';
import { Plus, X, Search, Link, ArrowLeft, Lightbulb, Barcode, Eye, QrCode, Printer, PackageOpen, FileText, ExternalLink } from 'lucide-react';
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

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ 
  isOpen, onClose, onSave, initialData, inventory = [], onCreateAccessory, title, activeDatabaseId 
}) => {
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [weightInput, setWeightInput] = useState('0');
  const [powerInput, setPowerInput] = useState('0');
  const [accessorySearch, setAccessorySearch] = useState('');
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [localInventory, setLocalInventory] = useState<InventoryItem[]>([]);
  const [quickForm, setQuickForm] = useState<Partial<InventoryItem>>({});
  const [quickWeightInput, setQuickWeightInput] = useState('0');
  const [quickPowerInput, setQuickPowerInput] = useState('0');

  // Reminder State
  const [reminderInput, setReminderInput] = useState('');
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);

  // Documents State
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);
  const [docNameInput, setDocNameInput] = useState('');
  const [docUrlInput, setDocUrlInput] = useState('');

  // Instances State
  const [isInstancesOpen, setIsInstancesOpen] = useState(false);
  const [tempInstances, setTempInstances] = useState<ItemInstance[]>([]);
  const [instanceIdInput, setInstanceIdInput] = useState('');
  const [instanceSnInput, setInstanceSnInput] = useState('');
  const [editingInstanceIndex, setEditingInstanceIndex] = useState<{ index: number; field: 'id' | 'serialNumber' } | null>(null);
  const [editingInstanceValue, setEditingInstanceValue] = useState<string>('');

  // Code Preview State
  const [isCodePreviewOpen, setIsCodePreviewOpen] = useState(false);

  // Effect to initialize or reset form state ONLY when modal opens or target item changes
  useEffect(() => {
    if (isOpen) {
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
          accessories: initialData.accessories || [], 
          reminders: initialData.reminders || [], 
          documents: initialData.documents || [],
          instances: initialData.instances || [] 
        });
        setWeightInput(initialData.weight?.toString() || '0');
        setPowerInput(initialData.powerConsumption?.toString() || '0');
      } else {
        const defaultCode = generateProductCode(inventory);
        const defaultQr = generateProductQrCode(inventory);
        setFormData({
          category: Category.AUDIO,
          inStock: 0,
          weight: 0,
          powerConsumption: 0,
          name: '',
          productCode: defaultCode,
          qrCode: defaultQr,
          description: '',
          accessories: [],
          reminders: [],
          documents: [],
          instances: []
        });
        setWeightInput('0');
        setPowerInput('0');
      }
      setAccessorySearch('');
      setIsQuickCreateOpen(false);
      setLocalInventory([]); // Reset local cache on open
      setReminderInput('');
      setDocNameInput('');
      setDocUrlInput('');
      setInstanceIdInput('');
      setInstanceSnInput('');
      setEditingInstanceIndex(null);
      setEditingInstanceValue('');
    }
  }, [isOpen, initialData?.id]);

  const handleNumericInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    formKey: keyof InventoryItem,
    formSetter: React.Dispatch<React.SetStateAction<Partial<InventoryItem>>>
  ) => {
    const val = e.target.value;
    setter(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      formSetter(prev => ({ ...prev, [formKey]: num }));
    }
  };

  const handleSubmit = () => {
    if (formData.name && formData.category) {
      if (editingInstanceIndex) {
        saveEditingInstance();
      }

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

      finalFormData.instances = Array.isArray(finalFormData.instances) ? finalFormData.instances : [];
      finalFormData.accessories = Array.isArray(finalFormData.accessories) ? finalFormData.accessories : [];
      finalFormData.reminders = Array.isArray(finalFormData.reminders) ? finalFormData.reminders : [];
      finalFormData.documents = Array.isArray(finalFormData.documents) ? finalFormData.documents : [];

      onSave(finalFormData as Omit<InventoryItem, 'id'>);
      onClose();
    }
  };

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

  const getSuggestedInstanceId = (currentInstancesList?: ItemInstance[]) => {
    const usedNumbers = new Set<number>();

    // 1. Scan across ALL items in database inventory (both item qrCode and all instance IDs)
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

    // 2. Scan instances currently in form / temp list
    const instancesToScan = currentInstancesList !== undefined ? currentInstancesList : (formData.instances || []);
    instancesToScan.forEach(inst => {
      const code = (inst.id || '').trim();
      if (/^\d{7}$/.test(code)) {
        usedNumbers.add(parseInt(code, 10));
      }
    });

    // 3. Find first unused progressive 7-digit number starting at 1000001
    let nextNum = 1000001;
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }

    return nextNum.toString();
  };

  const openInstancesModal = () => {
    const currentList = [...(formData.instances || [])];
    setTempInstances(currentList);
    setInstanceIdInput(getSuggestedInstanceId(currentList));
    setInstanceSnInput('');
    setEditingInstanceIndex(null);
    setEditingInstanceValue('');
    setIsInstancesOpen(true);
  };

  const cancelInstancesModal = () => {
    setIsInstancesOpen(false);
    setEditingInstanceIndex(null);
    setEditingInstanceValue('');
  };

  const saveInstancesModal = async () => {
    let finalInstances = [...tempInstances];
    if (editingInstanceIndex) {
      const { index, field } = editingInstanceIndex;
      const val = editingInstanceValue.trim();
      const currentInst = finalInstances[index];
      if (currentInst) {
        if (field === 'id' && val) {
          finalInstances[index] = { ...currentInst, id: val };
        } else if (field === 'serialNumber') {
          finalInstances[index] = { ...currentInst, serialNumber: val || undefined };
        }
      }
    }
    
    // 1. Update local form state
    setFormData(prev => ({ ...prev, instances: finalInstances }));
    
    // 2. Immediately persist to database (Firestore) if editing an existing item
    if (initialData?.id) {
      try {
        await updateItemFields(getInventoryCollection(activeDatabaseId), initialData.id, { instances: finalInstances });
        initialData.instances = finalInstances;
      } catch (err) {
        console.error("Errore nel salvataggio immediato dei seriali in Firestore:", err);
      }
    }

    setIsInstancesOpen(false);
    setEditingInstanceIndex(null);
    setEditingInstanceValue('');
  };

  const addInstance = () => {
    const code = instanceIdInput.trim();
    if (!code) return;

    if (code.length > 20) {
      alert("Il codice univoco / QR può avere una lunghezza massima di 20 caratteri.");
      return;
    }

    // Check locally first in tempInstances
    const isDuplicateLocal = tempInstances.some(inst => inst.id.toLowerCase() === code.toLowerCase());
    if (isDuplicateLocal) {
      alert(`Il codice univoco / QR "${code}" è già stato inserito in questo articolo.`);
      return;
    }

    // Check globally in database (across item qrCode and instance IDs)
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
      alert(`Errore: Il codice univoco / QR "${code}" è già associato al prodotto "${duplicateItemName}". I codici QR/Univoci devono essere unici in tutto il gestionale.`);
      return;
    }

    // Validate SN uniqueness if provided
    const snCode = instanceSnInput.trim();
    if (snCode) {
      if (snCode.length > 20) {
        alert("Il Serial Number (SN) può avere una lunghezza massima di 20 caratteri.");
        return;
      }

      const isDuplicateSnLocal = tempInstances.some(
        inst => inst.serialNumber && inst.serialNumber.trim().toLowerCase() === snCode.toLowerCase()
      );
      if (isDuplicateSnLocal) {
        alert(`Il Serial Number (SN) "${snCode}" è già stato inserito in questo articolo.`);
        return;
      }

      let duplicateSnItemName = '';
      if (inventory && Array.isArray(inventory)) {
        for (const item of inventory) {
          if (initialData && item.id === initialData.id) continue;
          const hasDuplicate = (item.instances || []).some(
            inst => inst.serialNumber && inst.serialNumber.trim().toLowerCase() === snCode.toLowerCase()
          );
          if (hasDuplicate) {
            duplicateSnItemName = item.name;
            break;
          }
        }
      }

      if (duplicateSnItemName) {
        alert(`Errore: Il Serial Number (SN) "${snCode}" è già associato al prodotto "${duplicateSnItemName}". Deve essere unico.`);
        return;
      }
    }

    const newInstance: ItemInstance = { 
      id: code, 
      serialNumber: snCode || undefined
    };
    const updatedInstances = [...tempInstances, newInstance];
    setTempInstances(updatedInstances);
    
    // Immediately calculate and pre-fill the NEXT 7-digit QR code starting at 1000001
    const nextCode = getSuggestedInstanceId(updatedInstances);
    setInstanceIdInput(nextCode);
    setInstanceSnInput('');
  };

  const startEditingInstance = (index: number, field: 'id' | 'serialNumber') => {
    const inst = tempInstances[index];
    if (!inst) return;
    setEditingInstanceIndex({ index, field });
    setEditingInstanceValue(field === 'id' ? inst.id : (inst.serialNumber || ''));
  };

  const saveEditingInstance = () => {
    if (!editingInstanceIndex) return;
    const { index, field } = editingInstanceIndex;
    const val = editingInstanceValue.trim();
    const currentInstances = [...tempInstances];
    const currentInst = currentInstances[index];
    if (!currentInst) {
      setEditingInstanceIndex(null);
      return;
    }

    if (val.length > 20) {
      alert("Il valore può avere una lunghezza massima di 20 caratteri.");
      return;
    }

    if (field === 'id') {
      if (!val) {
        alert("Il codice univoco / QR non può essere vuoto.");
        return;
      }

      if (val.toLowerCase() !== currentInst.id.toLowerCase()) {
        // Check duplicate locally
        const isDuplicateLocal = currentInstances.some(
          (inst, idx) => idx !== index && inst.id.toLowerCase() === val.toLowerCase()
        );
        if (isDuplicateLocal) {
          alert(`Il codice univoco / QR "${val}" è già presente in un'altra riga di questo articolo.`);
          return;
        }

        // Check duplicate globally
        let duplicateItemName = '';
        if (inventory && Array.isArray(inventory)) {
          for (const item of inventory) {
            if (initialData && item.id === initialData.id) continue;
            if (item.qrCode && item.qrCode.trim().toLowerCase() === val.toLowerCase()) {
              duplicateItemName = item.name;
              break;
            }
            const hasDuplicate = (item.instances || []).some(
              inst => (inst.id || '').trim().toLowerCase() === val.toLowerCase()
            );
            if (hasDuplicate) {
              duplicateItemName = item.name;
              break;
            }
          }
        }

        if (duplicateItemName) {
          alert(`Errore: Il codice univoco / QR "${val}" è già associato al prodotto "${duplicateItemName}". Deve essere unico.`);
          return;
        }
      }

      currentInstances[index] = { ...currentInst, id: val };
      setTempInstances(currentInstances);
      const nextCode = getSuggestedInstanceId(currentInstances);
      setInstanceIdInput(nextCode);
    } else if (field === 'serialNumber') {
      if (val && (!currentInst.serialNumber || val.toLowerCase() !== currentInst.serialNumber.trim().toLowerCase())) {
        // Check duplicate SN locally
        const isDuplicateSnLocal = currentInstances.some(
          (inst, idx) => idx !== index && inst.serialNumber && inst.serialNumber.trim().toLowerCase() === val.toLowerCase()
        );
        if (isDuplicateSnLocal) {
          alert(`Il Serial Number (SN) "${val}" è già presente in un'altra riga di questo articolo.`);
          return;
        }

        // Check duplicate SN globally
        let duplicateSnItemName = '';
        if (inventory && Array.isArray(inventory)) {
          for (const item of inventory) {
            if (initialData && item.id === initialData.id) continue;
            const hasDuplicate = (item.instances || []).some(
              inst => inst.serialNumber && inst.serialNumber.trim().toLowerCase() === val.toLowerCase()
            );
            if (hasDuplicate) {
              duplicateSnItemName = item.name;
              break;
            }
          }
        }

        if (duplicateSnItemName) {
          alert(`Errore: Il Serial Number (SN) "${val}" è già associato al prodotto "${duplicateSnItemName}". Deve essere unico.`);
          return;
        }
      }

      currentInstances[index] = { ...currentInst, serialNumber: val || undefined };
      setTempInstances(currentInstances);
    }

    setEditingInstanceIndex(null);
    setEditingInstanceValue('');
  };

  const removeInstance = (index: number) => {
    const newInstances = [...tempInstances];
    newInstances.splice(index, 1);
    setTempInstances(newInstances);
    
    const nextCode = getSuggestedInstanceId(newInstances);
    setInstanceIdInput(nextCode);
  };

  const addAccessory = (item: InventoryItem) => {
    const currentAccessories = formData.accessories || [];
    const existing = currentAccessories.find(a => a.itemId === item.id);
    
    let updatedAccessories;
    if (existing) {
      updatedAccessories = currentAccessories.map(a => 
        a.itemId === item.id ? { ...a, quantity: a.quantity + 1 } : a
      );
    } else {
      updatedAccessories = [...currentAccessories, { itemId: item.id, quantity: 1 }];
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
        const combined = `${i.name} ${i.category} ${i.description || ''}`.toLowerCase();
        return tokens.every(token => combined.includes(token));
    });
  }, [inventory, accessorySearch, initialData]);

  const renderAccessoryList = () => {
    const accessories = formData.accessories || [];
    if (accessories.length === 0) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 p-4 text-center">
            <Link size={32} className="mb-2 opacity-20" />
            <p className="text-sm">Nessun accessorio collegato.</p>
            <p className="text-xs mt-1 opacity-50">Cerca qui sopra per aggiungerne uno.</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {accessories.map((acc, idx) => {
            const accItem = inventory.find(i => i.id === acc.itemId) || localInventory.find(i => i.id === acc.itemId);
            const accName = accItem ? accItem.name : 'Caricamento...';
            return (
            <div key={idx} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800/50 group">
                <div className="flex-1 min-w-0 pr-2">
                    <div className="text-sm text-slate-200 truncate">{accName}</div>
                    <div className="text-xs text-slate-500">Accessorio collegato</div>
                </div>
                <div className="flex items-center gap-2">
                    <input type="number" min="1" className="w-10 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white text-xs outline-none focus:border-blue-500" value={acc.quantity} onChange={(e) => updateAccessoryQuantity(acc.itemId, parseInt(e.target.value))} />
                    <button onClick={() => removeAccessory(acc.itemId)} className="text-slate-600 hover:text-rose-500 p-1"><X size={14} /></button>
                </div>
            </div>
            );
        })}
      </div>
    );
  };
  
  const renderAccessorySearch = () => (
    <div className="space-y-1">
      {searchResults.length > 0 ? (
        searchResults.map(item => (
          <button key={item.id} onClick={() => addAccessory(item)} className="w-full text-left p-2 hover:bg-blue-900/20 border border-transparent hover:border-blue-500/30 rounded-lg flex justify-between items-center group transition-colors">
            <div className="min-w-0">
              <div className="text-sm text-slate-200 truncate font-medium group-hover:text-blue-300">{item.name}</div>
              <div className="text-xs text-slate-500">{item.category}</div>
            </div>
            <Plus size={16} className="text-slate-600 group-hover:text-blue-400" />
          </button>
        ))
      ) : (
        <div className="text-center py-8">
            <p className="text-sm text-slate-500 mb-2">Nessun risultato per "{accessorySearch}"</p>
            {onCreateAccessory && (
              <button onClick={openQuickCreate} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full inline-flex items-center gap-1">
                  <Plus size={12} /> Crea "{accessorySearch}"
              </button>
            )}
        </div>
      )}
    </div>
  );

  const renderQuickCreateForm = () => (
    <Modal isOpen={isQuickCreateOpen} onClose={() => setIsQuickCreateOpen(false)} title="Nuovo Accessorio" size="lg">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome</label>
          <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none" value={quickForm.name} onChange={e => setQuickForm({...quickForm, name: e.target.value})} placeholder="Es. Gancio Aliscaf" autoFocus />
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
            <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-right" value={quickForm.inStock} onChange={e => setQuickForm({...quickForm, inStock: parseInt(e.target.value) || 0})} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Peso (kg)</label>
            <input type="number" step="0.01" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none" value={quickWeightInput} onChange={e => handleNumericInputChange(e, setQuickWeightInput, 'weight', setQuickForm)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Consumo (W)</label>
            <input type="number" step="1" min="0" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none" value={quickPowerInput} onChange={e => handleNumericInputChange(e, setQuickPowerInput, 'powerConsumption', setQuickForm)} placeholder="0 se non elettrico" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
          <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none h-20 resize-none" value={quickForm.description} onChange={e => setQuickForm({...quickForm, description: e.target.value})} placeholder="Dettagli aggiuntivi..." />
        </div>
      </div>
      <div className="flex flex-col-reverse md:flex-row justify-end gap-3 pt-6 border-t border-slate-800 mt-4">
        <button onClick={() => setIsQuickCreateOpen(false)} className="w-full md:w-auto px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-center font-medium">Annulla</button>
        <button onClick={handleCreateAndAddAccessory} disabled={!quickForm.name} className="w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-colors shadow-lg shadow-blue-900/20 text-center">Crea Accessorio</button>
      </div>
    </Modal>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl" hideCloseButton={true}>
      <div className="flex flex-col lg:flex-row gap-6 relative">
        <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="space-y-1 md:col-span-6">
                    <div className="h-6 flex items-center">
                        <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Nome Materiale *</label>
                    </div>
                    <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none placeholder-slate-700" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Es. Lettore DJ - Pioneer - CDJ-2000" autoFocus />
                </div>
                <div className="space-y-1 md:col-span-3">
                    <div className="h-6 flex items-center justify-between">
                        <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Codice Prod.</label>
                        <span className="text-[10px] text-slate-500 font-mono">No Stampa</span>
                    </div>
                    <input 
                      type="text" 
                      maxLength={20}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none placeholder-slate-700 font-mono text-sm" 
                      value={formData.productCode || ''} 
                      onChange={e => setFormData({...formData, productCode: e.target.value})} 
                      placeholder="Es. 067" 
                    />
                </div>
                <div className="space-y-1 md:col-span-3">
                    <div className="h-6 flex items-center justify-between">
                        <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">QR Code Prod.</label>
                        {formData.qrCode && (
                            <div className="flex items-center gap-0.5">
                                <button 
                                    type="button" 
                                    onClick={() => setIsCodePreviewOpen(true)} 
                                    className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Visualizza Codice a Barre e QR Code"
                                >
                                    <Eye size={15} />
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => printBarcode(formData.qrCode!, formData.name || '')} 
                                    className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Stampa Codice a Barre"
                                >
                                    <Barcode size={15} />
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => printQRCode(formData.qrCode!, formData.name || '')} 
                                    className="p-1 text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Stampa QR Code"
                                >
                                    <QrCode size={15} />
                                </button>
                            </div>
                        )}
                    </div>
                    <input 
                      type="text" 
                      maxLength={20}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-purple-300 font-bold focus:border-purple-500 outline-none placeholder-slate-700 font-mono text-sm" 
                      value={formData.qrCode || ''} 
                      onChange={e => setFormData({...formData, qrCode: e.target.value})} 
                      placeholder="Es. 1006821" 
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Categoria</label>
                    <select 
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" 
                      value={formData.category} 
                      onChange={e => setFormData({ ...formData, category: e.target.value as Category })}
                    >
                        {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Stock Totale</label>
                    <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-right" value={formData.inStock} onChange={e => setFormData({...formData, inStock: parseInt(e.target.value) || 0})} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Peso (kg)</label>
                    <input type="number" step="0.01" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={weightInput} onChange={e => handleNumericInputChange(e, setWeightInput, 'weight', setFormData)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Consumo (W)</label>
                    <input type="number" step="1" min="0" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" value={powerInput} onChange={e => handleNumericInputChange(e, setPowerInput, 'powerConsumption', setFormData)} placeholder="0 se non elettrico" />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Descrizione</label>
                <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none h-24 resize-none placeholder-slate-700" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Note e specifiche tecniche..." />
            </div>
        </div>

        <div className="hidden lg:block w-px bg-slate-800" />

        <div className="w-full lg:w-[400px] flex flex-col h-[500px] lg:h-auto">
            <div className="mb-3">
                <h3 className="font-bold text-white flex items-center gap-2"><Link size={16} className="text-blue-500" /> Accessori Predefiniti</h3>
                <p className="text-xs text-slate-500 mt-1 leading-snug">Oggetti aggiunti automaticamente in lista quando selezioni questo articolo (es. Cavi, Ganci).</p>
            </div>
            <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                    <input type="text" placeholder="Cerca accessorio nell'inventario..." className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500 placeholder-slate-600" value={accessorySearch} onChange={(e) => setAccessorySearch(e.target.value)} />
                </div>
                {onCreateAccessory && (
                    <button onClick={openQuickCreate} className="bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 rounded-lg w-10 flex items-center justify-center transition-colors" title="Crea nuovo accessorio se non esiste">
                        <Plus size={20} />
                    </button>
                )}
            </div>
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 overflow-y-auto custom-scrollbar relative min-h-[220px]">
                {accessorySearch ? renderAccessorySearch() : renderAccessoryList()}
            </div>
        </div>
      </div>

      <div className="flex flex-col-reverse md:flex-row justify-between items-stretch md:items-center pt-6 border-t border-slate-800 mt-2 gap-4">
        <div className="flex flex-col md:flex-row gap-2 flex-wrap">
            <button 
                onClick={() => setIsDocumentsOpen(true)}
                className={`flex items-center justify-center gap-2 p-3 md:px-4 md:py-2 w-full md:w-auto rounded-lg transition-colors ${formData.documents && formData.documents.length > 0 ? 'bg-blue-900/20 text-blue-400 border border-blue-900/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-blue-400'}`}
                title="Gestisci documenti e file collegati (Google Drive, OneDrive, PDF, schede tecniche)"
            >
                <FileText size={18} />
                <span className="text-sm font-bold uppercase tracking-wider">Documenti & File {formData.documents && formData.documents.length > 0 ? `(${formData.documents.length})` : ''}</span>
            </button>
            <button 
                onClick={() => setIsRemindersOpen(true)}
                className={`flex items-center justify-center gap-2 p-3 md:px-4 md:py-2 w-full md:w-auto rounded-lg transition-colors ${formData.reminders && formData.reminders.length > 0 ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-900/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-yellow-400'}`}
            >
                <Lightbulb size={18} className={formData.reminders && formData.reminders.length > 0 ? 'fill-current' : ''} />
                <span className="text-sm font-bold uppercase tracking-wider">Promemoria {formData.reminders && formData.reminders.length > 0 ? `(${formData.reminders.length})` : ''}</span>
            </button>
            <button 
                onClick={openInstancesModal}
                className={`flex items-center justify-center gap-2 p-3 md:px-4 md:py-2 w-full md:w-auto rounded-lg transition-colors ${formData.instances && formData.instances.length > 0 ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-900/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-emerald-400'}`}
            >
                <Barcode size={18} />
                <span className="text-sm font-bold uppercase tracking-wider">Seriali {formData.instances && formData.instances.length > 0 ? `(${formData.instances.length})` : ''}</span>
            </button>
        </div>
        <div className="flex gap-2 flex-col md:flex-row w-full md:w-auto">
            <button onClick={onClose} className="w-full md:w-auto px-4 py-3 md:py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-center font-medium">Annulla</button>
            <button onClick={handleSubmit} disabled={!formData.name} className="w-full md:w-auto px-6 py-3 md:py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors shadow-lg shadow-blue-900/20 text-center">Salva Materiale</button>
        </div>
      </div>

      {renderQuickCreateForm()}

      {/* DOCUMENTS MODAL */}
      <Modal isOpen={isDocumentsOpen} onClose={() => setIsDocumentsOpen(false)} title="Documenti & File Materiale" size="lg">
            <div className="space-y-4">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-start gap-3">
                    <FileText size={20} className="text-blue-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-slate-400">
                        Inserisci link a file archiviati su <strong>Google Drive, OneDrive, Dropbox</strong> o server aziendale (PDF, schede tecniche, Excel, DOCX, manuali).
                        Se lasci vuoto il nome, verrà usato direttamente l'indirizzo del link.
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <div className="flex-1 space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nome</label>
                        <input 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none text-sm placeholder-slate-600"
                            placeholder="Es. Manuale Tecnico, Scheda..."
                            value={docNameInput}
                            onChange={e => setDocNameInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addDocument()}
                        />
                    </div>
                    <div className="flex-[1.5] space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Link Esterno / Drive (URL) *</label>
                        <input 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-blue-300 focus:border-blue-500 outline-none text-sm placeholder-slate-600 font-mono"
                            placeholder="https://drive.google.com/file/d/..."
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
                            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-1.5 text-sm transition-all shadow-md shadow-blue-900/30"
                        >
                            <Plus size={16}/> Aggiungi
                        </button>
                    </div>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                    {formData.documents?.map((doc) => {
                        const displayName = doc.name && doc.name.trim() ? doc.name.trim() : doc.url;
                        return (
                            <div key={doc.id} className="flex justify-between items-center bg-slate-800/80 p-3 rounded-lg border border-slate-700/80 group hover:border-slate-600 transition-colors">
                                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                                    <FileText size={18} className="text-blue-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-white truncate">{displayName}</div>
                                        <div className="text-xs text-slate-500 font-mono truncate">{doc.url}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                        type="button"
                                        onClick={() => openDocumentInBrowser(doc.url)} 
                                        className="px-2.5 py-1.5 bg-slate-700 hover:bg-blue-600 text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                        title="Apri e visualizza nel browser"
                                    >
                                        <Eye size={14} />
                                        <span>Apri</span>
                                        <ExternalLink size={12} className="opacity-70" />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => removeDocument(doc.id)} 
                                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                                        title="Rimuovi documento"
                                    >
                                        <X size={16}/>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {(!formData.documents || formData.documents.length === 0) && (
                        <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
                            <FileText size={32} className="opacity-20" />
                            <span>Nessun documento o link collegato</span>
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2">
                    <button type="button" onClick={() => setIsDocumentsOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors">Chiudi</button>
                </div>
            </div>
      </Modal>

      {/* REMINDERS MODAL */}
      <Modal isOpen={isRemindersOpen} onClose={() => setIsRemindersOpen(false)} title="Promemoria Oggetto" size="md">
            <div className="space-y-4">
                <p className="text-sm text-slate-400">Aggiungi note importanti che verranno mostrate quando userai questo oggetto.</p>
                <div className="flex gap-2">
                    <input 
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:border-yellow-500 outline-none"
                        placeholder="Es. Controllare lo stato..."
                        value={reminderInput}
                        onChange={e => setReminderInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addReminder()}
                        autoFocus
                    />
                    <button onClick={addReminder} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded flex items-center gap-2">
                        <Plus size={18}/> Aggiungi
                    </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar bg-slate-900 p-2 rounded border border-slate-800">
                    {formData.reminders?.map((rem, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-800 p-3 rounded border border-slate-700">
                            <div className="flex items-center gap-3">
                                <Lightbulb size={16} className="text-yellow-500 shrink-0" />
                                <span className="text-sm text-slate-200">{rem}</span>
                            </div>
                            <button onClick={() => removeReminder(idx)} className="text-slate-500 hover:text-rose-500 transition-colors"><X size={18}/></button>
                        </div>
                    ))}
                    {(!formData.reminders || formData.reminders.length === 0) && (
                        <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
                            <Lightbulb size={32} className="opacity-20" />
                            <span>Nessun promemoria attivo</span>
                        </div>
                    )}
                </div>
                <div className="flex justify-end pt-2">
                    <button onClick={() => setIsRemindersOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded">Chiudi</button>
                </div>
            </div>
      </Modal>

      {/* INSTANCES MODAL */}
      <Modal isOpen={isInstancesOpen} onClose={cancelInstancesModal} title="Gestione Codici e Seriali" size="lg" hideCloseButton={true}>
            <div className="space-y-4">
                <p className="text-sm text-slate-400">Gestisci i singoli pezzi/seriali del materiale. Il <strong>Codice Univoco / QR Seriale</strong> è composto da 7 cifre (parte da 1000001 o custom) ed è stampabile come QR Code e Barcode. Il <strong>Serial Number (SN)</strong> è il seriale di fabbrica.</p>
                <div className="flex flex-col gap-2 p-3 bg-slate-900 border border-slate-700 rounded-lg">
                    <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-6 space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Codice Univoco / QR Seriale *</label>
                            <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-purple-300 focus:border-purple-500 outline-none font-mono font-bold text-sm"
                                placeholder="Es. 1000001"
                                maxLength={20}
                                value={instanceIdInput}
                                onChange={e => setInstanceIdInput(e.target.value)}
                            />
                        </div>
                        <div className="col-span-5 space-y-1">
                            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Serial Number (SN)</label>
                            <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none font-mono text-sm"
                                placeholder="Es. SN-89402 (Opz.)"
                                maxLength={20}
                                value={instanceSnInput}
                                onChange={e => setInstanceSnInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addInstance()}
                            />
                        </div>
                        <div className="col-span-1 flex justify-end">
                            <button onClick={addInstance} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center justify-center h-[42px] transition-colors" title="Aggiungi Seriale">
                                <Plus size={18}/> 
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar bg-slate-900 p-2 rounded border border-slate-800">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <div className="col-span-5">Codice Univoco / QR</div>
                        <div className="col-span-4">Serial Number (SN)</div>
                        <div className="col-span-3 text-right">Azioni</div>
                    </div>
                    {tempInstances.map((inst, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-800 p-2 rounded border border-slate-700 font-mono text-sm">
                            {/* CODICE UNIVOCO / QR CELL */}
                            <div className="col-span-5 pr-1">
                                {editingInstanceIndex?.index === idx && editingInstanceIndex?.field === 'id' ? (
                                    <input 
                                        type="text"
                                        autoFocus
                                        maxLength={20}
                                        className="w-full bg-slate-950 border border-purple-500 rounded px-1.5 py-0.5 text-purple-300 font-mono text-xs outline-none font-bold"
                                        value={editingInstanceValue}
                                        onChange={e => setEditingInstanceValue(e.target.value)}
                                        onBlur={saveEditingInstance}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') saveEditingInstance();
                                            else if (e.key === 'Escape') setEditingInstanceIndex(null);
                                        }}
                                    />
                                ) : (
                                    <div 
                                        onClick={() => startEditingInstance(idx, 'id')}
                                        className="text-purple-300 truncate font-bold cursor-pointer hover:underline hover:text-purple-200"
                                        title="Clicca per modificare il codice univoco / QR"
                                    >
                                        {inst.id}
                                    </div>
                                )}
                            </div>

                            {/* S/N CELL */}
                            <div className="col-span-4 pr-1">
                                {editingInstanceIndex?.index === idx && editingInstanceIndex?.field === 'serialNumber' ? (
                                    <input 
                                        type="text"
                                        autoFocus
                                        maxLength={20}
                                        className="w-full bg-slate-950 border border-blue-500 rounded px-1.5 py-0.5 text-white font-mono text-xs outline-none"
                                        value={editingInstanceValue}
                                        onChange={e => setEditingInstanceValue(e.target.value)}
                                        onBlur={saveEditingInstance}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') saveEditingInstance();
                                            else if (e.key === 'Escape') setEditingInstanceIndex(null);
                                        }}
                                        placeholder="Vuoto"
                                    />
                                ) : (
                                    <div 
                                        onClick={() => startEditingInstance(idx, 'serialNumber')}
                                        className={`truncate cursor-pointer hover:underline ${inst.serialNumber ? 'text-slate-300 hover:text-white' : 'text-slate-500 italic text-xs'}`}
                                        title="Clicca per modificare il Serial Number"
                                    >
                                        {inst.serialNumber || 'Nessun SN'}
                                    </div>
                                )}
                            </div>

                            {/* ACTIONS */}
                            <div className="col-span-3 flex items-center justify-end gap-1">
                                <button 
                                  type="button"
                                  onClick={() => printBarcode(inst.id, `${formData.name || 'Articolo'} (${inst.id})`)} 
                                  title="Stampa Barcode Seriale"
                                  className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded transition-colors"
                                >
                                  <Barcode size={14} />
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => printQRCode(inst.id, `${formData.name || 'Articolo'} (${inst.id})`)} 
                                  title="Stampa QR Code Seriale"
                                  className="p-1 text-slate-400 hover:text-purple-400 hover:bg-slate-700 rounded transition-colors"
                                >
                                  <QrCode size={14} />
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => removeInstance(idx)} 
                                  title="Rimuovi Seriale"
                                  className="text-slate-500 hover:text-rose-500 hover:bg-slate-700 transition-colors p-1 rounded"
                                >
                                  <X size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {(!tempInstances || tempInstances.length === 0) && (
                        <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
                            <Barcode size={32} className="opacity-20" />
                            <span>Nessun seriale registrato</span>
                        </div>
                    )}
                </div>
                <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-800">
                    <button 
                        type="button" 
                        onClick={cancelInstancesModal} 
                        className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors font-medium text-sm"
                    >
                        Annulla
                    </button>
                    <button 
                        type="button" 
                        onClick={saveInstancesModal} 
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-900/30 text-sm active:scale-95"
                    >
                        Salva
                    </button>
                </div>
            </div>
      </Modal>

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
};
