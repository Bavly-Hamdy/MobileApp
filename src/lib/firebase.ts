import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged as onAuthStateChangedFunction, User } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, connectFirestoreEmulator, enableNetwork, disableNetwork } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getDatabase } from "firebase/database";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDc1iS4NX2um7sqJuYRSll9Il_7V6g6LsE",
  authDomain: "graduatinproject.firebaseapp.com",
  databaseURL: "https://graduatinproject-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "graduatinproject",
  storageBucket: "graduatinproject.appspot.com",
  messagingSenderId: "361149223809",
  appId: "1:361149223809:web:58467e248f81422f97ce80",
};

// Initialize Firebase once
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);
export const database = getDatabase(app);

// Connection state management
let isOnline = navigator.onLine;
let connectionPromise: Promise<void> | null = null;

// Monitor connection state
window.addEventListener('online', async () => {
  console.log('Firebase: Network came online, enabling Firestore');
  isOnline = true;
  try {
    await enableNetwork(firestore);
  } catch (error) {
    console.warn('Firebase: Error enabling network:', error);
  }
});

window.addEventListener('offline', async () => {
  console.log('Firebase: Network went offline, disabling Firestore');
  isOnline = false;
  try {
    await disableNetwork(firestore);
  } catch (error) {
    console.warn('Firebase: Error disabling network:', error);
  }
});

// Exponential backoff retry utility
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Firebase: Retry attempt ${attempt + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};

// Enhanced authentication state monitoring
export const onAuthStateChanged = (callback: (user: User | null) => void) => {
  return onAuthStateChangedFunction(auth, (user) => {
    console.log('Firebase Auth: State changed:', user ? `User ${user.uid}` : 'No user');
    callback(user);
  });
};

// Enhanced offline persistence with better error handling
const enableOfflineCapabilities = async () => {
  try {
    await enableIndexedDbPersistence(firestore, {
      forceOwnership: false
    });
    console.log("Firebase: Offline persistence enabled successfully");
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      if ((error as { code: string }).code === 'failed-precondition') {
        console.warn("Firebase: Multiple tabs open, persistence can only be enabled in one tab at a time");
      } else if ((error as { code: string }).code === 'unimplemented') {
        console.warn("Firebase: The current browser does not support offline persistence");
      } else {
        console.error("Firebase: Error enabling offline persistence:", error);
      }
    } else {
      console.error("Firebase: Unknown error enabling offline persistence:", error);
    }
  }
};

// Initialize Analytics conditionally
export const initializeAnalytics = async () => {
  try {
    if (await isSupported()) {
      return getAnalytics(app);
    }
  } catch (error) {
    console.warn('Firebase: Analytics not supported:', error);
  }
  return null;
};

// Connection health check
export const checkConnection = async (): Promise<boolean> => {
  if (!connectionPromise) {
    connectionPromise = withRetry(async () => {
      if (!isOnline) {
        throw new Error('Network offline');
      }
      await enableNetwork(firestore);
    }, 2, 500).then(() => {
      connectionPromise = null;
    }).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  
  try {
    await connectionPromise;
    return true;
  } catch {
    return false;
  }
};

// Initialize Firebase services
console.log('Firebase: Initializing services for project:', firebaseConfig.projectId);
enableOfflineCapabilities();
