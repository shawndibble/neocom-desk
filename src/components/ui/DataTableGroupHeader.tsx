import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, rowInteractiveClassName } from './controlStyles';
import * as Icon from './icons';

interface DataTableGroupHeaderProps {
  /** Cells the header row spans: the caller's columns plus the trailing ones. */
  colSpan: number;
  expanded: boolean;
  /** Receives the *effective* `expanded`, so a default-expanded group closes in one tap. */
  onToggle: () => void;
  /** Off a phone an all-widths fold takes a table row's height, not a card's. */
  allWidths?: boolean;
  children: ReactNode;
}

/** The fold row above a `DataTable` group's member rows. */
export function DataTableGroupHeader({
  colSpan,
  expanded,
  onToggle,
  allWidths,
  children,
}: DataTableGroupHeaderProps) {
  const Chevron = expanded ? Icon.Expanded : Icon.Descend;
  return (
    <tr role="row" className={cx('dt-group-header', rowInteractiveClassName)}>
      <td role="cell" colSpan={colSpan} className="p-0">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className={cx(
            'flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left',
            focusRingInsetClassName,
            allWidths && 'sm:min-h-0'
          )}
        >
          <span className="min-w-0 flex-1">{children}</span>
          <Chevron aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-dim" />
        </button>
      </td>
    </tr>
  );
}
