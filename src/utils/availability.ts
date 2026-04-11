import { InventoryItem, Kit, PackingList, ListComponent } from '../types';

/**
 * Calculates the available quantity of a specific item based on overlaps with other active events.
 */
export function calculateAvailableQuantity(
    componentId: string,
    componentType: 'material' | 'kit' | 'template',
    startDate: string,
    endDate: string | undefined, 
    currentListId: string | null,
    allLists: PackingList[],
    inventory: InventoryItem[],
    kits: Kit[]
): { available: number; total: number; overlappingLists: { name: string, quantity: number }[] } {
    let total = 0;

    // Get base quantity
    if (componentType === 'material') {
        const item = inventory.find(i => i.id === componentId);
        total = item ? item.inStock : 0;
    } else if (componentType === 'kit' || componentType === 'template') {
        // Kits and Templates are logical groupings, we assume unlimited or compute based on parts
        total = 999; 
    }

    if (!startDate) {
        return { available: total, total, overlappingLists: [] };
    }

    const currentStart = new Date(startDate).getTime();
    // Default to the same day if endDate is not provided
    const currentEnd = endDate ? new Date(endDate).getTime() : currentStart;
    
    // Find overlapping events
    let usedQuantity = 0;
    const overlappingLists: { name: string, quantity: number }[] = [];

    const activeLists = allLists.filter(list => !list.isArchived && list.id !== currentListId);

    activeLists.forEach(list => {
        const listStartDateStr = list.truckLoadDate || list.setupDate || list.eventDate;
        if (!listStartDateStr) return;

        const listStart = new Date(listStartDateStr).getTime();
        const listEnd = new Date(list.returnDate || list.teardownDate || list.endDate || listStartDateStr).getTime();

        // Check if dates overlap: (StartA <= EndB) and (EndA >= StartB)
        const overlaps = currentStart <= listEnd && currentEnd >= listStart;

        if (overlaps) {
            // How much of this item is used in this overlapping list?
            let usedInList = 0;

            // Search through zones, sections, components
            list.zones?.forEach(zone => {
                zone.sections.forEach(section => {
                    section.components.forEach(comp => {
                        // Match directly (material vs material, kit vs kit)
                        // Note: comp.type refers to 'item' | 'kit' | 'template'
                        const effectiveCompType = comp.type === 'item' ? 'material' : comp.type;
                        if (comp.referenceId === componentId && effectiveCompType === componentType) {
                            if (!comp.isExternalRental) {
                                usedInList += comp.quantity;
                            }
                        }
                    });
                });
            });

            if (usedInList > 0) {
                usedQuantity += usedInList;
                overlappingLists.push({ name: list.eventName, quantity: usedInList });
            }
        }
    });

    const available = total - usedQuantity;

    return {
        available: available,
        total: total,
        overlappingLists: overlappingLists
    };
}
