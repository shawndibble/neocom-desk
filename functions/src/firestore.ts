import { getFirestore } from 'firebase-admin/firestore';

/**
 * The one Firestore accessor for index.ts and the job modules. A function, not
 * a constant: `initializeApp()` runs at index.ts load, so the handle must be
 * resolved per call, never at import time.
 */
export const firestore = () => getFirestore();
