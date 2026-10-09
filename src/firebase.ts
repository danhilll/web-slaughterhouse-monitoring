import { initializeApp, getApps } from 'firebase/app';
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

const app = isFirebaseConfigured
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null;
const auth = app ? getAuth(app) : null;

if (!isFirebaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[firebase] Missing web app configuration. Copy .env.example to .env and fill in the Firebase web app values.'
  );
}

export { app, auth };
