import { reconcileZones, createDefaultWarehouseState } from '../src/services/syncReconciler.ts';

// Test harness for Sync Reconciler
function runTests() {
  console.log("🧪 Avvio test per SyncReconciler (Concorrenza Multi-Utente)...");

  // TEST 1: User A creates Zone 2 and adds "Ottetto", User B modifies Zone 1
  {
    console.log("\n▶ TEST 1: Creazione concorrente Zone e aggiunta 'Ottetto'");
    const localZones = [
      { id: 'zone-1', name: 'Zona Principale', sections: [{ id: 'sec-audio', name: 'Audio', components: [] }] },
      { id: 'zone-2', name: 'Zona FOH', sections: [{ id: 'sec-audio-2', name: 'Audio', components: [{ uniqueId: 'comp-ottetto', name: 'Ottetto Cavi', quantity: 1, type: 'item' }] }] }
    ];
    // Remote snapshot arrives from User B who only had Zone 1 and changed something in Zone 1
    const remoteZones = [
      { id: 'zone-1', name: 'Zona Principale', notes: 'Nota aggiunta da Utente B', sections: [{ id: 'sec-audio', name: 'Audio', components: [] }] }
    ];

    const merged = reconcileZones(localZones, remoteZones, {
      createdZoneIds: new Set(['zone-2']),
      sourceContext: 'builder'
    });

    if (merged.length !== 2) throw new Error(`Test 1 fallito: attese 2 zone, trovate ${merged.length}`);
    const z2 = merged.find(z => z.id === 'zone-2');
    if (!z2) throw new Error("Test 1 fallito: 'zone-2' scomparsa!");
    const ottetto = z2.sections[0].components.find(c => c.uniqueId === 'comp-ottetto');
    if (!ottetto) throw new Error("Test 1 fallito: 'comp-ottetto' scomparso da zone-2!");
    const z1 = merged.find(z => z.id === 'zone-1');
    if (z1?.notes !== 'Nota aggiunta da Utente B') throw new Error("Test 1 fallito: nota remota di Utente B non preservata!");

    console.log("  ✅ TEST 1 SUPERATO: Zona 2 e Ottetto preservati intatti insieme alle note di Zona 1!");
  }

  // TEST 2: Multi-Reparto (Single Section Isolation): User A touches Audio, User B touches Luci
  {
    console.log("\n▶ TEST 2: Isolamento Concorrente Singoli Reparti (Audio vs Luci)");
    const localZones = [
      {
        id: 'zone-1',
        name: 'Zona Principale',
        sections: [
          { id: 'sec-audio', name: 'Audio', components: [{ uniqueId: 'comp-mic', name: 'Microfono Shure', quantity: 4, type: 'item' }] },
          { id: 'sec-luci', name: 'Luci', components: [] }
        ]
      }
    ];

    const remoteZones = [
      {
        id: 'zone-1',
        name: 'Zona Principale',
        sections: [
          { id: 'sec-audio', name: 'Audio', components: [] },
          { id: 'sec-luci', name: 'Luci', components: [{ uniqueId: 'comp-spot', name: 'Faro Spot', quantity: 8, type: 'item' }] }
        ]
      }
    ];

    const merged = reconcileZones(localZones, remoteZones, {
      sourceContext: 'builder'
    });

    const secAudio = merged[0].sections.find(s => s.id === 'sec-audio');
    const secLuci = merged[0].sections.find(s => s.id === 'sec-luci');

    if (!secAudio?.components.find(c => c.uniqueId === 'comp-mic')) {
      throw new Error("Test 2 fallito: Microfono Audio perso!");
    }
    if (!secLuci?.components.find(c => c.uniqueId === 'comp-spot')) {
      throw new Error("Test 2 fallito: Faro Spot Luci perso!");
    }

    console.log("  ✅ TEST 2 SUPERATO: Reparti Audio e Luci fusi perfettamente senza perdita!");
  }

  // TEST 3: 4 Warehousemen concurrently checking items
  {
    console.log("\n▶ TEST 3: 4 Magazzinieri che spuntano materiali in contemporanea");
    // Operator 1 checked Item 1
    const localZonesOp1 = [
      {
        id: 'zone-1',
        name: 'Zona Principale',
        sections: [{
          id: 'sec-audio',
          name: 'Audio',
          components: [
            { uniqueId: 'c1', name: 'Cavo 1', quantity: 1, type: 'item', warehouseState: { inDistinta: true, loaded: false, returned: false, isBroken: false, warehouseNote: '' } },
            { uniqueId: 'c2', name: 'Cavo 2', quantity: 1, type: 'item', warehouseState: { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' } }
          ]
        }]
      }
    ];

    // Remote snapshot arrives where Operator 2 has already checked Item 2
    const remoteZonesFromOp2 = [
      {
        id: 'zone-1',
        name: 'Zona Principale',
        sections: [{
          id: 'sec-audio',
          name: 'Audio',
          components: [
            { uniqueId: 'c1', name: 'Cavo 1', quantity: 1, type: 'item', warehouseState: { inDistinta: false, loaded: false, returned: false, isBroken: false, warehouseNote: '' } },
            { uniqueId: 'c2', name: 'Cavo 2', quantity: 1, type: 'item', warehouseState: { inDistinta: true, loaded: false, returned: false, isBroken: false, warehouseNote: '' } }
          ]
        }]
      }
    ];

    const deltasOp1 = new Map();
    deltasOp1.set('c1', { inDistinta: true });

    const mergedOp1 = reconcileZones(localZonesOp1, remoteZonesFromOp2, {
      warehouseDeltas: deltasOp1,
      sourceContext: 'warehouse'
    });

    const c1 = mergedOp1[0].sections[0].components.find(c => c.uniqueId === 'c1');
    const c2 = mergedOp1[0].sections[0].components.find(c => c.uniqueId === 'c2');

    if (!c1?.warehouseState?.inDistinta) throw new Error("Test 3 fallito: spunta c1 persa!");
    if (!c2?.warehouseState?.inDistinta) throw new Error("Test 3 fallito: spunta c2 persa!");

    console.log("  ✅ TEST 3 SUPERATO: Entrambe le spunte di c1 e c2 coesistono in simultanea!");
  }

  // TEST 4: Intentional deletion of an item
  {
    console.log("\n▶ TEST 4: Eliminazione esplicita (Nessun effetto Zombie)");
    const localZones = [
      {
        id: 'zone-1',
        name: 'Zona 1',
        sections: [{ id: 'sec-1', name: 'Audio', components: [] }] // c-deleted was removed locally
      }
    ];
    const remoteZones = [
      {
        id: 'zone-1',
        name: 'Zona 1',
        sections: [{ id: 'sec-1', name: 'Audio', components: [{ uniqueId: 'c-deleted', name: 'Da Rimuovere', quantity: 1, type: 'item' }] }]
      }
    ];

    const merged = reconcileZones(localZones, remoteZones, {
      deletedComponentIds: new Set(['c-deleted']),
      sourceContext: 'builder'
    });

    const found = merged[0].sections[0].components.find(c => c.uniqueId === 'c-deleted');
    if (found) throw new Error("Test 4 fallito: l'oggetto eliminato è resuscitato!");

    console.log("  ✅ TEST 4 SUPERATO: Oggetto eliminato esplicitamente NON resuscita!");
  }

  // TEST 5: Copy-Paste Quantity Summing & Builder Priority
  {
    console.log("\n▶ TEST 5: Somma Quantità su Copia-Incolla Materiale Esistente");
    const localZones = [
      {
        id: 'zone-1',
        name: 'Zona 1',
        sections: [{
          id: 'sec-1',
          name: 'Audio',
          components: [
            // Item originally had qty 2, user copied 3 from another section -> now qty 5
            { uniqueId: 'comp-shure', referenceId: 'ref-shure', name: 'Microfono Shure', quantity: 5, type: 'item' }
          ]
        }]
      }
    ];

    const remoteZones = [
      {
        id: 'zone-1',
        name: 'Zona 1',
        sections: [{
          id: 'sec-1',
          name: 'Audio',
          components: [
            { uniqueId: 'comp-shure', referenceId: 'ref-shure', name: 'Microfono Shure', quantity: 2, type: 'item' }
          ]
        }]
      }
    ];

    const merged = reconcileZones(localZones, remoteZones, {
      modifiedComponentIds: new Set(['comp-shure']),
      sourceContext: 'builder'
    });

    const shure = merged[0].sections[0].components.find(c => c.uniqueId === 'comp-shure');
    if (shure?.quantity !== 5) {
      throw new Error(`Test 5 fallito: Quantità attesa 5, trovata ${shure?.quantity}`);
    }

    console.log("  ✅ TEST 5 SUPERATO: Quantità sommata a 5 preservata correttamente!");
  }

  // TEST 6: Item Replacement (e.g. Monitor 65" -> Monitor 75")
  {
    console.log("\n▶ TEST 6: Sostituzione Materiale (es. Monitor 65\" -> Monitor 75\")");
    const localZones = [
      {
        id: 'zone-video',
        name: 'Zona Video',
        sections: [{
          id: 'sec-video',
          name: 'Video',
          components: [
            // User replaced 65" with 75" on comp-row-6930
            { 
              uniqueId: 'comp-row-6930', 
              referenceId: 'ref-mon-75', 
              name: 'Monitor 75"', 
              quantity: 1, 
              type: 'item',
              contents: [{ itemId: 'acc-stand-75', name: 'Stand 75"' }]
            }
          ]
        }]
      }
    ];

    const remoteZones = [
      {
        id: 'zone-video',
        name: 'Zona Video',
        sections: [{
          id: 'sec-video',
          name: 'Video',
          components: [
            // Remote still had old 65" item
            { 
              uniqueId: 'comp-row-6930', 
              referenceId: 'ref-mon-65', 
              name: 'Monitor 65"', 
              quantity: 1, 
              type: 'item',
              contents: [{ itemId: 'acc-stand-65', name: 'Stand 65"' }]
            }
          ]
        }]
      }
    ];

    const merged = reconcileZones(localZones, remoteZones, {
      modifiedComponentIds: new Set(['comp-row-6930']),
      sourceContext: 'builder'
    });

    const replaced = merged[0].sections[0].components.find(c => c.uniqueId === 'comp-row-6930');
    if (replaced?.name !== 'Monitor 75"' || replaced?.referenceId !== 'ref-mon-75') {
      throw new Error(`Test 6 fallito: Monitor non sostituito! Trovato: ${replaced?.name} (${replaced?.referenceId})`);
    }
    if (replaced?.contents?.[0]?.itemId !== 'acc-stand-75') {
      throw new Error(`Test 6 fallito: Accessori non sostituiti! Trovato: ${JSON.stringify(replaced?.contents)}`);
    }

    console.log("  ✅ TEST 6 SUPERATO: Sostituzione Monitor 75\" e accessori preservata su snapshot remoto!");
  }

  // TEST 7: Zone Notes Modification & Persistence (ZoneEditModal)
  {
    console.log("\n▶ TEST 7: Salvataggio e Persistenza Note Zona");
    const localZones = [
      {
        id: 'zone-palco',
        name: 'Palco Centrale',
        notes: 'Passaggio cavi sotterraneo obbligatorio e altezza truss 7m.',
        sections: [{ id: 'sec-1', name: 'Audio', components: [] }]
      }
    ];

    const remoteZones = [
      {
        id: 'zone-palco',
        name: 'Palco Centrale',
        notes: '', // Remote had empty notes before save
        sections: [{ id: 'sec-1', name: 'Audio', components: [] }]
      }
    ];

    const merged = reconcileZones(localZones, remoteZones, {
      modifiedZoneIds: new Set(['zone-palco']),
      sourceContext: 'builder'
    });

    const palco = merged.find(z => z.id === 'zone-palco');
    if (palco?.notes !== 'Passaggio cavi sotterraneo obbligatorio e altezza truss 7m.') {
      throw new Error(`Test 7 fallito: Note zona non conservate! Trovato: "${palco?.notes}"`);
    }

    console.log("  ✅ TEST 7 SUPERATO: Note zona salvate e preservate contro snapshot remoti!");
  }

  console.log("\n🎉 TUTTI I TEST DI CONCORRENZA MULTI-UTENTE HANNO AVUTO SUCCESSO!\n");
}

runTests();
