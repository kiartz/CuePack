/**
 * Share & Deep Linking Utilities for CuePack Manager
 */

export type ShareViewType = 'lists' | 'prep-material';

/**
 * Builds the complete absolute URL for sharing an event view.
 * Uses window.location.origin + window.location.pathname with query parameters.
 */
export function getShareUrl(view: ShareViewType, listId: string): string {
  if (typeof window === 'undefined') return '';
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const searchParams = new URLSearchParams();
  searchParams.set('view', view);
  searchParams.set('listId', listId);
  return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * Copies given text to clipboard using the Modern Clipboard API with fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Try standard navigator.clipboard
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, using fallback:', err);
    }
  }

  // Fallback for older browsers or restricted mobile webviews
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy command failed:', err);
    return false;
  }
}

/**
 * Parses query params or hash from current window location.
 */
export function getShareUrlParams(): { view?: ShareViewType; listId?: string } | null {
  if (typeof window === 'undefined') return null;

  // 1. Check search params
  const searchParams = new URLSearchParams(window.location.search);
  let view = searchParams.get('view') as ShareViewType | null;
  let listId = searchParams.get('listId');

  // 2. Check hash as fallback (e.g., #view=lists&listId=...)
  if (!listId && window.location.hash) {
    const hashQuery = window.location.hash.includes('?') 
      ? window.location.hash.split('?')[1] 
      : window.location.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hashQuery);
    if (!view) view = hashParams.get('view') as ShareViewType | null;
    if (!listId) listId = hashParams.get('listId');
  }

  if (view && (view === 'lists' || view === 'prep-material') && listId) {
    return { view, listId };
  }

  // Also support listId only (defaults to 'lists')
  if (listId) {
    return { view: view === 'prep-material' ? 'prep-material' : 'lists', listId };
  }

  return null;
}

/**
 * Clean share parameters from URL without reloading the page.
 */
export function clearShareUrlParams(): void {
  if (typeof window === 'undefined') return;
  const newUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, newUrl);
}
