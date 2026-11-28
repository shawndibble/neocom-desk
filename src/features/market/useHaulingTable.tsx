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
import { cx } from '@/lib/cx';
import { isOnTrip, type TripLine, type TripOverride } from '@/engine/market/haulingPlan';
import { HAULING_THRESHOLDS, type DemandKind } from '@/engine/market/haulingMarket';
import { formatIsk, formatMarketIsk, marketIskDecimals } from '@/lib/isk';
import { createColumnVisibilitySetting, useColumnVisibility } from '@/lib/columnVisibility';
import { BringInput } from './HaulingFilterFields';
import { HaulingFlagWord } from './HaulingFlagWord';
import { formatSignedPct, formatTripM3, formatVolume } from './format';
import { formatDaysToSell, type HaulingViewRow } from './haulingView';
import { hubAtAnyEnd, type HaulingAnyEnd } from './haulingHubs';
import { iskGains, signedIsk } from '@/lib/signedIsk';
import { TurnInDetail, TurnInGlyph } from '@/features/campaigns/TurnInDetail';
import { approxIsk } from '@/features/campaigns/turnInContent';
import type { TurnInOfferDetail } from '@/features/campaigns/useTurnIns';

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

const LISTING_ONLY_COLUMN_IDS: readonly HaulingColumnId[] = ['days'];
const INSTANT_COLUMN_IDS = HAULING_COLUMN_IDS.filter((id) => !LISTING_ONLY_COLUMN_IDS.includes(id));

function isHaulingColumnId(id: string): id is HaulingColumnId {
  return (HAULING_COLUMN_IDS as readonly string[]).includes(id);
}

const useHaulingColumns = createColumnVisibilitySetting<HaulingColumnId>({
  key: 'haulingTripColumns',
  ids: HAULING_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_COLUMN_IDS,
});

const DEMAND_MARK: Record<DemandKind, string> = {
  'most-days': 'rounded-full bg-success',
  bursts: 'rounded-full border-2 border-warning',
  rarely: 'rounded-[1px] bg-danger',
};

interface HaulingTableInput {
  instant: boolean;
  anyEnd: HaulingAnyEnd;
  cards: boolean;
  compact: boolean;
  demandLabel: boolean;
  windowed: boolean;
  lineOf: ReadonlyMap<number, TripLine>;
  suggestedProfitOf: ReadonlyMap<number, number>;
  overrides: ReadonlyMap<number, TripOverride>;
  patchOverride: (typeId: number, patch: TripOverride | null) => void;
  addedFromOf: (typeId: number) => string | null;
  limitTextOf: (row: HaulingViewRow) => string | undefined;
  turnInOfferFor: (row: HaulingViewRow) => TurnInOfferDetail | null;
}

export function useHaulingTable({
  instant,
  anyEnd,
  cards,
  compact,
  demandLabel,
  windowed,
  lineOf,
  suggestedProfitOf,
  overrides,
  patchOverride,
  addedFromOf,
  limitTextOf,
  turnInOfferFor,
}: HaulingTableInput) {
  const { t } = useTranslation();
  const columnVisibility = useColumnVisibility(useHaulingColumns, DEFAULT_VISIBLE_COLUMN_IDS);
  const isk = (value: number, digits: number) =>
    compact ? <IskAmount value={value} decimals={digits} /> : formatIsk(value, digits);
  const price = (value: number) =>
    compact ? (
      <IskAmount value={value} decimals={marketIskDecimals(value)} />
    ) : (
      formatMarketIsk(value)
    );
  const marginVisible = columnVisibility.isVisible('margin');

  const columns: DataTableColumn<HaulingViewRow>[] = [
    {
      id: 'select',
      header: '',
      width: '6ch',
      stackEdge: 'start',
      render: (row) => (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox
            aria-label={t('market.hauling.selectRow', { item: row.name })}
            checked={isOnTrip(overrides, row.typeId)}
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
      className: cards || windowed ? undefined : 'w-full max-w-0 min-w-28',
      minWidth: '7rem',
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => {
        const added = addedFromOf(row.typeId);
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
              return hub.systemName;
            },
          },
        ]),
    {
      id: 'buy',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.buy'),
      width: '13ch',
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
      width: '13ch',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: {
        before: `${t(instant ? 'market.hauling.columns.buyOrder' : 'market.hauling.columns.expected')} `,
      },
      sortValue: (row) => row.price,
      render: (row) => {
        const offer = turnInOfferFor(row);
        if (!offer) return price(row.price);
        const gain = offer.totalPerItem - row.price;
        return (
          <>
            {price(row.price)}
            <TurnInDetail
              name={row.name}
              offer={offer}
              surfaceLine={
                gain > 0
                  ? t('campaigns.turnIn.overSale', {
                      gain: approxIsk(gain),
                      price: formatMarketIsk(row.price),
                    })
                  : undefined
              }
              trigger={<TurnInGlyph name={row.name} />}
            />
          </>
        );
      },
    },
    {
      id: 'profit',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.profit'),
      headerTooltip: t(
        instant ? 'market.hauling.columns.profitInstantTip' : 'market.hauling.columns.profitTip'
      ),
      width: '15ch',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cardCorner: true,
      cellClassName: (row) =>
        iskGains(lineOf.get(row.typeId)?.profit ?? 0, 0) ? 'text-isk-pos' : 'text-text-dim',
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
        row.marginPct >= HAULING_THRESHOLDS.lowMarginPct ? 'text-isk-pos' : 'text-text-dim',
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
      id: 'm3',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.m3'),
      width: '10ch',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: ` ${t('market.hauling.columns.m3')}` },
      sortValue: (row) => lineOf.get(row.typeId)?.volumeM3 ?? 0,
      render: (row) => formatTripM3(lineOf.get(row.typeId)?.volumeM3 ?? 0),
    },
    {
      id: 'days',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.days'),
      headerTooltip: t('market.hauling.columns.daysTip'),
      width: demandLabel ? '24ch' : '8ch',
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
            <span className={demandLabel ? 'text-xs text-text-dim' : 'sr-only'}>
              · {t(`market.hauling.demand.${row.demand.demand}`)}
            </span>
          </DataTableDenseCell>
        ),
    },
    {
      id: 'bring',
      headerClassName: 'whitespace-nowrap',
      header: t('market.hauling.columns.bring'),
      width: '13ch',
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
            value={!isOnTrip(overrides, row.typeId) ? '' : formatVolume(line.quantity)}
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
        (columnVisibility.isVisible(column.id) || (cards && column.id === 'margin')))
  );

  return { columnVisibility, hideableColumnsById, availableColumnIds, visibleColumns };
}
