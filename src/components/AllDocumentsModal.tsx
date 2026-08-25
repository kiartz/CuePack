import React, { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { InventoryItem, ItemDocument, Category } from '../types';
import { FileText, Search, ExternalLink, Filter, Layers, Eye } from 'lucide-react';
import { openDocumentInBrowser } from '../utils/documentViewer';

interface AllDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  onOpenItemModal?: (item: InventoryItem) => void;
}

interface DocumentRow {
  doc: ItemDocument;
  item: InventoryItem;
}

export const AllDocumentsModal: React.FC<AllDocumentsModalProps> = ({
  isOpen,
  onClose,
  items,
  onOpenItemModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Flatten all documents with their parent item
  const allDocs = useMemo<DocumentRow[]>(() => {
    const list: DocumentRow[] = [];
    (items || []).forEach(item => {
      if (item.documents && Array.isArray(item.documents) && item.documents.length > 0) {
        item.documents.forEach(doc => {
          if (doc.url && doc.url.trim()) {
            list.push({ doc, item });
          }
        });
      }
    });
    return list;
  }, [items]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return allDocs.filter(({ doc, item }) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!search) return true;
      const docName = (doc.name || '').toLowerCase();
      const docUrl = (doc.url || '').toLowerCase();
      const itemName = (item.name || '').toLowerCase();
      const prodCode = (item.productCode || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();

      return docName.includes(search) || 
             docUrl.includes(search) || 
             itemName.includes(search) || 
             prodCode.includes(search) || 
             cat.includes(search);
    });
  }, [allDocs, searchTerm, selectedCategory]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Documenti & File Materiale (Drive / Cloud)"
      size="xl"
    >
      <div className="space-y-4 text-slate-200">
        {/* Header Description */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-950/70 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
              <FileText size={22} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">Archivio Documenti Materiale</h4>
              <p className="text-xs text-slate-400">
                Tutti i link e schede tecniche dei materiali (PDF, schede Excel, manuali, DOCX) consultabili online senza download.
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs bg-blue-900/30 text-blue-300 border border-blue-800/40 px-2.5 py-1 rounded-lg font-bold font-mono">
              {allDocs.length} {allDocs.length === 1 ? 'documento' : 'documenti'}
            </span>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Cerca per nome file, materiale, link o codice..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none placeholder-slate-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <select
                className="bg-slate-950 border border-slate-700 text-slate-300 pl-8 pr-8 py-2 rounded-lg text-xs appearance-none outline-none focus:border-blue-500 font-medium"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="All">Tutte le Categorie</option>
                {Object.values(Category).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Documents Table / Grid */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-[55vh] overflow-y-auto custom-scrollbar">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-16 px-4 text-slate-500 flex flex-col items-center gap-3">
              <FileText size={36} className="opacity-30" />
              {allDocs.length === 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-400">Nessun documento inserito nel materiale.</p>
                  <p className="text-xs text-slate-500 mt-1">Puoi aggiungere link a file (PDF, Excel, Word, Drive) modificando qualsiasi articolo.</p>
                </div>
              ) : (
                <p className="text-sm">Nessun documento corrisponde ai filtri di ricerca.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {filteredDocs.map(({ doc, item }) => {
                const displayName = (doc.name && doc.name.trim()) ? doc.name.trim() : doc.url;
                
                return (
                  <div 
                    key={doc.id}
                    className="p-3.5 hover:bg-slate-900/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-sm text-white truncate">{displayName}</h5>
                          {doc.name && doc.name.trim() && (
                            <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px] hidden md:inline">
                              {doc.url}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
                          <span className="flex items-center gap-1 text-slate-300 font-medium truncate">
                            <Layers size={13} className="text-slate-500 shrink-0" />
                            {item.name}
                          </span>
                          {item.productCode && (
                            <span className="bg-blue-950/60 text-blue-400 border border-blue-900/40 px-1.5 py-0.2 rounded font-mono text-[11px]">
                              #{item.productCode}
                            </span>
                          )}
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400">{item.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {onOpenItemModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenItemModal(item);
                          }}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                          title="Modifica articolo nell'inventario"
                        >
                          Scheda Materiale
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openDocumentInBrowser(doc.url)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-900/30 flex items-center gap-1.5 active:scale-95"
                        title="Apri documento nel browser"
                      >
                        <Eye size={14} />
                        <span>Visualizza</span>
                        <ExternalLink size={12} className="opacity-70" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2">
          <p className="text-[11px] text-slate-500">
            I file vengono visualizzati direttamente tramite il viewer del tuo browser o Google Drive / OneDrive.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
};
