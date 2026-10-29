import type { ImproveState } from './useImprove';

/**
 * Whether a finished search has anything to list: a swap row or a Makeover.
 * `blocked` also counts the rows the pilot cannot fly yet (shown by the panel,
 * but not worth the footer's selection bar, which has nothing to tick for them).
 */
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
