export interface DbColorDefinition {
  id: string;
  label: string;
  badge: string;
  dot: string;
}

export const DB_COLORS: DbColorDefinition[] = [
  { id: 'emerald', label: 'Smeraldo', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-400' },
  { id: 'blue', label: 'Blu', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40', dot: 'bg-blue-400' },
  { id: 'purple', label: 'Viola', badge: 'bg-purple-500/20 text-purple-400 border-purple-500/40', dot: 'bg-purple-400' },
  { id: 'amber', label: 'Ambra', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40', dot: 'bg-amber-400' },
  { id: 'rose', label: 'Rosa / Rosso', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40', dot: 'bg-rose-400' },
  { id: 'cyan', label: 'Ciano', badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40', dot: 'bg-cyan-400' },
  { id: 'indigo', label: 'Indaco', badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40', dot: 'bg-indigo-400' },
  { id: 'slate', label: 'Grigio', badge: 'bg-slate-700/50 text-slate-300 border-slate-600', dot: 'bg-slate-400' },
];

export const getDbBadgeStyle = (color?: string): string => {
  const found = DB_COLORS.find(c => c.id === color);
  return found ? found.badge : 'bg-slate-800 text-slate-300 border-slate-700';
};

export const getDbDotColor = (color?: string): string => {
  const found = DB_COLORS.find(c => c.id === color);
  return found ? found.dot : 'bg-slate-400';
};
