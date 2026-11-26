import type { Fitting } from '@/engine/fittings/types';
import { loadActivePilotProfile } from './fittingPilotProfile';
import { fittingCanFly } from './useCompareCanFly';

const cache = new WeakMap<Fitting, Map<number, boolean>>();

export async function canFlyForCharacter(
  fitting: Fitting,
  characterId: number
): Promise<boolean | null> {
  const perFitting = cache.get(fitting) ?? new Map<number, boolean>();
  cache.set(fitting, perFitting);
  const cached = perFitting.get(characterId);
  if (cached !== undefined) return cached;
  const profile = await loadActivePilotProfile(characterId);
  const flies = await fittingCanFly(fitting, profile.skillLevels);
  if (flies !== null) perFitting.set(characterId, flies);
  return flies;
}
