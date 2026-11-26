import type { ImproveState } from './useImprove';

export function hasImproveResults(
  state: Extract<ImproveState, { status: 'done' }>,
  { blocked }: { blocked: boolean }
): boolean {
  const { result } = state;
  return (
    result.makeFlyable.length > 0 ||
    (blocked && result.flyableBlocked.length > 0) ||
    result.noDownside.length > 0 ||
    result.tradeOffs.length > 0 ||
    state.makeover !== undefined
  );
}
