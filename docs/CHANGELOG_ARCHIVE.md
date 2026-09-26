# CuePack Manager - Changelog Storico (v0.5.1 - v0.5.8)

Questo file raccoglie lo storico dettagliato delle versioni precedenti di CuePack Manager, archiviato per mantenere snello ed efficiente il file principale `PROJECT_CONTEXT.md`.

---

## v0.5.8: Full-Page Item Editor & Rentman Compatibility Architecture
- Converted item details into a full-page view (`ItemFormModal.tsx`) with top fixed header (`← Torna all'Inventario`, material name & code badge, cancel and save buttons) and 6 distinct tabs (`data`, `serials`, `accessories`, `inspections`, `notes`, `files`).
- Clean & ergonomic "Dati Generali" re-layout (name standalone, alias underneath, compact code & 7-digit QR code on right, category & subcategory hierarchy with custom Category Manager modal, dedicated physical box with weight on top, dimensions, and auto-calculated $m^3$ volume, bidirectional $W \leftrightarrow A$ electrical calculator supporting Monofase 230V and Trifase 400V with supply rating 16A/32A/63A/125A, purchase price alongside rental list and subrental costs).
- Maintained backward compatibility and zero database overhead.

---

## v0.5.7.2: Day/Night Theme Switcher & Real-Time Sync Polish
- Added sleek Moon/Sun toggle switch in the desktop sidebar footer and mobile navigation menu with zero background clutter.
- Full application theme adaptation (light background, crisp white cards, light borders and legible dark typography).
- High-contrast text for deleted materials and reminders box; bold user text in production and warehouse notes in matching harmonic colors without unnecessary box paddings.
- Document badges & document picker modals adapted to light mode.
- Clean 3-button QR/barcode column.
- Checklist high contrast colors for light mode.
- Rock-solid sequential write queue and Firestore rollback prevention for instant real-time synchronization across devices; zero database overhead with device-local persistence in `localStorage`.

---

## v0.5.7.1: Mobile/Tablet Touch Fix & Enlarge Checkboxes
- Removed invalid nested `<label><button>` wrapping that caused mobile browsers to discard touch events.
- Added `type="button"`, `touch-manipulation`, `e.stopPropagation()`.
- Increased touch target size to min 48x48px on mobile/tablet and icon sizes to 34px (32px totals / 28px accessories) for effortless one-tap checking while on the move in the warehouse.

---

## v0.5.7: Warehouse Real-Time Synchronization & Version Change Retention
- Direct Firestore doc listener (`onSnapshot`), non-destructive state merge (`mergeWarehouseStates`), atomic updates with local ref tracking, state retention on version updates (`computeVersionSnapshotDiff`), red warning pulse checkboxes and hover/click explanation badges for altered or newly added items.
- Event sharing with two direct access links: "Preparazione Lista (Produzione / Ufficio)" and "Preparazione Magazzino (Lista Pronta)", protected with Firebase Auth and auto-redirect. External link integration for materials (PDF, Excel, Word, Google Drive, OneDrive) with in-browser preview and item row badges.

---

## v0.5.6: Item Reminders, Master Quick-Edit & Availability Engine
- Integrated `reminders` array to `InventoryItem` and extended the `ItemFormModal` with a dedicated yellow Lightbulb button and Reminders Modal to take and manage item-specific notes, just like Kits.
- Refined real-time overlap validation extending timeframe from truck load to teardown and integrated EventSummary/Edit forms inside the Calendar workspace.
- Extracted EventFormModal from PackingListBuilder logic to share it easily with the visual calendar tools.
- Appending hotel, travel dates, personnel passes into the main PackingList model.
- Master quick-edit access from highlight bar in builder.
- Scroll anchoring on exit highlight.
- Unified export modal in `src/utils/export.ts` with custom PDF highlighter for notes.
- Python migration utility `firebase_migration.py`.
- Multi-database initial support and Rentman code/serials structure.

---

## v0.5.1 - v0.5.4: Fondamenta ERP & Magazzino
- v0.5.4: UI optimizations (Row density in totals view, temporary item stock checks ignored, labels updated to "CON ACCESSORI", calendar load/setup date alignment bugs fixed).
- v0.5.3: Availability Engine (Stock awareness via Date Ranges), Gantt Calendar (Horizontal Timeline & Staffing visualization), ERP Navigation Evolution (Dropdowns, Sidebar auto-collapse, INVENTARIO grouping), Espansione Sidebar con sezioni LOGISTICA e UTILITY, Custom Stock Alerts.
- v0.5.2: Template System - Warehouse Unpacking & Builder Expansion.
- v0.5.1: Warehouse Unification & Action-First Header.
