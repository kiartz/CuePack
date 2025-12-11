import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, onClose, onConfirm, title, message 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-rose-900/30 rounded-full text-rose-500">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>
        
        <p className="text-slate-300 mb-6 leading-relaxed">{message}</p>
        
        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            Annulla
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium shadow-lg shadow-rose-900/20 transition-all"
          >
            Elimina
          </button>
        </div>
      </div>
    </div>
  );
};