/**
 * Phone rendering of the Build Opportunities list (mobile UX pass): a
 * genuinely different information hierarchy from the desktop table, not a
 * CSS-only reflow of it — a glanceable list rather than a column-for-column
 * comparison. Each card leads with its selection checkbox, then the product
 * with a promoted "hero" metric (whichever field the pilot is sorting by)
 * parked at the right of its row, and every other field folded into one
 * quiet secondary line. Every row action
 * (Plan, price history, the market) lives in one borderless ⋯ menu.
 *
 * Identical copies — same owner, print, location, ME/TE and runs — fold into
 * one card with a count (`identicalBlueprints.ts`); they price identically,
 * so a second card would only repeat the first.
 *
 * Sorting: `DataTable`'s own sortable column headers are accessibility-hidden
 * once it stacks below `sm` (`.dt-stacked thead`, `src/styles/index.css`), so
 * this list keeps its own sort toolbar, reusing `sortRows`/`nextDataTableSort`
 * so both this list and the desktop table sort and toggle direction by the
 * identical rule.
 *
 * Comparing: once two or more cards are ticked, a bar pinned above the bottom
 * tab bar carries the Compare action — the panel header has no room for it.
 */
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { selectedRowClassName } from '@/components/ui/controlStyles';
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
  sortRows,
  Checkbox,
  textActionClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { STAT_CHIP_TONE_TEXT_CLASS } from '@/components/ui/statChipTone';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { iskToneClass } from '@/features/character/format';
import { cx } from '@/lib/cx';
import { formatDuration } from '@/lib/duration';
import { isCardOwnClick, useRowStartPlan } from './rowStartPlan';
import { formatIsk } from '@/lib/isk';
import type { BlueprintCatalogEntry } from './blueprintCatalog';
import { groupIdentical, identicalBlueprintKey } from './identicalBlueprints';
import { ORDER_DEPTH_TONE, unitMargin } from './opportunityMetrics';
import { formatPercent } from './format';
import type { OpportunityRow } from './opportunities';
import { MobileSortToolbar } from './MobileSortToolbar';
import { SkillGateMarker } from './SkillGateMarker';
import { useUrlSort } from '@/lib/useUrlState';
import { OPPORTUNITIES_DEFAULT_SORT, OPPORTUNITIES_SORT_KEY } from './opportunitiesUrl';

interface MobileOpportunityListProps {
  rows: readonly OpportunityRow[];
  showCharacterColumn: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
  onClearSelected: () => void;
  /** Seeds the ticked cards' rows into Build Plan Compare. */
  onCompare: (rows: readonly OpportunityRow[]) => void;
  /** Resolves true once it has opened the new plan (see `StartPlanButton`). */
  onStartPlan: (entry: BlueprintCatalogEntry) => Promise<boolean>;
  onViewHistory: (typeId: number, itemName: string, regionId: number) => void;
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
              <IskAmount value={value} decimals={0} />
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
              <IskAmount value={value} decimals={0} />
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

const identicalRowKey = (row: OpportunityRow) =>
  identicalBlueprintKey(String(row.candidate.characterId), row.candidate.blueprint);

export function MobileOpportunityList({
  rows,
  showCharacterColumn,
  selectedIds,
  onToggleSelected,
  onClearSelected,
  onCompare,
  onStartPlan,
  onViewHistory,
  skillGateFor,
  nameForSkill,
  nameForCharacter,
}: MobileOpportunityListProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const startPlanFromRow = useRowStartPlan(onStartPlan);
  const fields = sortFields(t);

  const { sort, onSortChange: setSort } = useUrlSort(
    OPPORTUNITIES_SORT_KEY,
    OPPORTUNITIES_DEFAULT_SORT,
    SORT_FIELD_ORDER
  );
  const activeFieldId = sort.columnId as SortFieldId;

  const sortedRows = sortRows(rows, { sortValue: fields[activeFieldId].sortValue }, sort.direction);
  const groups = groupIdentical(sortedRows, identicalRowKey);
  // A folded card's checkbox stands for its first row only, so selection is
  // read off the visible cards: neither a hidden copy ticked earlier (say on
  // desktop, before a resize) nor an id a Character filter change dropped
  // from `rows` can count toward Compare.
  const selectedRows = groups
    .map((group) => group.first)
    .filter((row) => selectedIds.has(row.candidate.id));

  return (
    <div className="flex flex-col">
      <MobileSortToolbar
        count={groups.length}
        fields={SORT_FIELD_ORDER.map((id) => ({ id, label: fields[id].label }))}
        sort={sort}
        onSortChange={setSort}
        className="-mt-1 pb-1"
      />

      <ul className="-mx-3 flex flex-col" aria-label={t('industry.opportunitiesTitle')}>
        {groups.map(({ first: row, members }) => {
          const hero = fields[activeFieldId].hero(row);
          const productTypeID = row.candidate.catalogEntry.productTypeID;
          const productName = row.candidate.catalogEntry.productName;
          const original = row.candidate.blueprint.runs === -1;
          const skillGateVerdict = productTypeID !== null ? skillGateFor(productTypeID) : undefined;
          const selected = selectedIds.has(row.candidate.id);
          const depthTone = ORDER_DEPTH_TONE[row.orderDepth];
          const depthLabel = t(`industry.opportunitiesOrderDepth.${row.orderDepth}`);

          return (
            <li
              key={row.candidate.id}
              aria-current={selected ? 'true' : undefined}
              // A tap on the card is Start plan's action; its controls are exempt.
              onClick={(event) => {
                if (isCardOwnClick(event)) startPlanFromRow(row.candidate.catalogEntry);
              }}
              className={cx(
                'grid grid-cols-[2.75rem_minmax(0,1fr)_auto] border-b border-line pr-1 last:border-b-0',
                selected ? selectedRowClassName : 'border-l-2 border-l-transparent'
              )}
            >
              <label
                className={`flex size-11 cursor-pointer items-center justify-center self-start`}
              >
                <Checkbox
                  checked={selected}
                  onChange={() => onToggleSelected(row.candidate.id)}
                  aria-label={t('industry.opportunitiesSelectFor', { name: productName })}
                />
              </label>

              <div className="flex min-w-0 flex-col gap-1 py-3">
                {/* The hero rides the name row's right edge like a price tag, matching the owned-blueprint cards. */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={entityLinkClassName('text-sm font-semibold break-words')}>
                      {productName}
                    </span>
                    {members.length > 1 && (
                      <span className="text-[0.6875rem] font-semibold text-text-dim">
                        {t('industry.opportunitiesCopies', { count: members.length })}
                      </span>
                    )}
                    {skillGateVerdict?.gated && (
                      <SkillGateMarker
                        verdict={skillGateVerdict}
                        nameForSkill={nameForSkill}
                        nameForCharacter={nameForCharacter}
                      />
                    )}
                    {showCharacterColumn && (
                      <span className="text-[0.6875rem] text-text-dim">
                        {row.candidate.characterName}
                      </span>
                    )}
                  </div>
                  <span className="flex shrink-0 flex-col items-end text-right leading-tight tabular-nums">
                    <span className={cx('text-sm font-semibold', hero.toneClassName)}>
                      {hero.node}
                    </span>
                    <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">
                      {fields[activeFieldId].label}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-text-dim tabular-nums">
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
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full bg-current ${STAT_CHIP_TONE_TEXT_CLASS[depthTone]}`}
                    />
                    <span className="sr-only">{t('industry.opportunitiesOrderDepthLabel')}: </span>
                    {depthLabel}
                  </span>
                  {row.result.profit !== null && row.result.profit < 0 && (
                    <InfoTooltip
                      label={t('industry.opportunitiesLossBreakdownFor', { name: productName })}
                      content={t('industry.opportunitiesLossBreakdown', {
                        cost: formatIsk(row.result.totalCost),
                        revenue:
                          row.result.revenue !== null ? formatIsk(row.result.revenue) : unknown,
                      })}
                    />
                  )}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    variant="plain"
                    size="row"
                    icon={<Icon.More />}
                    label={t('industry.moreActionsLabel', { name: productName })}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {productTypeID !== null && (
                    <DropdownMenuItem
                      onSelect={() => onViewHistory(productTypeID, productName, row.hub.regionId)}
                    >
                      {t('industry.opportunitiesPriceHistory')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>

      {selectedRows.length > 1 && (
        <div
          role="region"
          aria-label={t('industry.opportunitiesCompareBar')}
          className="sticky bottom-[var(--bottom-nav-clearance)] z-30 -mx-1 mt-2 flex items-center gap-2 rounded-xs border border-accent-dim bg-panel-2 py-1.5 pr-1.5 pl-3 shadow-lg md:bottom-3"
        >
          <span className="flex-1 text-sm text-text-dim">
            {t('industry.opportunitiesSelectedCount', { count: selectedRows.length })}
          </span>
          <button
            type="button"
            className={textActionClassName('px-2 md:min-h-9')}
            onClick={onClearSelected}
          >
            {t('industry.opportunitiesClearSelection')}
          </button>
          <Button size="sm" variant="primary" onClick={() => onCompare(selectedRows)}>
            {t('industry.opportunitiesCompare')}
          </Button>
        </div>
      )}
    </div>
  );
}
