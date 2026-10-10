import type { FocusCandidate } from '@/lib/useFocusAfterCommit';

/** Marks a plan row's drag-handle button, so focus can find any row's handle (entry, prereq or marker). */
export const PLAN_HANDLE_ATTR = 'data-plan-handle';

/** The drag-handle button of the row with this merged-row id, if it is mounted. */
export function planRowHandle(rowId: string): HTMLElement | null {
  const handles = document.querySelectorAll<HTMLElement>(`[${PLAN_HANDLE_ATTR}]`);
  for (const handle of handles) {
    if (handle.getAttribute(PLAN_HANDLE_ATTR) === rowId) return handle;
  }
  return null;
}

/**
 * Where focus goes when a row is removed: each row after it, then each row
 * before it (nearest first), then `fallback` (the "Your entries" heading).
 * Getters, so a row that goes in the same update is skipped at focus time.
 */
export function neighbourFocusCandidates(
  rows: readonly { id: string }[],
  rowId: string,
  fallback: FocusCandidate
): FocusCandidate[] {
  const index = rows.findIndex((row) => row.id === rowId);
  const around = index < 0 ? [] : [...rows.slice(index + 1), ...rows.slice(0, index).reverse()];
  return [...around.map((row) => () => planRowHandle(row.id)), fallback];
}
