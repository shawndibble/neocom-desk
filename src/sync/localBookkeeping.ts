// Device-local Dexie bookkeeping keys the sync driver (planSync.ts) uses to
// track per-Character sync state (owner-hash bookmark, tombstone lists).
// Firebase-free and safe to import synchronously — unlike the rest of
// src/sync, which is deliberately kept behind `await import(...)` (see
// index.ts's code-splitting note) — so this is what lets
// features/character/removeCharacter.ts clean these up on removal without
// pulling in the ~160 KB Firebase bundle.

import { db } from '@/db';
import type { LocalTombstone } from './merge';

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
export const planetRichnessTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}planetRichnessTombstones.${characterId}`;
export const productionRunTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}productionRunTombstones.${characterId}`;
export const productionSaleLinkTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}productionSaleLinkTombstones.${characterId}`;
export const productionOrderWatchTombstonesKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}productionOrderWatchTombstones.${characterId}`;

/**
 * One Character's tombstone list for a collection, by its bookkeeping key.
 *
 * Lives here rather than in planSync.ts so a Firebase-free module can read
 * tombstones — `accountWideBackfill.ts` has to, and importing planSync would
 * drag the ~160 KB Firebase bundle into a Dexie-only path.
 */
export async function readTombstones(key: string): Promise<LocalTombstone[]> {
  const record = await db.settings.get(key);
  return Array.isArray(record?.value) ? (record.value as LocalTombstone[]) : [];
}

/**
 * Drop every device-local sync bookkeeping key for one Character (owner-hash
 * bookmark + every collection's tombstone list). Called when a Character is
 * removed — its skillPlans/buildPlans/quickbars/etc. rows are already gone by
 * then, so there is nothing left for these to describe.
 */
export async function clearCharacterSyncBookkeeping(characterId: number): Promise<void> {
  await db.settings.bulkDelete([
    ownerHashKey(characterId),
    planTombstonesKey(characterId),
    buildPlanTombstonesKey(characterId),
    quickbarTombstonesKey(characterId),
    stationPinTombstonesKey(characterId),
    planetRichnessTombstonesKey(characterId),
    productionRunTombstonesKey(characterId),
    productionSaleLinkTombstonesKey(characterId),
    productionOrderWatchTombstonesKey(characterId),
  ]);
}
