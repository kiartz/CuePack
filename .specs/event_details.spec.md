# Feature: Event Details & Calendar Enhancement (v0.5.4)

## Goal
Implement additional metadata fields for `PackingList` (Events) to support full logistical planning. Furthermore, enhance the `CalendarView` to display different types of days (Setup, Event, Teardown, Extra/Travel) and change the click behavior on an event from navigating directly to the builder, to opening a summary popup with an option to edit the event details or jump into the builder.

## State (Gap Analysis)
- `src/types.ts`: `PackingList` interface needs new fields: `setupCompany` (Azienda allestitore), `truckLoadDate` (Data carico camion), `teardownDate` (Data smontaggio), `returnDate` (Data rientro), `hotel` (Hotel), `technicalDrawingLink` (Link al disegno tecnico), `personnelPassLinks` (Link ai pass per ogni persona - maybe an array of `{name, link}` or a simple text area), `extraDays` (Giorni extra/viaggio - manual array of dates or number of days).
- `src/components/CalendarView.tsx`: Needs to map `setupDate`, `eventDate` -> `endDate`, `teardownDate`, and `extraDays`. Clicking an event currently calls `onOpenEvent(id)` which immediately opens the list builder. We must intercept this to show a `DetailModal`.
- `src/components/PackingListBuilder.tsx` & `src/components/EventFormModal.tsx` (or where event creation happens): Need to support the new fields in the form.

## Design
1. **Model Updates (`src/types.ts`)**:
   ```typescript
   export interface PackingList {
     // existing...
     setupCompany?: string;       // Azienda allestitore
     truckLoadDate?: string;      // Data carico camion (ISO Date)
     teardownDate?: string;       // Data smontaggio (ISO Date)
     returnDate?: string;         // Data rientro (ISO Date)
     hotel?: string;              // Hotel
     technicalDrawingLink?: string; // Link al disegno tecnico
     personnelPasses?: { name: string; link: string }[]; // Link ai pass
     extraDays?: string[];        // Array of ISO Dates for travel/extra days
   }
   ```

2. **CalendarView Updates**:
   - The gantt must render segments with different colors:
     - `setupDate` to `eventDate - 1` -> Setup (Yellow/Orange)
     - `eventDate` to `endDate` -> Event (Blue/Green)
     - `teardownDate` -> Teardown (Red/Orange)
     - `extraDays` -> Extra/Travel (Purple/Gray)
   - Click handler on gantt item opens a modal `<EventSummaryModal />`.
   - The modal shows all event data.
   - The modal has an "Modifica Dati" (Edit) button that opens the event form.
   - The modal has an "Apri Lista Materiale" button to go to the builder.

3. **Event Creation/Edit Form**:
   Identify where `PackingList` is created. Probably a modal in `HomeView.tsx` or similar (`CreateListModal` or `EventFormModal`). Add all the new fields.

## Invarianti
- Retro-compatibility for existing events that lack these new fields.
- Dates should be consistently stored as YYYY-MM-DD (`toISOString().split('T')[0]`).
- Do not break the Availability Engine, which relies on `eventDate`, `endDate`, `setupDate`. If `teardownDate` or `returnDate` extends the out-of-warehouse time, we might also need to update how Availability Engine calculates overlaps (e.g. from `truckLoadDate` to `returnDate`). This is critical.
