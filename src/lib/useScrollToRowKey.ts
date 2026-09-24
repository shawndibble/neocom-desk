import { useEffect, useRef, type RefObject } from 'react';

/**
 * Scrolls the `[data-row-key]` element matching `rowKey` into view — the row
 * a notification pointed at (`useHighlightParam`). Pair with `row-pulse` on
 * that row so the reader arrives on it rather than scanning for it.
 *
 * Also marks that row `aria-current="location"` and moves keyboard focus onto
 * it (issue #1490) — `row-pulse` alone is a colour-only signal, invisible to
 * assistive tech and to anyone who can't see the pulse. A row that isn't
 * otherwise focusable gets a temporary `tabindex="-1"` so it can still take
 * focus; both are cleared the moment a different key takes over, so a stale
 * row never keeps announcing itself as current.
 *
 * Runs whenever the row set changes as well as the key: rows arrive a render
 * or more after the key does (the fetch resolves later), and scrolling the
 * same element twice is harmless where missing it leaves the reader where
 * they landed. A key matching no row does nothing. Focus only moves the first
 * time a given key's row is found, not on every later refresh of `rows` —
 * otherwise a live-polling list would keep yanking focus back.
 */
export function useScrollToRowKey(
  containerRef: RefObject<HTMLElement | null>,
  rowKey: string | number | null,
  rows: unknown
): void {
  const currentRef = useRef<{ key: string | number; el: HTMLElement; hadTabIndex: boolean } | null>(
    null
  );

  useEffect(() => {
    if (currentRef.current && currentRef.current.key !== rowKey) {
      const { el, hadTabIndex } = currentRef.current;
      el.removeAttribute('aria-current');
      if (!hadTabIndex) el.removeAttribute('tabindex');
      currentRef.current = null;
    }

    if (rowKey === null) return;

    const row = containerRef.current?.querySelector(
      `[data-row-key="${CSS.escape(String(rowKey))}"]`
    );
    if (!row) return;
    const el = row as HTMLElement;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });

    const alreadyCurrent = currentRef.current?.el === el;
    const hadTabIndex = alreadyCurrent
      ? currentRef.current!.hadTabIndex
      : el.hasAttribute('tabindex');
    el.setAttribute('aria-current', 'location');
    if (!hadTabIndex) el.setAttribute('tabindex', '-1');
    if (!alreadyCurrent) el.focus({ preventScroll: true });
    currentRef.current = { key: rowKey, el, hadTabIndex };
  }, [containerRef, rowKey, rows]);
}
