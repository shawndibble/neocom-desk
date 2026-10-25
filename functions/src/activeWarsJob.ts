/**
 * Body of `syncActiveWars` (see its doc in index.ts): runs the sweep
 * (`activeWarsSweep.ts`) against `systemConditions/activeWars` in Firestore.
 */
import { ACTIVE_WARS_DOC } from './activeWars.js';
import { runActiveWarsSweep, type ActiveWarsDoc } from './activeWarsSweep.js';
import { firestore } from './firestore.js';
import { SYSTEM_CONDITIONS_COLLECTION } from './lawlessSystems.js';

export * from './activeWarsSweep.js';

/** Body of syncActiveWars (see its doc in index.ts). */
export async function runSyncActiveWars(): Promise<void> {
  const ref = firestore().collection(SYSTEM_CONDITIONS_COLLECTION).doc(ACTIVE_WARS_DOC);
  await runActiveWarsSweep({
    fetchImpl: fetch,
    read: async () => (await ref.get()).data() as ActiveWarsDoc | undefined,
    write: async (doc) => {
      await ref.set(doc);
    },
    now: Date.now,
  });
}
