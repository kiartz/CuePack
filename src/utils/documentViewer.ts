/**
 * Utility per formattare e aprire i documenti (Drive, Cloud, PDF, Office)
 * direttamente nel browser evitando il download automatico.
 */

export const getBrowserViewUrl = (rawUrl: string): string => {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  // Se manca il protocollo http/https, aggiungi https://
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Google Drive: Se il link è di tipo "uc?export=download" o "file/d/ID/view", ottimizzalo per l'anteprima
  if (url.includes('drive.google.com')) {
    // Trasforma link di download diretto in link di visualizzazione /preview
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      const fileId = fileIdMatch[1];
      return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    }
  }

  // Dropbox: sostituisci dl=1 con raw=1 o visualizzatore
  if (url.includes('dropbox.com')) {
    url = url.replace(/[?&]dl=1/, '?dl=0');
    return url;
  }

  // File Office (docx, xlsx, pptx) ospitati su URL diretti o server web generici (non Google Drive)
  // Possiamo usare Google Docs Viewer per consentirne l'apertura online immediata
  const isDirectOfficeFile = /\.(docx?|xlsx?|pptx?|csv)$/i.test(url.split('?')[0]);
  if (isDirectOfficeFile && !url.includes('google.com') && !url.includes('sharepoint.com') && !url.includes('1drv.ms') && !url.includes('onedrive.live.com')) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=false`;
  }

  return url;
};

export const openDocumentInBrowser = (rawUrl: string): void => {
  const finalUrl = getBrowserViewUrl(rawUrl);
  if (finalUrl && typeof window !== 'undefined') {
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }
};
