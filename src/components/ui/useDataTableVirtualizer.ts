import { measureElement, useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface Options<T> {
  windowed: boolean;
  expandable: boolean;
  sortedRows: readonly T[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string | number;
  estimatedRowHeight: number;
  cardsWanted: boolean;
  expandedRowKey: string | number | null;
  highlightRowKey: string | number | null;
}

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
  const getItemKey = useCallback(
    (index: number) => rowKey(sortedRows[index], index),
    [rowKey, sortedRows]
  );
  const rowVirtualizer = useWindowVirtualizer({
    count: windowed ? sortedRows.length : 0,
    enabled: windowed,
    estimateSize: () => estimatedRowHeight,
    getItemKey,
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
    initialRect: { width: window.innerWidth, height: window.innerHeight },
  });
  useEffect(() => {
    if (windowed) rowVirtualizer.measure();
  }, [cardsWanted, windowed, rowVirtualizer]);

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

  const expandedIndex = useMemo(
    () =>
      windowed && expandedRowKey !== null
        ? sortedRows.findIndex((row, index) => rowKey(row, index) === expandedRowKey)
        : -1,
    [windowed, expandedRowKey, sortedRows, rowKey]
  );
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
  const [reachedHighlightKey, setReachedHighlightKey] = useState<string | number | null>(null);
  if (highlightMounted && reachedHighlightKey !== highlightRowKey) {
    setReachedHighlightKey(highlightRowKey);
  }
  if (highlightRowKey === null && reachedHighlightKey !== null) {
    setReachedHighlightKey(null);
  }
  const highlightReached = highlightRowKey !== null && reachedHighlightKey === highlightRowKey;
  useEffect(() => {
    if (highlightIndex < 0 || highlightReached) return;
    rowVirtualizer.scrollToIndex(highlightIndex, { align: 'center' });
  }, [highlightIndex, highlightReached, scrollMargin, rowVirtualizer]);
  const scrollToRowTrigger = useMemo(
    () => (windowed ? [rows, highlightReached] : rows),
    [windowed, rows, highlightReached]
  );
  return { rowVirtualizer, bodyRef, remeasureRow, expandedIndex, scrollToRowTrigger };
}
