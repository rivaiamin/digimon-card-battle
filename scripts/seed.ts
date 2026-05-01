import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, getDocs } from 'firebase/firestore';
import cards from '../src/data/cards.json';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function seed() {
  console.log('Starting seed...');
  for (const card of cards) {
    try {
      await setDoc(doc(db, 'cards', card.id), card);
      console.log(`Seeded card: ${card.name}`);
    } catch (e) {
      console.error(`Error seeding ${card.id}:`, e);
    }
  }
  console.log('Seed complete.');
}

seed();
