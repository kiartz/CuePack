import * as XLSX from 'xlsx';
import { Category, InventoryItem, ItemInstance } from '../types';
import { DEFAULT_CATEGORY_DEFINITIONS } from './categories';

export interface ParsedRentmanItem extends InventoryItem {
  rentmanId?: string; // Rentman ID interno (colonna BD)
  rawStockCalculationMethod?: string;
  rawFolder?: string;
}

export interface RentmanParseResult {
  items: ParsedRentmanItem[];
  totalRows: number;
  totalItems: number;
  serializedItemsCount: number;
  bulkItemsCount: number;
  totalInstancesCount: number;
  unmappedCategories: string[];
  warnings: string[];
}

/**
 * Maps Rentman folder / path to CuePack Category and Subcategory.
 */
export function mapFolderToCategory(folder?: string): { category: Category; subcategory: string } {
  const cleanFolder = (folder || '').trim();
  if (!cleanFolder) {
    return { category: Category.OTHER, subcategory: '' };
  }

  // 1. Direct match with standard subcategories in CuePack
  for (const catDef of DEFAULT_CATEGORY_DEFINITIONS) {
    for (const sub of catDef.subcategories) {
      if (sub.toLowerCase() === cleanFolder.toLowerCase()) {
        return { category: catDef.name as Category, subcategory: cleanFolder };
      }
    }
  }

  // 2. Keyword heuristic for common AV & Event terminology
  const lower = cleanFolder.toLowerCase();
  if (
    lower.includes('audio') ||
    lower.includes('microfon') ||
    lower.includes('diffusor') ||
    lower.includes('mixer') ||
    lower.includes('cassa') ||
    lower.includes('sub') ||
    lower.includes('monitor audio') ||
    lower.includes('stagebox') ||
    lower.includes('amplificator') ||
    lower.includes('lettori')
  ) {
    return { category: Category.AUDIO, subcategory: cleanFolder };
  }

  if (
    lower.includes('luce') ||
    lower.includes('luci') ||
    lower.includes('dmx') ||
    lower.includes('led') ||
    lower.includes('spot') ||
    lower.includes('wash') ||
    lower.includes('fari') ||
    lower.includes('laser') ||
    lower.includes('fumo') ||
    lower.includes('nebbia') ||
    lower.includes('co2')
  ) {
    return { category: Category.LIGHTS, subcategory: cleanFolder };
  }

  if (
    lower.includes('video') ||
    lower.includes('ledwall') ||
    lower.includes('scherm') ||
    lower.includes('monitor') ||
    lower.includes('hdmi') ||
    lower.includes('sdi') ||
    lower.includes('proiettor') ||
    lower.includes('telecamer') ||
    lower.includes('broadcast') ||
    lower.includes('splitter')
  ) {
    return { category: Category.VIDEO, subcategory: cleanFolder };
  }

  if (
    lower.includes('cavo') ||
    lower.includes('cavi') ||
    lower.includes('spina') ||
    lower.includes('prese') ||
    lower.includes('alimentaz') ||
    lower.includes('quadro') ||
    lower.includes('prolung')
  ) {
    return { category: Category.CABLES, subcategory: cleanFolder };
  }

  if (
    lower.includes('struttur') ||
    lower.includes('truss') ||
    lower.includes('american') ||
    lower.includes('flightcase') ||
    lower.includes('case') ||
    lower.includes('baule') ||
    lower.includes('bauli') ||
    lower.includes('stativo') ||
    lower.includes('pedan') ||
    lower.includes('palco') ||
    lower.includes('cover')
  ) {
    return { category: Category.STRUCTURE, subcategory: cleanFolder };
  }

  if (
    lower.includes('regia') ||
    lower.includes('network') ||
    lower.includes('switch') ||
    lower.includes('router') ||
    lower.includes('intercom') ||
    lower.includes('consolle') ||
    lower.includes('tablet')
  ) {
    return { category: Category.REGIA, subcategory: cleanFolder };
  }

  if (
    lower.includes('attrezz') ||
    lower.includes('utensil') ||
    lower.includes('misur') ||
    lower.includes('avvitator') ||
    lower.includes('scala') ||
    lower.includes('periferiche')
  ) {
    return { category: Category.TOOLS, subcategory: cleanFolder };
  }

  return { category: Category.OTHER, subcategory: cleanFolder };
}

/**
 * Safely parses Excel dates (both serial numbers and standard date strings) into YYYY-MM-DD.
 */
export function parseExcelDate(val: any): string | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  
  if (typeof val === 'number') {
    // Excel base date: Dec 30, 1899
    const utcDays = Math.floor(val - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    const num = parseFloat(trimmed);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const utcDays = Math.floor(num - 25569);
      const date = new Date(utcDays * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    // Check ISO or standard formats
    if (trimmed.includes('-')) {
      const isoPart = trimmed.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) {
        return isoPart;
      }
    }
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }

  return undefined;
}

/**
 * Parses numbers with comma/dot decimal handling and fallback.
 */
export function parseNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Normalize header text for resilient matching.
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[\s\-_()[\]/\\.,;:'"]/g, '')
    .trim();
}

/**
 * Header dictionary with aliases for Rentman columns (both English and Italian).
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  name: [
    'nameindatabase',
    'nomeindatabase',
    'name',
    'nome',
    'descrizione',
    'equipmentname',
    'nomeattrezzatura'
  ],
  code: [
    'code',
    'codice',
    'productcode',
    'codiceprodotto',
    'articolo'
  ],
  qrCode: [
    'qrcodesrfid',
    'codiciqrrfid',
    'qrcode',
    'codiceqr',
    'barcode',
    'codiceabarre'
  ],
  alias: [
    'alias',
    'nomebreve',
    'shortname'
  ],
  folder: [
    'folderfolder',
    'cartellacartella',
    'folder',
    'cartella',
    'sottocategoria',
    'subcategory'
  ],
  inStock: [
    'currentquantity',
    'quantitaattuale',
    'quantitàattuale',
    'totalstockperstocklocationposizionepredefinitadellescorte',
    'totalstockperstocklocation',
    'instock',
    'giacenza',
    'stock'
  ],
  location: [
    'locationindefaultstocklocation',
    'posizionenellaposizionepredefinitadellescorte',
    'locationinwarehouseperstocklocationposizionepredefinitadellescorte',
    'location',
    'posizione',
    'ubicazione'
  ],
  height: ['height', 'altezza'],
  width: ['width', 'larghezza'],
  length: ['length', 'lunghezza'],
  volume: ['transportvolume', 'volumeditrasporto', 'volume'],
  packedPer: ['packedper', 'imballatoper', 'pezziperimballo'],
  weight: ['weight', 'peso', 'pesonetto'],
  power: ['power', 'potenza', 'consumo'],
  current: ['current', 'corrente', 'amperaggio'],
  rentalPrice: ['rentalsalesprice', 'prezzodinoleggiovendita', 'rentalprice', 'prezzonoleggio', 'prezzolistino'],
  subrentalCost: ['subrentpurchasecost', 'costodisubnoleggioacquisto', 'subrentcost', 'costosubnoleggio'],
  purchasePrice: ['purchasepriceserialnumber', 'prezzodiacquistonumerodiserie', 'purchaseprice', 'prezzoacquisto'],
  stockCalculationMethod: ['stockcalculationmethod', 'metododicalcolodellescorte'],
  typeOfEquipment: ['typeofequipment', 'tipodiattrezzatura'],
  rentalSales: ['rentalsales', 'noleggiovendita'],
  canHaveContent: ['theequipmentcanhavecontent', 'lattrezzaturapuoaverecontenuto', 'lattrezzaturapuòaverecontenuto'],
  internalRemark: ['internalremark', 'notainterna', 'commentointerno'],
  externalRemark: ['externalremark', 'notaesterna', 'commentoesterno'],
  rentmanId: ['id'],
  // Serial instance specific columns
  instanceQrCode: ['qrcodesrfidserialnumber', 'codiciqrrfidnumerodiserie', 'qrcodeserialnumber'],
  instanceSerialNumber: ['manufacturerserialnumberserialnumber', 'numerodiseriedelproduttorenumerodiserie', 'serialnumber', 'numerodiserie'],
  instanceInternalRef: ['internalreferenceserialnumber', 'riferimentointernonumerodiserie', 'internalreference', 'riferimentointerno'],
  instancePurchaseDate: ['dateofpurchaseserialnumber', 'datadiacquisitonumerodiserie', 'dateofpurchase', 'datadiacquisto'],
  instanceActive: ['activeserialnumber', 'attivonumerodiserie', 'active', 'attivo'],
  instanceRemark: ['remarkserialnumber', 'notanumerodiserie', 'commentonumerodiserie'],
  instanceId: ['idserialnumber', 'idnumerodiserie']
};

/**
 * Builds an index map resolving standard field names to row array indexes.
 */
function buildHeaderIndexMap(headerRow: string[]): Record<string, number> {
  const normalizedHeaders = headerRow.map((h, idx) => ({
    norm: normalizeHeader(String(h || '')),
    idx
  }));

  const indexMap: Record<string, number> = {};

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const match = normalizedHeaders.find(h => h.norm === alias);
      if (match !== undefined) {
        indexMap[field] = match.idx;
        break;
      }
    }
  }

  return indexMap;
}

/**
 * Core parsing function for Rentman Excel WorkBook.
 */
export function parseRentmanWorkbook(
  workbook: XLSX.WorkBook,
  targetDatabaseId: string = 'default'
): RentmanParseResult {
  const warnings: string[] = [];
  const unmappedCategoriesSet = new Set<string>();

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Il file Excel non contiene fogli di lavoro validi.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawRows.length < 2) {
    throw new Error('Il foglio di lavoro selezionato è vuoto o contiene solo le intestazioni.');
  }

  const headerRow = rawRows[0] as string[];
  const colIndex = buildHeaderIndexMap(headerRow);

  // Validate critical header: name
  if (colIndex.name === undefined) {
    throw new Error(
      "Colonna del nome attrezzatura non trovata. Verificare che il file contenga 'Name (in database)' o 'Nome'."
    );
  }

  const getVal = (row: any[], field: string): any => {
    const idx = colIndex[field];
    if (idx === undefined || idx >= row.length) return '';
    return row[idx];
  };

  const itemsMap = new Map<string, ParsedRentmanItem>();
  let totalInstancesCount = 0;

  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex++) {
    const row = rawRows[rowIndex];
    const name = String(getVal(row, 'name') || '').trim();
    if (!name) continue; // Skip blank rows

    const code = String(getVal(row, 'code') || '').trim();
    const qrCode = String(getVal(row, 'qrCode') || '').trim();
    const rentmanId = String(getVal(row, 'rentmanId') || '').trim();

    // Grouping key: QR Code > Product Code > Rentman ID > Item Name
    const groupKey = qrCode || code || (rentmanId ? `rentman_${rentmanId}` : name);

    const folder = String(getVal(row, 'folder') || '').trim();
    const { category, subcategory } = mapFolderToCategory(folder);
    if (category === Category.OTHER && folder && !unmappedCategoriesSet.has(folder)) {
      unmappedCategoriesSet.add(folder);
    }

    const rawStockCalc = String(getVal(row, 'stockCalculationMethod') || '').trim();
    const isMethodSerialized =
      rawStockCalc.toLowerCase() === 'serialized' || rawStockCalc.toLowerCase() === 'serializzato';

    // Instance details in current row
    const sn = String(getVal(row, 'instanceSerialNumber') || '').trim();
    const snQr = String(getVal(row, 'instanceQrCode') || '').trim();
    const snId = String(getVal(row, 'instanceId') || '').trim();
    const snActiveRaw = getVal(row, 'instanceActive');
    const snInternalRef = String(getVal(row, 'instanceInternalRef') || '').trim();
    const snPurchaseDateRaw = getVal(row, 'instancePurchaseDate');
    const snRemark = String(getVal(row, 'instanceRemark') || '').trim();

    const hasInstanceData = Boolean(sn || snQr || snId);

    let existing = itemsMap.get(groupKey);

    if (!existing) {
      const rawQty = parseNumber(getVal(row, 'inStock'), 0);
      const location = String(getVal(row, 'location') || '').trim();
      const alias = String(getVal(row, 'alias') || '').trim();

      const height = parseNumber(getVal(row, 'height'), 0);
      const width = parseNumber(getVal(row, 'width'), 0);
      const length = parseNumber(getVal(row, 'length'), 0);
      const volume = parseNumber(getVal(row, 'volume'), 0);
      const packedPer = parseNumber(getVal(row, 'packedPer'), 1);

      const weight = parseNumber(getVal(row, 'weight'), 0);
      const power = parseNumber(getVal(row, 'power'), 0);
      const current = parseNumber(getVal(row, 'current'), 0);

      const rentalPrice = parseNumber(getVal(row, 'rentalPrice'), 0);
      const subrentalCost = parseNumber(getVal(row, 'subrentalCost'), 0);
      const purchasePrice = parseNumber(getVal(row, 'purchasePrice'), 0);

      const internalRemark = String(getVal(row, 'internalRemark') || '').trim();
      const externalRemark = String(getVal(row, 'externalRemark') || '').trim();
      const canHaveContent = String(getVal(row, 'canHaveContent') || '').trim() === '1';
      const rentalSaleType =
        String(getVal(row, 'rentalSales') || '').toLowerCase() === 'sales' ? 'sale' : 'rental';

      existing = {
        id: groupKey,
        databaseId: targetDatabaseId,
        rentmanId: rentmanId || undefined,
        rawStockCalculationMethod: rawStockCalc || undefined,
        rawFolder: folder || undefined,
        name,
        productCode: code || undefined,
        qrCode: qrCode || undefined,
        category,
        subcategory: subcategory || undefined,
        folder: folder || undefined,
        alias: alias || undefined,
        location: location || undefined,
        stockType: isMethodSerialized ? 'serialized' : 'bulk',
        inStock: rawQty,
        weight: weight > 0 ? weight : undefined,
        dimensions: (height > 0 || width > 0 || length > 0) ? { height, width, length } : undefined,
        volume: volume > 0 ? volume : undefined,
        packedPer: packedPer > 1 ? packedPer : undefined,
        powerConsumption: power > 0 ? power : undefined,
        current: current > 0 ? current : undefined,
        rentalPrice: rentalPrice > 0 ? rentalPrice : undefined,
        subrentalCost: subrentalCost > 0 ? subrentalCost : undefined,
        purchasePrice: purchasePrice > 0 ? purchasePrice : undefined,
        rentalSaleType,
        canHaveContent,
        internalRemark: internalRemark || undefined,
        externalRemark: externalRemark || undefined,
        instances: []
      };

      itemsMap.set(groupKey, existing);
    }

    if (hasInstanceData) {
      totalInstancesCount++;
      existing.stockType = 'serialized';

      // Active status in Rentman: 1 / true / '' -> active, 0 / false -> inactive
      const isActive =
        snActiveRaw === '' || snActiveRaw === undefined || snActiveRaw === null
          ? true
          : snActiveRaw === 1 ||
            snActiveRaw === '1' ||
            snActiveRaw === true ||
            String(snActiveRaw).toLowerCase() === 'true';

      const instanceId =
        snQr ||
        (snId ? `rm_${snId}` : (sn ? `sn_${sn}` : `inst_${rowIndex}_${Math.random().toString(36).substring(2, 6)}`));

      const instance: ItemInstance = {
        id: instanceId,
        serialNumber: sn || undefined,
        internalReference: snInternalRef || undefined,
        purchaseDate: parseExcelDate(snPurchaseDateRaw),
        active: isActive,
        notes: snRemark || undefined
      };

      existing.instances = existing.instances || [];
      existing.instances.push(instance);
    }
  }

  // Final pass: synchronize inStock for serialized items with instances
  let serializedCount = 0;
  let bulkCount = 0;

  for (const item of itemsMap.values()) {
    if (item.stockType === 'serialized') {
      serializedCount++;
      if (item.instances && item.instances.length > 0) {
        const activeInstances = item.instances.filter(i => i.active !== false).length;
        item.inStock = activeInstances;
      }
    } else {
      bulkCount++;
    }
  }

  return {
    items: Array.from(itemsMap.values()),
    totalRows: rawRows.length - 1,
    totalItems: itemsMap.size,
    serializedItemsCount: serializedCount,
    bulkItemsCount: bulkCount,
    totalInstancesCount,
    unmappedCategories: Array.from(unmappedCategoriesSet),
    warnings
  };
}

/**
 * High-level parser that accepts browser File, ArrayBuffer, or Uint8Array.
 */
export async function parseRentmanFile(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  targetDatabaseId: string = 'default'
): Promise<RentmanParseResult> {
  let data: any;

  if (typeof (fileOrBuffer as File).arrayBuffer === 'function') {
    data = await (fileOrBuffer as File).arrayBuffer();
  } else if (fileOrBuffer instanceof ArrayBuffer || fileOrBuffer instanceof Uint8Array) {
    data = fileOrBuffer;
  } else {
    throw new Error('Tipo di file non supportato. Passare un oggetto File o ArrayBuffer.');
  }

  const workbook = XLSX.read(data, {
    type: data instanceof ArrayBuffer ? 'array' : 'buffer',
    cellDates: false
  });
  return parseRentmanWorkbook(workbook, targetDatabaseId);
}
