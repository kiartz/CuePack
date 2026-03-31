import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-6xl',
    full: 'max-w-full h-full',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className={`bg-slate-900 border border-slate-700 sm:rounded-xl shadow-2xl w-full ${sizeClasses[size]} ${size === 'full' ? 'h-full pt-[env(safe-area-inset-top)]' : 'max-h-[95vh]'} flex flex-col overflow-hidden`}>
        <div className={`flex justify-between items-center ${size === 'full' ? 'p-4 border-b border-slate-800' : 'p-6 border-b border-slate-700'} bg-slate-900/50 backdrop-blur-md`}>
          <h2 className={`font-bold text-white truncate pr-4 ${size === 'full' ? 'text-sm uppercase tracking-wider text-slate-400' : 'text-xl'}`}>
            {title}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors shrink-0">
            <X size={size === 'full' ? 20 : 24} />
          </button>
        </div>
        <div className={`flex-1 overflow-y-auto custom-scrollbar ${size === 'full' ? 'p-0' : 'p-6'}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
