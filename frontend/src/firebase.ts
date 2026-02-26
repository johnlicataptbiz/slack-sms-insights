import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Firebase API keys are designed to be public and embedded in client-side code.
// Security is enforced through Firebase Console > Project Settings > Your Apps:
// - Add domain restrictions under "Authorized domains" 
// - Enable "Restrict key usage" in Google Cloud Console for this API key
// - Recommended allowed domains: ptbizsms.com, www.ptbizsms.com, localhost (for dev)
const firebaseConfig = {
  apiKey: 'AIzaSyBLaIFv578OpjGkNXcssrqqk1_M_TtFFBo',
  authDomain: 'aloware-sms-updates.firebaseapp.com',
  projectId: 'aloware-sms-updates',
  storageBucket: 'aloware-sms-updates.firebasestorage.app',
  messagingSenderId: '295905998690',
  appId: '1:295905998690:web:99bfcc5deb26625d071e3b',
  measurementId: 'G-5KG64GBL70',
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
