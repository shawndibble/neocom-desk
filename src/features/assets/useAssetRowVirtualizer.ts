import { useEffect, useRef } from 'react';
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import { rootFontScale } from '@/lib/fontScale';

/**
 * The virtualizer both asset browsers (character and corp) window their rows
 * with. `baseRowHeight` is the unscaled estimate per row; it is scaled by the
 * root font size. `resetKey` changing (a new level, or search on/off) puts the
 * new list back at the top rather than inheriting the previous scroll offset.
 */
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
  // React Compiler isn't enabled in this build (no babel plugin configured);
  // this is eslint-plugin-react-hooks flagging TanStack Virtual's returned
  // functions as unsafe to memoize *if* the compiler is ever turned on.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => rootFontScale() * baseRowHeight(rows[index]),
    // Rows wrap onto two lines at phone widths, so the estimate is only a first
    // guess — measure the real height or rows overlap. Zero (jsdom, a row not
    // laid out yet) falls back to the estimate.
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) ||
      instance.options.estimateSize(instance.indexFromElement(element)),
    getItemKey: (index) => rows[index].key,
    overscan: 10,
  });

  // Plain `scrollTop` rather than `scrollTo()` — jsdom's test shim implements
  // the former, not the latter.
  useEffect(() => {
    if (scrollParentRef.current) scrollParentRef.current.scrollTop = 0;
  }, [resetKey]);

  return { scrollParentRef, rowVirtualizer };
}
