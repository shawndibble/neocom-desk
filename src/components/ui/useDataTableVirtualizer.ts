import { measureElement, useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface Options<T> {
  windowed: boolean;
  expandable: boolean;
  sortedRows: readonly T[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string | number;
  estimatedRowHeight: number;
  /** Card/table layout switch: measured sizes from the old layout are dropped. */
  cardsWanted: boolean;
  expandedRowKey: string | number | null;
  highlightRowKey: string | number | null;
}

/**
 * Windowing state for `DataTable`: the page-level virtualizer, where the body
 * sits on the page, row re-measuring, and the scroll-to-highlight bookkeeping
 * a windowed table needs because off-window rows aren't in the DOM.
 */
export function useDataTableVirtualizer<T>({
  windowed,
  expandable,
  sortedRows,
  rows,
  rowKey,
  estimatedRowHeight,
  cardsWanted,
  expandedRowKey,
  highlightRowKey,
}: Options<T>) {
  // Where the body starts on the page: the virtualizer's positions are
  // measured from the top of the document, not this table. A callback ref
  // plus a body-resize observer, as `NotificationsPanel` does, since
  // whatever sits above the table (filters, a banner) can change height
  // after mount. `getBoundingClientRect` rather than `offsetTop`, which is
  // relative to the nearest positioned ancestor, not the document.
  const [bodyElement, setBodyElement] = useState<HTMLTableSectionElement | null>(null);
  const bodyRef = useCallback((node: HTMLTableSectionElement | null) => setBodyElement(node), []);
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    if (!windowed || !bodyElement) return;
    const measure = () => setScrollMargin(bodyElement.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [windowed, bodyElement]);
  // Stable across scroll renders: TanStack Virtual rebuilds every row's
  // position whenever this function's identity changes, which on a
  // six-figure snapshot is the whole cost windowing exists to avoid.
  const getItemKey = useCallback(
    (index: number) => rowKey(sortedRows[index], index),
    [rowKey, sortedRows]
  );
  const rowVirtualizer = useWindowVirtualizer({
    count: windowed ? sortedRows.length : 0,
    enabled: windowed,
    estimateSize: () => estimatedRowHeight,
    getItemKey,
    // A laid-out row never measures 0 — only jsdom (no layout) or a hidden
    // container reports that — so 0 keeps the estimate instead of collapsing
    // every row and mounting the whole list.
    //
    // An expandable row's size is its own `<tr>` plus the detail `<tr>`
    // beneath it when open. Re-measured by the row itself on a toggle, which
    // is why that path reads the row fresh: TanStack's default answers a
    // measure without a ResizeObserver entry from its cache, which would
    // still hold the detail's height after a collapse.
    measureElement: (element, entry, instance) => {
      if (!expandable) return measureElement(element, entry, instance) || estimatedRowHeight;
      const own = entry
        ? measureElement(element, entry, instance)
        : (element as HTMLElement).offsetHeight;
      const next = element.nextElementSibling;
      const detail =
        next instanceof HTMLElement && next.classList.contains('dt-row-detail')
          ? next.offsetHeight
          : 0;
      return (own || estimatedRowHeight) + detail;
    },
    scrollMargin,
    overscan: 10,
    // The viewport's size before the virtualizer has observed it. Its
    // default, 0×0, windows nothing on the first render after `enabled`
    // flips — which, for a table crossing `VIRTUALIZE_THRESHOLD`, would
    // unmount every row (and drop its focus) for one commit.
    initialRect: { width: window.innerWidth, height: window.innerHeight },
  });
  // Switching between table rows and cards swaps in rows of a different height; drop
  // the sizes measured under the old layout (TanStack Virtual's documented
  // reset, as `NotificationsPanel` does on its own breakpoint).
  // Guarded: `measure()` re-renders, and every non-windowed table would pay
  // for that on mount.
  useEffect(() => {
    if (windowed) rowVirtualizer.measure();
  }, [cardsWanted, windowed, rowVirtualizer]);

  // A row's own re-measure (see `DataTableRow`'s `remeasure`): straight to
  // `resizeItem`, through the same `measureElement` the virtualizer uses.
  // Its options are read at call time, so this stays stable.
  const remeasureRow = useCallback(
    (node: HTMLTableRowElement) => {
      const index = Number(node.getAttribute('data-index'));
      if (!Number.isInteger(index)) return;
      rowVirtualizer.resizeItem(
        index,
        rowVirtualizer.options.measureElement(node, undefined, rowVirtualizer)
      );
    },
    [rowVirtualizer]
  );

  // Windowed, where the open row sits in the whole set: the rows below it
  // shift one `aria-rowindex` down for its detail row.
  const expandedIndex = useMemo(
    () =>
      windowed && expandedRowKey !== null
        ? sortedRows.findIndex((row, index) => rowKey(row, index) === expandedRowKey)
        : -1,
    [windowed, expandedRowKey, sortedRows, rowKey]
  );
  // Opening a row closes the previous one, which may have been scrolled out
  // of the window: nothing mounted is left to re-measure it, and its cached
  // size would keep its detail's height until it next mounts. Its main row's
  // own size is only known by measuring, so the estimate stands in. TanStack
  // compensates the scroll position for a row entirely above the viewport.
  // Tracked by key, not index: a re-sort moves the open row without closing it.
  const previousExpandedKey = useRef(expandedRowKey);
  useLayoutEffect(() => {
    const previous = previousExpandedKey.current;
    if (previous === expandedRowKey) return;
    previousExpandedKey.current = expandedRowKey;
    if (!windowed || previous === null) return;
    const index = sortedRows.findIndex((row, i) => rowKey(row, i) === previous);
    if (index < 0 || rowVirtualizer.getVirtualItems().some((item) => item.index === index)) return;
    rowVirtualizer.resizeItem(index, estimatedRowHeight);
  }, [expandedRowKey, windowed, sortedRows, rowKey, rowVirtualizer, estimatedRowHeight]);

  // A highlighted row outside the window isn't in the DOM for
  // `useScrollToRowKey` to find, so the virtualizer scrolls to it first —
  // not smoothly: TanStack Virtual can't smooth-scroll to a dynamically
  // measured row. Re-run as `scrollMargin` settles (the first call on mount
  // measures from 0) and until the row has actually mounted.
  const highlightIndex = useMemo(
    () =>
      windowed && highlightRowKey !== null
        ? sortedRows.findIndex((row, index) => rowKey(row, index) === highlightRowKey)
        : -1,
    [windowed, highlightRowKey, sortedRows, rowKey]
  );
  const highlightMounted =
    highlightIndex >= 0 &&
    rowVirtualizer.getVirtualItems().some((item) => item.index === highlightIndex);
  // Latched per key: which key's row has mounted at least once. Scrolling
  // away and back must not count as arriving again, or `useScrollToRowKey`
  // would yank the page back to it and re-take focus.
  const [reachedHighlightKey, setReachedHighlightKey] = useState<string | number | null>(null);
  if (highlightMounted && reachedHighlightKey !== highlightRowKey) {
    setReachedHighlightKey(highlightRowKey);
  }
  // Cleared with the key, so a later link to the same row is a new arrival
  // and gets scrolled to again, as an unwindowed table's row would.
  if (highlightRowKey === null && reachedHighlightKey !== null) {
    setReachedHighlightKey(null);
  }
  const highlightReached = highlightRowKey !== null && reachedHighlightKey === highlightRowKey;
  useEffect(() => {
    if (highlightIndex < 0 || highlightReached) return;
    rowVirtualizer.scrollToIndex(highlightIndex, { align: 'center' });
  }, [highlightIndex, highlightReached, scrollMargin, rowVirtualizer]);
  // Windowed, the hook also re-runs once the row first mounts. Its
  // imperative `aria-current="location"` lives on that DOM node, so it is
  // gone if the reader scrolls the row out of the window and back — the
  // pulse and focus have done their job by then.
  const scrollToRowTrigger = useMemo(
    () => (windowed ? [rows, highlightReached] : rows),
    [windowed, rows, highlightReached]
  );
  return { rowVirtualizer, bodyRef, remeasureRow, expandedIndex, scrollToRowTrigger };
}
