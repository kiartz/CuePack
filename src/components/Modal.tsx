import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  hideCloseButton?: boolean;
  asDrawerOnDesktop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md', 
  hideCloseButton = false,
  asDrawerOnDesktop = false
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-6xl',
    full: 'max-w-full h-full',
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`fixed inset-0 z-[100] flex bg-black/80 backdrop-blur-sm transition-all duration-300 ${
        asDrawerOnDesktop
          ? 'items-center justify-center p-0 sm:p-4 lg:items-stretch lg:justify-end lg:p-0'
          : 'items-center justify-center p-0 sm:p-4'
      }`}
    >
      <div 
        className={`bg-slate-900 border border-slate-700 shadow-2xl w-full flex flex-col overflow-hidden transition-all ${
          asDrawerOnDesktop
            ? `sm:rounded-xl ${sizeClasses[size]} ${size === 'full' ? 'h-full pt-[env(safe-area-inset-top)]' : 'max-h-[95vh]'} lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-slate-800 lg:h-full lg:max-h-screen lg:w-[440px] lg:max-w-[480px] lg:animate-in lg:slide-in-from-right lg:duration-300`
            : `sm:rounded-xl ${sizeClasses[size]} ${size === 'full' ? 'h-full pt-[env(safe-area-inset-top)]' : 'max-h-[95vh]'}`
        }`}
      >
        <div 
          className={`flex justify-between items-center ${
            size === 'full' 
              ? 'p-4 border-b border-slate-800' 
              : asDrawerOnDesktop
                ? 'p-5 sm:p-6 lg:px-6 lg:py-5 border-b border-slate-700 lg:border-slate-800'
                : 'p-6 border-b border-slate-700'
          } bg-slate-900/50 backdrop-blur-md shrink-0`}
        >
          <h2 className={`font-bold text-white truncate pr-4 ${size === 'full' ? 'text-sm uppercase tracking-wider text-slate-400' : 'text-lg sm:text-xl'}`}>
            {title}
          </h2>
          {!hideCloseButton && (
            <button 
              type="button"
              onClick={onClose} 
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
              title="Chiudi (Esc)"
            >
              <X size={size === 'full' ? 20 : 22} />
            </button>
          )}
        </div>
        <div className={`flex-1 overflow-y-auto custom-scrollbar flex flex-col ${size === 'full' ? 'p-0' : 'p-5 sm:p-6'}`}>
          {children}
        </div>
      </div>
    </div>
  );
};


