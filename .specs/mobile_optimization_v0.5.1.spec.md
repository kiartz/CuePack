# Mobile UX Optimization - v0.5.1

## Goal
To optimize the CuePack Manager application for mobile devices (smartphones, tablets) by improving typography, maximizing tap targets, and ensuring responsive element stacking without breaking functionality.

## Context
The application is currently functional on desktop and iPad sizes (md+). However, on smaller screens (smartphones), elements like tables, action buttons, and nested lists (in PackingListBuilder) might be squished, difficult to tap, or render layout overflows. The goal is to provide a "native-like" feel on mobile without rewriting components from scratch, utilizing Tailwind CSS responsive classes.

## Inputs / Targets
- `src/components/HomeView.tsx`
- `src/components/InventoryView.tsx`
- `src/components/KitsView.tsx`
- `src/components/PackingListBuilder.tsx`
- `src/components/PrepMaterialView.tsx`

## Design & UI Constraints (Rules)
1. **Responsive Stacking**: 
   - Change `flex-row` to `flex-col` on `< md` screens for data rows where applicable.
   - For real datasets (Inventory, Kits), either implement card-style layout for mobile OR ensure robust horizontal scrolling (`overflow-x-auto`) where cards are not feasible.
2. **Touch Targets**: 
   - All interactive elements (buttons, checkboxes, icons) must have adequate padding (e.g., `p-2` or `p-3`, min size `w-10 h-10` virtually).
   - Especially critical in `PackingListBuilder` (quantity toggles) and `PrepMaterialView` (warehouse status flags).
3. **Sticky Actions**: 
   - Main actions (e.g., Save, Add Zone, Complete List) must be fixed to the bottom (`fixed bottom-0 w-full`) or top on mobile screens.
4. **Typography**: 
   - Prevent text truncation or ugly wraps. 
   - Use `truncate` defensively or `break-words`. 
   - Reduce text size (`text-sm` or `text-xs`) on mobile for secondary data.

## Expected Outputs
- A fully responsive web app layout easily usable on a smartphone.
- No horizontal scrolling on the main page wrapper (`body` should be non-scrollable horizontally `overflow-x-hidden`).
- Clear visual hierarchy on mobile viewports.

## Invariants & Error Patterns
- Modifications must NOT break the desktop layout (use `md:` prefixes).
- Functionality and state management (React hooks) must remain unaltered.
- FireStore data structure remains untouched.
