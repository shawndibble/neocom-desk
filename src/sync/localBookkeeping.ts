// Device-local Dexie bookkeeping keys the sync driver (planSync.ts) uses to
// track per-Character sync state (owner-hash bookmark, tombstone lists).
// Firebase-free and safe to import synchronously — unlike the rest of
// src/sync, which is deliberately kept behind `await import(...)` (see
// index.ts's code-splitting note) — so this is what lets
// features/character/removeCharacter.ts clean these up on removal without
// pulling in the ~160 KB Firebase bundle.

import { db } from '@/db';

export const INTERNAL_PREFIX = 'sync.__';

export const ownerHashKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}ownerHash.${characterId}`;
export const planTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}tombstones.${characterId}`;
export const buildPlanTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}buildTombstones.${characterId}`;
export const quickbarTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}quickbarTombstones.${characterId}`;
export const stationPinTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}stationPinTombstones.${characterId}`;

/**
 * Drop every device-local sync bookkeeping key for one Character (owner-hash
 * bookmark + the three tombstone lists). Called when a Character is removed —
 * its skillPlans/buildPlans/quickbars rows are already gone by then, so there
 * is nothing left for these to describe.
 */
export async function clearCharacterSyncBookkeeping(characterId: number): Promise<void> {
  await db.settings.bulkDelete([
    ownerHashKey(characterId),
    planTombstonesKey(characterId),
    buildPlanTombstonesKey(characterId),
    quickbarTombstonesKey(characterId),
    stationPinTombstonesKey(characterId),
  ]);
}
