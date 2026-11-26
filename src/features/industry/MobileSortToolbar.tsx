import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  nextDataTableSort,
  textActionClassName,
  type DataTableSort,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';

interface MobileSortToolbarProps<Id extends string> {
  count: number;
  summary?: string;
  fields: readonly { id: Id; label: string; firstDirection?: 'asc' | 'desc' }[];
  sort: DataTableSort;
  onSortChange: (next: DataTableSort) => void;
  className?: string;
}

export function MobileSortToolbar<Id extends string>({
  count,
  summary,
  fields,
  sort,
  onSortChange,
  className = '',
}: MobileSortToolbarProps<Id>) {
  const { t } = useTranslation();
  const activeLabel = fields.find((field) => field.id === sort.columnId)?.label ?? '';
  const SortIcon = sort.direction === 'asc' ? Icon.Ascending : Icon.Descending;
  return (
    <div className={`flex items-center justify-between gap-2 border-b border-line ${className}`}>
      <span className="text-xs text-text-dim tabular-nums">
        {summary ?? t('industry.opportunitiesCount', { count })}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={textActionClassName('gap-1.5 px-2 md:min-h-9')}
            aria-label={t(
              sort.direction === 'asc'
                ? 'industry.opportunitiesSortByFieldAsc'
                : 'industry.opportunitiesSortByFieldDesc',
              { field: activeLabel }
            )}
          >
            <span className="font-normal text-text-dim">{t('industry.opportunitiesSortBy')}</span>{' '}
            {activeLabel}
            <SortIcon aria-hidden="true" size={Icon.ICON_SIZE.sm} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <p className={cx(eyebrowClassName, 'px-2 py-1.5')}>{t('industry.opportunitiesSortBy')}</p>
          {fields.map((field) => (
            <DropdownMenuItem
              key={field.id}
              onSelect={() => onSortChange(nextDataTableSort(sort, field.id, field.firstDirection))}
              aria-label={
                field.id === sort.columnId
                  ? t(sort.direction === 'asc' ? 'industry.sortedAsc' : 'industry.sortedDesc', {
                      column: field.label,
                    })
                  : undefined
              }
            >
              {field.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
