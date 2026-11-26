import type { FittingModule } from '../types';

export const isMutated = (module: Pick<FittingModule, 'mutation'>): boolean =>
  module.mutation !== undefined;

export const placeKey = (module: Pick<FittingModule, 'slot' | 'slotIndex'>): string =>
  `${module.slot}${module.slotIndex}`;

export interface MutatedKept {
  kept: number;
  unflyable: number;
}

export function mutatedKept(
  modules: readonly FittingModule[],
  allowMutated: boolean,
  canFly?: (module: FittingModule) => boolean
): MutatedKept {
  if (allowMutated) return { kept: 0, unflyable: 0 };
  const mutated = modules.filter(isMutated);
  return {
    kept: mutated.length,
    unflyable: canFly ? mutated.filter((module) => !canFly(module)).length : 0,
  };
}
