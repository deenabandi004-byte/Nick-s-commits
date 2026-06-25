// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';  // ← ADD THIS LINE

// Firebase configuration — read from VITE_ env vars with hardcoded fallbacks
// so existing deploys continue to work without setting env vars.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "offerloop-native.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "offerloop-native",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "offerloop-native.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "184607281467",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:184607281467:web:eab1b0e8be341aa8c5271e",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);


// Initialize Cloud Firestore. Force HTTP long-polling so we never attempt the
// streaming WebChannel/QUIC transport — that transport stalls hard on this
// network (ERR_QUIC_PROTOCOL_ERROR / QUIC_TOO_MANY_RTOS), and auto-detect still
// tries it first. Long-polling is slightly less efficient but reliable; real-time
// listeners still work. Revisit if the network/proxy issue is resolved.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });

// Initialize Firebase Storage and get a reference to the service  // ← ADD THIS LINE
export const storage = getStorage(app);                             // ← ADD THIS LINE

export default app;
