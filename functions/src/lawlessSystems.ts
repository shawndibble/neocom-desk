/**
 * Lawless (insurgency) systems for Route Safety (issue #2870).
 *
 * CCP's public insurgency feed is CORS-locked to eveonline.com, so a scheduled
 * job (`syncLawlessSystems` in index.ts) fetches it and stores the lawless
 * system ids in Firestore for the app to read. This module is the pure parse
 * step and the write-or-skip decision, testable with no emulator.
 */

export const INSURGENCY_URL = 'https://www.eveonline.com/api/warzone/insurgency';

/** One doc in this collection holds the latest list (`LAWLESS_SYSTEMS_DOC`). */
export const SYSTEM_CONDITIONS_COLLECTION = 'systemConditions';
export const LAWLESS_SYSTEMS_DOC = 'lawless';

/** An insurgency's `corruptionState` once the system has gone lawless. */
export const LAWLESS_CORRUPTION_STATE = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * System ids of every insurgency at corruption state 5, once each, ascending.
 * A body that is not the expected list yields `[]`, never a throw: CCP gives no
 * stability promise for this endpoint.
 */
export function parseLawlessSystemIds(body: unknown): number[] {
  if (!Array.isArray(body)) return [];
  const ids = new Set<number>();
  for (const campaign of body) {
    if (!isRecord(campaign) || !Array.isArray(campaign.insurgencies)) continue;
    for (const insurgency of campaign.insurgencies) {
      if (!isRecord(insurgency) || insurgency.corruptionState !== LAWLESS_CORRUPTION_STATE)
        continue;
      const system = insurgency.solarSystem;
      if (isRecord(system) && typeof system.id === 'number' && Number.isInteger(system.id)) {
        ids.add(system.id);
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * How often an unchanged list is rewritten anyway (issue #4272). The app hides
 * the list once `updatedAt` is 60 minutes old (`LAWLESS_STALE_AFTER_MS` in
 * `src/engine/route/lawless.ts`), so `updatedAt` means "last confirmed", not
 * "last changed": half that limit leaves a couple of failed runs of margin
 * before a still-current list would age out.
 */
export const LAWLESS_HEARTBEAT_MS = 30 * 60 * 1000;

/** Whether a stored `systemIds` value holds exactly `next`'s ids, in any order. */
export function sameLawlessSystemIds(stored: unknown, next: readonly number[]): boolean {
  if (!Array.isArray(stored) || stored.length !== next.length) return false;
  if (!stored.every((id): id is number => typeof id === 'number')) return false;
  const a = [...stored].sort((x, y) => x - y);
  const b = [...next].sort((x, y) => x - y);
  return a.every((id, i) => id === b[i]);
}

/**
 * Whether `syncLawlessSystems` must write `systemConditions/lawless`: the list
 * changed, nothing usable is stored, or the heartbeat is due. Otherwise the run
 * skips the write — most runs, since the insurgency list rarely moves.
 */
export function lawlessWriteNeeded(stored: unknown, next: readonly number[], now: number): boolean {
  if (!isRecord(stored) || typeof stored.updatedAt !== 'number') return true;
  if (now - stored.updatedAt >= LAWLESS_HEARTBEAT_MS) return true;
  return !sameLawlessSystemIds(stored.systemIds, next);
}
