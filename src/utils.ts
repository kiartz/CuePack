// Fallback sicura per la generazione di ID unici (utile su dispositivi vecchi o connessioni HTTP senza HTTPS)
export const generateId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    
    // Fallback pseudo-randomico
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10) + '-' + Math.random().toString(36).substring(2, 10);
};

/**
 * Strips 'undefined' values recursively from an object to prevent Firestore errors.
 */
export const cleanData = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(item => cleanData(item));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => [key, cleanData(value)])
    );
  }
  return obj;
};

/**
 * Formats a date string or Date object into Italian format (DD/MM/YYYY).
 * Handles ISO timestamps (e.g. 2026-10-18T22:00:00.000Z), YYYY-MM-DD, or DD/MM/YYYY safely.
 */
export const formatItalianDate = (dStr?: string | Date | null): string => {
  if (!dStr) return '-- / -- / ----';
  if (dStr instanceof Date) {
    return isNaN(dStr.getTime())
      ? '-- / -- / ----'
      : dStr.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  const trimmed = typeof dStr === 'string' ? dStr.trim() : String(dStr);
  if (!trimmed) return '-- / -- / ----';

  // Already Italian format (DD/MM/YYYY)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // Simple YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // ISO or general parseable date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return trimmed;
};

