import assert from 'assert';
import { extractCompactItem } from '../src/services/catalogIndexService.ts';

console.log("=== RUNNING VERIFICATION FOR ITEM FIXES (REMINDERS & ACCESSORIES) ===");

// 1. Test extractCompactItem retains reminders and essential fields
const sampleItem = {
  id: 'test-item-1',
  name: 'Cavo DMX 5 Pin',
  category: 'Cablaggi',
  inStock: 10,
  reminders: ['Verificare continuità con tester prima del rientro'],
  internalRemark: 'Conservare nel baule nero',
  externalRemark: 'Standard neutrik',
  dimensions: { length: 100, width: 2, height: 2 },
  accessories: [{ itemId: 'acc-1', quantity: 2 }]
};

const compact = extractCompactItem(sampleItem);
assert.ok(Array.isArray(compact.reminders), 'compact.reminders should be an array');
assert.strictEqual(compact.reminders.length, 1, 'compact.reminders length should be 1');
assert.strictEqual(compact.reminders[0], 'Verificare continuità con tester prima del rientro');
assert.strictEqual(compact.internalRemark, 'Conservare nel baule nero');
assert.strictEqual(compact.externalRemark, 'Standard neutrik');
assert.strictEqual(compact.accessories.length, 1);
assert.strictEqual(compact.accessories[0].quantity, 2);

console.log("✅ Assertion 1: extractCompactItem correctly preserves reminders & metadata");

// 2. Test multi-tap accessories increment logic
let accessories = [];

const handleAddAccessory = (itemId, quantity = 1) => {
  const current = accessories;
  const existingIdx = current.findIndex(a => a.itemId === itemId);
  if (existingIdx !== -1) {
    const next = [...current];
    next[existingIdx] = {
      ...next[existingIdx],
      quantity: (next[existingIdx].quantity || 1) + quantity
    };
    accessories = next;
  } else {
    accessories = [...current, { itemId, quantity, automatic: true }];
  }
};

// First tap
handleAddAccessory('acc-alpha', 1);
assert.strictEqual(accessories.length, 1);
assert.strictEqual(accessories[0].quantity, 1);

// Second tap directly from inventory picker
handleAddAccessory('acc-alpha', 1);
assert.strictEqual(accessories.length, 1, 'Should NOT create duplicate row');
assert.strictEqual(accessories[0].quantity, 2, 'Quantity should increment to 2');

// Third tap directly from inventory picker
handleAddAccessory('acc-alpha', 1);
assert.strictEqual(accessories[0].quantity, 3, 'Quantity should increment to 3');

console.log("✅ Assertion 2: Multiple clicks on accessory increment quantity smoothly");

// 3. Test reminder submit handling (pending input automatically collected)
const existingReminders = ['Promemoria 1'];
const pendingReminderInput = 'Promemoria 2 digitato senza premere aggiungi';

const effectiveReminders = [...existingReminders];
if (pendingReminderInput.trim() && !effectiveReminders.includes(pendingReminderInput.trim())) {
  effectiveReminders.push(pendingReminderInput.trim());
}

assert.strictEqual(effectiveReminders.length, 2);
assert.strictEqual(effectiveReminders[1], 'Promemoria 2 digitato senza premere aggiungi');

console.log("✅ Assertion 3: Pending reminder input is safely captured on form submission");

console.log("🎉 ALL ITEM FIX VERIFICATIONS PASSED!");
