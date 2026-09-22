import { useEffect, type RefObject } from 'react';

/**
 * Scrolls the `[data-row-key]` element matching `rowKey` into view — the row
 * a notification pointed at (`useHighlightParam`). Pair with `row-pulse` on
 * that row so the reader arrives on it rather than scanning for it.
 *
 * Runs whenever the row set changes as well as the key: rows arrive a render
 * or more after the key does (the fetch resolves later), and scrolling the
 * same element twice is harmless where missing it leaves the reader where
 * they landed. A key matching no row does nothing.
 */
export function useScrollToRowKey(
  containerRef: RefObject<HTMLElement | null>,
  rowKey: string | number | null,
  rows: unknown
): void {
  useEffect(() => {
    if (rowKey === null) return;
    const row = containerRef.current?.querySelector(
      `[data-row-key="${CSS.escape(String(rowKey))}"]`
    );
    if (!row) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    row.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [containerRef, rowKey, rows]);
}
