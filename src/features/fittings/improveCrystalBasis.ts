import type { ImproveSearch } from './useImprove';

export function crystalBasisOf(state: ImproveSearch['state']) {
  const basis = state.status === 'done' ? state.crystals : undefined;
  const now = state.status === 'done' ? (state.fitAsIs?.mining.perSecond ?? 0) : 0;
  const best = state.status === 'done' ? state.before.mining.perSecond : 0;
  return {
    basis,
    unloaded: basis?.unloaded ?? null,
    now,
    best,
    differs: basis !== undefined && now !== best,
  };
}
