import { eyebrowClassName } from './eyebrowClassName';
import { cx } from '@/lib/cx';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterCount } from '@/features/character/useCharacters';
import { useOneTimeHint } from '@/lib/hintFlags';
import { Button } from './Button';
import { Popover, PopoverAnchor, PopoverContent } from './Popover';
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
  buttonLabel: string;
  menuTitle: string;
  onReset?: () => void;
  resetLabel?: string;
  size?: ComponentProps<typeof IconButton>['size'];
  extraItems?: readonly { id: string; label: string; checked: boolean; onToggle: () => void }[];
}

const COLUMN_PICKER_HINT = 'columnPickerHint';

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
  const { t } = useTranslation();
  const visibleSet = new Set(visible);
  const loggedIn = useCharacterCount() > 0;
  const hasHiddenColumns = available.some((id) => !visibleSet.has(id));
  const [hintShown, dismissHint, hintAnchor] = useOneTimeHint(
    COLUMN_PICKER_HINT,
    loggedIn && hasHiddenColumns
  );

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && hintShown) dismissHint();
      }}
    >
      <Popover open={hintShown} onOpenChange={(open) => !open && dismissHint()}>
        <PopoverAnchor asChild ref={hintAnchor}>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<Icon.ColumnsPicker />} label={buttonLabel} size={size} />
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          aria-label={buttonLabel}
          className="flex max-w-60 flex-col items-start gap-2 p-2 text-xs"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
        >
          <p>{t('common.columnPickerHint')}</p>
          <Button size="sm" onClick={dismissHint}>
            {t('common.hintGotIt')}
          </Button>
        </PopoverContent>
      </Popover>
      <DropdownMenuContent align="end" className="min-w-48">
        <p className={cx(eyebrowClassName, 'px-2 py-1.5')}>{menuTitle}</p>
        {available.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={visibleSet.has(id)}
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
