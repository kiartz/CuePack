# GLOBAL RULES & DIRECTIVES

## 1. CORE PHILOSOPHY: SPEC-DRIVEN PROGRAMMING (SDP)
- **Spec-as-Truth**: Il codice è solo una realizzazione temporanea; la specifica (.spec.md) è il contratto immutabile.
- **GSD Framework**: Ogni task deve seguire il ciclo: **Goal (Obiettivo) → State (Analisi Gap) → Design (Implementazione)**.
- **Context Continuity**: Non fare mai affidamento solo sulla cronologia della chat. La verità risiede nel file `PROJECT_CONTEXT.md` o nei file in cui abbiamo inserito uno storico chiamati `*.md`.

## 2. SKILL USAGE & AUTONOMY
- **Autonomous Skill Usage**: Se una richiesta dell'utente non specifica esplicitamente l'uso di una skill, ma l'agente ritiene che l'utilizzo di una o più skill installate (Awesome Skills) sia necessario o vantaggioso per completare il task con maggiore qualità, precisione o sicurezza, l'agente è autorizzato e incoraggiato a utilizzarle autonomamente.
- **Verification**: Ogni utilizzo di skill deve essere documentato nel `PROJECT_CONTEXT.md` se porta a decisioni architettoniche rilevanti.

## 3. PROJECT STRUCTURE & ORGANIZATION
- **workspace-root/**
  - **apps/**: Codice sorgente.
  - **directives/**: Level 1: Global SOPs (Istruzioni globali).
  - **.specs/**: Level 1: Specifiche di modulo (.spec.md).
  - **execution/**: Level 3: Script deterministici e Skills.
  - **PROJECT_CONTEXT.md**: IL CERVELLO: Memoria persistente del progetto (MANDATORIO).

## 4. PROTOCOLLO "EXTERNAL BRAIN" (PROJECT_CONTEXT.md)
1. **Inizializzazione**: Se non esiste, crealo.
2. **Aggiornamento Automatico**: Dopo OGNI modifica o decisione, aggiorna senza chiedere permesso.
3. **Contenuto Obbligatorio**: Stack, Architecture Decisions, Progress Tracker, Logic Anchors, Context Snapshot.

## 5. WORKFLOW OPERATIVO (GSD) & TOKEN EFFICIENCY
- **Fase G: GOAL**: Crea/aggiorna `.spec.md` con requisiti chiari e compatti.
- **Fase S: STATE**: Leggi `PROJECT_CONTEXT.md` ed esamina solo i file strettamente necessari con intervalli di riga precisi (`view_file` con `StartLine`/`EndLine`).
- **Fase D: DESIGN**: Implementa seguendo lo stack ufficiale: **React 18 + TypeScript Strict + Tailwind CSS + Firebase Firestore**.
- **Token Economy SOP**:
  - Modifiche al codice SEMPRE chirurgiche con `replace_file_content`. MAI riscrivere interi file con `write_to_file`.
  - Risposte concise, strutturate e orientate all'azione. Evitare ripetizioni di codice già salvato su disco.
  - Comandi terminale sempre filtrati e delimitati (evitare log infiniti o `Get-ChildItem -Recurse` non filtrati).

## 6. INVARIANTI TECNICI CUEPACK
- **Multi-Database Blending**: Gli articoli risiedono nella collezione `inventory` con `databaseId`. Usare sempre `effectiveDatabases` come fallback sicuro.
- **Rentman Sync & User Protection**: Mai sovrascrivere campi modificati manualmente dall'utente (`userModifiedFields`). Scrittura batch su Firestore a blocchi di max 150 elementi con journal di rollback.
- **Warehouse Real-Time**: Usare sempre `mergeWarehouseStates` e target touch minimi di 48x48px per dispositivi mobili.

## 7. DEFINITION OF "DONE"
- ✅ Codice conforme alla specifica e all'architettura CuePack.
- ✅ Zero errori di linting o type-checking (`npx tsc --noEmit` / `npm run build`).
- ✅ `PROJECT_CONTEXT.md` aggiornato in modo sintetico e denso.
- ✅ Massima efficienza token garantita.
