# Specification: Aggregated Notes in Totals View

## Goal
Aggregation of notes in the "Totals" view (Magazzino/Warehouse) and PDF export. When items are grouped by ID, their unique notes should be listed under the total quantity.

## Design Constraints (GSD - S)
- **UI**: Show notes with an indentation/arrow `↳`, smaller text, and muted color.
- **PDF**: Add secondary rows under the total line, indented/italicized/gray.
- **Data Structure**: `aggregatedNotes: { qty: number, text: string }[]`.

## Affected Components
- `src/components/PrepMaterialView.tsx`: `aggregatedData` hook and Totals view rendering.
- `src/components/PackingListBuilder.tsx`: `exportTotalsPDF` function.

## Plan
### 1. Data Aggregation (PrepMaterialView.tsx)
Update `aggregatedData` (useMemo) to include `aggregatedNotes` in:
- `complexItems` (parents)
- `children` (of complex items)
- `simpleItems`

### 2. UI Update (PrepMaterialView.tsx)
In the Totals view, loop through `aggregatedNotes` and display them:
- Design: `↳ {qty}x Nota: {text}`
- Style: smaller, muted color.

### 3. PDF Update (PackingListBuilder.tsx)
In `exportTotalsPDF`:
- Update the internal aggregation logic to collect notes.
- Update `tableBody.push` to include the notes as secondary rows or multi-line content.

## Verification
- Quantities summation remains unchanged.
- Notes are correctly aggregated by text content.
- PDF layout is maintained and readable.
