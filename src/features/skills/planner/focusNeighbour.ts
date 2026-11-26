import type { FocusCandidate } from '@/lib/useFocusAfterCommit';

export const PLAN_HANDLE_ATTR = 'data-plan-handle';

export function planRowHandle(rowId: string): HTMLElement | null {
  const handles = document.querySelectorAll<HTMLElement>(`[${PLAN_HANDLE_ATTR}]`);
  for (const handle of handles) {
    if (handle.getAttribute(PLAN_HANDLE_ATTR) === rowId) return handle;
  }
  return null;
}

export function neighbourFocusCandidates(
  rows: readonly { id: string; kind?: string }[],
  rowId: string,
  fallback: FocusCandidate
): FocusCandidate[] {
  const index = rows.findIndex((row) => row.id === rowId);
  const removedKind = rows[index]?.kind;
  const around = index < 0 ? [] : [...rows.slice(index + 1), ...rows.slice(0, index).reverse()];
  const stable = around.filter(
    (row) => row.kind !== 'prereq' && !(removedKind === 'marker' && row.kind === 'marker')
  );
  return [...stable.map((row) => () => planRowHandle(row.id)), fallback];
}
