import { useEffect, useRef, type RefObject } from 'react';

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

  useEffect(() => {
    return () => {
      const current = currentRef.current;
      if (!current) return;
      current.el.removeAttribute('aria-current');
      if (!current.hadTabIndex) current.el.removeAttribute('tabindex');
    };
  }, []);
}
