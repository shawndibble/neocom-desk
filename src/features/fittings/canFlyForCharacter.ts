import type { Fitting } from '@/engine/fittings/types';
import { loadActivePilotProfile } from './fittingPilotProfile';
import { fittingCanFly } from './useCompareCanFly';

const cache = new WeakMap<Fitting, Map<number, boolean>>();

/** Whether the Character can fly the Fitting, from their own trained skills. */
export async function canFlyForCharacter(fitting: Fitting, characterId: number): Promise<boolean> {
  const perFitting = cache.get(fitting) ?? new Map<number, boolean>();
  cache.set(fitting, perFitting);
  const cached = perFitting.get(characterId);
  if (cached !== undefined) return cached;
  const profile = await loadActivePilotProfile(characterId);
  const flies = await fittingCanFly(fitting, profile.skillLevels);
  perFitting.set(characterId, flies);
  return flies;
}
