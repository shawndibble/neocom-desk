/**
 * Phone rendering of What's profitable: one ranked card per product in place
 * of `DataTable`'s stacked label/value rows, in the same family as the Ranked
 * (`MobileOpportunityList`) and All owned (`MobileOwnedBlueprintList`) cards.
 * Each card leads with the product's icon and its rank in the scan, names it
 * with where its blueprint comes from and how deep its sell orders are, and
 * parks the sorted field on the right like a price tag — the other figures
 * fold into one quiet line beneath the name.
 *
 * The rows arrive already filtered, sorted and cut to the page the panel is
 * showing, so the rank is just a card's position.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip, IskAmount, TypeIcon, type DataTableSort } from '@/components/ui';
import { STAT_CHIP_TONE_TEXT_CLASS } from '@/components/ui/statChipTone';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { iskToneClass } from '@/features/character/format';
import { ItemMoreActions } from '@/features/market/ItemContextMenu';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { cx } from '@/lib/cx';
import { formatDuration } from '@/lib/duration';
import { formatPercent } from './format';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { MobileSortToolbar } from './MobileSortToolbar';
import { ORDER_DEPTH_TONE } from './opportunityMetrics';
import { SkillGateMarker } from './SkillGateMarker';
import { StartPlanButton } from './StartPlanButton';

interface MobileMarketWideListProps {
  /** The page being shown: filtered, sorted and cut. */
  rows: readonly MarketWideResultRow[];
  /** Every row the filters let through, of which `rows` is the top. */
  total: number;
  sort: DataTableSort;
  onSortChange: (next: DataTableSort) => void;
  /** For the item menu's "Build plan" entry; undefined while the catalog loads. */
  blueprintTypeIDFor: (productTypeID: number) => number | null | undefined;
  skillGateFor: (productTypeID: number) => SkillGateVerdict | undefined;
  nameForSkill: (typeID: number) => string;
  nameForCharacter: (characterId: number) => string;
  /** Resolves true once it has opened the new plan (see `StartPlanButton`). */
  onStartPlan: (row: MarketWideResultRow) => Promise<boolean>;
}

/** The desktop table's sortable column ids, so the two share one URL sort. */
type SortFieldId =
  'iskPerHour' | 'margin' | 'duration' | 'buildCost' | 'product' | 'blueprintSource' | 'orderDepth';
const SORT_FIELD_ORDER: readonly SortFieldId[] = [
  'iskPerHour',
  'margin',
  'duration',
  'buildCost',
  'product',
  'blueprintSource',
  'orderDepth',
];

/** The fields with a figure to show; a sort by any other leads with ISK/hour. */
type FigureId = 'iskPerHour' | 'margin' | 'duration' | 'buildCost';
const FIGURE_ORDER: readonly FigureId[] = ['iskPerHour', 'margin', 'duration', 'buildCost'];

interface Figure {
  node: ReactNode;
  toneClassName?: string;
}

function figureFor(id: FigureId, row: MarketWideResultRow, unknown: string): Figure {
  switch (id) {
    case 'iskPerHour':
      return row.iskPerHour === null
        ? { node: unknown }
        : {
            node: (
              <>
                {row.iskPerHour > 0 ? '+' : ''}
                <IskAmount value={row.iskPerHour} revealOn="tap" decimals={0} />
              </>
            ),
            toneClassName: iskToneClass(row.iskPerHour),
          };
    case 'margin':
      return row.marginPct === null
        ? { node: unknown }
        : {
            node: `${row.marginPct > 0 ? '+' : ''}${formatPercent(row.marginPct)}`,
            toneClassName: iskToneClass(row.marginPct),
          };
    case 'duration':
      return { node: formatDuration(row.seconds) };
    case 'buildCost':
      return { node: <IskAmount value={row.buildCost} revealOn="tap" decimals={0} /> };
  }
}

export function MobileMarketWideList({
  rows,
  total,
  sort,
  onSortChange,
  blueprintTypeIDFor,
  skillGateFor,
  nameForSkill,
  nameForCharacter,
  onStartPlan,
}: MobileMarketWideListProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');

  const fieldLabel: Record<SortFieldId, string> = {
    iskPerHour: t('industry.iskPerHour'),
    margin: t('industry.margin'),
    duration: t('industry.time'),
    buildCost: t('industry.buildCost'),
    product: t('industry.product'),
    blueprintSource: t('industry.marketOpportunitiesBlueprintSource'),
    orderDepth: t('industry.opportunitiesOrderDepthLabel'),
  };
  const heroId: FigureId = (FIGURE_ORDER as readonly string[]).includes(sort.columnId)
    ? (sort.columnId as FigureId)
    : 'iskPerHour';

  return (
    // Flush to the panel's edges: the cards carry their own inset.
    <div className="-mx-3 flex flex-col">
      <MobileSortToolbar
        count={rows.length}
        summary={t('industry.marketOpportunitiesTopOf', { shown: rows.length, total })}
        fields={SORT_FIELD_ORDER.map((id) => ({ id, label: fieldLabel[id] }))}
        sort={sort}
        onSortChange={onSortChange}
        className="px-3"
      />

      <ul className="flex flex-col" aria-label={t('industry.marketOpportunitiesTitle')}>
        {rows.map((row, index) => {
          const hero = figureFor(heroId, row, unknown);
          const verdict = skillGateFor(row.productTypeID);
          const depthTone = ORDER_DEPTH_TONE[row.orderDepth];
          const owned = row.blueprintSource === 'owned';
          return (
            <li
              key={row.productTypeID}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-x-3 border-b border-line py-3 pr-1 pl-3 last:border-b-0"
            >
              <span className="relative size-10">
                <TypeIcon
                  typeId={row.productTypeID}
                  size={64}
                  width={40}
                  height={40}
                  className="size-10 rounded-xs border border-line"
                />
                <span className="absolute -bottom-1 -left-1 rounded-xs border border-line bg-bg px-1 text-[0.625rem] leading-4 font-semibold text-text-dim tabular-nums">
                  #{index + 1}
                </span>
              </span>

              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-sm font-semibold break-words">
                    <MarketItemLink typeId={row.productTypeID}>{row.productName}</MarketItemLink>
                  </span>
                  {verdict?.gated && (
                    <SkillGateMarker
                      verdict={verdict}
                      nameForSkill={nameForSkill}
                      nameForCharacter={nameForCharacter}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-text-dim">
                  <span
                    className={cx(
                      'rounded-xs border px-1.5 text-[0.625rem] leading-4 font-semibold tracking-wider uppercase',
                      owned ? 'border-success/40 text-success' : 'border-line text-text-dim'
                    )}
                  >
                    <span className="sr-only">
                      {t('industry.marketOpportunitiesBlueprintSource')}:{' '}
                    </span>
                    {t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full bg-current ${STAT_CHIP_TONE_TEXT_CLASS[depthTone]}`}
                    />
                    <span className="sr-only">{t('industry.opportunitiesOrderDepthLabel')}: </span>
                    {t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.6875rem] text-text-dim tabular-nums">
                  {FIGURE_ORDER.filter((id) => id !== heroId).map((id) => {
                    const figure = figureFor(id, row, unknown);
                    return (
                      <span key={id} className={figure.toneClassName}>
                        {fieldLabel[id]}: {figure.node}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col items-end justify-between gap-1 text-right">
                <span
                  data-testid="hero"
                  className="flex flex-col items-end leading-tight tabular-nums"
                >
                  <span
                    className={cx(
                      'inline-flex items-center gap-1 text-base font-bold',
                      hero.toneClassName
                    )}
                  >
                    {hero.node}
                    {heroId === 'iskPerHour' && row.priceCapped && (
                      <InfoTooltip
                        label={t('industry.marketOpportunitiesPriceCapped')}
                        content={t('industry.marketOpportunitiesPriceCapped')}
                      />
                    )}
                  </span>
                  <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">
                    {fieldLabel[heroId]}
                  </span>
                </span>
                <span className="flex items-center">
                  <StartPlanButton
                    onStart={() => onStartPlan(row)}
                    compact={{ name: row.productName }}
                  />
                  <ItemMoreActions
                    typeId={row.productTypeID}
                    itemName={row.productName}
                    blueprintTypeID={blueprintTypeIDFor(row.productTypeID)}
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
