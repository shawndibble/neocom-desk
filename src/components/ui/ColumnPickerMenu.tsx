import { Button } from './Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './DropdownMenu';
import type { DataTableColumn } from './DataTable';

interface ColumnPickerMenuProps<Id extends string, Row> {
  available: readonly Id[];
  visible: readonly Id[];
  columnsById: Record<Id, DataTableColumn<Row>>;
  onToggle: (id: Id) => void;
  buttonLabel: string;
  menuTitle: string;
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
}: ColumnPickerMenuProps<Id, Row>) {
  const visibleSet = new Set(visible);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="md">{buttonLabel}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <p className="px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {menuTitle}
        </p>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
