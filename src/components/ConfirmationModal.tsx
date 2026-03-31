import React from 'react';
import { AlertTriangle, Copy, Rocket } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'primary' | 'success';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, onClose, onConfirm, title, message, confirmText = 'Conferma', variant = 'danger'
}) => {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isSuccess = variant === 'success';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-full ${
            isDanger ? 'bg-rose-900/30 text-rose-500' : 
            isSuccess ? 'bg-emerald-900/30 text-emerald-500' : 
            'bg-blue-900/30 text-blue-500'
          }`}>
            {isDanger ? <AlertTriangle size={24} /> : 
             isSuccess ? <Rocket size={24} /> : 
             <Copy size={24} />}
          </div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>
        
        <p className="text-slate-300 mb-6 leading-relaxed">{message}</p>
        
        <div className="flex flex-col-reverse md:flex-row justify-end gap-3 mt-6">
          <button 
            onClick={onClose}
            className="w-full md:w-auto px-4 py-3 md:py-2 text-slate-400 font-medium hover:text-white hover:bg-slate-800 rounded-lg transition-all text-center"
          >
            Annulla
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={`w-full md:w-auto px-6 py-3 md:py-2 text-white rounded-lg font-bold shadow-lg transition-all text-center ${
              isDanger 
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20' 
                : isSuccess
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};