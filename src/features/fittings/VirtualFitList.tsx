/**
 * A windowed list of fit rows: only the rows in view (plus overscan) mount.
 *
 * Built for the EVE Workbench tab, where a popular hull lists 500+ fits and
 * rendering every row at once — each with its module icons and their
 * tooltips — blocked the main thread for seconds, and the Trade Hub prices
 * landed only after that render finished (see `workbenchFitPrices.ts`).
 *
 * Two shapes, after `PopularFitsPanel`'s `capped` prop:
 *
 * - **Capped**: a fixed-height box that scrolls in place, and is the
 *   virtualizer's scroll element (`useVirtualizer`, as `Assets.tsx` does).
 * - **Uncapped**: the list runs its full length and its host scrolls. The
 *   hosts that do this are a slide-over or sheet body (`SlideOver`, `Modal`),
 *   an element with its own `overflow-y: auto` — not the page — so
 *   `useWindowVirtualizer` would never hear a scroll. The list instead windows
 *   against its nearest scrolling ancestor, offset by where it sits in it
 *   (`scrollMargin`, the same offset `NotificationsPanel` keeps against the
 *   page). With no scrolling ancestor at all it renders every row, as before.
 *
 * Rows keep list semantics: the `<ul>` holds only `<li>`s, each carrying its
 * place in the whole list (`aria-posinset`/`aria-setsize`) since only some are
 * in the DOM. Each row is measured once laid out, so rows of any height fit.
 */
import { useCallback, useLayoutEffect, useState, type ReactNode } from 'react';
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';

interface VirtualFitListProps<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  /** A first guess at one row's height, gap included; each row is then measured. */
  estimateSize: number;
  /** The list's accessible name. */
  label: string;
  /** Scroll in a fixed-height box, rather than letting the host scroll. */
  capped: boolean;
  renderItem: (item: T) => ReactNode;
}

/** A fit row's box — here and on the zKillboard tab's rows, so the two tabs match. */
export const FIT_ROW_CLASS =
  'flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-panel px-2 py-1.5';

/**
 * The nearest ancestor that scrolls vertically, or `null` when only the page
 * does. Read from computed `overflow-y`, which an `overflow-x`-only box also
 * reports as `auto` — fine for today's hosts, whose only such box is the
 * scrolling body itself.
 */
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
  // Callback refs into state, not `useRef` read at render (the
  // `react-hooks/refs` rule) — the same pattern `NotificationsPanel` uses.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxRef = useCallback((node: HTMLDivElement | null) => setBox(node), []);
  const [list, setList] = useState<HTMLUListElement | null>(null);
  const listRef = useCallback((node: HTMLUListElement | null) => setList(node), []);

  // Uncapped: `undefined` until the list is in the DOM to look up from (no
  // rows yet, so the first commit never mounts the whole list); `null` when
  // nothing but the page scrolls. Looked up once per mount: the hosts don't
  // change which element scrolls under a mounted list.
  const [scrollParent, setScrollParent] = useState<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (!capped && list) setScrollParent(scrollParentOf(list));
  }, [capped, list]);

  // Where the list starts inside its scroll parent's content. Re-measured
  // whenever anything above it changes height — the pricing line comes and
  // goes — which resizes one of the boxes between the list and its scroll
  // parent, or the scroll parent's own content.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (capped || !list || !scrollParent) return;
    const measure = () =>
      setScrollMargin(
        list.getBoundingClientRect().top -
          scrollParent.getBoundingClientRect().top -
          scrollParent.clientTop +
          scrollParent.scrollTop
      );
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    for (const child of scrollParent.children) observer.observe(child);
    for (let node = list.parentElement; node && node !== scrollParent; node = node.parentElement) {
      observer.observe(node);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [capped, list, scrollParent]);

  const scrollElement = capped ? box : (scrollParent ?? null);
  const margin = capped ? 0 : scrollMargin;
  const getItemKey = useCallback((index: number) => itemKey(items[index]), [itemKey, items]);
  // React Compiler isn't enabled in this build; this is eslint-plugin-react-hooks
  // flagging TanStack Virtual's returned functions, as in `Assets.tsx`.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: scrollElement !== null,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    // Rows wrap at narrow widths, so the estimate is only a first guess.
    // Zero (jsdom, a row not laid out yet) falls back to the estimate.
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) ||
      instance.options.estimateSize(instance.indexFromElement(element)),
    getItemKey,
    scrollMargin: margin,
    overscan: 10,
  });

  // No scrolling ancestor at all: the plain list.
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
