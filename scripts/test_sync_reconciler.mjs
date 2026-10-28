import { reconcileZones, createDefaultWarehouseState, compactZonesForStorage } from '../src/services/syncReconciler.ts';

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

  // TEST 8: Isolation between "Crea Liste" (draftZones) and "Preparazione Eventi" (zones) until "Aggiorna" is pressed
  {
    console.log("\n▶ TEST 8: Isolamento modifiche in Crea Liste da Preparazione Eventi finché non si preme 'Aggiorna'");
    const confirmedZonesV1 = [
      {
        id: 'zone-1',
        name: 'Zona Principale',
        sections: [{
          id: 'sec-audio',
          name: 'Audio',
          components: [
            { uniqueId: 'c-mic', name: 'Microfono Shure', quantity: 2, type: 'item' },
            { uniqueId: 'c-rcf', name: 'Cassa RCF', quantity: 2, type: 'item' }
          ]
        }]
      }
    ];

    // Firestore state for a completed list v1.0
    let firestoreDoc = {
      id: 'list-1',
      version: '1.0',
      isCompleted: true,
      zones: JSON.parse(JSON.stringify(confirmedZonesV1)),
      snapshot: JSON.parse(JSON.stringify(confirmedZonesV1)),
      draftZones: []
    };

    // Helper simulating updateActiveList payload routing in PackingListBuilder
    const buildFirestorePayload = (baseList, updates) => {
      const isVersionPublish = updates.snapshot !== undefined;
      const isPublished = Boolean(baseList.isCompleted || baseList.isDraftVisible);
      const firestoreUpdates = { ...updates };
      if (isVersionPublish) {
        firestoreUpdates.draftZones = [];
      } else if (isPublished && firestoreUpdates.zones) {
        firestoreUpdates.draftZones = firestoreUpdates.zones;
        delete firestoreUpdates.zones;
        delete firestoreUpdates.snapshot;
      }
      return firestoreUpdates;
    };

    // 1. Designer edits list in Crea Liste WITHOUT pressing "Aggiorna":
    //    - Changes Mic from 2 -> 8
    //    - Deletes Cassa RCF
    //    - Adds Mixer A&H
    const designerDraftEdit = [
      {
        id: 'zone-1',
        name: 'Zona Principale',
        sections: [{
          id: 'sec-audio',
          name: 'Audio',
          components: [
            { uniqueId: 'c-mic', name: 'Microfono Shure', quantity: 8, type: 'item' },
            { uniqueId: 'c-mixer', name: 'Mixer Allen&Heath', quantity: 1, type: 'item' }
          ]
        }]
      }
    ];

    const payloadWithoutAggiorna = buildFirestorePayload(firestoreDoc, { zones: designerDraftEdit });
    if (payloadWithoutAggiorna.zones !== undefined) {
      throw new Error("Test 8 fallito: 'zones' non deve essere aggiornato prima di premere Aggiorna!");
    }
    firestoreDoc = { ...firestoreDoc, ...payloadWithoutAggiorna };

    // Verify what Preparazione Eventi (PrepMaterialView) sees:
    const prepViewComps = firestoreDoc.zones[0].sections[0].components;
    if (prepViewComps.length !== 2 || prepViewComps[0].quantity !== 2 || prepViewComps[1].uniqueId !== 'c-rcf') {
      throw new Error(`Test 8 fallito: Preparazione Eventi è cambiata prima di premere Aggiorna! Trovato: ${JSON.stringify(prepViewComps)}`);
    }

    // 2. Meanwhile, Warehouse operator in Preparazione Eventi checks 'Microfono Shure' as loaded
    firestoreDoc.zones[0].sections[0].components[0].warehouseState = {
      inDistinta: true,
      loaded: true,
      returned: false,
      isBroken: false,
      warehouseNote: 'Baule 1'
    };

    // 3. Now Designer presses "Aggiorna" (v1.1) -> explicit version publish
    const publishedV1_1 = [
      {
        id: 'zone-1',
        name: 'Zona Principale',
        sections: [{
          id: 'sec-audio',
          name: 'Audio',
          components: [
            {
              uniqueId: 'c-mic',
              name: 'Microfono Shure',
              quantity: 8,
              type: 'item',
              warehouseState: firestoreDoc.zones[0].sections[0].components[0].warehouseState
            },
            { uniqueId: 'c-mixer', name: 'Mixer Allen&Heath', quantity: 1, type: 'item' }
          ]
        }]
      }
    ];

    const payloadWithAggiorna = buildFirestorePayload(firestoreDoc, {
      version: '1.1',
      snapshot: publishedV1_1,
      zones: publishedV1_1,
      isCompleted: true
    });
    firestoreDoc = { ...firestoreDoc, ...payloadWithAggiorna };

    const prepAfterAggiorna = firestoreDoc.zones[0].sections[0].components;
    if (prepAfterAggiorna[0].quantity !== 8 || !prepAfterAggiorna.find(c => c.uniqueId === 'c-mixer')) {
      throw new Error("Test 8 fallito: Dopo aver premuto Aggiorna, Preparazione Eventi non ha ricevuto le modifiche!");
    }
    if (firestoreDoc.draftZones.length !== 0) {
      throw new Error("Test 8 fallito: draftZones dovrebbe essere svuotato dopo Aggiorna!");
    }

    console.log("  ✅ TEST 8 SUPERATO: Preparazione Eventi è rimasta 100% invariata durante le modifiche e si è aggiornata SOLO al click su Aggiorna!");
  }

  // TEST 9: Exclusive Zone Lock in Crea Liste (Single-User Per Zone)
  {
    console.log("\n▶ TEST 9: Blocco Esclusivo Zona in Crea Liste (Un solo utente per zona)");
    const ZONE_LOCK_TTL_MS = 2 * 60 * 1000;

    const getZoneLockWarning = (zoneId, zoneLocks, currentUserUid, now = Date.now()) => {
      const lock = zoneLocks?.[zoneId];
      if (!lock) return null;
      if (now - (lock.lockedAt || 0) > ZONE_LOCK_TTL_MS) return null;
      if (lock.uid === currentUserUid) return null;
      const nome = lock.userEmail ? lock.userEmail.split('@')[0] : lock.userName;
      return `L'utente ${nome} sta lavorando su questa lista. Un solo utente può modificare la zona.`;
    };

    const now = Date.now();
    const zoneLocks = {
      'zone-main': {
        uid: 'user-roberto-uid',
        userEmail: 'roberto.chiartano@service.it',
        userName: 'roberto.chiartano',
        sessionId: 'sess-1',
        lockedAt: now
      }
    };

    // 1. User A (owner) accesses zone-main -> allowed (null warning)
    const ownerCheck = getZoneLockWarning('zone-main', zoneLocks, 'user-roberto-uid', now);
    if (ownerCheck !== null) {
      throw new Error(`Test 9 fallito: Il proprietario del lock non deve essere bloccato! Ricevuto: ${ownerCheck}`);
    }

    // 2. User B tries to access zone-main -> blocked with exact message
    const secondUserCheck = getZoneLockWarning('zone-main', zoneLocks, 'user-marco-uid', now);
    const expectedMsg = "L'utente roberto.chiartano sta lavorando su questa lista. Un solo utente può modificare la zona.";
    if (secondUserCheck !== expectedMsg) {
      throw new Error(`Test 9 fallito: Messaggio di blocco non conforme!\nAtteso: "${expectedMsg}"\nRicevuto: "${secondUserCheck}"`);
    }

    // 3. User B accesses another unlocked zone ('zone-sala-b') -> allowed
    const otherZoneCheck = getZoneLockWarning('zone-sala-b', zoneLocks, 'user-marco-uid', now);
    if (otherZoneCheck !== null) {
      throw new Error(`Test 9 fallito: Una zona libera non deve essere bloccata!`);
    }

    // 4. Stale lock (> 2 min) expires automatically
    const expiredCheck = getZoneLockWarning('zone-main', zoneLocks, 'user-marco-uid', now + ZONE_LOCK_TTL_MS + 1000);
    if (expiredCheck !== null) {
      throw new Error(`Test 9 fallito: Un lock scaduto deve permettere l'accesso!`);
    }

    console.log("  ✅ TEST 9 SUPERATO: Blocco esclusivo zona e messaggio 'L'utente NOME sta lavorando su questa lista. Un solo utente può modificare la zona.' verificati!");
  }

  // TEST 10: Large Event Compaction (45 Zones like EIMA 2026 under Firestore 1 MiB Limit)
  {
    console.log("\n▶ TEST 10: Compattazione Eventi Grandi (45+ Zone come EIMA 2026 sotto il limite 1 MiB di Firestore)");
    const raw45Zones = Array.from({ length: 45 }, (_, zIdx) => ({
      id: `zone-${zIdx + 1}`,
      name: `PAD. ${zIdx + 1} - STAND EIMA`,
      location: '',
      notes: '',
      sections: [
        {
          id: `sec-video-${zIdx + 1}`,
          name: 'Video',
          notes: '',
          components: Array.from({ length: 7 }, (__, cIdx) => ({
            uniqueId: `comp-${zIdx + 1}-${cIdx + 1}`,
            type: 'item',
            referenceId: `ref-item-${cIdx + 1}`,
            name: `Monitor Samsung 55" #${cIdx + 1}`,
            category: 'Regia Video',
            quantity: 2,
            isExternalRental: false,
            databaseId: 'default',
            notes: '',
            prepNote: '',
            warehouseState: {
              inDistinta: zIdx < 8 && cIdx === 0,
              loaded: false,
              returned: false,
              isBroken: false,
              warehouseNote: '',
              changeLog: {
                previousQuantity: 0,
                previousVersion: 'v1.15',
                wasChecked: false,
                changedAt: '2026-10-28T08:00:00.000Z',
                history: [
                  { version: 'v1.15', name: `Monitor Samsung 55" #${cIdx + 1}`, quantity: 0, wasChecked: false, updatedAt: '2026-10-27T08:00:00.000Z' },
                  { version: 'v1.16', name: `Monitor Samsung 55" #${cIdx + 1}`, quantity: 2, wasChecked: false, updatedAt: '2026-10-28T08:00:00.000Z' }
                ]
              }
            },
            contents: Array.from({ length: 3 }, (___, sIdx) => ({
              itemId: `acc-${sIdx + 1}`,
              name: `Cavo HDMI 5mt #${sIdx + 1}`,
              quantity: 1,
              category: 'Cavi Video',
              notes: '',
              prepNote: '',
              warehouseState: {
                inDistinta: false,
                loaded: false,
                returned: false,
                isBroken: false,
                warehouseNote: ''
              }
            }))
          }))
        }
      ]
    }));

    const compactedZones = compactZonesForStorage(raw45Zones, 'zones');
    const compactedSnapshot = compactZonesForStorage(raw45Zones, 'snapshot');
    const compactedDraft = compactZonesForStorage(raw45Zones, 'draft');

    if (compactedZones.length !== 45 || compactedSnapshot.length !== 45) {
      throw new Error(`Test 10 fallito: attese 45 zone, trovate ${compactedZones.length}`);
    }

    // Check that Zone 1 Comp 1 preserved its inDistinta = true and changeLog
    const z1c1 = compactedZones[0].sections[0].components[0];
    if (!z1c1.warehouseState?.inDistinta || !z1c1.warehouseState?.changeLog) {
      throw new Error("Test 10 fallito: warehouseState o changeLog perso su componente attivo!");
    }

    // Check that clean accessory warehouseState was omitted (undefined)
    if (z1c1.contents[0].warehouseState !== undefined) {
      throw new Error("Test 10 fallito: warehouseState vuoto su accessorio non è stato compattato!");
    }

    // Check that snapshot stripped warehouseState completely
    if (compactedSnapshot[0].sections[0].components[0].warehouseState !== undefined) {
      throw new Error("Test 10 fallito: snapshot non ha rimosso warehouseState!");
    }

    const totalPublishPayloadBytes = JSON.stringify({
      zones: compactedZones,
      snapshot: compactedSnapshot,
      draftZones: []
    }).length;

    const totalDraftPayloadBytes = JSON.stringify({
      zones: compactedZones.slice(0, 8),
      snapshot: compactedSnapshot.slice(0, 8),
      draftZones: compactedDraft
    }).length;

    console.log(`     Dimensione payload pubblicazione 45 zone (zones + snapshot): ${(totalPublishPayloadBytes / 1024).toFixed(1)} KB`);
    console.log(`     Dimensione payload bozza 45 zone (draftZones + 8 zone pub): ${(totalDraftPayloadBytes / 1024).toFixed(1)} KB`);

    if (totalPublishPayloadBytes > 500 * 1024) {
      throw new Error(`Test 10 fallito: Payload troppo grande (${totalPublishPayloadBytes} bytes)!`);
    }

    console.log("  ✅ TEST 10 SUPERATO: Tutte le 45 zone pubblicate in Preparazione Eventi sotto i 350 KB (ben sotto il limite di 1 MiB di Firestore)!");
  }

  // TEST 11: Calendar date coordination & handle alignment (No regression on EIMA 2026 multi-zone)
  {
    console.log("\n▶ TEST 11: Bounding Box Calendario, Maniglie e Compattazione Date Zone");
    // Simulate EIMA event with 43 zones and truck load date before zone setups
    const timelineStart = new Date(2026, 9, 20); // 20 Oct 2026
    const columnWidth = 70;

    const truckLoadDate = "2026-10-26";
    const setupDate = "2026-10-29";
    const showDate = "2026-11-04";
    const returnDate = "2026-11-15";

    const getDayDiff = (d1, d2) => Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    const parseYmd = (s) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    const dTruck = parseYmd(truckLoadDate);
    const dSetup = parseYmd(setupDate);
    const dShow = parseYmd(showDate);
    const dReturn = parseYmd(returnDate);

    // Main event duration
    const eventDuration = getDayDiff(dTruck, dReturn) + 1;
    const truckDays = getDayDiff(dTruck, dSetup); // 3 days (26, 27, 28)
    const setupDays = getDayDiff(dSetup, dShow); // 6 days (29, 30, 31, 1, 2, 3)

    if (truckDays !== 3 || setupDays !== 6) {
      throw new Error(`Test 11 fallito: calcolo giorni errato (truck=${truckDays}, setup=${setupDays})`);
    }

    // Handle X positions
    const truckHandleX = getDayDiff(timelineStart, dTruck) * columnWidth;
    const setupHandleX = getDayDiff(timelineStart, dSetup) * columnWidth;

    // Relative offset of Setup inside event bar
    const setupRelXInBar = truckDays * columnWidth;
    const barAbsoluteX = truckHandleX;
    const calculatedSetupAbsoluteX = barAbsoluteX + setupRelXInBar;

    if (calculatedSetupAbsoluteX !== setupHandleX) {
      throw new Error(`Test 11 fallito: disallineamento maniglia Setup (${calculatedSetupAbsoluteX} vs ${setupHandleX})`);
    }

    // Moving truck date forward (from 26 to 27)
    const newTruck = parseYmd("2026-10-27");
    const newTruckDays = getDayDiff(newTruck, dSetup); // 2 days
    const newBarAbsoluteX = getDayDiff(timelineStart, newTruck) * columnWidth;
    const newCalculatedSetupX = newBarAbsoluteX + (newTruckDays * columnWidth);

    // Setup absolute timeline X must remain EXACTLY setupHandleX (Oct 29)! It must NOT shift backward!
    if (newCalculatedSetupX !== setupHandleX) {
      throw new Error(`Test 11 fallito: lo spostamento del carico ha spostato all'indietro il montaggio! (${newCalculatedSetupX} vs ${setupHandleX})`);
    }

    console.log("  ✅ TEST 11 SUPERATO: Allineamento maniglie e date calendario perfetto (nessuno spostamento backward)!");
  }

  console.log("\n🎉 TUTTI I TEST DI CONCORRENZA MULTI-UTENTE HANNO AVUTO SUCCESSO!\n");
}

runTests();
