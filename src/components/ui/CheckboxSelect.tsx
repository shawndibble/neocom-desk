import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { selectTriggerClassName, type ControlSize } from './controlStyles';
import { useFilterSurface } from './filterSurface';
import { SelectChevron } from './SelectChevron';

export interface CheckboxSelectOption<V> {
  value: V;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface CheckboxSelectProps<V> {
  label: string;
  options: readonly CheckboxSelectOption<V>[];
  selected: ReadonlySet<V>;
  onToggle: (value: V) => void;
  size?: ControlSize;
  noneLabel?: string;
  className?: string;
  active?: boolean;
}

export function CheckboxSelect<V extends string | number>({
  label,
  options,
  selected,
  onToggle,
  size = 'md',
  noneLabel,
  className,
  active,
}: CheckboxSelectProps<V>) {
  const { t } = useTranslation();
  const inline = useFilterSurface() === 'inline';
  const chosen = options.filter((option) => selected.has(option.value));
  const summary =
    chosen.length === options.length
      ? t('common.checkboxSelect.all')
      : chosen.length === 0
        ? (noneLabel ?? t('common.checkboxSelect.none'))
        : chosen.length === 1
          ? chosen[0].label
          : t('common.checkboxSelect.count', { count: chosen.length });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('common.checkboxSelect.labelled', { label, value: summary })}
        className={cx(selectTriggerClassName(size), className)}
        data-active={active || undefined}
      >
        <span>
          {inline ? t('common.checkboxSelect.labelled', { label, value: summary }) : summary}
        </span>
        <SelectChevron size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            disabled={option.disabled}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(option.value)}
          >
            <span className="flex flex-col">
              <span>{option.label}</span>
              {option.description && (
                <span className="text-[0.6875rem] text-text-dim">{option.description}</span>
              )}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
