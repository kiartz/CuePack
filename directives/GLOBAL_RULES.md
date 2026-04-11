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

## 5. WORKFLOW OPERATIVO (GSD)
- **Fase G: GOAL**: Crea/aggiorna `.spec.md`.
- **Fase S: STATE**: Leggi `PROJECT_CONTEXT.md` e analizza gap.
- **Fase D: DESIGN**: Implementa seguendo PEP 8 (Python) o standard TS/React.

## 6. DEFINITION OF "DONE"
- ✅ Codice soddisfa la `.spec.md`.
- ✅ `PROJECT_CONTEXT.md` aggiornato.
- ✅ Zero errori di linting/type-checking.
- ✅ Documentazione allineata.
