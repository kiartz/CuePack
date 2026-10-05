import React, { useState, useEffect, useRef } from 'react';
import { 
  ElectricalConnectorDefinition, 
  getConnectorDefinitions, 
  addConnector, 
  deleteConnector, 
  reorderConnectors,
  STANDARD_AMPERAGES
} from '../utils/connectors';
import { Plus, Trash2, Zap, Check, Lock, GripVertical } from 'lucide-react';

interface ConnectorManagerProps {
  onConnectorsUpdated?: () => void;
  className?: string;
}

const getTargetInsertIndex = (sourceIndex: number, targetIndex: number, position: 'before' | 'after'): number => {
  if (sourceIndex === targetIndex) return sourceIndex;
  if (sourceIndex < targetIndex) {
    return position === 'after' ? targetIndex : targetIndex - 1;
  } else {
    return position === 'before' ? targetIndex : targetIndex + 1;
  }
};

export const ConnectorManager: React.FC<ConnectorManagerProps> = ({
  onConnectorsUpdated,
  className = ''
}) => {
  const [connectors, setConnectors] = useState<ElectricalConnectorDefinition[]>(getConnectorDefinitions());
  const [isAdding, setIsAdding] = useState(false);
  
  // Form fields for new connector
  const [newName, setNewName] = useState('');
  const [newAmperage, setNewAmperage] = useState('16A');
  const [newPhase, setNewPhase] = useState<'monofase' | 'trifase'>('monofase');

  // Drag and drop state & synchronous refs
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const dropTargetRef = useRef<{ index: number; position: 'before' | 'after' } | null>(null);

  // Sync state if connectors change elsewhere
  useEffect(() => {
    const handleConnectorsUpdated = (e: any) => {
      const updated = e?.detail || getConnectorDefinitions();
      setConnectors(updated);
    };
    window.addEventListener('cuepack_connectors_updated', handleConnectorsUpdated);
    return () => window.removeEventListener('cuepack_connectors_updated', handleConnectorsUpdated);
  }, []);

  const handleAddConnector = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (connectors.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Questo connettore esiste già!');
      return;
    }
    const voltage = newPhase === 'trifase' ? '400V' : '230V';
    const updated = await addConnector(trimmed, newAmperage, newPhase, voltage);
    setConnectors(updated);
    setNewName('');
    setNewAmperage('16A');
    setNewPhase('monofase');
    setIsAdding(false);
    onConnectorsUpdated?.();
  };

  const handleDeleteConnector = async (id: string, name: string) => {
    if (confirm(`Eliminare il connettore personalizzato "${name}"?`)) {
      const updated = await deleteConnector(id);
      setConnectors(updated);
      onConnectorsUpdated?.();
    }
  };

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedIndexRef.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const sourceIdx = draggedIndexRef.current;
    if (sourceIdx === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const isBelow = (e.clientY - rect.top) > (rect.height / 2);
    const position: 'before' | 'after' = isBelow ? 'after' : 'before';

    const targetObj: { index: number; position: 'before' | 'after' } = { index, position };
    dropTargetRef.current = targetObj;

    const finalTarget = getTargetInsertIndex(sourceIdx, index, position);
    if (finalTarget !== sourceIdx) {
      setDropTarget(targetObj);
    } else {
      setDropTarget(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceIdx = draggedIndexRef.current;
    if (sourceIdx === null) {
      setDraggedIndex(null);
      setDropTarget(null);
      return;
    }

    let finalTargetIndex: number;
    if (targetIndex !== undefined) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isBelow = (e.clientY - rect.top) > (rect.height / 2);
      const position: 'before' | 'after' = isBelow ? 'after' : 'before';
      finalTargetIndex = getTargetInsertIndex(sourceIdx, targetIndex, position);
    } else if (dropTargetRef.current) {
      finalTargetIndex = getTargetInsertIndex(
        sourceIdx, 
        dropTargetRef.current.index, 
        dropTargetRef.current.position
      );
    } else {
      finalTargetIndex = connectors.length - 1;
    }

    if (sourceIdx !== finalTargetIndex && finalTargetIndex >= 0 && finalTargetIndex < connectors.length) {
      const updated = await reorderConnectors(sourceIdx, finalTargetIndex);
      setConnectors(updated);
      onConnectorsUpdated?.();
    }

    draggedIndexRef.current = null;
    dropTargetRef.current = null;
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    draggedIndexRef.current = null;
    dropTargetRef.current = null;
    setDraggedIndex(null);
    setDropTarget(null);
  };

  return (
    <div className={`bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col h-[380px] ${className}`}>
      
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap size={14} className="text-yellow-400" />
          Connettori Predefiniti & Standard ({connectors.length})
        </span>
        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="text-[11px] font-semibold text-yellow-400 hover:text-yellow-300 hover:underline flex items-center gap-1"
          title="Aggiungi nuovo connettore"
        >
          <Plus size={13} />
          {isAdding ? 'Annulla' : '+ Nuovo Connettore'}
        </button>
      </div>

      {/* Inline Creation Form */}
      {isAdding && (
        <div className="mb-2 p-2 bg-slate-900 rounded-lg border border-slate-700 space-y-2 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              placeholder="Nome connettore (es. Harting 16P, CEE 16A...)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddConnector()}
              className="sm:col-span-6 bg-slate-950 text-white text-xs px-2.5 py-1.5 rounded-lg outline-none border border-slate-700 focus:border-yellow-500"
              autoFocus
            />
            <select
              value={newPhase}
              onChange={e => setNewPhase(e.target.value as 'monofase' | 'trifase')}
              className="sm:col-span-3 bg-slate-950 text-white text-xs px-2 py-1.5 rounded-lg outline-none border border-slate-700 focus:border-yellow-500"
            >
              <option value="monofase">Monofase (230V)</option>
              <option value="trifase">Pentapolare (400V)</option>
            </select>
            <div className="sm:col-span-3 flex items-center gap-1.5">
              <select
                value={newAmperage}
                onChange={e => setNewAmperage(e.target.value)}
                className="w-full bg-slate-950 text-white text-xs px-2 py-1.5 rounded-lg outline-none border border-slate-700 focus:border-yellow-500 font-mono text-center"
              >
                {STANDARD_AMPERAGES.map(amp => (
                  <option key={amp} value={amp}>{amp}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddConnector}
                disabled={!newName.trim()}
                className="p-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-slate-950 rounded-lg text-xs font-bold transition-colors shrink-0"
                title="Conferma creazione connettore"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connectors Scrollable Drag-and-Move List */}
      <div 
        className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 py-1"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => handleDrop(e)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropTarget(null);
            dropTargetRef.current = null;
          }
        }}
      >
        {connectors.map((conn, idx) => {
          const isBeingDragged = draggedIndex === idx;
          const isMono = conn.phase === 'monofase';

          return (
            <div
              key={conn.id}
              className="relative"
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
            >
              {/* Highlight Line BEFORE */}
              {dropTarget?.index === idx && dropTarget.position === 'before' && (
                <div className="absolute -top-1 left-0 right-0 h-[3px] bg-yellow-400 rounded-full shadow-[0_0_10px_#facc15] ring-1 ring-yellow-300 z-30 pointer-events-none" />
              )}

              <div
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnd={handleDragEnd}
                className={`w-full p-2 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-grab active:cursor-grabbing select-none group ${
                  isBeingDragged
                    ? 'opacity-30 border border-dashed border-yellow-400 bg-slate-900/60'
                    : ''
                }`}
              >
                {/* Grip Handle + Name + Lock */}
                <div className="flex items-center gap-2 min-w-0 pr-2 pointer-events-none select-none">
                  <GripVertical size={13} className="text-slate-600 group-hover:text-slate-400 shrink-0" />
                  {conn.isSystem && (
                    <span title="Connettore standard predefinito (bloccato, trascina per ordinare)">
                      <Lock size={11} className="text-slate-500 shrink-0" />
                    </span>
                  )}
                  <span className="text-slate-200 font-semibold truncate">{conn.name}</span>
                </div>

                {/* Badges & Actions */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  {/* Phase & Voltage Badge */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                    isMono 
                      ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40' 
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                  }`}>
                    {conn.voltage} ({isMono ? 'Mono' : 'Penta'})
                  </span>

                  {/* Amperage Badge */}
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-yellow-400 border border-slate-700">
                    {conn.amperage}
                  </span>

                  {/* System Lock Badge or Custom Delete */}
                  {conn.isSystem ? (
                    <span className="text-[9px] text-slate-500 font-mono px-1 py-0.5 rounded bg-slate-950 border border-slate-800 ml-0.5" title="Connettore base di fabbrica">
                      Base
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDeleteConnector(conn.id, conn.name)}
                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                      title="Elimina connettore personalizzato"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Highlight Line AFTER */}
              {dropTarget?.index === idx && dropTarget.position === 'after' && (
                <div className="absolute -bottom-1 left-0 right-0 h-[3px] bg-yellow-400 rounded-full shadow-[0_0_10px_#facc15] ring-1 ring-yellow-300 z-30 pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
