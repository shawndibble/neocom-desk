/**
 * Mutated (abyssal) modules in Improve (#5800). Every swap goes through the shared
 * swap helper, which drops the roll, so Improve leaves a fitted mutated module alone
 * unless the pilot opts in; these are the shared rules for that.
 */
import type { FittingModule } from './types';

/** Whether the fitted module is a mutated one (its roll is what a swap would lose). */
export const isMutated = (module: Pick<FittingModule, 'mutation'>): boolean =>
  module.mutation !== undefined;

/** `slot` + index: where a fitted module sits, for telling copies of one type apart. */
export const placeKey = (module: Pick<FittingModule, 'slot' | 'slotIndex'>): string =>
  `${module.slot}${module.slotIndex}`;

export interface MutatedKept {
  /** Mutated modules left alone. */
  kept: number;
  /** Of those, the ones the pilot cannot fly yet: a plain module would be replaced, this one is not. */
  unflyable: number;
}

/**
 * The mutated modules Improve skipped: all of them unless swaps of mutated modules are
 * allowed. `canFly` tells a module the pilot cannot fly (absent: all flyable).
 */
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
