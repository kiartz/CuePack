# Feature: Templates (v0.5.2)

## Goal
Implement a `Template` entity that groups `InventoryItem` (with their accessories) and `Kit` into a single reusable unit.
The primary advantage is during Packing List definition: adding a Template places a single row in the builder, keeping the list draft visually compact. During warehouse operations (`PrepMaterialView`) and PDF exports, the template naturally unpacks its elements (which retain their internal structure, e.g., a Kit inside a Template remains a Kit, and its inner items remain Kit Components) so the warehouse worker prepares them normally without navigating extra nested layers.

## State (Gap Analysis)
- `src/types.ts`: Missing `Template` interfaces. `ListComponent` needs a `'template'` type.
- `src/firebase.ts`: Missing `COLL_TEMPLATES`.
- `src/components/AuthenticatedApp.tsx`: Needs Firebase subscription and a Navigation entry.
- `src/components/TemplatesView.tsx` & `TemplateFormModal.tsx`: Missing entirely.
- `src/components/PackingListBuilder.tsx`: Search logic is currently limited to items and kits. Template search must be appended. Furthermore, rendering a packed `'template'` row in edit view is needed, colored Emerald.
- `src/components/PrepMaterialView.tsx`: Iteration logic must intercept `type === 'template'` and render its `contents` linearly, wiring the `onToggleWarehouseState` to the correct sub-item in the template's `contents` array.

## Design
1. **Model**:
   ```typescript
   export interface TemplateComponent {
     type: 'item' | 'kit';
     referenceId: string;
     name: string;
     quantity: number;
     category: string;
     contents?: { itemId?: string; name: string; quantity: number; category: string; prepNote?: string }[];
   }
   export interface Template {
     id: string;
     name: string;
     description?: string;
     components: TemplateComponent[];
   }
   ```
2. **List Behavior**:
   - `ListComponent` has `type: 'template'`.
   - Its `contents` will not just be `{itemId, name, quantity}` like kits, BUT the unpacked Array of `ListComponent` (or specifically, an array shaped just like the things you see in `TemplateComponent`, plus `warehouseState` for tracking the warehouse prep).
   - Actually, since a Template contains `TemplateComponent` (which is structurally very close to `ListComponent` minus `uniqueId` and `warehouseState`), when adding it to the list, we map `Template.components` to `ListComponent` by adding a uniqueId and initializing `warehouseState`. But wait!

   To be compact in the list builder but unpacked in the warehouse: 
   The list builder stores ONE element in `PackingList.zones.sections.components`: `type: 'template'`.
   Its `contents` field will be an Array of `ListComponent` objects. 
   BUT `contents` is already typed as `{ itemId?: string; ... warehouseState?: WarehouseState }[]`.
   Since a Template can hold a Kit (which has its own `contents`), this means we'd have `contents` containing elements that themselves have `contents`.

   Let's refine `ListComponent`:
   We want the nested structure to be clean.
   Ideally, the list builder just expands the template AT INSERTION, but then it's no longer compact in the builder.
   If we MUST be compact, we change `ListComponent.contents` type to support recursive nesting, OR we define a specialized property: `templateContents?: ListComponent[]` inside `ListComponent`.

3. **Invarianti**:
   - A kit inside a template must still look and behave like a kit in the warehouse.
   - Modifying a kit in the master DB should trigger auto-sync on lists that contain templates which contain that kit. (This might be complex, so for v0.5.2 auto-sync of templates might just pull the latest items. As an MVP, we copy the current snapshot of the items and kits at the time of insertion).
