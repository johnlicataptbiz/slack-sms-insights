import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Firebase API keys are designed to be public and embedded in client-side code.
// Security is enforced through Firebase Console > Project Settings > Your Apps:
// - Add domain restrictions under "Authorized domains" 
// - Enable "Restrict key usage" in Google Cloud Console for this API key
// - Recommended allowed domains: ptbizsms.com, www.ptbizsms.com, localhost (for dev)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

export const firebaseApp = initializeApp(firebaseConfig);

export const initializeFirebaseAnalytics = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  if (await isSupported()) {
    getAnalytics(firebaseApp);
  }
};
