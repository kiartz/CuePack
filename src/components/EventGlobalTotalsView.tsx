import React, { useState, useMemo } from 'react';
import { 
  Package, Copy, Check, FileDown, Search, Tag
} from 'lucide-react';
import { PackingList, InventoryDatabase } from '../types';
import { flattenComponents, exportTotalsPDF } from '../utils/export';
import { formatItalianDate } from '../utils';
import { isTextMatch } from '../utils/searchUtils';

interface EventGlobalTotalsViewProps {
  event: PackingList;
  databases?: InventoryDatabase[];
  onBackToZones?: () => void;
}

export interface GlobalItemTotal {
  name: string;
  category: string;
  totalQty: number;
  looseQty: number;
  inKitQty: number;
  isTemporary?: boolean;
  zoneBreakdown: { zoneId: string; zoneName: string; quantity: number; looseQty: number; inKitQty: number }[];
  parentKits: string[];
  notes: { zoneName: string; text: string; qty: number }[];
}

const getCategoryColor = (category?: string) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('audio')) return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-950/80 text-blue-300 border-blue-800/80' };
  if (cat.includes('luci') || cat.includes('light')) return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-950/80 text-amber-300 border-amber-800/80' };
  if (cat.includes('video')) return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-950/80 text-purple-300 border-purple-800/80' };
  if (cat.includes('strutt') || cat.includes('truss') || cat.includes('rigging')) return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80' };
  if (cat.includes('cavi') || cat.includes('cabl')) return { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', badge: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80' };
  if (cat.includes('elett') || cat.includes('power')) return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-950/80 text-yellow-300 border-yellow-800/80' };
  return { bg: 'bg-slate-800/40', border: 'border-slate-700/40', text: 'text-slate-300', badge: 'bg-slate-800/80 text-slate-300 border-slate-700/80' };
};

export type SortOption = 'name-asc' | 'name-desc' | 'qty-desc' | 'qty-asc';

export const EventGlobalTotalsView: React.FC<EventGlobalTotalsViewProps> = ({
  event,
  databases = [],
  onBackToZones
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [activeTab, setActiveTab] = useState<'all-items' | 'by-category'>('all-items');
  const [isCopied, setIsCopied] = useState(false);

  // --- AGGREGATION ENGINE ---
  const { 
    allItemsMap, 
    categoriesList, 
    stats 
  } = useMemo(() => {
    const itemsMap = new Map<string, GlobalItemTotal>();
    const categoriesSet = new Set<string>();

    let totalPieceCount = 0;
    let totalKitsCount = 0;
    const zonesSet = new Set<string>();

    if (!event.zones || event.zones.length === 0) {
      return {
        allItemsMap: itemsMap,
        categoriesList: [],
        stats: { totalPieces: 0, uniqueItems: 0, totalKits: 0, totalZones: 0 }
      };
    }

    event.zones.forEach(zone => {
      zonesSet.add(zone.name);

      zone.sections.forEach(section => {
        const flatComps = flattenComponents(section.components);

        flatComps.forEach(comp => {
          const compCategory = comp.category || 'Altro';
          categoriesSet.add(compCategory);

          const isKit = comp.type === 'kit';
          const hasAccessories = !isKit && Array.isArray(comp.contents) && comp.contents.length > 0;

          if (isKit) {
            const kitName = (comp.name || '').trim();
            totalKitsCount += comp.quantity;

            // Kit contents aggregation into allItemsMap
            comp.contents?.forEach(sub => {
              const subName = (sub.name || '').trim();
              if (!subName) return;
              const subCategory = (sub.category || compCategory).trim();
              categoriesSet.add(subCategory);
              const subTotalQty = sub.quantity * comp.quantity;

              if (!itemsMap.has(subName)) {
                itemsMap.set(subName, {
                  name: subName,
                  category: subCategory,
                  totalQty: 0,
                  looseQty: 0,
                  inKitQty: 0,
                  zoneBreakdown: [],
                  parentKits: [],
                  notes: []
                });
              }
              const itemEntry = itemsMap.get(subName)!;
              itemEntry.totalQty += subTotalQty;
              itemEntry.inKitQty += subTotalQty;
              totalPieceCount += subTotalQty;

              if (!itemEntry.parentKits.includes(kitName)) {
                itemEntry.parentKits.push(kitName);
              }

              const existingItemZone = itemEntry.zoneBreakdown.find(z => z.zoneName === zone.name);
              if (existingItemZone) {
                existingItemZone.quantity += subTotalQty;
                existingItemZone.inKitQty += subTotalQty;
              } else {
                itemEntry.zoneBreakdown.push({
                  zoneId: zone.id,
                  zoneName: zone.name,
                  quantity: subTotalQty,
                  looseQty: 0,
                  inKitQty: subTotalQty
                });
              }

              if (sub.prepNote) {
                itemEntry.notes.push({ zoneName: zone.name, text: sub.prepNote, qty: subTotalQty });
              }
            });

          } else {
            // Standalone item & Complex machine
            const itemName = (comp.name || '').trim();
            if (!itemName) return;
            const itemQty = comp.quantity;
            totalPieceCount += itemQty;

            if (!itemsMap.has(itemName)) {
              itemsMap.set(itemName, {
                name: itemName,
                category: compCategory,
                totalQty: 0,
                looseQty: 0,
                inKitQty: 0,
                isTemporary: comp.isTemporary,
                zoneBreakdown: [],
                parentKits: [],
                notes: []
              });
            }
            const itemEntry = itemsMap.get(itemName)!;
            itemEntry.totalQty += itemQty;
            itemEntry.looseQty += itemQty;

            const existingItemZone = itemEntry.zoneBreakdown.find(z => z.zoneName === zone.name);
            if (existingItemZone) {
              existingItemZone.quantity += itemQty;
              existingItemZone.looseQty += itemQty;
            } else {
              itemEntry.zoneBreakdown.push({
                zoneId: zone.id,
                zoneName: zone.name,
                quantity: itemQty,
                looseQty: itemQty,
                inKitQty: 0
              });
            }

            if (comp.notes) {
              itemEntry.notes.push({ zoneName: zone.name, text: comp.notes, qty: itemQty });
            }

            // Accessories if any
            if (hasAccessories) {
              comp.contents?.forEach(acc => {
                const accName = (acc.name || '').trim();
                if (!accName) return;
                const accCategory = (acc.category || compCategory).trim();
                categoriesSet.add(accCategory);
                const accTotalQty = acc.quantity * itemQty;
                totalPieceCount += accTotalQty;

                if (!itemsMap.has(accName)) {
                  itemsMap.set(accName, {
                    name: accName,
                    category: accCategory,
                    totalQty: 0,
                    looseQty: 0,
                    inKitQty: 0,
                    zoneBreakdown: [],
                    parentKits: [],
                    notes: []
                  });
                }
                const accEntry = itemsMap.get(accName)!;
                accEntry.totalQty += accTotalQty;
                accEntry.inKitQty += accTotalQty;

                const parentLabel = `${itemName} (Accessorio)`;
                if (!accEntry.parentKits.includes(parentLabel)) {
                  accEntry.parentKits.push(parentLabel);
                }

                const existingAccZone = accEntry.zoneBreakdown.find(z => z.zoneName === zone.name);
                if (existingAccZone) {
                  existingAccZone.quantity += accTotalQty;
                  existingAccZone.inKitQty += accTotalQty;
                } else {
                  accEntry.zoneBreakdown.push({
                    zoneId: zone.id,
                    zoneName: zone.name,
                    quantity: accTotalQty,
                    looseQty: 0,
                    inKitQty: accTotalQty
                  });
                }

                if (acc.prepNote) {
                  accEntry.notes.push({ zoneName: zone.name, text: acc.prepNote, qty: accTotalQty });
                }
              });
            }
          }
        });
      });
    });

    const sortedCategories = Array.from(categoriesSet).sort((a, b) => a.localeCompare(b));

    return {
      allItemsMap: itemsMap,
      categoriesList: sortedCategories,
      stats: {
        totalPieces: totalPieceCount,
        uniqueItems: itemsMap.size,
        totalKits: totalKitsCount,
        totalZones: zonesSet.size
      }
    };
  }, [event]);

  // Filtered Items for Tab 1 (All Items)
  const filteredAllItems = useMemo(() => {
    const list = Array.from(allItemsMap.values());
    return list.filter(item => {
      if (selectedCategory !== 'All' && item.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
      if (searchTerm.trim()) {
        if (!isTextMatch(item.name, searchTerm)) return false;
      }
      return true;
    }).sort((a, b) => {
      const nameA = a.name.trim();
      const nameB = b.name.trim();
      if (sortBy === 'qty-desc') return b.totalQty - a.totalQty || nameA.localeCompare(nameB, 'it', { sensitivity: 'base', numeric: true });
      if (sortBy === 'qty-asc') return a.totalQty - b.totalQty || nameA.localeCompare(nameB, 'it', { sensitivity: 'base', numeric: true });
      if (sortBy === 'name-desc') return nameB.localeCompare(nameA, 'it', { sensitivity: 'base', numeric: true });
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base', numeric: true });
    });
  }, [allItemsMap, selectedCategory, searchTerm, sortBy]);

  // Grouped by Category for Tab 2
  const itemsByCategory = useMemo(() => {
    const grouped = new Map<string, GlobalItemTotal[]>();
    filteredAllItems.forEach(item => {
      const cat = (item.category || 'Altro').trim();
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(item);
    });
    return Array.from(grouped.entries()).sort((a, b) => a[0].trim().localeCompare(b[0].trim(), 'it', { sensitivity: 'base' }));
  }, [filteredAllItems]);

  // Copy plain text list
  const handleCopyList = () => {
    const lines: string[] = [
      `TOTALI MATERIALI: ${event.eventName.toUpperCase()}`,
      `Data Evento: ${formatItalianDate(event.eventDate)}`,
      `Location: ${event.location || 'N/D'}`,
      `Pezzi Totali: ${stats.totalPieces} | Articoli Distinti: ${stats.uniqueItems}`,
      `Zone Sommate: ${event.zones?.map(z => z.name).join(', ') || 'Nessuna'}`,
      '----------------------------------------',
      ''
    ];

    filteredAllItems.forEach(item => {
      const zonesStr = item.zoneBreakdown.map(z => `${z.zoneName}: ${z.quantity}`).join(', ');
      lines.push(`• ${item.name} - TOTALE: x${item.totalQty} [${zonesStr}]`);
      if (item.notes.length > 0) {
        item.notes.forEach(n => lines.push(`   ↳ Nota (${n.zoneName}): ${n.text}`));
      }
    });

    navigator.clipboard.writeText(lines.join('\n'));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-text animate-in fade-in duration-200">
      
      {/* COMPACT TOP BAR: Stats (PC/Tablet only, hidden on mobile) + Actions */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-2 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          
          {/* Numbers Bar (Visible on PC & Tablet, hidden on mobile) */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">Pezzi:</span>
              <strong className="text-indigo-400 font-mono">{stats.totalPieces}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">Articoli:</span>
              <strong className="text-cyan-400 font-mono">{stats.uniqueItems}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">Kit:</span>
              <strong className="text-purple-400 font-mono">{stats.totalKits}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">Zone:</span>
              <strong className="text-emerald-400 font-mono">{stats.totalZones}</strong>
            </span>
          </div>

          {/* Actions: Copia & PDF Totali */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <button
              type="button"
              onClick={handleCopyList}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 active:scale-95"
              title="Copia elenco formattato per messaggio o nota"
            >
              {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{isCopied ? 'Copiato!' : 'Copia'}</span>
            </button>
            <button
              type="button"
              onClick={() => exportTotalsPDF(event)}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 text-xs font-bold transition-colors flex items-center gap-1.5 active:scale-95 shadow-sm shadow-indigo-600/30"
              title="Esporta PDF Totali"
            >
              <FileDown size={14} />
              <span>PDF Totali</span>
            </button>
          </div>

        </div>
      </div>

      {/* FILTER BAR & TABS */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-3 sm:px-4 py-2 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          
          {/* Sub-Tabs: Conta Totale & Per Categoria */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('all-items')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'all-items' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package size={14} />
              <span>Conta Totale ({filteredAllItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('by-category')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'by-category' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tag size={14} />
              <span>Per Categoria</span>
            </button>
          </div>

          {/* Search + Category Filter */}
          <div className="flex items-center gap-2 flex-1 md:justify-end">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                placeholder="Cerca nome materiale..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-8 pr-7 py-1.5 rounded-lg outline-none focus:border-indigo-500 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="relative shrink-0">
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg outline-none focus:border-indigo-500 cursor-pointer font-medium"
              >
                <option value="All">Tutte le Categorie ({categoriesList.length})</option>
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg outline-none focus:border-indigo-500 cursor-pointer font-medium"
                title="Ordina per"
              >
                <option value="name-asc">Nome (A → Z)</option>
                <option value="name-desc">Nome (Z → A)</option>
                <option value="qty-desc">Quantità (Max → Min)</option>
                <option value="qty-asc">Quantità (Min → Max)</option>
              </select>
            </div>
          </div>

        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-4">
        <div className="max-w-7xl mx-auto">

          {/* TAB 1: ALL ITEMS (COMPACT LIST WITHOUT BOXES) */}
          {activeTab === 'all-items' && (
            <div>
              {filteredAllItems.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/30 border border-slate-800 rounded-xl text-slate-500 text-xs">
                  <Package className="mx-auto mb-2 opacity-30" size={36} />
                  Nessun materiale trovato per i criteri di ricerca selezionati.
                </div>
              ) : (
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden divide-y divide-slate-800/50">
                  {filteredAllItems.map((item, idx) => {
                    const color = getCategoryColor(item.category);
                    return (
                      <div
                        key={`${item.name}-${idx}`}
                        className="py-2 px-3 sm:px-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between gap-3 text-xs"
                      >
                        {/* Item Name + Zone Breakdown Inline */}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-white truncate">
                              {item.name}
                            </span>
                            {item.category && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${color.badge}`}>
                                {item.category}
                              </span>
                            )}
                            {item.isTemporary && (
                              <span className="text-[9px] font-extrabold uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Temp
                              </span>
                            )}
                          </div>

                          {/* Zone breakdown & details inline */}
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                            {item.zoneBreakdown.map(zb => (
                              <span
                                key={zb.zoneId}
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-950/80 border border-slate-800/70 text-slate-300"
                              >
                                <span>{zb.zoneName}:</span>
                                <strong className="text-indigo-300">{zb.quantity}</strong>
                              </span>
                            ))}
                            {item.parentKits.length > 0 && (
                              <span className="text-purple-400 text-[10px]">
                                (Incluso in: {item.parentKits.join(', ')}{item.looseQty > 0 ? ` + ${item.looseQty} sfusi` : ''})
                              </span>
                            )}
                            {item.notes.length > 0 && (
                              <span className="text-amber-400/90 text-[10px] italic">
                                [{item.notes.map(n => `${n.zoneName}: "${n.text}"`).join('; ')}]
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Total Count Badge */}
                        <div className="shrink-0 text-right">
                          <span className="font-mono font-black text-base sm:text-lg text-indigo-400">
                            x{item.totalQty}
                          </span>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GROUPED BY CATEGORY (COMPACT LIST WITHOUT BOXES) */}
          {activeTab === 'by-category' && (
            <div className="space-y-3">
              {itemsByCategory.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/30 border border-slate-800 rounded-xl text-slate-500 text-xs">
                  Nessun materiale trovato.
                </div>
              ) : (
                itemsByCategory.map(([catName, items]) => {
                  const color = getCategoryColor(catName);
                  const totalCatPieces = items.reduce((sum, it) => sum + it.totalQty, 0);

                  return (
                    <div key={catName} className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
                      <div className={`px-3 py-1.5 border-b flex items-center justify-between ${color.bg} ${color.border}`}>
                        <div className="flex items-center gap-2">
                          <Tag size={14} className={color.text} />
                          <h3 className={`text-xs font-black uppercase tracking-wider ${color.text}`}>
                            {catName}
                          </h3>
                          <span className="text-[11px] text-slate-400 font-medium">({items.length} articoli)</span>
                        </div>
                        <span className="text-xs font-bold font-mono text-white bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                          Totale: {totalCatPieces}
                        </span>
                      </div>

                      <div className="divide-y divide-slate-800/40">
                        {items.map(item => (
                          <div key={item.name} className="py-1.5 px-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0 flex-1">
                              <span className="text-xs sm:text-sm font-bold text-white block truncate">{item.name}</span>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[11px] text-slate-400">
                                {item.zoneBreakdown.map(zb => (
                                  <span key={zb.zoneId} className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-950/80 border border-slate-800/70 text-slate-300">
                                    <span>{zb.zoneName}:</span>
                                    <strong className="text-indigo-300">{zb.quantity}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className="font-mono font-black text-sm sm:text-base text-indigo-400 shrink-0">
                              x{item.totalQty}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
};
