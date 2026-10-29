import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GROUPING_MODES, type GroupingMode } from '../groupingMode';
import type { usePlanViewPrefs } from './usePlanViewPrefs';

/** Group-by and Columns: the entry list's own view controls, riding the skill picker's row. */
export function EntryListControls({
  viewPrefs,
}: {
  viewPrefs: ReturnType<typeof usePlanViewPrefs>;
}) {
  const { t } = useTranslation();
  const { columnVisibility, setColumnVisibility, groupingMode, setGroupingMode } = viewPrefs;
  return (
    <>
      <label className="flex items-center gap-1">
        {t('plans.groupBy')}
        <Select
          value={groupingMode}
          onValueChange={(value) => void setGroupingMode(value as GroupingMode)}
        >
          <SelectTrigger size="md" aria-label={t('plans.groupBy')} className="w-36 lg:scroll-mt-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPING_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {mode === 'priority' ? t('plans.groupByPriority') : t('plans.groupByAttributePair')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={<Icon.ColumnsPicker />}
            label={t('plans.columns')}
            className="lg:scroll-mt-40"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(
            [
              ['attributePair', 'plans.columnAttributePair'],
              ['priority', 'plans.columnPriority'],
              ['perLevelTime', 'plans.columnPerLevel'],
              ['cumulativeTime', 'plans.columnCumulative'],
            ] as const
          ).map(([key, labelKey]) => (
            <DropdownMenuCheckboxItem
              key={key}
              checked={columnVisibility[key]}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                void setColumnVisibility({ ...columnVisibility, [key]: checked })
              }
            >
              {t(labelKey)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
