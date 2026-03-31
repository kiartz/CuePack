// Fallback sicura per la generazione di ID unici (utile su dispositivi vecchi o connessioni HTTP senza HTTPS)
export const generateId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    
    // Fallback pseudo-randomico
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10) + '-' + Math.random().toString(36).substring(2, 10);
};
