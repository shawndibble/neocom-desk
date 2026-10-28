import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Where the floating copy of a table's header sits, in viewport pixels. */
export interface StickyHeaderState {
  /** Top edge: the scroller's visible top, pulled up as the table ends. */
  top: number;
  left: number;
  /** Visible width: the sideways scroller's, not the table's. */
  width: number;
  /** The real table's width and per-column widths, so the copy lines up. */
  tableWidth: number;
  columnWidths: number[];
  scrollLeft: number;
  background: string;
  /** Dialog the table sits in, if any: only its top layer can show above it. */
  container: HTMLElement | null;
}

const SCROLLING = /auto|scroll|overlay/;

/**
 * `scroll-padding-top` owners per scroller. Two tables share the page, so a
 * per-table save/restore would leave the first one's value behind.
 */
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

/**
 * The nearest ancestor that scrolls the table's rows. `overflow-x: auto`
 * (the sideways wrapper) computes `overflow-y: auto` too, so a plain
 * `position: sticky` sticks to that wrapper, never to the page — which is
 * why the header is a floating copy. Only an ancestor that really overflows
 * vertically counts; none means the page.
 */
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

/** Alpha of a computed colour: `rgba(r, g, b, a)` or `oklab(l a b / a)`; 1 when absent (plain `rgb(r, g, b)` too). */
function alphaOf(color: string): number {
  const match = /(?:\/\s*|^rgba\(.*,\s*)([\d.]+%?)\)$/.exec(color);
  if (!match) return 1;
  return match[1].endsWith('%') ? parseFloat(match[1]) / 100 : parseFloat(match[1]);
}

/**
 * First ancestor fill, so rows do not show through the copy. A translucent
 * panel fill (`bg-panel` is 85% opaque) is laid over the page colour, since
 * the copy floats above rows rather than sitting on the panel.
 */
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

/**
 * Pins a copy of a table's header to the top of whatever scrolls its rows
 * (the page, or a modal body) once the real header has scrolled away, and
 * unpins it as the table ends. Also reserves the header's height as
 * `scroll-padding-top` on that scroller so a focused or highlighted row is
 * not hidden under it (WCAG 2.4.11).
 *
 * Returns the copy's geometry while it should show, else `null`.
 */
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
    // The real header still in view, or no body left to cover, or the
    // scroller itself has left the screen above the copy.
    if (headRect.top >= viewTop || tableRect.bottom - headRect.height <= viewTop) return null;
    if (scrollerRect && scrollerRect.bottom - headRect.height <= viewTop) return null;
    const hScroller = horizontalScroller(table);
    const hRect = (hScroller ?? table).getBoundingClientRect();
    return {
      top: Math.min(viewTop, tableRect.bottom - headRect.height),
      left: hRect.left,
      width: hScroller ? hScroller.clientWidth : table.offsetWidth,
      tableWidth: table.offsetWidth,
      // Only rendered cells: a `max-sm:hidden` column has no `<th>` in the
      // copy, so its zero-width entry would shift every column after it.
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

    // The scroller's `scroll-padding-top` is the header's height for as long
    // as this table is on screen, shown or not: a row scrolled to the top
    // edge must already clear the copy that appears once it gets there.
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
    // Capture: `scroll` does not bubble, and the page, a modal body and the
    // sideways wrapper all matter.
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
