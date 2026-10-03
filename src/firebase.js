import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let app = null;
let db = null;
let auth = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else if (import.meta.env.DEV) {
  console.warn(
    '[firebase] Missing VITE_FIREBASE_* env vars. Copy .env.example to .env and fill in values from the Firebase console (project com-slaughterhouse-app).'
  );
}

export { app, db, auth };
export const COLLECTIONS = {
  vendors: 'vendors',
  slaughterRecords: 'slaughter_records',
  invoices: 'invoices',
  notifications: 'notifications',
  serviceFeesDoc: 'config/serviceFees'
};
