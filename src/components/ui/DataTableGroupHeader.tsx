import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, rowInteractiveClassName } from './controlStyles';
import * as Icon from './icons';

interface DataTableGroupHeaderProps {
  colSpan: number;
  expanded: boolean;
  onToggle: () => void;
  allWidths?: boolean;
  children: ReactNode;
}

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
          <Chevron aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-dim" />
          <span className="min-w-0 flex-1">{children}</span>
        </button>
      </td>
    </tr>
  );
}
