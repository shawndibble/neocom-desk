import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { DataTableHeader } from './DataTableHeader';
import type { StickyHeaderState } from './useStickyTableHeader';

type HeaderProps<T> = Omit<ComponentProps<typeof DataTableHeader<T>>, 'floating'>;

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
