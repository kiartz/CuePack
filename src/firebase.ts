import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Helper to safely access environment variables without strict type checking
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key];
  }
  return undefined;
};

// Configuration from Environment Variables
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Collection References Constants
export const COLL_INVENTORY = 'inventory';
export const COLL_KITS = 'kits';
export const COLL_LISTS = 'packing_lists';
export const COLL_CHECKLIST_CONFIG = 'checklist_config';

// --- Generic Helper Functions ---

/**
 * Adds or Overwrites a document in a collection with a specific ID.
 */
export const addOrUpdateItem = async (collectionName: string, item: any) => {
  try {
    const docRef = doc(db, collectionName, item.id);
    await setDoc(docRef, item);
  } catch (error) {
    console.error(`Error writing to ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Updates specific fields of a document.
 */
export const updateItemFields = async (collectionName: string, id: string, fields: any) => {
  try {
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, fields);
  } catch (error) {
    console.error(`Error updating ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Deletes a document.
 */
export const deleteItem = async (collectionName: string, id: string) => {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.error(`Error deleting from ${collectionName}:`, error);
    throw error;
  }
};

// --- Batch Helper for Reset/Import ---

export const batchWriteItems = async (collectionName: string, items: any[]) => {
    const batch = writeBatch(db);
    items.forEach(item => {
        const docRef = doc(db, collectionName, item.id);
        batch.set(docRef, item);
    });
    await batch.commit();
};