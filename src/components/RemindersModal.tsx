import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, Lightbulb, Square, CheckSquare } from 'lucide-react';
import { Reminder } from '../types';

interface RemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
  reminders: Reminder[];
  onUpdate: (reminders: Reminder[]) => void;
  title: string;
}

export const RemindersModal: React.FC<RemindersModalProps> = ({ 
  isOpen, 
  onClose, 
  reminders, 
  onUpdate,
  title 
}) => {
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newNote.trim()) return;
    const newItem: Reminder = {
      id: crypto.randomUUID(),
      text: newNote.trim(),
      isCompleted: false,
      createdAt: new Date().toISOString()
    };
    onUpdate([...reminders, newItem]);
    setNewNote('');
  };

  const handleDelete = (id: string) => {
    if (confirm('Eliminare questa nota?')) {
      onUpdate(reminders.filter(r => r.id !== id));
    }
  };

  const toggleCheck = (id: string) => {
    onUpdate(reminders.map(r => r.id === id ? { ...r, isCompleted: !r.isCompleted } : r));
  };

  const startEdit = (reminder: Reminder) => {
    setEditingId(reminder.id);
    setEditText(reminder.text);
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) return;
    onUpdate(reminders.map(r => r.id === editingId ? { ...r, text: editText.trim() } : r));
    setEditingId(null);
    setEditText('');
  };

  const sortedReminders = [...reminders].sort((a, b) => {
    if (a.isCompleted === b.isCompleted) {
       return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.isCompleted ? 1 : -1;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/50 rounded-t-xl">
           <div className="flex items-center gap-2 text-yellow-500">
              <Lightbulb className="fill-current" size={20} />
              <h3 className="font-bold text-lg text-white">Note & Promemoria</h3>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-full transition-colors">
             <X size={20} />
           </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
          {reminders.length === 0 && (
            <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
               <Lightbulb size={32} className="opacity-20" />
               <p>Nessuna nota presente.</p>
            </div>
          )}

          {sortedReminders.map(reminder => (
            <div 
              key={reminder.id} 
              className={`group flex items-center gap-3 p-3 rounded-lg border transition-all ${reminder.isCompleted ? 'bg-slate-900/50 border-slate-800 opacity-60' : 'bg-slate-800 border-slate-700'}`}
            >
               <button 
                 onClick={() => toggleCheck(reminder.id)}
                 className={`shrink-0 transition-colors ${reminder.isCompleted ? 'text-emerald-500' : 'text-slate-400 hover:text-white'}`}
               >
                 {reminder.isCompleted ? <CheckSquare size={20} /> : <Square size={20} />}
               </button>

               {editingId === reminder.id ? (
                 <div className="flex-1 flex gap-2">
                    <input 
                      type="text" 
                      className="flex-1 bg-slate-950 border border-blue-500 rounded px-2 py-1 text-sm text-white outline-none"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                    />
                    <button onClick={saveEdit} className="p-1 text-emerald-500 hover:bg-slate-700 rounded"><Check size={16} /></button>
                 </div>
               ) : (
                 <span className={`flex-1 text-sm ${reminder.isCompleted ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                    {reminder.text}
                 </span>
               )}

               <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                 {editingId !== reminder.id && !reminder.isCompleted && (
                    <button onClick={() => startEdit(reminder)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded">
                      <Edit2 size={14} />
                    </button>
                 )}
                 <button onClick={() => handleDelete(reminder.id)} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded">
                   <Trash2 size={14} />
                 </button>
               </div>
            </div>
          ))}
        </div>

        {/* Footer Input */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 rounded-b-xl">
           <div className="flex gap-2">
             <input 
               type="text" 
               placeholder="Aggiungi una nota..."
               className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none transition-colors"
               value={newNote}
               onChange={(e) => setNewNote(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
             />
             <button 
               onClick={handleAdd}
               disabled={!newNote.trim()}
               className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg flex items-center gap-1 font-medium transition-colors"
             >
               <Plus size={16} />
               <Lightbulb size={16} className="fill-current" />
             </button>
           </div>
        </div>

      </div>
    </div>
  );
};