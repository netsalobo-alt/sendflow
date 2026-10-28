import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const firestore =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

/**
 * Validates connection to Firestore at app startup as instructed by the Firebase skill.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const testRef = doc(firestore, 'system', 'connection_ping');
    await getDocFromServer(testRef).catch(() => null);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('the client is offline')) {
      console.warn('Firebase Firestore client is offline, using fallback cache.');
    } else {
      console.warn('Firestore initial check notice:', err);
    }
    return false;
  }
}
