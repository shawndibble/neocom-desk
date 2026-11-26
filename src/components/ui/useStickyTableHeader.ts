import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface StickyHeaderState {
  top: number;
  left: number;
  width: number;
  tableWidth: number;
  columnWidths: number[];
  scrollLeft: number;
  background: string;
  container: HTMLElement | null;
}

const SCROLLING = /auto|scroll|overlay/;

const paddingOwners = new Map<HTMLElement, { before: string; heights: Map<symbol, number> }>();

function setPadding(el: HTMLElement, owner: symbol, height: number) {
  const entry = paddingOwners.get(el) ?? { before: el.style.scrollPaddingTop, heights: new Map() };
  entry.heights.set(owner, height);
  paddingOwners.set(el, entry);
  el.style.scrollPaddingTop = `${Math.max(...entry.heights.values())}px`;
}

function clearPadding(el: HTMLElement, owner: symbol) {
  const entry = paddingOwners.get(el);
  if (!entry) return;
  entry.heights.delete(owner);
  if (entry.heights.size > 0) {
    el.style.scrollPaddingTop = `${Math.max(...entry.heights.values())}px`;
    return;
  }
  el.style.scrollPaddingTop = entry.before;
  paddingOwners.delete(el);
}

function verticalScroller(table: HTMLElement): HTMLElement | null {
  for (let el = table.parentElement; el && el !== document.body; el = el.parentElement) {
    if (SCROLLING.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) {
      return el;
    }
  }
  return null;
}

function horizontalScroller(table: HTMLElement): HTMLElement | null {
  for (let el = table.parentElement; el && el !== document.body; el = el.parentElement) {
    if (SCROLLING.test(getComputedStyle(el).overflowX)) return el;
  }
  return null;
}

function alphaOf(color: string): number {
  const match = /(?:\/\s*|^rgba\(.*,\s*)([\d.]+%?)\)$/.exec(color);
  if (!match) return 1;
  return match[1].endsWith('%') ? parseFloat(match[1]) / 100 : parseFloat(match[1]);
}

function backgroundBehind(el: HTMLElement): string {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (!color || color === 'transparent') continue;
    const alpha = alphaOf(color);
    if (alpha === 0) continue;
    return alpha < 1 ? `linear-gradient(${color}, ${color}), var(--color-bg)` : color;
  }
  return 'var(--color-bg)';
}

export function useStickyTableHeader(
  tableRef: RefObject<HTMLTableElement | null>,
  enabled: boolean
): StickyHeaderState | null {
  const [state, setState] = useState<StickyHeaderState | null>(null);

  const measure = useCallback((): StickyHeaderState | null => {
    const table = tableRef.current;
    const head = table?.tHead;
    if (!table || !head) return null;
    const headRect = head.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const vScroller = verticalScroller(table);
    const scrollerRect = vScroller?.getBoundingClientRect();
    const viewTop = scrollerRect ? Math.max(0, scrollerRect.top) : 0;
    if (headRect.top >= viewTop || tableRect.bottom - headRect.height <= viewTop) return null;
    if (scrollerRect && scrollerRect.bottom - headRect.height <= viewTop) return null;
    const hScroller = horizontalScroller(table);
    const hRect = (hScroller ?? table).getBoundingClientRect();
    return {
      top: Math.min(viewTop, tableRect.bottom - headRect.height),
      left: hRect.left,
      width: hScroller ? hScroller.clientWidth : table.offsetWidth,
      tableWidth: table.offsetWidth,
      columnWidths: Array.from(head.rows[0]?.cells ?? [])
        .filter((cell) => getComputedStyle(cell).display !== 'none')
        .map((cell) => cell.getBoundingClientRect().width),
      scrollLeft: hScroller?.scrollLeft ?? 0,
      background: backgroundBehind(table),
      container: table.closest('dialog'),
    };
  }, [tableRef]);

  useEffect(() => {
    const table = tableRef.current;
    if (!enabled || !table) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = measure();
      setState((previous) => {
        if (!next || !previous) return next;
        const same =
          next.top === previous.top &&
          next.left === previous.left &&
          next.width === previous.width &&
          next.tableWidth === previous.tableWidth &&
          next.scrollLeft === previous.scrollLeft &&
          next.container === previous.container &&
          next.columnWidths.join() === previous.columnWidths.join();
        return same ? previous : next;
      });
      reservePadding();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const owner = Symbol('sticky-table-header');
    let paddedEl: HTMLElement | null = null;
    function reservePadding() {
      const head = table?.tHead;
      if (!table || !head) return;
      const el = verticalScroller(table) ?? document.documentElement;
      if (el !== paddedEl) releasePadding();
      paddedEl = el;
      setPadding(el, owner, head.getBoundingClientRect().height);
    }
    function releasePadding() {
      if (paddedEl) clearPadding(paddedEl, owner);
      paddedEl = null;
    }

    update();
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(table);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      releasePadding();
      setState(null);
    };
  }, [enabled, measure, tableRef]);

  return enabled ? state : null;
}
