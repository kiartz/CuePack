import React, { useState, useEffect } from 'react';
import { PackingList } from '../types';
import { Modal } from './Modal';
import { MapPin, Calendar } from 'lucide-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<PackingList>) => void;
  initialData?: Partial<PackingList>;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData = {} 
}) => {
  const [formData, setFormData] = useState<Partial<PackingList>>(initialData);

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData);
    }
  }, [isOpen, initialData]);

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={formData.id ? "Modifica Evento" : "Nuovo Evento"} size="lg">
        <div className="space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar pr-2">
            
            {/* INFORMAZIONI GENERALI */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 pb-2">Informazioni Generali</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-full">
                        <label className="block text-sm font-medium text-slate-400 mb-1">Nome Evento</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Es. Concerto Estivo 2024"
                            value={formData.eventName || ''}
                            onChange={e => setFormData(prev => ({ ...prev, eventName: e.target.value }))}
                            autoFocus
                        />
                    </div>
                    <div className="col-span-full">
                        <label className="block text-sm font-medium text-slate-400 mb-1">Location / Luogo</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-2.5 text-slate-500" size={18} />
                            <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                                placeholder="Es. Teatro Comunale, Roma"
                                value={formData.location || ''}
                                onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Cliente Finale</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Nome del cliente"
                            value={formData.customer || ''}
                            onChange={e => setFormData(prev => ({ ...prev, customer: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Azienda Allestitore</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Es. Service Audio Luci SRL"
                            value={formData.setupCompany || ''}
                            onChange={e => setFormData(prev => ({ ...prev, setupCompany: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Responsabile Esecutivo</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Nome del responsabile"
                            value={formData.executiveManager || ''}
                            onChange={e => setFormData(prev => ({ ...prev, executiveManager: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Autore Disegno Tecnico</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Nome del disegnatore"
                            value={formData.designAuthor || ''}
                            onChange={e => setFormData(prev => ({ ...prev, designAuthor: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Link Disegno Tecnico</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                            placeholder="Es. Link GDrive o Dropbox"
                            value={formData.technicalDrawingLink || ''}
                            onChange={e => setFormData(prev => ({ ...prev, technicalDrawingLink: e.target.value }))}
                        />
                    </div>
                </div>
            </div>

            {/* LOGISTICA DATE E TRASPORTI */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 pb-2">Logistica e Tempistiche</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Data Carico (Magazzino)</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                            <DatePicker 
                                portalId="root"
                                selected={formData.truckLoadDate ? new Date(formData.truckLoadDate) : null} 
                                onChange={(date) => setFormData(prev => ({ ...prev, truckLoadDate: date ? date.toISOString() : '' }))} 
                                dateFormat="dd/MM/yyyy"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                                placeholderText="Data carico..."
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Data Inizio Montaggio</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                            <DatePicker 
                                portalId="root"
                                selected={formData.setupDate ? new Date(formData.setupDate) : null} 
                                onChange={(date) => setFormData(prev => ({ ...prev, setupDate: date ? date.toISOString() : '' }))} 
                                dateFormat="dd/MM/yyyy"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                                placeholderText="Data montaggio..."
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Data Inizio Evento</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                            <DatePicker 
                                portalId="root"
                                selected={formData.eventDate ? new Date(formData.eventDate) : null} 
                                onChange={(date) => setFormData(prev => ({ ...prev, eventDate: date ? date.toISOString() : '' }))} 
                                dateFormat="dd/MM/yyyy"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                                placeholderText="Data inizio..."
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Data Fine Evento</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                            <DatePicker 
                                portalId="root"
                                selected={formData.endDate ? new Date(formData.endDate) : null} 
                                onChange={(date) => setFormData(prev => ({ ...prev, endDate: date ? date.toISOString() : '' }))} 
                                dateFormat="dd/MM/yyyy"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                                placeholderText="Data fine..."
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Data Smontaggio</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                            <DatePicker 
                                portalId="root"
                                selected={formData.teardownDate ? new Date(formData.teardownDate) : null} 
                                onChange={(date) => setFormData(prev => ({ ...prev, teardownDate: date ? date.toISOString() : '' }))} 
                                dateFormat="dd/MM/yyyy"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                                placeholderText="Data smontaggio..."
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Data Rientro (Magazzino)</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 z-10 pointer-events-none" size={18} />
                            <DatePicker 
                                portalId="root"
                                selected={formData.returnDate ? new Date(formData.returnDate) : null} 
                                onChange={(date) => setFormData(prev => ({ ...prev, returnDate: date ? date.toISOString() : '' }))} 
                                dateFormat="dd/MM/yyyy"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-white focus:border-emerald-500 outline-none"
                                placeholderText="Data rientro..."
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                   <label className="block text-sm font-medium text-slate-400 mb-1">Giorni Extra o Viaggio</label>
                   <p className="text-[10px] text-slate-500 mb-2">Un elenco di altre date (es. viaggi o pause) da visualizzare nel calendario</p>
                   {/* Per semplicità, li inseriamo con un text field CSV o array */}
                   <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                        placeholder="AAAA-MM-GG, AAAA-MM-GG"
                        value={formData.extraDays ? formData.extraDays.join(', ') : ''}
                        onChange={e => setFormData(prev => ({ 
                            ...prev, 
                            extraDays: e.target.value.split(',').map(s => s.trim()).filter(s => s.match(/^\d{4}-\d{2}-\d{2}$/)) 
                        }))}
                    />
                </div>
            </div>

            {/* PERSONALE E HOTEL */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 pb-2">Personale e Hotel</h3>
                
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Hotel</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 outline-none"
                        placeholder="Nome Hotel o link indicazioni"
                        value={formData.hotel || ''}
                        onChange={e => setFormData(prev => ({ ...prev, hotel: e.target.value }))}
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-400">Personale e Pass</label>
                        <button 
                            type="button"
                            onClick={() => {
                                const current = formData.personnelPasses || [];
                                setFormData(p => ({...p, personnelPasses: [...current, { name: '', link: '' }]}));
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-xs px-2 py-1 rounded text-slate-300"
                        >
                            + Aggiungi Persona
                        </button>
                    </div>
                    {(!formData.personnelPasses || formData.personnelPasses.length === 0) ? (
                        <p className="text-xs text-slate-600 italic">Nessun personale aggiunto</p>
                    ) : (
                        <div className="space-y-3">
                            {formData.personnelPasses.map((pInfo, i) => (
                                <div key={i} className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                                    <div className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">Nome</label>
                                            <input 
                                                type="text" 
                                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white"
                                                placeholder="Nome..."
                                                value={pInfo.name}
                                                onChange={(e) => {
                                                    const newPasses = [...(formData.personnelPasses || [])];
                                                    newPasses[i].name = e.target.value;
                                                    setFormData(prev => ({ ...prev, personnelPasses: newPasses }));
                                                }}
                                            />
                                        </div>
                                        <div className="w-1/3">
                                            <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">Settore / Ruolo</label>
                                            <select 
                                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white outline-none"
                                                value={pInfo.role || ''}
                                                onChange={(e) => {
                                                    const newPasses = [...(formData.personnelPasses || [])];
                                                    newPasses[i].role = e.target.value;
                                                    setFormData(prev => ({ ...prev, personnelPasses: newPasses }));
                                                }}
                                            >
                                                <option value="">Seleziona...</option>
                                                <option value="Audio">Audio</option>
                                                <option value="Luci">Luci</option>
                                                <option value="Video">Video</option>
                                                <option value="Strutture">Strutture</option>
                                                <option value="Rigging">Rigging</option>
                                                <option value="Regia">Regia</option>
                                                <option value="Backline">Backline</option>
                                                <option value="Logistic">Logistica</option>
                                                <option value="Driver">Driver</option>
                                                <option value="Custom">Altro / Custom</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <input 
                                                type="text" 
                                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-[11px] text-slate-400"
                                                placeholder={pInfo.role === 'Custom' ? "Specifica ruolo qui..." : "Link al pass documentale..."}
                                                value={pInfo.link || ''}
                                                onChange={(e) => {
                                                    const newPasses = [...(formData.personnelPasses || [])];
                                                    newPasses[i] = { ...newPasses[i], link: e.target.value };
                                                    setFormData(prev => ({ ...prev, personnelPasses: newPasses }));
                                                }}
                                            />
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const newPasses = [...(formData.personnelPasses || [])];
                                                newPasses.splice(i, 1);
                                                setFormData(prev => ({ ...prev, personnelPasses: newPasses }));
                                            }}
                                            className="p-2 text-rose-500 hover:bg-rose-500/20 rounded-lg group transition-colors"
                                            title="Rimuovi"
                                        >
                                            &times; Rimuovi
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Keep backward compatibility with standard personnel text string if needed, or hide it if we use personnelPasses. We'll sync them down the line. */}
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <label className="block text-sm font-medium text-slate-500 mb-1">Annotazioni Personale Libere</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 outline-none"
                            placeholder="Es. Mario Rossi (Audio), Luigi Neri (Luci)"
                            value={formData.personnel ? formData.personnel.join(', ') : ''}
                            onChange={e => setFormData(prev => ({ ...prev, personnel: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center border-t border-slate-800 pt-4 mt-2">
                <div>
                     <label className="block text-xs font-medium text-slate-600 mb-1">Data Creazione</label>
                     <DatePicker 
                        portalId="root"
                        selected={formData.creationDate ? new Date(formData.creationDate) : new Date()} 
                        onChange={(date) => setFormData(prev => ({ ...prev, creationDate: date ? date.toISOString() : '' }))} 
                        dateFormat="dd/MM/yyyy"
                        className="bg-transparent border-none text-slate-500 text-xs focus:outline-none w-24 cursor-pointer hover:text-slate-400"
                     />
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Annulla</button>
                    <button 
                        onClick={handleSave} 
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!formData.eventName}
                    >
                        Salva Evento
                    </button>
                </div>
            </div>
            
        </div>
    </Modal>
  );
};
