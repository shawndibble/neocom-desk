/**
 * Phone rendering of the Build Opportunities list (mobile UX pass): a
 * genuinely different information hierarchy from the desktop table, not a
 * CSS-only reflow of it — a ranked, glanceable list rather than a
 * column-for-column comparison. `DataTable`'s stacked cards already print
 * one panel-wide card per row; this replaces that stacking with a rank
 * badge, a promoted "hero" metric (whichever field the pilot is sorting
 * by), and every other field folded into one quiet secondary line.
 *
 * Sorting: `DataTable`'s own sortable column headers are accessibility-hidden
 * once it stacks below `sm` (`.dt-stack thead`, `src/styles/index.css`), so a
 * phone pilot has no way to change sort at all today. This list keeps its own
 * `DataTableSort` state and a small `DropdownMenu` trigger, reusing
 * `sortRows`/`nextDataTableSort` so both this list and the desktop table sort
 * and toggle direction by the identical rule.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  InfoTooltip,
  IskAmount,
  StatChip,
  nextDataTableSort,
  sortRows,
  Checkbox,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { iskToneClass } from '@/features/character/format';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { ORDER_DEPTH_TONE, unitMargin } from './opportunityMetrics';
import { formatPercent } from './format';
import type { OpportunityRow } from './opportunities';
import { SkillGateMarker } from './SkillGateMarker';
import { useUrlSort } from '@/lib/useUrlState';
import { OPPORTUNITIES_DEFAULT_SORT, OPPORTUNITIES_SORT_KEY } from './opportunitiesUrl';

interface MobileOpportunityListProps {
  rows: readonly OpportunityRow[];
  showCharacterColumn: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
  onViewHistory: (typeId: number, itemName: string) => void;
  /** Account-wide skill gate for a row's product (issue #1231). */
  skillGateFor: (productTypeID: number) => SkillGateVerdict | undefined;
  nameForSkill: (typeID: number) => string;
  nameForCharacter: (characterId: number) => string;
}

type SortFieldId = 'iskPerHour' | 'unitMargin' | 'margin' | 'duration';

interface HeroValue {
  node: ReactNode;
  toneClassName?: string;
}

/**
 * One entry per sortable field. `label` doubles as this list's own sort menu
 * text and the secondary line's field label — both already-translated
 * strings the desktop table's columns use, so nothing new needed translating
 * beyond the sort menu's own chrome.
 */
function sortFields(t: ReturnType<typeof useTranslation>['t']): Record<
  SortFieldId,
  {
    label: string;
    sortValue: (row: OpportunityRow) => number | undefined;
    hero: (row: OpportunityRow) => HeroValue;
  }
> {
  const unknown = t('common.unknown');
  return {
    iskPerHour: {
      label: t('industry.iskPerHour'),
      sortValue: (row) => row.result.iskPerHour ?? undefined,
      hero: (row) => {
        const value = row.result.iskPerHour;
        if (value === null) return { node: unknown };
        return {
          node: (
            <>
              {value > 0 ? '+' : ''}
              <IskAmount value={value} revealOn="tap" decimals={0} />
            </>
          ),
          toneClassName: iskToneClass(value),
        };
      },
    },
    unitMargin: {
      label: t('industry.opportunitiesUnitMargin'),
      sortValue: (row) => unitMargin(row) ?? undefined,
      hero: (row) => {
        const value = unitMargin(row);
        if (value === null) return { node: unknown };
        return {
          node: (
            <>
              {value > 0 ? '+' : ''}
              <IskAmount value={value} revealOn="tap" decimals={0} />
            </>
          ),
          toneClassName: iskToneClass(value),
        };
      },
    },
    margin: {
      label: t('industry.margin'),
      sortValue: (row) => row.result.marginPct ?? undefined,
      hero: (row) => {
        const value = row.result.marginPct;
        if (value === null) return { node: unknown };
        return {
          node: `${value > 0 ? '+' : ''}${formatPercent(value)}`,
          toneClassName: iskToneClass(value),
        };
      },
    },
    duration: {
      label: t('industry.time'),
      sortValue: (row) => row.result.seconds,
      hero: (row) => ({ node: formatDuration(row.result.seconds) }),
    },
  };
}

const SORT_FIELD_ORDER: readonly SortFieldId[] = ['iskPerHour', 'unitMargin', 'margin', 'duration'];

export function MobileOpportunityList({
  rows,
  showCharacterColumn,
  selectedIds,
  onToggleSelected,
  onViewHistory,
  skillGateFor,
  nameForSkill,
  nameForCharacter,
}: MobileOpportunityListProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const fields = sortFields(t);

  const { sort, onSortChange: setSort } = useUrlSort(
    OPPORTUNITIES_SORT_KEY,
    OPPORTUNITIES_DEFAULT_SORT,
    SORT_FIELD_ORDER
  );
  const activeFieldId = sort.columnId as SortFieldId;

  const sortedRows = sortRows(rows, { sortValue: fields[activeFieldId].sortValue }, sort.direction);

  const SortIcon = sort.direction === 'asc' ? Icon.Ascending : Icon.Descending;

  return (
    <div className="flex flex-col">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="mb-3 self-start"
            aria-label={t('industry.opportunitiesSortByField', {
              field: fields[activeFieldId].label,
            })}
          >
            <span className="text-text-dim">{t('industry.opportunitiesSortBy')}</span>{' '}
            {fields[activeFieldId].label}
            <SortIcon aria-hidden="true" size={Icon.ICON_SIZE.sm} className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <p className="px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('industry.opportunitiesSortBy')}
          </p>
          {SORT_FIELD_ORDER.map((id) => (
            <DropdownMenuItem key={id} onSelect={() => setSort(nextDataTableSort(sort, id))}>
              {fields[id].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ul className="flex flex-col" aria-label={t('industry.opportunitiesTitle')}>
        {sortedRows.map((row, index) => {
          const hero = fields[activeFieldId].hero(row);
          const productTypeID = row.candidate.catalogEntry.productTypeID;
          const original = row.candidate.blueprint.runs === -1;
          const skillGateVerdict = productTypeID !== null ? skillGateFor(productTypeID) : undefined;

          return (
            <li
              key={row.candidate.id}
              className="relative flex flex-col gap-1.5 border-b border-line py-2.5 last:border-b-0"
            >
              <div className="absolute top-1 right-2 flex size-11 items-center justify-center md:size-4">
                <Checkbox
                  checked={selectedIds.has(row.candidate.id)}
                  onChange={() => onToggleSelected(row.candidate.id)}
                  aria-label={t('industry.opportunitiesSelectFor', {
                    name: row.candidate.catalogEntry.productName,
                  })}
                />
              </div>

              <div className="flex items-start gap-2 pr-12">
                <span
                  aria-label={t('industry.opportunitiesRankLabel', { rank: index + 1 })}
                  className="mt-0.5 inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center rounded-xs bg-accent px-1 text-[0.6875rem] font-bold text-accent-contrast"
                >
                  {index + 1}
                </span>
                <span className="mt-0.5 text-sm font-semibold break-words">
                  {row.candidate.catalogEntry.productName}
                </span>
                {skillGateVerdict?.gated && (
                  <SkillGateMarker
                    verdict={skillGateVerdict}
                    nameForSkill={nameForSkill}
                    nameForCharacter={nameForCharacter}
                  />
                )}
                {showCharacterColumn && (
                  <span className="mt-1 text-[0.6875rem] text-text-dim">
                    {row.candidate.characterName}
                  </span>
                )}
                {productTypeID !== null && (
                  <IconButton
                    size="sm"
                    icon={<Icon.Market />}
                    label={t('industry.opportunitiesViewHistory', {
                      name: row.candidate.catalogEntry.productName,
                    })}
                    onClick={() =>
                      onViewHistory(productTypeID, row.candidate.catalogEntry.productName)
                    }
                    className="ml-auto shrink-0"
                  />
                )}
              </div>

              <div
                className={`flex items-baseline gap-1.5 text-xl font-bold tabular-nums ${hero.toneClassName ?? ''}`}
              >
                {hero.node}
                <span className="text-[0.6875rem] font-normal tracking-widest text-text-dim uppercase">
                  {fields[activeFieldId].label}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-text-dim">
                <StatChip
                  label={original ? t('industry.bpo') : t('industry.bpc')}
                  value={
                    original
                      ? t('industry.opportunitiesUnlimitedRuns')
                      : row.candidate.blueprint.runs
                  }
                  tone={original ? 'accent' : 'default'}
                />
                {SORT_FIELD_ORDER.filter((id) => id !== activeFieldId).map((id) => {
                  const secondary = fields[id].hero(row);
                  return (
                    <span key={id} className={secondary.toneClassName}>
                      {fields[id].label}: {secondary.node}
                    </span>
                  );
                })}
                <StatChip
                  label={t('industry.opportunitiesOrderDepthLabel')}
                  value={t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
                  tone={ORDER_DEPTH_TONE[row.orderDepth]}
                />
                {row.result.profit !== null && row.result.profit < 0 && (
                  <InfoTooltip
                    label={t('industry.opportunitiesLossBreakdownFor', {
                      name: row.candidate.catalogEntry.productName,
                    })}
                    content={t('industry.opportunitiesLossBreakdown', {
                      cost: formatIsk(row.result.totalCost),
                      revenue:
                        row.result.revenue !== null ? formatIsk(row.result.revenue) : unknown,
                    })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
