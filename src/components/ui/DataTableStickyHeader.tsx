import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { DataTableHeader } from './DataTableHeader';
import type { StickyHeaderState } from './useStickyTableHeader';

type HeaderProps<T> = Omit<ComponentProps<typeof DataTableHeader<T>>, 'floating'>;

/**
 * The copy of a table-mode table's header pinned over the top of the screen
 * while its rows scroll under it on a phone (`useStickyTableHeader` says
 * where). Presentational: the real header stays the one assistive tech reads,
 * so this is `aria-hidden` with its controls out of the tab order; a tap on
 * a sort button still sorts. Its own box scrolls sideways in step with the
 * real wrapper, which keeps the pinned column pinned.
 */
export function DataTableStickyHeader<T>({
  state,
  ...header
}: HeaderProps<T> & { state: StickyHeaderState }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = state.scrollLeft;
  });
  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="dt-sticky-header"
      style={{
        top: state.top,
        left: state.left,
        width: state.width,
        background: state.background,
      }}
      className="pointer-events-auto fixed z-30 overflow-hidden border-b border-line"
    >
      <table
        className="text-xs"
        style={{ width: state.tableWidth, tableLayout: 'fixed' }}
        role="presentation"
      >
        <colgroup>
          {state.columnWidths.map((width, i) => (
            <col key={i} style={{ width }} />
          ))}
        </colgroup>
        <DataTableHeader {...header} floating />
      </table>
    </div>,
    state.container ?? document.body
  );
}
