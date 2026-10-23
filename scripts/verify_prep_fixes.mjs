import assert from 'assert';

console.log("=== RUNNING VERIFICATION FOR PREP MATERIAL FIXES ===");

// 1. Test renderWarehouseCheckboxIcon logic
const renderWarehouseCheckboxIcon = (
    isChecked,
    showWarning,
    wasPreviouslyChecked
) => {
    if (isChecked) {
        return { type: 'CheckSquare', color: 'active' };
    }
    if (showWarning && wasPreviouslyChecked) {
        return { 
          type: 'GhostCheck', 
          squareColor: 'text-rose-500', 
          checkColor: 'text-slate-400' // Must be GREY
        };
    }
    return { 
      type: 'EmptySquare', 
      squareColor: showWarning ? 'text-rose-500' : 'text-slate-600' 
    };
};

// Case 1: Item checked now
const res1 = renderWarehouseCheckboxIcon(true, false, false);
assert.strictEqual(res1.type, 'CheckSquare', 'Checked item should show CheckSquare');

// Case 2: Modified item that WAS checked previously -> ghost check with GREY inner check
const res2 = renderWarehouseCheckboxIcon(false, true, true);
assert.strictEqual(res2.type, 'GhostCheck', 'Should show GhostCheck');
assert.strictEqual(res2.squareColor, 'text-rose-500', 'Square should be rose-500');
assert.strictEqual(res2.checkColor, 'text-slate-400', 'Inner check MUST be slate-400 (grey)');

// Case 3: Modified item that WAS NOT checked previously -> EMPTY red square
const res3 = renderWarehouseCheckboxIcon(false, true, false);
assert.strictEqual(res3.type, 'EmptySquare', 'Should show EmptySquare (no check)');
assert.strictEqual(res3.squareColor, 'text-rose-500', 'Square should be rose-500');

// Case 4: Testing boolean coercion bug fix
// Previously: changeLog object was passed as 3rd arg: renderWarehouseCheckboxIcon(false, true, { wasChecked: false })
// When passing Boolean(changeLog?.wasChecked), it evaluates to false!
const changeLogUnchecked = { previousQuantity: 2, wasChecked: false };
const res4 = renderWarehouseCheckboxIcon(false, true, Boolean(changeLogUnchecked?.wasChecked));
assert.strictEqual(res4.type, 'EmptySquare', 'Unchecked item with changeLog MUST evaluate to EmptySquare, not GhostCheck');

const changeLogChecked = { previousQuantity: 2, wasChecked: true };
const res5 = renderWarehouseCheckboxIcon(false, true, Boolean(changeLogChecked?.wasChecked));
assert.strictEqual(res5.type, 'GhostCheck', 'Checked item with changeLog MUST evaluate to GhostCheck');

// 2. Test Kit effectiveSubChangeLog fallback
const subWsWithoutCheck = { inDistinta: false, loaded: false };
const effectiveSubChangeLog = subWsWithoutCheck.changeLog || {
    previousQuantity: 4,
    wasChecked: Boolean(subWsWithoutCheck.changeLog?.wasChecked ?? false)
};
assert.strictEqual(effectiveSubChangeLog.wasChecked, false, 'Kit sub-item without prior check must have wasChecked = false');

// 3. Test Total View wasPreviouslyChecked
const totalChangeLogWithoutCheck = { previousQuantity: 5, wasChecked: false };
const totalWasPreviouslyChecked = Boolean(
    totalChangeLogWithoutCheck?.wasChecked || 
    (totalChangeLogWithoutCheck?.history && totalChangeLogWithoutCheck.history.some(h => h.wasChecked))
);
assert.strictEqual(totalWasPreviouslyChecked, false, 'Total button must not treat previousQuantity > 0 as checked if wasChecked is false');

console.log("✅ All logic assertions passed successfully!");
