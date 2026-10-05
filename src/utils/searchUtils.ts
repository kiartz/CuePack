/**
 * Search Utilities for CuePack Manager
 * 
 * Provides unified, intelligent search with:
 * - Equivalence of commas and periods (e.g., 2,5m <-> 2.5m <-> 2.5mt)
 * - Accent/diacritic insensitivity (e.g., perche <-> perché)
 * - Multi-token matching in any order (e.g., "infiled 1.9" matches "Mattonella Ledwall Flex Infiled 50x50 cm P 1.9")
 * - Smart numeric relevance scoring (e.g., searching "cavo xlr 5" prioritizes "5mt" over "2,5mt" or "50mt")
 */

export interface SearchableItemFields {
  name?: string;
  category?: string;
  subcategory?: string;
  folder?: string;
  alias?: string;
  location?: string;
  description?: string;
  productCode?: string;
  instances?: Array<{ id?: string; serialNumber?: string; internalReference?: string }>;
}

/**
 * Normalizes text for search:
 * - lowercase
 * - strips diacritics/accents
 * - unifies decimal commas into periods (e.g. "2,5" -> "2.5")
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/(\d+),(\d+)/g, '$1.$2'); // unify decimal comma to dot
}

/**
 * Splits query string into individual clean search tokens.
 */
export function tokenizeQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

/**
 * Extracts searchable tokens from a text, including word tokens,
 * numeric sub-tokens (e.g. "50x50" -> ["50x50", "50"]),
 * letter+number tokens (e.g. "pl2.5" -> ["pl2.5", "pl", "2.5"]),
 * and measurement tokens (e.g. "5mt" -> ["5mt", "5"], "2.5m" -> ["2.5m", "2.5"]).
 */
export function extractTextTokens(text: string): string[] {
  const norm = normalizeSearchText(text);
  if (!norm) return [];

  // Split on word delimiters: spaces, dashes, slashes, parens, brackets, underscores, etc.
  const rawTokens = norm.split(/[\s\-_/()[\]{}|:;]+/);
  const tokenSet = new Set<string>();

  for (const raw of rawTokens) {
    if (!raw) continue;
    tokenSet.add(raw);

    // If token is like "50x50" or "50x50cm"
    if (raw.includes('x')) {
      const parts = raw.split('x').map(p => p.trim()).filter(Boolean);
      parts.forEach(p => tokenSet.add(p));
    }

    // If token has letters followed by numbers e.g. "pl2.5" -> "pl", "2.5"
    const letterNumMatch = raw.match(/^([a-z]+)(\d+(?:\.\d+)?)$/);
    if (letterNumMatch) {
      tokenSet.add(letterNumMatch[1]);
      tokenSet.add(letterNumMatch[2]);
    }

    // If token has numbers followed by letters e.g. "3p" -> "3", "p"
    const numLetterMatch = raw.match(/^(\d+(?:\.\d+)?)([a-z]+)$/);
    if (numLetterMatch) {
      tokenSet.add(numLetterMatch[1]);
      tokenSet.add(numLetterMatch[2]);
    }

    // If token has number followed by unit e.g. "5mt", "5m", "50cm", "100w" -> "5", "50", "100"
    const numUnitMatch = raw.match(/^(\d+(?:\.\d+)?)(mt|m|cm|mm|mmq|kg|w|a|p|v|hz|deg|°)?$/);
    if (numUnitMatch && numUnitMatch[2]) {
      tokenSet.add(numUnitMatch[1]); // e.g. "5"
    }
  }

  return Array.from(tokenSet);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasBoundaryMatch(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  const escaped = escapeRegex(phrase);
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i');
  return regex.test(text);
}

/**
 * Checks if a specific query token matches an item's combined text or tokens.
 */
function matchSingleToken(
  token: string, 
  combinedNorm: string, 
  nameTokens: string[], 
  nameNorm: string
): boolean {
  if (combinedNorm.includes(token)) return true;
  if (nameTokens.includes(token)) return true;

  // Handle unit equivalences: e.g. "5m" vs "5mt", "2.5m" vs "2.5mt"
  if (token.endsWith('m') && !token.endsWith('mm')) {
    const base = token.slice(0, -1);
    if (combinedNorm.includes(base + 'mt') || combinedNorm.includes(base + ' mt')) return true;
  }
  if (token.endsWith('mt')) {
    const base = token.slice(0, -2);
    if (combinedNorm.includes(base + 'm') || combinedNorm.includes(base + ' m')) return true;
  }

  // Handle number without unit matching token with unit: e.g. "5" matching "5mt" or "5m"
  if (/^\d+(\.\d+)?$/.test(token)) {
    if (nameTokens.some(nt => nt.startsWith(token) && /^[a-z°]+$/.test(nt.slice(token.length)))) {
      return true;
    }
    // Check if token matches with space e.g. "p 1.9" or "5 mt"
    if (nameNorm.includes(' ' + token) || nameNorm.startsWith(token)) return true;
  }

  return false;
}

/**
 * Returns true if ALL query tokens are present in the item.
 */
export function matchesSearch(item: SearchableItemFields, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;

  const nameNorm = normalizeSearchText(item.name || '');
  const catNorm = normalizeSearchText(item.category || '');
  const subcatNorm = normalizeSearchText(item.subcategory || item.folder || '');
  const aliasNorm = normalizeSearchText(item.alias || '');
  const locNorm = normalizeSearchText(item.location || '');
  const descNorm = normalizeSearchText(item.description || '');
  const pcodeNorm = normalizeSearchText(item.productCode || '');
  const icodesNorm = (item.instances || [])
    .map(i => `${i.id || ''} ${i.serialNumber || ''} ${i.internalReference || ''}`)
    .map(normalizeSearchText)
    .join(' ');

  const combinedNorm = `${nameNorm} ${catNorm} ${subcatNorm} ${aliasNorm} ${locNorm} ${descNorm} ${pcodeNorm} ${icodesNorm}`;
  const nameTokens = extractTextTokens(item.name || '');

  return tokens.every(token => matchSingleToken(token, combinedNorm, nameTokens, nameNorm));
}

/**
 * Scores an item against search tokens.
 * Higher score = higher relevance.
 * Returns -1 if it doesn't match all tokens.
 */
export function scoreSearchMatch(
  item: SearchableItemFields, 
  tokens: string[], 
  rawQuery?: string
): number {
  if (tokens.length === 0) return 1;

  const nameNorm = normalizeSearchText(item.name || '');
  const catNorm = normalizeSearchText(item.category || '');
  const subcatNorm = normalizeSearchText(item.subcategory || item.folder || '');
  const aliasNorm = normalizeSearchText(item.alias || '');
  const locNorm = normalizeSearchText(item.location || '');
  const descNorm = normalizeSearchText(item.description || '');
  const pcodeNorm = normalizeSearchText(item.productCode || '');
  const icodesNorm = (item.instances || [])
    .map(i => `${i.id || ''} ${i.serialNumber || ''} ${i.internalReference || ''}`)
    .map(normalizeSearchText)
    .join(' ');

  const combinedNorm = `${nameNorm} ${catNorm} ${subcatNorm} ${aliasNorm} ${locNorm} ${descNorm} ${pcodeNorm} ${icodesNorm}`;
  const nameTokens = extractTextTokens(item.name || '');

  // 1. Strict filter: all tokens must be present
  const allMatch = tokens.every(token => matchSingleToken(token, combinedNorm, nameTokens, nameNorm));
  if (!allMatch) return -1;

  let score = 0;
  const queryNorm = rawQuery ? normalizeSearchText(rawQuery).trim() : tokens.join(' ');

  // Direct full-name match bonuses
  if (nameNorm === queryNorm) {
    score += 50000;
  } else if (hasBoundaryMatch(nameNorm, queryNorm)) {
    score += 18000;
  } else if (nameNorm.includes(queryNorm)) {
    // If followed by digit (e.g. "1.9" in "1.95"), lower bonus
    const idx = nameNorm.indexOf(queryNorm) + queryNorm.length;
    const nextChar = nameNorm[idx] || '';
    if (/[0-9]/.test(nextChar)) {
      score += 500;
    } else {
      score += 8000;
    }
  }

  for (const token of tokens) {
    const isTokenNumber = /^\d+(\.\d+)?$/.test(token);

    // Exact token match in name
    if (nameTokens.includes(token)) {
      score += isTokenNumber ? 10000 : 8000;
    }
    // Unit match: e.g. query "5" matches "5mt" or "5m", query "5m" matches "5mt"
    else if (nameTokens.some(nt => {
      if (token.endsWith('m') && !token.endsWith('mm')) {
        const base = token.slice(0, -1);
        return nt === base + 'mt' || nt === base + 'm';
      }
      if (token.endsWith('mt')) {
        const base = token.slice(0, -2);
        return nt === base + 'm' || nt === base + 'mt';
      }
      if (isTokenNumber) {
        return nt.startsWith(token) && /^[a-z°]+$/.test(nt.slice(token.length));
      }
      return false;
    })) {
      score += 9000;
    }
    // Prefix match
    else if (nameTokens.some(nt => nt.startsWith(token))) {
      if (isTokenNumber) {
        // e.g. token "5" vs "50" or "50mt" -> it's a different number!
        score += 300;
      } else {
        // e.g. token "inf" vs "infiled"
        score += 5000;
      }
    }
    // Substring match in name
    else if (nameNorm.includes(token)) {
      if (isTokenNumber) {
        // e.g. token "5" inside "2.5mt" or "15mt"
        score += 100;
      } else {
        score += 1500;
      }
    }

    // Alias matches
    if (aliasNorm === token) score += 6000;
    else if (aliasNorm.includes(token)) score += 2000;

    // Product code match
    if (pcodeNorm === token) score += 12000;
    else if (pcodeNorm.includes(token)) score += 4000;

    // Serial code match
    if (icodesNorm.includes(token)) score += 4500;

    // Subcategory / Category match
    if (subcatNorm.includes(token)) score += 500;
    if (catNorm.includes(token)) score += 250;

    // Location / Description match
    if (locNorm.includes(token)) score += 100;
    if (descNorm.includes(token)) score += 50;
  }

  // Slight length penalty to favor concise direct matches
  score -= (nameNorm.length * 0.1);

  return score;
}

/**
 * Searches and sorts an array of items by relevance.
 */
export function searchAndSortItems<T extends SearchableItemFields>(
  items: T[], 
  query: string
): T[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return items;

  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const score = scoreSearchMatch(item, tokens, query);
    if (score > -1) {
      scored.push({ item, score });
    }
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.item.name || '').localeCompare(b.item.name || '');
    })
    .map(x => x.item);
}

/**
 * Simple helper to check if a single string matches a query (for simple text/name checks).
 */
export function isTextMatch(text: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;

  const norm = normalizeSearchText(text);
  const nameTokens = extractTextTokens(text);

  return tokens.every(token => matchSingleToken(token, norm, nameTokens, norm));
}
