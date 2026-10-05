import React from 'react';
import { Modal } from './Modal';
import { CategoryManager } from './CategoryManager';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesUpdated?: () => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  onCategoriesUpdated
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestione Categorie & Sottocategorie" size="xl">
      <div className="space-y-4">
        <p className="text-xs text-slate-400">
          Personalizza l'albero delle macro-categorie e delle sottocategorie universali per tutti i database. Puoi aggiungere nuove voci e modificare l'ordine di visualizzazione negli elenchi e filtri.
        </p>

        <CategoryManager onCategoriesUpdated={onCategoriesUpdated} />

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            Chiudi & Applica
          </button>
        </div>
      </div>
    </Modal>
  );
};
