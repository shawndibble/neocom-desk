import { useObservedMeasure } from '@/lib/useObservedMeasure';
import { useCallback, useLayoutEffect, useState, type ReactNode } from 'react';
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';

interface VirtualFitListProps<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  estimateSize: number;
  label: string;
  capped: boolean;
  renderItem: (item: T) => ReactNode;
}

export const FIT_ROW_CLASS =
  'flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-panel px-2 py-1.5';

function scrollParentOf(element: Element): Element | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

export function VirtualFitList<T>({
  items,
  itemKey,
  estimateSize,
  label,
  capped,
  renderItem,
}: VirtualFitListProps<T>) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxRef = useCallback((node: HTMLDivElement | null) => setBox(node), []);
  const [list, setList] = useState<HTMLUListElement | null>(null);
  const listRef = useCallback((node: HTMLUListElement | null) => setList(node), []);

  const [scrollParent, setScrollParent] = useState<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (!capped && list) setScrollParent(scrollParentOf(list));
  }, [capped, list]);

  const [scrollMargin, setScrollMargin] = useState(0);
  const measureScrollMargin = useCallback(() => {
    if (!list || !scrollParent) return;
    setScrollMargin(
      list.getBoundingClientRect().top -
        scrollParent.getBoundingClientRect().top -
        scrollParent.clientTop +
        scrollParent.scrollTop
    );
  }, [list, scrollParent]);
  useObservedMeasure(
    () => {
      if (capped || !list || !scrollParent) return null;
      const observed: Element[] = [...scrollParent.children];
      for (
        let node = list.parentElement;
        node && node !== scrollParent;
        node = node.parentElement
      ) {
        observed.push(node);
      }
      return observed;
    },
    measureScrollMargin,
    [capped, list, scrollParent, measureScrollMargin],
    { layout: true }
  );
  useLayoutEffect(() => {
    if (capped) return;
    window.addEventListener('resize', measureScrollMargin);
    return () => window.removeEventListener('resize', measureScrollMargin);
  }, [capped, measureScrollMargin]);

  const scrollElement = capped ? box : (scrollParent ?? null);
  const margin = capped ? 0 : scrollMargin;
  const getItemKey = useCallback((index: number) => itemKey(items[index]), [itemKey, items]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: scrollElement !== null,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) ||
      instance.options.estimateSize(instance.indexFromElement(element)),
    getItemKey,
    scrollMargin: margin,
    overscan: 10,
  });

  if (!capped && scrollParent === null) {
    return (
      <ul aria-label={label} className="space-y-1">
        {items.map((item) => (
          <li key={itemKey(item)} className={FIT_ROW_CLASS}>
            {renderItem(item)}
          </li>
        ))}
      </ul>
    );
  }

  const rows = (
    <ul
      ref={listRef}
      aria-label={label}
      className="relative"
      style={{ height: scrollElement ? virtualizer.getTotalSize() : 0 }}
    >
      {scrollElement &&
        virtualizer.getVirtualItems().map((virtualRow) => (
          <li
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            aria-posinset={virtualRow.index + 1}
            aria-setsize={items.length}
            className="absolute top-0 left-0 w-full pb-1"
            style={{ transform: `translateY(${virtualRow.start - margin}px)` }}
          >
            <div className={FIT_ROW_CLASS}>{renderItem(items[virtualRow.index])}</div>
          </li>
        ))}
    </ul>
  );

  return capped ? (
    <div ref={boxRef} data-virtual-scroll-root className="max-h-72 overflow-y-auto">
      {rows}
    </div>
  ) : (
    rows
  );
}
