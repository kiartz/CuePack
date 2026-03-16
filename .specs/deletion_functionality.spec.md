# Specifica: Eliminazione Definitiva Packing List

## Obiettivo
Implementare la funzione di eliminazione definitiva per le packing list all'interno della sezione Archivio in `PrepMaterialView.tsx`. L'utente deve poter rimuovere permanentemente un evento archiviato dal database Firestore dopo una conferma esplicita.

## Requisiti Funzionali

### 1. Interfaccia Utente (UI)
- **Pulsante Elimina**:
    - Visibile solo per gli eventi con `isArchived: true`.
    - Icona: `Trash2` (Lucide React).
    - Stile: Testo rosso (`text-red-500`) o hover rosso (`hover:text-red-700` o background).
    - Comportamento: `e.stopPropagation()` per non aprire i dettagli dell'evento al click sul pulsante.
- **Modal di Conferma**:
    - Titolo: "Eliminazione Definitiva".
    - Messaggio: "Stai per eliminare l'evento [Nome Evento]. Questa azione è irreversibile e rimuoverà tutti i dati associati dal database."
    - Pulsante di Azione: "Elimina Ora" (Rosso Intenso).
    - Pulsante di Annullamento: "Annulla".

### 2. Logica di Business
- Al click su "Elimina Ora":
    - Recuperare il riferimento Firestore del documento (`doc(db, "packing_lists", id)`).
    - Eseguire `deleteDoc`.
    - Gestire eventuali errori (opzionale, ma consigliato loggare).

### 3. Feedback Post-Esecuzione
- Il modal deve chiudersi automaticamente.
- La lista deve sparire immediatamente dalla vista Archivio grazie alla sincronizzazione real-time di Firestore (`onSnapshot` in `AuthenticatedApp.tsx`).

## Dettagli Tecnici
- **Componente Core**: `PrepMaterialView.tsx`.
- **Modale Usato**: `ConfirmationModal.tsx` (o implementazione inline se necessario, ma preferibile riuso).
- **Libreria**: `firebase/firestore`.

## Invarianti
- Non è possibile eliminare eventi non archiviati tramite questa funzione (il pulsante non deve essere visibile).
- L'operazione non è reversibile.
