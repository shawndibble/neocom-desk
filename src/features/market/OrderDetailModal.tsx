/**
 * Full breakdown of one open order (GLOSSARY.md's redesigned Market > Open
 * Orders tab): what to do about it, the numbers behind that call, who is
 * cheaper and where, and — for a sell order — the cost-basis ledger the
 * floor came from.
 *
 * `OrderDetailModal` takes the order, the page snapshot and the page's one
 * Order Detail (`useOrderDetail`), which owns every fetch behind it;
 * `useOpenOrderDetail` asks for what this order needs and assembles the
 * view (`orderDetailView.ts`). `OrderDetailContent` below only renders that
 * finished view and asks for more via `onCheckDeeper`.
 *
 * The station/system/region three-way state a caller must not collapse:
 * - Station is always eager (`stationChecked` false only means the Fuzzwork
 *   aggregate call itself failed for this station — genuinely rare).
 * - System and region come from `deep`, fetched on demand. `deep === null`
 *   means "not checked yet" for BOTH; once it has run, `'system' in
 *   deep`'s undercut result can still be absent — my own order's system id
 *   could not be recovered from the region book (`openOrdersModel.ts`'s
 *   `deriveSystemId`) — which must render as "not checked" too, never as
 *   "checked, clean".
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Button,
  InfoTooltip,
  Disclosure,
  LiveStatus,
  Field,
  Fields,
  ProgressBar,
  StatChip,
  StatChips,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { cx } from '@/lib/cx';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { Link } from 'react-router-dom';
import { formatMarketIsk } from '@/lib/isk';
import { JumpsAwayText } from '@/features/character/assetBrowserRows';
import { useIsPhone } from '@/lib/useIsPhone';
import type { OpenOrderRow } from './openOrdersModel';
import { OrderProblemBadge } from './OrderProblemBadge';
import { OrderRowSummaryText } from './OrderRowSummaryText';
import { adviseOrder } from './orderAdvice';
import { orderExits, hubHaulGaps, type OrderExitKind } from './orderExits';
import { useOpenOrderDetail, type OrderDetail } from './useOrderDetail';
import { verdictFigures, type OrderDetailSnapshot, type OrderDetailView } from './orderDetailView';
import { doThisPrice, rowFixCall } from './orderDoThis';
import { OrderDoThisText } from './OrderDoThisText';
import { isOffHubStation } from './hubStation';
import { BASE_STATION_REPROCESSING_RATE } from '@/engine/industry/reprocessing';
import {
  appliedRefiningImplantPct,
  refiningImplantApplies,
} from '@/engine/industry/characterModifiers';
import { roundPriceUp } from '@/engine/market/priceTick';
import { CopyablePrice, CopyPriceButton } from './CopyablePrice';
import { marketIskTone, signedMarketIsk } from './signedIsk';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { MarketOnly } from '@/features/abyssal/MarketOnly';
import { MarketItemLink } from './MarketItemLink';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { StructureFeeLine } from './StructureFeeLine';
import { scopeOrdersCsvColumns, type ScopeOrderCsvRow } from './scopeOrdersCsv';
import {
  deepScopeState,
  scopeCsvRow,
  scopeLabelText,
  stationRank,
  stationScopeState,
  structureStationScopeState,
  tightestRivalScope,
  CELL,
  COLUMN_HEADER,
  computeSellThrough,
  type LocationState,
} from './orderScopeState';
import { ScopeRow } from './OrderScopeRow';
import { CostLedger } from './OrderCostLedger';

export interface OrderDetailModalProps {
  row: OpenOrderRow;
  snapshot: OrderDetailSnapshot;
  /**
   * The page's one Order Detail. Page-level rather than the modal's own:
   * its caches outlive this modal (which remounts per order and unmounts on
   * close, and reopening an order must not refetch), and its region and
   * structure books also reclassify the worklist's rows.
   */
  detail: OrderDetail;
  /** A section to open on arrival, e.g. the work-through loss line's "See exits". */
  initialSection?: OrderDetailSectionId;
  onClose: () => void;
}

/** The full breakdown of one open order. */
export function OrderDetailModal({
  row,
  snapshot,
  detail,
  initialSection,
  onClose,
}: OrderDetailModalProps) {
  const { view, checkDeeper } = useOpenOrderDetail(detail, row, snapshot);
  return (
    <OrderDetailContent
      row={row}
      {...view}
      initialSection={initialSection}
      onCheckDeeper={checkDeeper}
      onClose={onClose}
    />
  );
}

export type OrderDetailContentProps = OrderDetailView & {
  row: OpenOrderRow;
  initialSection?: OrderDetailSectionId;
  onCheckDeeper: () => void;
  onClose: () => void;
};

/** The modal's four folding sections, all folded on arrival. */
export type OrderDetailSectionId = 'numbers' | 'whoCheaper' | 'costBasis' | 'exits';

/** Money, not status: the ISK delta tokens, with the sign (DESIGN.md §1). */
function IskDelta({ amount }: { amount: number }) {
  return <span className={marketIskTone(amount)}>{signedMarketIsk(amount)}</span>;
}

/** Short label for an exit's kind in the "Other ways out" disclosure's trailing read — distinct from the exit's own full sentence, which states the price rather than the net. */
const EXIT_SHORT_KEY: Record<OrderExitKind, string> = {
  hold: 'exitShortHold',
  undercutStation: 'exitShortUndercutStation',
  dumpToBuyOrder: 'exitShortDumpToBuyOrder',
  reprocess: 'exitShortReprocess',
};

/** The modal itself, rendering a finished view — `OrderDetailModal` is what a page mounts. */
export function OrderDetailContent({
  row,
  deep,
  loadingDeep,
  history,
  stationChecked,
  stationsLoaded,
  regionJumps,
  reprocessing,
  hubs,
  hubsFailed,
  stationNameFor,
  structureMarket,
  relistFees,
  accountingLevel,
  initialSection,
  onCheckDeeper,
  onClose,
}: OrderDetailContentProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  // All folded: verdict, Copy and the facts are the answer, each trailing read
  // its summary. Remounts per orderId, so nothing carries between orders.
  const [openSections, setOpenSections] = useState<ReadonlySet<OrderDetailSectionId>>(
    () => new Set(initialSection ? [initialSection] : [])
  );
  const isExpanded = (id: OrderDetailSectionId) => openSections.has(id);
  const toggleSection = (id: OrderDetailSectionId) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const location: LocationState = !stationsLoaded
    ? 'unknown'
    : row.stationName === null
      ? 'structure'
      : 'known';

  const advice = adviseOrder(row);
  const { badge, summary, verdict } = advice;
  const { copyPrice, keepPerUnit } = verdictFigures(row, advice);
  // Without a verdict, a priceless "Do this" call ("Leave it alone",
  // "Relist it") is the short headline. A priced one never is: with no floor
  // the rival is a fact, not advice to match (decision 20260924-013535).
  const { call: fixCall } = rowFixCall(row);
  const shortCall = doThisPrice(fixCall) === null && fixCall.kind !== 'badgeAdvice';
  const station =
    location === 'structure'
      ? structureStationScopeState(row, structureMarket)
      : stationScopeState(row, stationChecked, location);
  const system = deepScopeState('system', row, deep, location);
  const region = deepScopeState('region', row, deep, location);

  const sell = computeSellThrough(row, deep, history);
  const sellValue =
    sell.kind === 'known'
      ? `${sell.daysToClear}d`
      : t(
          sell.reason === 'noHistory'
            ? 'market.orders.sellsOutUnknown'
            : 'market.orders.sellsOutNoSales'
        );
  const sellPastExpiry =
    sell.kind === 'known' && row.expiry !== null && sell.daysToClear > row.expiry.daysLeft;

  const showCheckDeeper = deep === null && !loadingDeep;
  const whoTableRef = useRef<HTMLDivElement>(null);
  const allClean =
    !row.isBuyOrder &&
    station.kind === 'clear' &&
    (system.kind === 'clear' || system.kind === 'unavailable' || system.kind === 'notChecked') &&
    region.kind === 'clear';
  const exits = orderExits({ row, competitors: deep?.competitors, reprocessing });
  // Named only when it moved the number: never on scrap (f4b5a3f5).
  const refineImplantPct = reprocessing
    ? appliedRefiningImplantPct(reprocessing.modifiers, reprocessing.entry.specialisationSkillID)
    : 0;
  const haulGaps = hubHaulGaps({ row, hubs: hubs ?? [], competitors: deep?.competitors });
  const refine = exits.find((exit) => exit.kind === 'reprocess');
  const rank = stationRank(row, deep);
  const netIfSellsAsListed = row.floor ? row.price - row.floor.fill : null;
  // The one floor this app shows as a figure (20260906-155913), rounded UP
  // to the nearest legal price (issue #1421): safe to type into an order,
  // never below the exact break-even — `belowFloor` detection elsewhere still
  // compares against the exact `row.floor.relist`, never this.
  const floorShown = row.floor ? (roundPriceUp(row.floor.relist) ?? row.floor.relist) : null;

  const whoTrailing = (() => {
    const tightest = tightestRivalScope(station, system, region);
    if (tightest === 'clear') return t('market.orders.trailingClear');
    if (tightest === 'notChecked') return t('market.orders.trailingNotChecked');
    return `${scopeLabelText(tightest.scope, t)} · ${formatMarketIsk(tightest.price)}`;
  })();

  const numbersTrailing =
    sell.kind === 'known'
      ? t(
          row.isBuyOrder
            ? 'market.orders.detail.trailingFillsIn'
            : 'market.orders.detail.trailingSellsOut',
          { count: sell.daysToClear }
        )
      : sellValue;

  const costTrailing =
    floorShown !== null
      ? t('market.orders.detail.trailingFloor', { price: formatMarketIsk(floorShown) })
      : row.costBasis
        ? t('market.orders.trailingCostPerUnit', {
            amount: formatMarketIsk(row.costBasis.unitCost),
          })
        : t('market.orders.badge.noCostBasis');

  const bestExit = exits.length
    ? exits.reduce((best, exit) => (exit.netPerUnit > best.netPerUnit ? exit : best))
    : null;
  const exitsTrailing = bestExit
    ? `${t(`market.orders.${EXIT_SHORT_KEY[bestExit.kind]}`)} · ${signedMarketIsk(bestExit.netPerUnit)}`
    : haulGaps.length
      ? `${haulGaps[0].systemName} · +${formatMarketIsk(haulGaps[0].overLocal)}`
      : t('market.orders.trailingNoExit');

  // Buy orders fill rather than sell out, and are beaten by a higher bid
  // rather than a cheaper ask (#1733).
  const sellsOutLabel = t(row.isBuyOrder ? 'market.orders.fillsIn' : 'market.orders.sellsOutIn');
  const whoLabel = t(row.isBuyOrder ? 'market.orders.whoBidsHigher' : 'market.orders.whoIsCheaper');

  // "Cheapest here" is the station tier: the price a buyer standing in this
  // station sees first. Exact, never shorthand.
  const cheapestHere = (() => {
    switch (station.kind) {
      case 'rival':
        return formatMarketIsk(station.rival.price);
      case 'clear':
        return t('market.orders.detail.chipYou');
      case 'unavailable':
        return t('market.orders.detail.chipUnreadable');
      case 'notChecked':
        return t('market.orders.trailingNotChecked');
    }
  })();

  // The grid below is a div table, not a DataTable, so it exports these rows
  // as built — same order, own order last.
  const scopeCsvRows: ScopeOrderCsvRow[] = [
    scopeCsvRow('station', station, t, {
      stationName: row.stationName,
      distance: t('market.orders.scopeSameStation'),
    }),
    scopeCsvRow('system', system, t, {
      stationName: system.kind === 'rival' ? stationNameFor(system.rival.locationId) : undefined,
      distance: t('market.orders.scopeSameSystem'),
    }),
    scopeCsvRow('region', region, t, {
      stationName: region.kind === 'rival' ? stationNameFor(region.rival.locationId) : undefined,
      jumps: regionJumps,
    }),
    {
      scope: t('market.orders.scopeMyOrder'),
      seller: row.stationName ?? t('market.unknownStructure'),
      price: row.price,
      gapIsk: null,
      gapPct: null,
      distance: null,
    },
  ];
  const scopeCsvColumns = useMemo(() => scopeOrdersCsvColumns(t), [t]);
  const scopeExport = useTableExport({
    surface: 'market-scope-orders',
    rows: scopeCsvRows,
    columns: scopeCsvColumns,
    source: 'rows',
  });

  const offHub = isOffHubStation(row.stationName, row.locationId);

  return (
    <Modal
      open
      onClose={onClose}
      title={row.typeName}
      placement={isPhone ? 'sheet' : 'center'}
      footer={
        isPhone && copyPrice !== null && <CopyPriceButton price={copyPrice} className="w-full" />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-dim">
          {row.characterName} · {row.stationName ?? t('market.unknownStructure')}
          {offHub && (
            <>
              {' · '}
              <span className="inline-flex items-center gap-1 text-warning">
                {t('market.orders.offHub')}
                <InfoTooltip
                  label={t('common.aboutLabel', { label: t('market.orders.offHub') })}
                  content={t('market.orders.offHubHelp')}
                />
              </span>
            </>
          )}
          {' · '}
          {t(row.isBuyOrder ? 'orders.buy' : 'orders.sell')} ·{' '}
          {t('market.orders.detail.unitsLeft', {
            remain: row.volumeRemain.toLocaleString(),
            total: row.volumeTotal.toLocaleString(),
          })}
        </p>

        <div>
          {badge && <OrderProblemBadge kind={badge.kind} detail={badge.detail} />}
          {verdict ? (
            <>
              {/*
                A real call, only ever reachable with an Order Floor. With no
                cost basis linked there is no way to tell "undercut them" from
                "let this one go", so the badge's generic advice is the
                fallback below — the common case, not the exception.
              */}
              <p className="mt-2 text-xl font-semibold text-text">
                {t(`market.orders.verdict.${verdict.kind}`, {
                  price: verdict.price === null ? '' : formatMarketIsk(verdict.price),
                })}
              </p>
              <p className="mt-1 text-sm text-text-dim">
                {t(`market.orders.verdict.${verdict.kind}Detail`, {
                  amount: verdict.amount === null ? '' : formatMarketIsk(verdict.amount),
                  price: verdict.price === null ? '' : formatMarketIsk(verdict.price),
                })}
              </p>
            </>
          ) : shortCall ? (
            <>
              {/*
                No floor, so no verdict: the fix list's own short call heads
                it, as the row says it; the badge's longer advice sits under.
              */}
              <p className="mt-2 text-xl font-semibold text-text">
                <OrderDoThisText row={row} interactive={false} />
              </p>
              {badge && (
                <p className="mt-1 text-sm text-text-dim">
                  {t(`market.orders.badge.${badge.kind}Action`)}
                </p>
              )}
              {summary && (
                <p className="mt-1">
                  <OrderRowSummaryText row={row} summary={summary} />
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-base font-semibold text-text">
                {badge
                  ? t(`market.orders.badge.${badge.kind}Action`)
                  : t('market.orders.scopeNotChecked')}
              </p>
              {summary && (
                <p className="mt-1">
                  <OrderRowSummaryText row={row} summary={summary} />
                </p>
              )}
            </>
          )}
          {/* Only a price the call recommends (`verdictFigures`). On a phone it is the sheet's footer. */}
          {!isPhone && copyPrice !== null && (
            <div className="mt-3">
              <CopyPriceButton price={copyPrice} />
            </div>
          )}
          {/* The two ways to the item's market share a line of their own, under the one action. */}
          <div className="mt-2 flex flex-wrap gap-2">
            {/*
              The phone list's row is plain text, not `MarketItemLink` (a
              link nested in the row's own tap target would be nested
              interactive content) — this is where a phone reader reaches the
              item's Market listing instead.
            */}
            <MarketItemLink typeId={row.typeId} className={buttonClassName({ variant: 'ghost' })}>
              {t('orders.viewInMarket')}
            </MarketItemLink>
            {/* Where the order is edited. An abyssal type has no market window. */}
            <MarketOnly typeId={row.typeId}>
              <OpenInEveButton
                kind="marketDetails"
                id={row.typeId}
                name={row.typeName}
                size="md"
                inRow
              />
            </MarketOnly>
          </div>
        </div>

        <StatChips>
          <StatChip
            label={t('market.orders.detail.chipYourPrice')}
            value={formatMarketIsk(row.price)}
          />
          <StatChip
            label={t(
              row.isBuyOrder
                ? 'market.orders.detail.chipTopBidHere'
                : 'market.orders.detail.chipCheapestHere'
            )}
            value={cheapestHere}
          />
          {keepPerUnit !== null && (
            <StatChip
              label={t('market.orders.detail.chipYouKeep')}
              value={<IskDelta amount={keepPerUnit} />}
            />
          )}
        </StatChips>

        <div className="divide-y divide-line rounded-xs border border-line">
          <section>
            <Disclosure
              label={whoLabel}
              trailing={whoTrailing}
              expanded={isExpanded('whoCheaper')}
              onToggle={() => toggleSection('whoCheaper')}
            >
              {/* The Disclosure's own header is its toggle button, so the grid's ⋯
                  menu heads the panel it opens instead. */}
              <div className="flex items-center justify-between gap-2 pr-1.5">
                <p className="px-2.5 pt-1.5 text-[0.6875rem] text-text-dim">
                  {t('market.orders.scopeTightestBites')}
                </p>
                <TableActionsMenu name={whoLabel} tableExport={scopeExport} />
              </div>
              {/*
                ONE grid so the price column lines up down the table. Rows are
                `display: contents` + `role="row"` (still a table to assistive
                tech), so the row rule and "my order" tint paint per cell.
              */}
              <div
                ref={whoTableRef}
                tabIndex={-1}
                role="table"
                aria-label={whoLabel}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] text-xs focus:outline-none"
              >
                <div role="row" className="contents">
                  <span role="columnheader" className={cx(COLUMN_HEADER, 'pl-3')}>
                    {t('market.orders.scopeColumn')}
                  </span>
                  <span role="columnheader" className={COLUMN_HEADER}>
                    {t('market.orders.scopeCheapestSeller')}
                  </span>
                  <span role="columnheader" className={cx(COLUMN_HEADER, 'pr-3 text-right')}>
                    {t('market.orders.scopeTheirPrice')}
                  </span>
                </div>
                <ScopeRow
                  scope="station"
                  state={station}
                  stationName={row.stationName}
                  distance={t('market.orders.scopeSameStation')}
                />
                <ScopeRow
                  scope="system"
                  state={system}
                  stationName={
                    system.kind === 'rival' ? stationNameFor(system.rival.locationId) : undefined
                  }
                  distance={t('market.orders.scopeSameSystem')}
                />
                <ScopeRow
                  scope="region"
                  state={region}
                  stationName={
                    region.kind === 'rival' ? stationNameFor(region.rival.locationId) : undefined
                  }
                  jumps={regionJumps}
                />
                {/* My own order last, as the line every row above is measured against. */}
                <div role="row" className="contents">
                  <span
                    role="rowheader"
                    className={cx(
                      CELL,
                      'bg-panel pl-3 font-semibold tracking-widest text-accent uppercase'
                    )}
                  >
                    {t('market.orders.scopeMyOrder')}
                  </span>
                  <span role="cell" className={cx(CELL, 'bg-panel')}>
                    {row.stationName ?? t('market.unknownStructure')}
                  </span>
                  <span role="cell" className={cx(CELL, 'bg-panel pr-3 text-right tabular-nums')}>
                    {formatMarketIsk(row.price)}
                  </span>
                </div>
              </div>
              <div className="px-3 pb-2">
                <LiveStatus>{loadingDeep ? t('market.orders.checkingDeeper') : null}</LiveStatus>
                {allClean && (
                  <p className="pt-1.5 text-xs text-success">{t('market.orders.onlySeller')}</p>
                )}
                {deep?.truncated && (
                  // A truncated fetch isn't the pre-fetch state (the button below
                  // stays hidden, same as any other resolved `deep`) — say why
                  // system/region above read "not checked" instead of leaving the
                  // user to wonder where the "check deeper" button went. Same
                  // key/shape `VariationsTable.tsx` uses for its own truncated fetch.
                  <p className="pt-1.5 text-[0.6875rem] text-warning uppercase">
                    {t('common.incompleteTitle')}
                  </p>
                )}
                {showCheckDeeper && (
                  <p className="pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        // The button unmounts; keep focus inside the dialog.
                        whoTableRef.current?.focus({ preventScroll: true });
                        onCheckDeeper();
                      }}
                    >
                      {t('market.orders.checkDeeper')}
                    </Button>
                  </p>
                )}
                {loadingDeep && (
                  <p aria-hidden="true" className="pt-1.5 text-xs text-text-dim">
                    {t('market.orders.checkingDeeper')}
                  </p>
                )}
              </div>
            </Disclosure>
          </section>

          <section>
            <Disclosure
              label={t('market.orders.sectionNumbers')}
              trailing={numbersTrailing}
              expanded={isExpanded('numbers')}
              onToggle={() => toggleSection('numbers')}
            >
              <div className="px-3 py-2.5 text-sm">
                <Fields>
                  {rank && (
                    <Field label={t('market.orders.detail.rankLabel')}>
                      <span className="tabular-nums">
                        {t('market.orders.detail.rankValue', {
                          rank: rank.rank,
                          total: rank.total,
                        })}
                      </span>
                    </Field>
                  )}
                  <Field
                    label={
                      <span className="inline-flex items-center gap-1">
                        {sellsOutLabel}
                        <InfoTooltip
                          label={t('common.aboutLabel', { label: sellsOutLabel })}
                          content={t(
                            row.isBuyOrder
                              ? 'market.orders.fillsInHelp'
                              : 'market.orders.sellsOutHelp'
                          )}
                        />
                      </span>
                    }
                  >
                    <span className="flex flex-col">
                      <span className="tabular-nums">
                        <span className={sellPastExpiry ? 'text-danger' : 'text-text'}>
                          {sellValue}
                        </span>
                        {sell.kind === 'known' && (
                          <span className="text-text-dim">
                            {' · '}
                            {t('market.orders.statSellsOutCaption', {
                              count: Math.round(sell.unitsPerDay),
                            })}
                          </span>
                        )}
                      </span>
                      {sellPastExpiry && (
                        <span className="text-xs text-danger">
                          {t('market.orders.sellsOutPastExpiry')}
                        </span>
                      )}
                    </span>
                  </Field>
                  <Field label={t('market.orders.statVolumeLeft')}>
                    {row.volumeTotal > 0 && (
                      <ProgressBar
                        label={t('market.orders.statVolumeLeft')}
                        value={row.volumeRemain}
                        max={row.volumeTotal}
                        surface="panel-2"
                        className="w-24"
                      />
                    )}
                    <span className="tabular-nums">
                      {`${row.volumeRemain.toLocaleString()} / ${row.volumeTotal.toLocaleString()}`}
                    </span>
                  </Field>
                  <Field label={t('market.orders.statOrderExpires')}>
                    {row.expiry ? (
                      <span className="tabular-nums">
                        <span className={row.expiry.daysLeft <= 7 ? 'text-warning' : 'text-text'}>
                          {`${row.expiry.daysLeft}d`}
                        </span>
                        <span className="text-text-dim">
                          {' · '}
                          {t('market.orders.statExpiresCaption', {
                            date: new Date(row.expiry.expiresAt).toLocaleDateString(),
                            listed: new Date(row.issued).toLocaleDateString(),
                          })}
                        </span>
                      </span>
                    ) : (
                      t('common.unknown')
                    )}
                  </Field>
                  <Field
                    label={t(
                      row.isBuyOrder
                        ? 'market.orders.statIfFillsAsListed'
                        : 'market.orders.statIfSellsAsListed'
                    )}
                  >
                    {netIfSellsAsListed === null ? (
                      t('common.unknown')
                    ) : (
                      <span className="tabular-nums">
                        <IskDelta amount={netIfSellsAsListed} />{' '}
                        <span className="text-text-dim">
                          {t('market.orders.statPerUnitAfterFees')}
                        </span>
                      </span>
                    )}
                  </Field>
                </Fields>
              </div>
            </Disclosure>
          </section>

          {/* Cost basis and exits are sell-side ideas: a buy order has neither (#1733). */}
          {!row.isBuyOrder && (
            <section>
              <Disclosure
                label={t('market.orders.detail.sectionCost')}
                trailing={costTrailing}
                expanded={isExpanded('costBasis')}
                onToggle={() => toggleSection('costBasis')}
              >
                <div className="space-y-1.5 px-3 py-2">
                  {row.costBasis === null ? (
                    <>
                      <p className="text-sm text-text">{t('market.orders.noCostBasisTitle')}</p>
                      <p className="text-xs text-text-dim">{t('market.orders.noCostBasisHint')}</p>
                      {row.walletGap && (
                        <p className="text-xs text-text-dim">
                          {row.walletGap.kind === 'partial'
                            ? t('market.orders.walletBasisPartial', {
                                covered: row.walletGap.coveredUnits.toLocaleString(),
                                total: row.walletGap.pool.toLocaleString(),
                              })
                            : t('market.orders.walletBasisHistoryShort')}
                          {row.walletGap.truncated
                            ? ' ' + t('market.orders.walletBasisTruncated')
                            : null}
                        </p>
                      )}
                    </>
                  ) : (
                    <CostLedger
                      row={row}
                      costBasis={row.costBasis}
                      relistFees={relistFees}
                      floorShown={floorShown}
                    />
                  )}
                  {location === 'structure' && (
                    <StructureFeeLine
                      structureId={row.locationId}
                      gross={row.price * row.volumeRemain}
                      accountingLevel={accountingLevel}
                    />
                  )}
                  <Link
                    to="/industry"
                    className={buttonClassName({ variant: 'ghost', size: 'sm' })}
                  >
                    {t('market.orders.linkBuild')}
                  </Link>
                </div>
              </Disclosure>
            </section>
          )}

          {!row.isBuyOrder && (
            <section>
              <Disclosure
                label={t('market.orders.detail.sectionExits')}
                trailing={exitsTrailing}
                expanded={isExpanded('exits')}
                onToggle={() => toggleSection('exits')}
              >
                <div className="space-y-1.5 px-3 py-2 text-xs">
                  {exits.length === 0 ? (
                    <p className="text-text-dim">{t('market.orders.exitsNoFloor')}</p>
                  ) : (
                    exits.map((exit) => {
                      const exitLabel =
                        exit.kind === 'hold' && sell.kind === 'known'
                          ? t('market.orders.exitHoldSellsIn', {
                              price: formatMarketIsk(exit.price),
                              days: sell.daysToClear,
                            })
                          : t(
                              `market.orders.exit${exit.kind[0].toUpperCase()}${exit.kind.slice(1)}`,
                              {
                                price: formatMarketIsk(exit.price),
                              }
                            );
                      return (
                        <p key={exit.kind} className="flex items-baseline justify-between gap-3">
                          <span className="text-text-dim">
                            {/*
                              Only the undercut exit is a price to TYPE somewhere —
                              hold, dump and reprocess are all facts already true,
                              not suggestions — so only its label is click-to-copy.
                            */}
                            {exit.kind === 'undercutStation' ? (
                              <CopyablePrice price={exit.price}>{exitLabel}</CopyablePrice>
                            ) : (
                              exitLabel
                            )}
                          </span>
                          <span
                            className={cx('shrink-0 tabular-nums', marketIskTone(exit.netPerUnit))}
                          >
                            {t('market.orders.exitPerUnit', {
                              amount: signedMarketIsk(exit.netPerUnit),
                            })}
                          </span>
                        </p>
                      );
                    })
                  )}
                  {/*
                    Hauling is a gap and a distance, never a net: what a hub pays
                    is knowable, what a courier charges is not. The rows survive a
                    missing Order Floor for the same reason — "Amarr bids more
                    than anyone here" needs no cost basis behind it.
                  */}
                  <div className="border-t border-line pt-1.5">
                    <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                      {t('market.orders.exitHaulTitle')}
                    </p>
                    {hubs === undefined ? (
                      <p className="mt-1 text-text-dim">
                        {t(
                          hubsFailed
                            ? 'market.orders.exitHaulUnavailable'
                            : 'market.orders.exitHaulLoading'
                        )}
                      </p>
                    ) : haulGaps.length === 0 ? (
                      <p className="mt-1 text-text-dim">{t('market.orders.exitHaulNone')}</p>
                    ) : (
                      <>
                        {haulGaps.map((gap) => (
                          <p
                            key={gap.hubId}
                            className="mt-1 flex items-baseline justify-between gap-3"
                          >
                            <span className="text-text-dim">
                              {t('market.orders.exitHaulHub', {
                                hub: gap.systemName,
                                price: formatMarketIsk(gap.price),
                              })}{' '}
                              <JumpsAwayText result={gap.jumps} t={t} />
                            </span>
                            <span className="shrink-0 tabular-nums text-success">
                              {t('market.orders.exitHaulGap', {
                                amount: formatMarketIsk(gap.overLocal),
                                total: formatMarketIsk(gap.totalIsk),
                              })}
                            </span>
                          </p>
                        ))}
                        <p className="mt-1 text-text-dim">{t('market.orders.exitHaulNote')}</p>
                      </>
                    )}
                  </div>
                  {!reprocessing && (
                    <p className="flex items-baseline justify-between gap-3 text-text-dim">
                      <span>{t('market.orders.exitReprocessNotBuilt')}</span>
                      <span className="shrink-0">{t('market.orders.exitNotBuilt')}</span>
                    </p>
                  )}
                  {refine && (
                    <>
                      {/*
                        The assumption, stated rather than folded into the number:
                        a structure's own reprocessing rate, its rigs and the
                        standings-based station tax are not readable from ESI, so
                        this prices a plain NPC station with no tax deducted.
                      */}
                      <p className="text-text-dim">
                        {t('market.orders.exitReprocessAssumption', {
                          rate: Math.round(BASE_STATION_REPROCESSING_RATE * 100),
                        })}
                      </p>
                      {refineImplantPct > 0 && (
                        <p className="text-text-dim">
                          {t('market.orders.exitReprocessImplant', {
                            pct: refineImplantPct,
                          })}
                        </p>
                      )}
                      {reprocessing &&
                        refiningImplantApplies(reprocessing.entry.specialisationSkillID) && (
                          <ImplantsAssumedNote
                            characterId={row.characterId}
                            hint={t('market.orders.exitReprocessAssumesNoImplants', {
                              character: row.characterName,
                            })}
                          />
                        )}
                      {refine.partial && (
                        <p className="text-warning">{t('market.orders.exitReprocessPartial')}</p>
                      )}
                      {refine.unitsLeftOver !== undefined && refine.unitsLeftOver > 0 && (
                        <p className="text-text-dim">
                          {t('market.orders.exitReprocessLeftOver', {
                            count: refine.unitsLeftOver,
                          })}
                        </p>
                      )}
                    </>
                  )}
                  <p className="text-text-dim">{t('market.orders.orderSoFarNotBuilt')}</p>
                </div>
              </Disclosure>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
