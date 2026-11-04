import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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

/** Group-by and Columns: the entry list's own view controls, riding the skill picker's search row. */
export function EntryListControls({
  viewPrefs,
}: {
  viewPrefs: ReturnType<typeof usePlanViewPrefs>;
}) {
  const { t } = useTranslation();
  const { columnVisibility, setColumnVisibility, groupingMode, setGroupingMode } = viewPrefs;
  const modeLabel = (mode: GroupingMode) =>
    mode === 'priority' ? t('plans.groupByPriority') : t('plans.groupByAttributePair');
  return (
    <>
      {/* Pointer widths: the labelled select. On a phone it is too wide to share
          the search box's row, so an icon opens the same choices (DESIGN.md §6c,
          as Skills › Certificates does for its sort). */}
      <label className="hidden items-center gap-1 sm:flex">
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
                {modeLabel(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="shrink-0 sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={<Icon.GroupBy />}
              label={t('plans.groupByWithValue', { value: modeLabel(groupingMode) })}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={groupingMode}
              onValueChange={(value) => void setGroupingMode(value as GroupingMode)}
            >
              {GROUPING_MODES.map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {modeLabel(mode)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
