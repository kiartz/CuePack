import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'cuepack-a7266', apiKey: 'mock-api-key' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
await signInWithEmailAndPassword(auth, 'benchmark_user@cuepack.local', 'Password123!');

const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const snap = await getDocs(collection(db, 'inventory_index'));
console.log(`Documenti indice letti: ${snap.size} (anziché 3140!)`);

const allItems = [];
snap.forEach(d => {
  allItems.push(...(d.data().items || []));
});
console.log(`Totale articoli disponibili in memoria per ricerca e UI: ${allItems.length}`);

// Test search 1: Mattonella
const query1 = 'mattonella';
const matches1 = allItems.filter(item => {
  const text = `${item.name} ${item.category || ''} ${item.description || ''}`.toLowerCase();
  return text.includes(query1);
});
console.log(`Risultati per '${query1}': ${matches1.length}`);
if (matches1.length > 0) {
  console.log(`Primo risultato: "${matches1[0].name}" [${matches1[0].category}] - Stock: ${matches1[0].inStock}`);
}

// Test search 2: LED
const query2 = 'led';
const matches2 = allItems.filter(item => {
  const text = `${item.name} ${item.category || ''} ${item.description || ''}`.toLowerCase();
  return text.includes(query2);
});
console.log(`Risultati per '${query2}': ${matches2.length}`);

// Test search 3: Cavo
const query3 = 'cavo';
const matches3 = allItems.filter(item => {
  const text = `${item.name} ${item.category || ''} ${item.description || ''}`.toLowerCase();
  return text.includes(query3);
});
console.log(`Risultati per '${query3}': ${matches3.length}`);

process.exit(0);
