import { useEffect, useRef } from 'react';
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import { rootFontScale } from '@/lib/fontScale';

export function useAssetRowVirtualizer<Row extends { key: string }>({
  rows,
  baseRowHeight,
  resetKey,
}: {
  rows: readonly Row[];
  baseRowHeight: (row: Row) => number;
  resetKey: string;
}) {
  const scrollParentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => rootFontScale() * baseRowHeight(rows[index]),
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) ||
      instance.options.estimateSize(instance.indexFromElement(element)),
    getItemKey: (index) => rows[index].key,
    overscan: 10,
  });

  useEffect(() => {
    if (scrollParentRef.current) scrollParentRef.current.scrollTop = 0;
  }, [resetKey]);

  return { scrollParentRef, rowVirtualizer };
}
