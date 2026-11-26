import { isRecord } from './guards.js';

export const INSURGENCY_URL = 'https://www.eveonline.com/api/warzone/insurgency';

export const SYSTEM_CONDITIONS_COLLECTION = 'systemConditions';

export const LAWLESS_CORRUPTION_STATE = 5;

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
