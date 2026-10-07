/**
 * Lawless (insurgency) systems for Route Safety (issue #2870).
 *
 * CCP's public insurgency feed is CORS-locked to eveonline.com, so a scheduled
 * job (`syncLawlessSystems` in index.ts) fetches it and stores the lawless
 * system ids in Firestore for the app to read. This module is the pure parse
 * step, testable from fixture JSON with no emulator.
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
