# Multi-Database Blending & Rentman Smart Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettere l'uso mescolato di database differenti all'interno delle liste materiali, assegnare ciascun articolo a un database con preselezione del default, aggiungere filtri dedicati in inventario e preparazione magazzino, e implementare un sistema di importazione e smart merge da export Rentman (.xlsx) con interfaccia di riconciliazione e diff visivo.

**Architecture:** Transizione da collezioni isolate a un inventario unificato dove ogni articolo possiede l'attributo `databaseId`, associato ai metadati del database (`id`, `name`, `code` di 3-4 caratteri, `color`). Le liste materiali attingono all'intero inventario unificato e mostrano un indicatore sintetico e poco ingombrante in fase di creazione, mentre la preparazione magazzino mantiene le righe pulite ma offre un filtro globale per database. Un parser Excel client-side estrae i dati Rentman e alimenta il "Diff & Merge Studio", che confronta vecchio e nuovo stato evidenziando le variazioni e permettendo all'utente di applicare le modifiche in modo selettivo o massivo.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Firebase Firestore, SheetJS (`xlsx`), Lucide Icons.

---

### Task 1: Modello Dati, Database Metadata & Unificazione Catalogo
**Files:**
- Modify: `src/types.ts:50-100`, `src/types.ts:240-254`
- Modify: `src/firebase.ts:40-60`
- Modify: `src/components/AuthenticatedApp.tsx:30-70`, `src/components/AuthenticatedApp.tsx:110-205`
- Modify: `src/components/HomeView.tsx:80-145`

**Details:**
1. Aggiungere a `InventoryDatabase` i campi `code: string` (es. "PRI", "RNT") e `color?: string`.
2. Aggiungere a `InventoryItem` il campo `databaseId?: string`.
3. In `AuthenticatedApp.tsx`, caricare l'inventario unificato da `COLL_INVENTORY` assicurando retrocompatibilità: per qualsiasi articolo privo di `databaseId`, assegnare automaticamente `'default'`. Assicurare che il database principale abbia `code: 'PRI'`.
4. Nel modale di creazione/modifica database in `HomeView.tsx`, aggiungere i campi per personalizzare la sigla/codice di 3-4 lettere e il colore del badge.

---

### Task 2: Selettore Database nella Scheda Articolo & Filtro Inventario
**Files:**
- Modify: `src/components/ItemFormModal.tsx:55-70`, `src/components/ItemFormModal.tsx:150-250`, `src/components/ItemFormModal.tsx:800-900`
- Modify: `src/components/InventoryView.tsx:15-30`, `src/components/InventoryView.tsx:40-105`, `src/components/InventoryView.tsx:200-350`
- Modify: `src/components/AuthenticatedApp.tsx:415-425`

**Details:**
1. In `ItemFormModal.tsx`:
   - Ricevere `databases: InventoryDatabase[]`.
   - Inserire nel Tab "Dati Generali" (accanto a Categoria o Magazzino) un blocco dedicato "Database di Appartenenza".
   - Per un nuovo articolo: selezionare in automatico il database con `isDefault: true`.
   - Mostrare dropdown con nome completo e badge sigla.
   - Salvare `databaseId` sull'oggetto.
2. In `InventoryView.tsx`:
   - Ricevere `databases: InventoryDatabase[]`.
   - Inserire un filtro dropdown / pills per Database nella toolbar accanto a Ricerca e Categoria: `Tutti i Database` e opzioni per i singoli database.
   - Mostrare un badge compatto della sigla DB (es. `[PRI]`, `[RNT]`) nella tabella degli articoli.
   - Mostrare contatori aggiornati degli articoli per database.

---

### Task 3: Liste Cross-Database & Filtro Magazzino
**Files:**
- Modify: `src/components/PackingListBuilder.tsx:30-40`, `src/components/PackingListBuilder.tsx:580-660`, `src/components/PackingListBuilder.tsx:900-1100`
- Modify: `src/components/PrepMaterialView.tsx:15-30`, `src/components/PrepMaterialView.tsx:80-160`, `src/components/PrepMaterialView.tsx:300-450`
- Modify: `src/components/AuthenticatedApp.tsx:440-465`

**Details:**
1. In `PackingListBuilder.tsx`:
   - Rimuovere le restrizioni rigide sul database dell'evento: l'evento può contenere articoli da qualsiasi DB mescolati insieme.
   - **Filtro Database nel Picker di Ricerca Materiale**: aggiungere un selettore/filtro rapido per Database (es. "Tutti i DB" oppure selezionare uno specifico database come "PRI - Principale", "RNT - Rentman"). Se selezionato un DB specifico, la ricerca nel catalogo troverà SOLO i materiali appartenenti a quel database; se impostato su "Tutti", cercherà ovunque.
   - Nel picker di ricerca articoli: mostrare accanto al nome il piccolo badge con la sigla del DB (es. `[PRI]`, `[RNT]`).
   - Nelle righe dei materiali inseriti nella distinta: inserire un piccolo badge poco ingombrante con la sigla DB (es. `PRI`, `RNT` in stile micro-pill 10px).
2. In `PrepMaterialView.tsx`:
   - Sulle righe di preparazione (spunta distinta, carico, rientro): **nessun** indicatore di DB visibile, garantendo la massima pulizia operativa.
   - Nella barra strumenti/testata: inserire un selettore filtro "Database: [Tutti i DB ▾]" con le opzioni dei singoli database.
   - Quando selezionato un DB specifico, filtrare sia la Vista Zone che la Vista Totali mostrando solo gli articoli appartenenti a quel DB.

---

### Task 4: Parser Excel Rentman (.xlsx)
**Files:**
- Install: `xlsx` package (previa conferma utente).
- Create: `src/utils/rentmanParser.ts`
- Test file: `Oggetti di riferimento/Export_Equipment_Rentman_Test_20260829.xlsx`

**Details:**
1. Implementare la funzione `parseRentmanExcel(file: File): Promise<ParsedRentmanData>`.
2. Estrazione e normalizzazione delle colonne:
   - Identificatori: Codice Prodotto (`Code`), QR Code Prodotto (`QR codes / RFID`), Nome (`Name (in database)`), Alias (`Alias`).
   - Categorie: Mappatura della cartella Rentman (`Folder (Folder)`) su sottocategoria e categoria principale.
   - Giacenza e Ubicazione: `Current quantity`, `Location in default stock location`.
   - Dimensioni e Pesi: `Weight`, `Height`, `Width`, `Length`, `Transport volume`.
   - Proprietà Elettriche: `Power` (W), `Current` (A).
   - Prezzi: `Rental-/Sales price`, `Subrent-/purchase cost`.
   - Seriali / Matricole: Raggruppamento delle righe serializzate multiple nello stesso articolo, popolando l'array `instances: ItemInstance[]` con QR Seriale (`CD`), Serial Number (`BP`), Riferimento interno (`BY`), Data acquisto (`BQ`), e stato attivo (`BW`).

---

### Task 5: "Diff & Merge Studio" (Interfaccia di Confronto e Riconciliazione)
**Files:**
- Create: `src/components/RentmanSyncModal.tsx`
- Modify: `src/components/HomeView.tsx` (pulsante Sincronizza / Importa Rentman)
- Modify: `src/components/InventoryView.tsx` (pulsante Importa / Aggiorna da Rentman)

**Details:**
1. Upload del file Excel Rentman con feedback immediato di caricamento e analisi.
2. Selezione della modalità:
   - **Nuovo Database**: crea un nuovo database da zero importando tutti gli articoli.
   - **Merge con Database Esistente**: seleziona il database di destinazione (es. "Database Principale").
3. Algoritmo di confronto automatico (Diff Engine):
   - Match su `qrCode` $\rightarrow$ `productCode` $\rightarrow$ `name`.
   - Ripartizione degli elementi nei 4 stati:
     * 🟢 **Nuovi** (inesistenti nel DB di destinazione).
     * 🟡 **Modificati** (differenze rilevate tra DB e file: giacenza, posizione, seriali aggiunti/rimossi, pesi, prezzi).
     * 🔴 **Non presenti nel file** (presenti nel DB ma assenti dall'export Rentman).
     * ⚪ **Invariati** (identici).
4. Diff Viewer chiaro ed ergonomico:
   - Schede/Filtri KPI rapidi con contatori per stato.
   - Per i prodotti modificati: elenco visivo delle sole differenze (es. *Giacenza: 2 → 5*, *Posizione: R2 → T1*, *Nuovi Seriali: +2*).
   - Pulsanti di azione massiva: *"Seleziona tutti i nuovi"*, *"Seleziona tutte le modifiche"*, *"Deseleziona tutto"*.
   - Checkbox di selezione per ciascun articolo.
   - Opzione di gestione per gli articoli non presenti (Mantieni / Segna Fuori Uso / Elimina).
5. Scrittura Batch in Firestore con visualizzazione avanzamento (progress bar) e report finale delle modifiche applicate.
