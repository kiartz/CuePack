import React, { useState, useEffect } from 'react';
import { InventoryItem, Category } from '../types';
import { Modal } from './Modal';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Omit<InventoryItem, 'id'>) => void;
  initialData?: InventoryItem | null;
  title: string;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({ isOpen, onClose, onSave, initialData, title }) => {
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    category: Category.AUDIO,
    inStock: 0,
    weight: 0,
    name: '',
    description: ''
  });

  const [weightInput, setWeightInput] = useState('0');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({ ...initialData });
        setWeightInput(initialData.weight?.toString() || '0');
      } else {
        // Reset for new item
        setFormData({ category: Category.AUDIO, inStock: 0, weight: 0, name: '', description: '' });
        setWeightInput('0');
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = () => {
    if (!formData.name) return;

    const parsedWeight = parseFloat(weightInput.replace(',', '.'));
    const finalWeight = isNaN(parsedWeight) ? 0 : parsedWeight;

    onSave({
      name: formData.name!,
      category: formData.category || Category.AUDIO,
      inStock: formData.inStock || 0,
      weight: finalWeight,
      description: formData.description || ''
    });
    
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Nome</label>
          <input 
            type="text" 
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
            value={formData.name || ''}
            onChange={e => setFormData({...formData, name: e.target.value})}
            placeholder="Es. Cavo XLR 10m"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Categoria</label>
            <select 
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value as Category})}
            >
              {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Stock Totale</label>
            <input 
              type="number" 
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
              value={formData.inStock}
              onChange={e => setFormData({...formData, inStock: Number(e.target.value)})}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Peso (kg)</label>
          <input 
            type="text"
            inputMode="decimal"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
            value={weightInput}
            onChange={e => {
              const val = e.target.value;
              if (/^[\d.,]*$/.test(val)) {
                setWeightInput(val);
              }
            }}
            onBlur={() => {
              const parsed = parseFloat(weightInput.replace(',', '.'));
              if (!isNaN(parsed)) {
                  setWeightInput(parsed.toString());
              }
            }}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Descrizione</label>
          <textarea 
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none h-24"
            value={formData.description || ''}
            onChange={e => setFormData({...formData, description: e.target.value})}
          />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white">Annulla</button>
          <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">Salva</button>
        </div>
      </div>
    </Modal>
  );
};