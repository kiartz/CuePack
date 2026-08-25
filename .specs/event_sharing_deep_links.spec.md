# SPEC: Event Sharing & Deep Linking (v0.5.7)

## 1. Goal & Context
Consente agli utenti di condividere qualsiasi evento creato in CuePack Manager tramite due link distinti e diretti:
1. **Link Preparazione Lista (Produzione / Ufficio)**: Apre direttamente l'evento in modalità modifica (`PackingListBuilder`), consentendo di comporre o modificare la distinta dei materiali.
2. **Link Preparazione Magazzino (Lista Pronta)**: Apre direttamente l'evento in modalità magazzino (`PrepMaterialView`), consentendo agli operatori di magazzino di gestire la spunta, il carico e il rientro dei materiali.

## 2. Invariants & Rules
- **Autenticazione Obbligatoria**: Se l'utente non è autenticato quando apre il link, viene reindirizzato alla pagina di login. I parametri di query string (`?view=...&listId=...`) o hash rimangono conservati. Dopo il completamento dell'autenticazione Firebase, l'app atterra immediatamente sulla pagina e sull'evento specificati nel link.
- **Deep Linking**:
  - `?view=lists&listId=<LIST_ID>` -> Imposta `currentView = 'lists'`, `activeListId = <LIST_ID>` e apre il builder.
  - `?view=prep-material&listId=<LIST_ID>` -> Imposta `currentView = 'prep-material'`, `activeListId = <LIST_ID>` e apre la distinta magazzino.
- **Database Alignment**: Se l'evento condiviso appartiene a un database specifico (`list.databaseId`), l'app allinea automaticamente il database attivo (`activeDatabaseId`) per visualizzare correttamente i dati.
- **Clipboard Fallback**: Supporto a `navigator.clipboard.writeText` con fallback ad un input di testo temporaneo nascosto per massima compatibilità cross-platform (inclusi browser mobili o webview).

## 3. Interfaces & Components
- `src/utils/share.ts`:
  - `getShareUrl(view: 'lists' | 'prep-material', listId: string): string`
  - `copyToClipboard(text: string): Promise<boolean>`
  - `getShareUrlParams(): { view?: 'lists' | 'prep-material', listId?: string } | null`
- `src/components/ShareEventModal.tsx`:
  - Componente modale con opzioni separate per i due tipi di link, pulsanti di copia e feedback visivo (*"Copiato!"* per 2.5s).
