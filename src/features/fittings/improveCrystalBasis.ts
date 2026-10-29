import type { ImproveSearch } from './useImprove';

/**
 * Mine more's rows compare on the best crystals while "Now" is the fit as it
 * is: the miners without the ore's crystals, and both figures in m³/s.
 */
export function crystalBasisOf(state: ImproveSearch['state']) {
  const basis = state.status === 'done' ? state.crystals : undefined;
  const now = state.status === 'done' ? (state.fitAsIs?.mining.perSecond ?? 0) : 0;
  const best = state.status === 'done' ? state.before.mining.perSecond : 0;
  return {
    basis,
    unloaded: basis?.unloaded ?? null,
    now,
    best,
    // Said only when "Now" and the rows are on different crystals.
    differs: basis !== undefined && now !== best,
  };
}
