import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DigimonCardData } from '../types';

enum OperationType {
  LIST = 'list',
  GET = 'get',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function getAllCards(): Promise<DigimonCardData[]> {
  const path = 'cards';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const cards: DigimonCardData[] = [];
    querySnapshot.forEach((doc) => {
      cards.push(doc.data() as DigimonCardData);
    });
    return cards;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
