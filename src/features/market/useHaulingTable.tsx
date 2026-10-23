import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  DataTableDenseCell,
  IskAmount,
  Tooltip,
  TypeIcon,
  type DataTableColumn,
} from '@/components/ui';
import { focusRingClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { COL_ISK, COL_QUANTITY } from '@/components/ui/dataTableWidths';
import { cx } from '@/lib/cx';
import type { TripLine, TripOverride } from '@/engine/market/haulingPlan';
import { HAULING_THRESHOLDS, type DemandKind } from '@/engine/market/haulingMarket';
import { formatIsk, formatMarketIsk, marketIskDecimals } from '@/lib/isk';
import { createColumnVisibilitySetting, useColumnVisibility } from '@/lib/columnVisibility';
import { BringInput } from './HaulingFilterFields';
import { HaulingFlagWord } from './HaulingFlagWord';
import { formatSignedPct, formatTripM3, formatVolume } from './format';
import { formatDaysToSell, type HaulingViewRow } from './haulingView';
import { hubAtAnyEnd, type HaulingAnyEnd } from './haulingHubs';
import { iskGains, signedIsk } from '@/lib/signedIsk';

/**
 * The list's optional (non-identity) columns, for `ColumnPickerMenu`
 * (issue: hauling toolbar redesign). `select`/`item` stay out of `ids` —
 * hiding either loses the row's own identity or the multibuy checkbox.
 * Margin and ISK/m³ start hidden: the margin rides under Profit.
 */
const HAULING_COLUMN_IDS = [
  'buy',
  'expected',
  'profit',
  'margin',
  'iskPerM3',
  'm3',
  'days',
  'bring',
] as const;
type HaulingColumnId = (typeof HAULING_COLUMN_IDS)[number];
const DEFAULT_VISIBLE_COLUMN_IDS: readonly HaulingColumnId[] = HAULING_COLUMN_IDS.filter(
  (id) => id !== 'margin' && id !== 'iskPerM3'
);

/** Days to Sell (and the demand it carries) is read for a listing only: an instant sale into buy orders has neither. */
const LISTING_ONLY_COLUMN_IDS: readonly HaulingColumnId[] = ['days'];
const INSTANT_COLUMN_IDS = HAULING_COLUMN_IDS.filter((id) => !LISTING_ONLY_COLUMN_IDS.includes(id));

function isHaulingColumnId(id: string): id is HaulingColumnId {
  return (HAULING_COLUMN_IDS as readonly string[]).includes(id);
}

/**
 * Not `haulingColumns`: that key stored a visible list of the old ids, which
 * would hide Profit and m³. Old picks start over from the new defaults.
 */
const useHaulingColumns = createColumnVisibilitySetting<HaulingColumnId>({
  key: 'haulingTripColumns',
  ids: HAULING_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_COLUMN_IDS,
});

/**
 * The demand mark: a filled dot, a hollow ring or a square, so the three
 * read apart by shape as well as colour — on a phone the mark stands alone,
 * its words left to screen readers and the row's detail (DESIGN.md §7).
 */
const DEMAND_MARK: Record<DemandKind, string> = {
  'most-days': 'rounded-full bg-success',
  bursts: 'rounded-full border-2 border-warning',
  rarely: 'rounded-[1px] bg-danger',
};

interface HaulingTableInput {
  instant: boolean;
  /** The end set to Any hub, if one is. */
  anyEnd: HaulingAnyEnd;
  /** Rows are cards (phone, or a table too narrow for columns). */
  cards: boolean;
  /** Figures go compact (`3.41K`). */
  compact: boolean;
  lineOf: ReadonlyMap<number, TripLine>;
  suggestedProfitOf: ReadonlyMap<number, number>;
  overrides: ReadonlyMap<number, TripOverride>;
  patchOverride: (typeId: number, patch: TripOverride | null) => void;
  /** Rows added by the fill, and the category each came from. */
  addedIds: ReadonlySet<number>;
  addedCategoryOf: ReadonlyMap<number, number> | null | undefined;
  categoryName: (id: number) => string;
  limitTextOf: (row: HaulingViewRow) => string | undefined;
}

/** The Hauling list's columns, which of them show, and the picker's catalog. */
export function useHaulingTable({
  instant,
  anyEnd,
  cards,
  compact,
  lineOf,
  suggestedProfitOf,
  overrides,
  patchOverride,
  addedIds,
  addedCategoryOf,
  categoryName,
  limitTextOf,
}: HaulingTableInput) {
  const { t } = useTranslation();
  const columnVisibility = useColumnVisibility(useHaulingColumns, DEFAULT_VISIBLE_COLUMN_IDS);
  const isk = (value: number, digits: number) =>
    compact ? <IskAmount value={value} decimals={digits} /> : formatIsk(value, digits);
  /** A per-unit price: the Market page's cents-below-10,000 rule. */
  const price = (value: number) =>
    compact ? (
      <IskAmount value={value} decimals={marketIskDecimals(value)} />
    ) : (
      formatMarketIsk(value)
    );
  const marginVisible = columnVisibility.isVisible('margin');

  // On a phone each row is the dense two-line card: name and profit on top,
  // Buy · Sell · margin · m³ · days underneath, the tick box and the Bring
  // box pinned to its edges (`stackEdge`). A tap opens the row's detail.
  const columns: DataTableColumn<HaulingViewRow>[] = [
    {
      id: 'select',
      header: '',
      width: '7ch',
      headerClassName: 'w-8',
      className: 'w-8',
      stackEdge: 'start',
      // The label is the 44px touch target on a coarse pointer; it grows the cell, never overlays a neighbour.
      render: (row) => (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox
            aria-label={t('market.hauling.selectRow', { item: row.name })}
            checked={overrides.get(row.typeId)?.selected !== false}
            onChange={(event) => patchOverride(row.typeId, { selected: event.target.checked })}
          />
        </label>
      ),
    },
    {
      id: 'item',
      header: t('market.hauling.columns.item'),
      headerClassName: 'whitespace-nowrap',
      primary: true,
      // Takes the spare width and wraps a long name, so the longest name never
      // sets the table's minimum; below `min-w-28` the table scrolls in its wrapper.
      className: cards ? undefined : 'w-full max-w-0 min-w-28',
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => {
        // The name is the row's handle, not a link: the row click is its action (§6c).
        const addedCategory = addedIds.has(row.typeId)
          ? addedCategoryOf?.get(row.typeId)
          : undefined;
        const added = addedCategory === undefined ? null : categoryName(addedCategory);
        // The name wraps (two lines at most on a card) and the notes go under it, so neither cuts the name.
        const nameAndNotes = (
          <span className="flex min-w-0 flex-col">
            <span
              className={entityLinkClassName(
                cx('min-w-0 font-medium leading-snug break-words', cards && 'line-clamp-2')
              )}
            >
              {row.name}
            </span>
            {(row.flags.length > 0 || added) && (
              <span className="flex flex-wrap gap-x-2 leading-tight">
                {added && (
                  <span className="text-[0.6875rem] text-text-dim">
                    {t('market.hauling.addedFrom', { category: added })}
                  </span>
                )}
                {row.flags.map((flag) => (
                  <HaulingFlagWord key={flag} flag={flag} />
                ))}
              </span>
            )}
          </span>
        );
        if (cards) return nameAndNotes;
        return (
          <span className="flex min-w-0 items-center gap-2">
            <TypeIcon typeId={row.typeId} size={32} className="size-6 shrink-0" />
            {nameAndNotes}
          </span>
        );
      },
    },
    ...(anyEnd === null
      ? []
      : [
          {
            id: 'hub',
            header: t('market.hauling.columns.hub'),
            headerTooltip: t(
              anyEnd === 'from'
                ? 'market.hauling.columns.hubFromTip'
                : 'market.hauling.columns.hubToTip'
            ),
            width: '14ch',
            headerClassName: 'whitespace-nowrap',
            className: 'truncate',
            sortValue: (row: HaulingViewRow) => hubAtAnyEnd(row, anyEnd).systemName,
            render: (row: HaulingViewRow) => {
              const hub = hubAtAnyEnd(row, anyEnd);
              return <span title={hub.systemName}>{hub.systemName}</span>;
            },
          },
        ]),
    {
      id: 'buy',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.buy'),
      width: '17ch',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { before: `${t('market.hauling.columns.buy')} ` },
      sortValue: (row) => row.buyLadder[0]?.price,
      render: (row) => price(row.buyLadder[0]?.price ?? 0),
    },
    {
      id: 'expected',
      headerClassName: 'whitespace-nowrap',
      header: t(instant ? 'market.hauling.columns.buyOrder' : 'market.hauling.columns.expected'),
      headerTooltip: t(
        instant ? 'market.hauling.columns.buyOrderTip' : 'market.hauling.columns.expectedTip'
      ),
      width: '17ch',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: {
        before: `${t(instant ? 'market.hauling.columns.buyOrder' : 'market.hauling.columns.expected')} `,
      },
      sortValue: (row) => row.price,
      render: (row) => price(row.price),
    },
    {
      // This trip's profit on the row: what Bring loads of it. The margin
      // rides under it in the table; the card has it on its meta line.
      id: 'profit',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.profit'),
      headerTooltip: t(
        instant ? 'market.hauling.columns.profitInstantTip' : 'market.hauling.columns.profitTip'
      ),
      // The signed figure, or the figure over its margin line.
      width: COL_ISK,
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      // The phone card's headline figure, on the title line.
      cardCorner: true,
      cellClassName: (row) =>
        iskGains(lineOf.get(row.typeId)?.profit ?? 0, 0) ? 'text-success' : 'text-text-dim',
      sortValue: (row) => suggestedProfitOf.get(row.typeId) ?? 0,
      render: (row) => {
        const line = lineOf.get(row.typeId);
        const profit =
          !line || line.quantity === 0 ? (
            '—'
          ) : compact ? (
            <>
              {iskGains(line.profit, 0) ? '+' : ''}
              <IskAmount value={line.profit} />
            </>
          ) : (
            signedIsk(line.profit, 0)
          );
        if (cards || marginVisible) return <span className="font-semibold">{profit}</span>;
        return (
          <span className="flex flex-col items-end leading-tight">
            <span className="font-semibold">{profit}</span>
            <span className="text-[0.6875rem] text-text-dim">
              {t('market.hauling.itemDetail.margin', { pct: formatSignedPct(row.marginPct, 1) })}
            </span>
          </span>
        );
      },
    },
    {
      id: 'margin',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.margin'),
      headerTooltip: t(
        instant ? 'market.hauling.columns.marginInstantTip' : 'market.hauling.columns.marginTip'
      ),
      width: '10ch',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cellClassName: (row) =>
        row.marginPct >= HAULING_THRESHOLDS.lowMarginPct ? 'text-success' : 'text-text-dim',
      sortValue: (row) => row.marginPct,
      render: (row) => formatSignedPct(row.marginPct, 1),
    },
    {
      id: 'iskPerM3',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.iskPerM3'),
      headerTooltip: t('market.hauling.columns.iskPerM3Tip'),
      width: '13ch',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: t('market.hauling.perM3Short') },
      sortValue: (row) => row.iskPerM3,
      render: (row) => isk(row.iskPerM3, 0),
    },
    {
      // The line's hold space: what Bring takes up.
      id: 'm3',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.m3'),
      width: COL_QUANTITY,
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: ` ${t('market.hauling.columns.m3')}` },
      sortValue: (row) => lineOf.get(row.typeId)?.volumeM3 ?? 0,
      render: (row) => formatTripM3(lineOf.get(row.typeId)?.volumeM3 ?? 0),
    },
    {
      // Days to sell and how steadily it sells, in one cell: the demand mark
      // leads, and its words follow in a wide table (a narrower one, and the
      // phone card, keep the mark's shape, with the words for screen readers only).
      id: 'days',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.days'),
      headerTooltip: t('market.hauling.columns.daysTip'),
      // Mark, days and the demand words ("Sells most days").
      width: '24ch',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: t('market.hauling.daysShort') },
      sortValue: (row) => (row.mode === 'list' ? row.sale.daysToSell : undefined),
      render: (row) =>
        row.mode === 'list' && (
          <DataTableDenseCell>
            <Tooltip content={t('market.hauling.demandDays', { count: row.demand.daysWithTrades })}>
              <span
                tabIndex={0}
                role="img"
                aria-label={t('market.hauling.demandDays', { count: row.demand.daysWithTrades })}
                className={`size-2 shrink-0 ${DEMAND_MARK[row.demand.demand]} ${focusRingClassName}`}
              />
            </Tooltip>
            {formatDaysToSell(row.sale.daysToSell)}
            <span className="text-xs text-text-dim @max-[62rem]:sr-only">
              · {t(`market.hauling.demand.${row.demand.demand}`)}
            </span>
          </DataTableDenseCell>
        ),
    },
    {
      id: 'bring',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.bring'),
      // The 5rem input plus the cell's padding.
      width: '16ch',
      align: 'right',
      className: 'whitespace-nowrap',
      stackEdge: 'end',
      render: (row) => {
        const line = lineOf.get(row.typeId);
        if (!line) return null;
        return (
          <BringInput
            card={cards}
            label={t('market.hauling.bringRow', { item: row.name })}
            title={limitTextOf(row)}
            value={overrides.get(row.typeId)?.selected === false ? '' : formatVolume(line.quantity)}
            onCommit={(quantity) =>
              patchOverride(
                row.typeId,
                quantity === 0
                  ? { selected: false, quantity: undefined }
                  : { selected: true, quantity }
              )
            }
          />
        );
      },
    },
  ];

  // Hideable columns only — `select` and `item` (the row's own identity)
  // are always shown, so they're left out of the picker's catalog entirely.
  const hideableColumnsById = Object.fromEntries(
    columns
      .filter((column): column is DataTableColumn<HaulingViewRow> & { id: HaulingColumnId } =>
        isHaulingColumnId(column.id)
      )
      .map((column) => [column.id, column])
  ) as Record<HaulingColumnId, DataTableColumn<HaulingViewRow>>;
  const availableColumnIds = instant ? INSTANT_COLUMN_IDS : HAULING_COLUMN_IDS;
  const visibleColumns = columns.filter(
    (column) =>
      !isHaulingColumnId(column.id) ||
      (availableColumnIds.includes(column.id) &&
        // The card's meta line carries the margin, picked or not: its Profit has no second line.
        (columnVisibility.isVisible(column.id) || (cards && column.id === 'margin')))
  );

  return { columnVisibility, hideableColumnsById, availableColumnIds, visibleColumns };
}
