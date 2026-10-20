import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type { DataTableSort } from '@/components/ui/DataTable';
import type { BuildPlanSortKey } from './buildPlanSort';

export function BuildPlanSortHeader({
  sortKey,
  label,
  sort,
  onSort,
  className,
}: {
  sortKey: BuildPlanSortKey;
  label: string;
  sort: DataTableSort | null;
  onSort: (key: BuildPlanSortKey) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const active = sort?.columnId === sortKey;
  // The app's sort glyph trio (DataTable headers, Order History): the neutral
  // glyph marks a sortable column that isn't sorting — here, manual order.
  const Glyph = !active ? Icon.Sort : sort.direction === 'asc' ? Icon.Ascending : Icon.Descending;
  return (
    <span className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={
          active
            ? t(sort.direction === 'asc' ? 'industry.sortedAsc' : 'industry.sortedDesc', {
                column: label,
              })
            : t('industry.sortBy', { column: label })
        }
        aria-pressed={active}
        className={`relative inline-flex items-center gap-px rounded-xs uppercase tracking-widest after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[""] md:after:hidden hover:text-text ${interactiveClassName} ${focusRingClassName} ${active ? 'text-text' : ''}`}
      >
        {label}
        <Glyph
          aria-hidden="true"
          size={Icon.ICON_SIZE.sm}
          className={`shrink-0 ${active ? 'text-accent' : 'text-text-faint'}`}
        />
      </button>
    </span>
  );
}
