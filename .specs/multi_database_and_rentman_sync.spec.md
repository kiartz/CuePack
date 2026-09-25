# Specification: Multi-Database Blending & Rentman Smart Sync Engine

## 1. Overview & Goal
Evolvere il sistema Multi-Database di CuePack Manager da archivi isolati a un'architettura **unificata a livello di catalogo e liste**, dove:
1. I database possono essere mescolati liberamente all'interno delle liste materiali.
2. Ogni articolo di inventario (`InventoryItem`) è associato a uno specifico database (`databaseId`), con preselezione automatica del database predefinito in creazione.
3. In creazione liste (`PackingListBuilder`), l'inventario è ricercabile cross-database e ogni articolo espone una sigla DB compatta (3-4 caratteri o numero) poco ingombrante.
4. In preparazione eventi (`PrepMaterialView`), non viene mostrata alcuna sigla di database sulle singole righe, ma è presente un filtro nella barra superiore per visualizzare solo il materiale di un database specifico o di tutti.
5. In inventario materiale (`InventoryView`), è presente un filtro per selezionare il database da visualizzare o tutti i database.
6. Motore di importazione e riconciliazione da Rentman (.xlsx):
   - Importazione di un database completo da zero.
   - Smart Merge con un database esistente, con visualizzazione Staging Diff chiara, filtri di stato (Nuovi, Modificati, Invariati, Non presenti) e scelta granulare o massiva delle modifiche da applicare prima del salvataggio definitivo.

---

## 2. Invarianti e Regole di Dominio
- **Nessuna perdita di dati**: Gli articoli già presenti in Firestore devono continuare a funzionare regolarmente, ricevendo il fallback sul database predefinito (`default`) se privi di `databaseId`.
- **Indipendenza delle liste**: Una packing list non è più vincolata a un solo database; può contenere componenti attinti da database differenti contemporaneamente.
- **Riconciliazione Rentman Determinante**: Il matching degli articoli Rentman segue la priorità:
  1. `qrCode` (7 cifre, colonna `AU - QR codes / RFID`).
  2. `productCode` (colonna `D - Code`).
  3. `name` normalizzato (colonna `C - Name (in database)`).
- **Trasparenza del Magazzino**: Nella visualizzazione operativa di carico e spunta (`PrepMaterialView`), le informazioni di DB rimangono nascoste per massimizzare la leggibilità per il magazziniere, ma il filtro globale per DB permette di separare i flussi di preparazione se desiderato.

---

## 3. Data Model Enhancements (`src/types.ts`)

### 3.1 `InventoryDatabase`
```typescript
export interface InventoryDatabase {
  id: string;          // es. 'default', 'db_rentman'
  name: string;        // es. "Database Principale", "Rentman Import"
  code: string;        // es. "PRI", "RNT", "SUB" (3-4 caratteri per badge compatti)
  color?: string;      // es. "emerald", "blue", "amber", "purple", "rose"
  description?: string;
  isDefault?: boolean;
  createdAt: string;
  itemCount?: number;
  kitCount?: number;
}
```

### 3.2 `InventoryItem`
```typescript
export interface InventoryItem {
  id: string;
  name: string;
  databaseId?: string; // ID del database di appartenenza (default: database predefinito)
  // ... tutti i campi esistenti (productCode, qrCode, category, subcategory, instances, ecc.)
}
```

### 3.3 `ListComponent` (opzionale o runtime resolution)
- In `PackingListBuilder`, il database di ciascun componente viene ricavato direttamente dal corrispondente `InventoryItem` memorizzato nell'inventario unificato, garantendo aggiornamenti in tempo reale anche se un oggetto cambia database.

---

## 4. Architettura dei 5 Step di Implementazione

### STEP 1: Modello Dati, Database Metadata & Unificazione Firestore
- Estensione interfaccia `InventoryDatabase` (aggiunta `code`, `color`).
- Estensione `InventoryItem` con `databaseId`.
- In `src/firebase.ts` e `AuthenticatedApp.tsx`, unificazione del flusso di sottoscrizione: l'inventario completo viene caricato da `COLL_INVENTORY` (con tag `databaseId`), consentendo a tutti i componenti di accedere a tutti i database.
- Funzione di migrazione trasparente / retrocompatibilità automatica per assegnare `databaseId: default` e codice sintetico ai record esistenti.

### STEP 2: Selettore Database nell'Oggetto & Filtro Inventario
- In `ItemFormModal.tsx`:
  - Sezione dedicata "Database" nel form dell'articolo.
  - Preimpostazione automatica del database predefinito (`isDefault: true`) per i nuovi oggetti.
  - Dropdown elegante con Nome + Sigla (`PRI`, `RNT`, ecc.).
- In `InventoryView.tsx`:
  - Filtro rapido nella barra superiore per visualizzare "Tutti i Database" o filtrare per singolo database.
  - Badge compatto della sigla DB nella riga dell'inventario.
  - Aggiornamento contatori per database.

### STEP 3: Liste Cross-Database & Filtri Magazzino
- In `PackingListBuilder.tsx`:
  - Rimozione di blocchi/avvisi vincolanti legati a un singolo database per evento.
  - Ricerca articoli su tutto l'inventario cross-database.
  - Badge sigla DB compatto (es. `[PRI]`, `[RNT]`) a ingombro minimo accanto a nome/codice nella distinta e nel dropdown di ricerca.
- In `PrepMaterialView.tsx`:
  - Nessuna sigla o badge DB sulle righe di preparazione (massima pulizia visiva).
  - Aggiunta filtro per Database nella toolbar: permette al magazziniere di filtrare e visualizzare solo gli articoli del DB scelto o tutti i DB, sia in Vista Zone che in Vista Totali.

### STEP 4: Parser Excel Rentman (.xlsx)
- Integrazione parser `.xlsx` client-side (libreria `xlsx` / SheetJS).
- Mappatura completa delle colonne del file Rentman:
  - Codice Prodotto (D), Nome (C), QR Prodotto (AU), Alias (AO), Folder/Sottocategoria (BF), Giacenza (AY/BB), Ubicazione (BA/BC), Dimensioni e Volume (AB, AC, AD, Z), Pesi (AE, AF), Dati Elettrici (AG, AH), Prezzi (P, Q), Seriali/Instances (BM..CS).
- Raggruppamento delle righe serializzate multiple in un singolo articolo aggregato con `instances: ItemInstance[]`.

### STEP 5: "Diff & Merge Studio" (Interfaccia di Confronto e Riconciliazione)
- Pagina / Modale dedicato per la sincronizzazione post-caricamento file:
  - Opzione per importare come Nuovo Database da zero.
  - Opzione per sincronizzare/mergiare con un Database Esistente.
- Algoritmo di confronto e partizionamento nei 4 stati:
  - 🟢 **Nuovi** (da aggiungere)
  - 🟡 **Modificati** (con differenze specifiche campo per campo)
  - ⚪ **Invariati** (identici, ignorati di default)
  - 🔴 **Non presenti nel file** (nel DB ma non nell'export, con scelta: ignora / dismetti / elimina)
- Diff Viewer visivo e chiaro che evidenzia il prima e il dopo per ogni attributo modificato.
- Filtri a tab e pulsanti di selezione rapida massiva ("Seleziona tutti i nuovi", "Seleziona tutte le modifiche").
- Applicazione atomica / batch in Firestore con progress bar e feedback.
