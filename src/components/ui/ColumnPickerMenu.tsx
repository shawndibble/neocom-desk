import { eyebrowClassName } from './eyebrowClassName';
import { cx } from '@/lib/cx';
import type { ComponentProps } from 'react';
import * as Icon from './icons';
import { IconButton } from './IconButton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';
import type { DataTableColumn } from './DataTable';

interface ColumnPickerMenuProps<Id extends string, Row> {
  available: readonly Id[];
  visible: readonly Id[];
  columnsById: Record<Id, DataTableColumn<Row>>;
  onToggle: (id: Id) => void;
  /** Accessible name and tooltip text for the trigger — the picker itself is icon-only. */
  buttonLabel: string;
  menuTitle: string;
  /**
   * "Reset to default" action below a separator (issue #1282, Mining
   * Overview's first consumer to need one — Characters' and BPC Search's
   * pickers have no equivalent). Omitted entirely when `onReset` isn't given.
   */
  onReset?: () => void;
  resetLabel?: string;
  /** Trigger size; defaults to `IconButton`'s own default so existing callers are unchanged. */
  size?: ComponentProps<typeof IconButton>['size'];
  /** Checkable picks that aren't columns (a heading figure), below a separator after the columns. */
  extraItems?: readonly { id: string; label: string; checked: boolean; onToggle: () => void }[];
}

/**
 * Which columns show in a table view — a menu, not a form: every toggle is
 * already reversible in one tap. Labels come straight from `columnsById`'s
 * own already-translated `header`, not a second id->i18n-key table that could
 * drift from it.
 *
 * Extracted from `Characters.tsx`'s original table-view column picker
 * (issue #796) so a second table (BPC Search) can toggle its own columns
 * through the same mechanism rather than a hand-rolled second one.
 */
export function ColumnPickerMenu<Id extends string, Row>({
  available,
  visible,
  columnsById,
  onToggle,
  buttonLabel,
  menuTitle,
  onReset,
  resetLabel,
  size,
  extraItems,
}: ColumnPickerMenuProps<Id, Row>) {
  const visibleSet = new Set(visible);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<Icon.ColumnsPicker />} label={buttonLabel} size={size} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <p className={cx(eyebrowClassName, 'px-2 py-1.5')}>{menuTitle}</p>
        {available.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={visibleSet.has(id)}
            // A picker that closes on the first check makes picking several
            // columns take one round trip per column.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(id)}
          >
            {columnsById[id].header}
          </DropdownMenuCheckboxItem>
        ))}
        {extraItems && extraItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {extraItems.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.id}
                checked={item.checked}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={item.onToggle}
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        {onReset && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onReset}>{resetLabel}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
