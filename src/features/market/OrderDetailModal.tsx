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
import { useMemo, useRef, useState, type ReactNode } from 'react';
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
import { formatIsk, formatMarketIsk } from '@/lib/isk';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { JumpsAwayText } from '@/features/character/assetBrowserRows';
import type { UndercutRival, UndercutScope } from '@/engine/market/undercut';
import { sellThrough, type SellThrough } from '@/engine/market/orderHealth';
import { filterPriceHistoryRange } from '@/engine/market/priceHistory';
import { useIsPhone } from '@/lib/useIsPhone';
import type { OpenOrderRow } from './openOrdersModel';
import type { RegionCompetition, StructureCompetition } from './orderCompetition';
import type { PriceHistoryResult } from './priceHistory';
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

type ScopeState =
  | { kind: 'unavailable' }
  | { kind: 'notChecked' }
  | { kind: 'clear' }
  | { kind: 'rival'; rival: UndercutRival };

/** The modal's four folding sections, all folded on arrival. */
export type OrderDetailSectionId = 'numbers' | 'whoCheaper' | 'costBasis' | 'exits';

/** The tightest scope carrying a rival, for the "Who is cheaper" disclosure's trailing read — or `'clear'`/`'notChecked'` when none of the three do. */
function tightestRivalScope(
  station: ScopeState,
  system: ScopeState,
  region: ScopeState
): { scope: UndercutScope; price: number } | 'clear' | 'notChecked' {
  for (const [scope, state] of [
    ['station', station],
    ['system', system],
    ['region', region],
  ] as const) {
    if (state.kind === 'rival') return { scope, price: state.rival.price };
  }
  // `unavailable` (a player structure's market that can't be read at all)
  // is not proof of "clear" either — only a real `clear` read earns that.
  return [station, system, region].some((s) => s.kind === 'notChecked' || s.kind === 'unavailable')
    ? 'notChecked'
    : 'clear';
}

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

/**
 * `'known'` — the NPC-station lookup loaded and resolved this location.
 * `'structure'` — it loaded but this location isn't in it (a player
 * structure). `'unknown'` — the lookup itself hasn't loaded, so nothing
 * about this location can be claimed either way.
 */
type LocationState = 'known' | 'structure' | 'unknown';

function stationScopeState(
  row: OpenOrderRow,
  stationChecked: boolean,
  location: LocationState
): ScopeState {
  if (location === 'unknown') return { kind: 'notChecked' };
  if (location === 'structure') return { kind: 'unavailable' };
  if (!stationChecked) return { kind: 'notChecked' };
  if (row.station.bestPrice === null) return { kind: 'clear' };
  if (row.station.beatsMe) {
    return {
      kind: 'rival',
      rival: {
        scope: 'station',
        price: row.station.bestPrice,
        gapIsk: row.station.gapIsk,
        gapPct: row.station.gapPct,
        volumeRemain: 0,
        locationId: row.locationId,
        systemId: 0,
        ordersBeatingMe: 0,
        unitsBeatingMe: 0,
      },
    };
  }
  return { kind: 'clear' };
}

/**
 * The 'station' column for a player structure (issue #538): sourced from
 * `row.deepUndercut.byScope.station`, which `openOrdersModel.ts` only
 * populates once THIS structure's own book was actually fetched — never from
 * `deepScopeState`, whose `deep.truncated` read is the REGION fetch's flag
 * and would misattribute a structure-book truncation to the wrong fetch.
 *
 * 'unavailable' is the default and the failure mode alike: never fetched,
 * the `structureMarkets` scope isn't granted, or this character isn't on the
 * structure's ACL all leave `byScope.station` absent, and all read the same
 * — there is no way, or reason, to tell them apart on the row.
 */
function structureStationScopeState(
  row: OpenOrderRow,
  structureMarket: StructureCompetition | null
): ScopeState {
  const byScope = row.deepUndercut?.byScope ?? {};
  if (!('station' in byScope)) return { kind: 'unavailable' };
  const rival = byScope.station;
  if (rival) return { kind: 'rival', rival };
  // A clean read from a TRUNCATED structure book is only proof of absence for
  // the pages it actually saw — same reasoning as `deepScopeState` below.
  if (structureMarket?.truncated) return { kind: 'notChecked' };
  return { kind: 'clear' };
}

function deepScopeState(
  scope: 'system' | 'region',
  row: OpenOrderRow,
  deep: RegionCompetition | null,
  location: LocationState
): ScopeState {
  if (scope === 'system' && location === 'unknown') return { kind: 'notChecked' };
  if (scope === 'system' && location === 'structure') return { kind: 'unavailable' };
  if (deep === null) return { kind: 'notChecked' };
  const byScope = row.deepUndercut?.byScope ?? {};
  if (!(scope in byScope)) return { kind: 'notChecked' };
  const rival = byScope[scope];
  if (rival) return { kind: 'rival', rival };
  // A rival was found here despite truncation, that finding stands. But a
  // CLEAN read from a truncated book is only proof of absence for the pages
  // it actually saw — honest is "not checked", not "clear".
  if (deep.truncated) return { kind: 'notChecked' };
  return { kind: 'clear' };
}

/** Scope pill colours: the same station/system/region ladder the row badges use. */
const SCOPE_PILL: Record<UndercutScope, string> = {
  station: 'bg-danger/15 text-danger',
  system: 'bg-warning/15 text-warning',
  region: 'bg-accent/15 text-accent',
};

/**
 * One cell of the scope table. Every row is a FRAGMENT of these, not its own
 * grid: three separate grids each size their `auto` columns to their own
 * content, so the price and gap columns landed in a different place on every
 * row. One grid owns the track sizes for the whole table, and the rows only
 * contribute cells.
 *
 * That rules out a row background or a row border — a fragment has no box —
 * so the top rule and the "my order" tint are painted per cell instead.
 */
const CELL = 'border-t border-line px-2 py-1.5';

/** A scope table column header. */
const COLUMN_HEADER =
  'px-2 pt-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

type Translate = ReturnType<typeof useTranslation>['t'];

function scopeLabelText(scope: UndercutScope, t: Translate): string {
  return t(`market.orders.badge.undercut${scope[0].toUpperCase()}${scope.slice(1)}`);
}

/** Distance as words, the way `JumpsAwayText` renders it. */
function jumpsText(jumps: JumpsAwayResult, t: Translate): string {
  return jumps.kind === 'known'
    ? t('assets.jumpsAway.value', { count: jumps.jumps })
    : t('assets.jumpsAway.unknown');
}

/** One scope line of the grid as exported (`scopeOrdersCsv.ts`), mirroring `ScopeRow`. */
function scopeCsvRow(
  scope: UndercutScope,
  state: ScopeState,
  t: Translate,
  where: { stationName?: string | null; distance?: string; jumps?: JumpsAwayResult }
): ScopeOrderCsvRow {
  const base = { scope: scopeLabelText(scope, t), price: null, gapIsk: null, gapPct: null };
  if (state.kind !== 'rival') {
    const seller =
      state.kind === 'unavailable'
        ? t('market.orders.structureMarketUnavailable')
        : state.kind === 'notChecked'
          ? t('market.orders.scopeNotChecked')
          : t('market.orders.scopeClear');
    return { ...base, seller, distance: null };
  }
  const { rival } = state;
  return {
    ...base,
    seller: where.stationName ?? t('market.unknownStructure'),
    price: rival.price,
    gapIsk: rival.gapIsk,
    gapPct: rival.gapPct,
    distance: where.jumps ? jumpsText(where.jumps, t) : (where.distance ?? null),
  };
}

/**
 * One scope's line in the "Who is cheaper" table.
 *
 * The seller cell carries the station, the ISK gap and the distance, because
 * the three scopes routinely carry the SAME rival — one seller at your own
 * station is, by construction, also the cheapest in your system and can be
 * the cheapest in the region too. Three identical ISK figures on three bare
 * rows read as a bug; the same three beside where they sit, the gap, and the
 * distance read as what they are.
 *
 * A state that isn't a rival (not checked, clear, structure) has nothing to
 * put in the seller and price columns, so it spans them rather than printing
 * dashes.
 */
function ScopeRow({
  scope,
  state,
  stationName,
  distance,
  jumps,
}: {
  scope: UndercutScope;
  state: ScopeState;
  /** Where the rival sits, when this app resolved that location. */
  stationName?: string | null;
  /** Fixed distance wording for a scope whose answer is structural (station, system). */
  distance?: string;
  jumps?: JumpsAwayResult;
}) {
  const { t } = useTranslation();
  const scopeLabel = (
    <span role="rowheader" className={cx(CELL, 'pl-3')}>
      <span
        className={cx(
          'inline-flex h-5 w-fit items-center rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-widest uppercase',
          SCOPE_PILL[scope]
        )}
      >
        {scopeLabelText(scope, t)}
      </span>
    </span>
  );

  if (state.kind !== 'rival') {
    return (
      <div role="row" className="contents">
        {scopeLabel}
        <span
          role="cell"
          className={cx(
            CELL,
            'col-span-2 pr-3',
            state.kind === 'clear' ? 'text-success' : 'text-text-dim'
          )}
        >
          {state.kind === 'unavailable' && t('market.orders.structureMarketUnavailable')}
          {state.kind === 'notChecked' && t('market.orders.scopeNotChecked')}
          {state.kind === 'clear' && t('market.orders.scopeClear')}
        </span>
      </div>
    );
  }

  const { rival } = state;
  // The station tier is a Fuzzwork aggregate: a price, never an order count.
  // `stationScopeState` fills those fields with 0, so they are only ever read
  // when the deep book actually supplied them.
  const countsKnown = rival.ordersBeatingMe > 0;
  const distanceText = jumps ? (
    <JumpsAwayText result={jumps} t={t} locationId={rival.locationId} />
  ) : (
    (distance ?? '')
  );
  const whoText = countsKnown
    ? [
        t('market.orders.rowSummary.sellersUnderMe', { count: rival.ordersBeatingMe }),
        t('market.orders.scopeUnitsUnder', { count: rival.unitsBeatingMe }),
      ].join(' · ')
    : t('market.orders.scopeAggregateOnly');

  return (
    <div role="row" className="contents">
      {scopeLabel}
      <span role="cell" className={cx(CELL, 'flex flex-col gap-0.5')}>
        <span>{stationName ?? t('market.unknownStructure')}</span>
        <span className="text-[0.6875rem] text-text-dim">{whoText}</span>
        {/*
          The gap and distance ride under the seller as labelled words: the
          dialog is narrow at every width, and a bare red number under no
          column header says nothing.
        */}
        <span className="text-[0.6875rem] text-text-dim">
          {t('market.orders.scopeOverBy')}:{' '}
          <span className="text-danger tabular-nums">
            {formatMarketIsk(rival.gapIsk)} · {rival.gapPct.toFixed(1)}%
          </span>
        </span>
        {distanceText !== '' && (
          <span className="text-[0.6875rem] text-text-dim">
            {t('market.orders.scopeDistance')}: {distanceText}
          </span>
        )}
      </span>
      <span role="cell" className={cx(CELL, 'pr-3 text-right tabular-nums')}>
        {formatMarketIsk(rival.price)}
      </span>
    </div>
  );
}

/**
 * "Sells out in": `sellThrough` fed with this order's remaining volume, the
 * region's recent average daily units (last 30 days of price history — the
 * same window `sellsOutNoSales`'s wording promises), and the player's share
 * of the units listed at their price or better.
 *
 * No usable history at all (never fetched, fetch failed, or ESI genuinely
 * has none) reads as `'noHistory'` — never a fabricated rate.
 *
 * `myShare` comes from the deep competitors already in hand: same side
 * (a buy order only queues behind other buy orders), priced at-or-better
 * than mine, my own remaining volume as a fraction of that whole pool. When
 * the deep book has not been fetched yet there is no honest way to place
 * myself in that queue, so this passes `1` (assume nothing ahead) rather
 * than inventing a number — the only other input, region volume, still
 * carries the interesting signal in that case. A TRUNCATED deep book is
 * used as-is here too: it under-counts the queue ahead of me (rather than
 * over-counting it), so `myShare` — and therefore the days-to-clear estimate
 * — reads as a lower bound in that case, never a false alarm.
 */
function computeSellThrough(
  row: OpenOrderRow,
  deep: RegionCompetition | null,
  history: PriceHistoryResult | null
): SellThrough {
  if (!history || history.points.length === 0) return { kind: 'unknown', reason: 'noHistory' };

  const recentDays = 30;
  const recent = filterPriceHistoryRange(history.points, '30d');
  const regionUnitsPerDay = recent.reduce((sum, p) => sum + p.volume, 0) / recentDays;

  let myShare = 1;
  if (deep) {
    const queueVolume = deep.competitors
      .filter(
        (c) =>
          c.orderId !== row.orderId &&
          c.isBuyOrder === row.isBuyOrder &&
          (row.isBuyOrder ? c.price >= row.price : c.price <= row.price)
      )
      .reduce((sum, c) => sum + c.volumeRemain, 0);
    const totalVolume = row.volumeRemain + queueVolume;
    myShare = totalVolume > 0 ? row.volumeRemain / totalVolume : 1;
  }

  return sellThrough({
    volumeRemain: row.volumeRemain,
    regionUnitsPerDay,
    myShare,
    hasHistory: true,
  });
}

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

/** "What it cost you" once a cost basis is known: build run or wallet buys, fees, floor. */
function CostLedger({
  row,
  costBasis,
  relistFees,
  floorShown,
}: {
  row: OpenOrderRow;
  costBasis: NonNullable<OpenOrderRow['costBasis']>;
  relistFees: OrderDetailView['relistFees'];
  floorShown: number | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-xs">
        {costBasis.source === 'wallet' ? (
          <>
            <LedgerRow
              label={t('market.orders.walletBasisUnits')}
              value={costBasis.unitsCovered.toLocaleString()}
            />
            <LedgerRow
              label={t('market.orders.walletBasisBuys')}
              value={costBasis.buyCount.toLocaleString()}
            />
            <LedgerRow
              label={t('market.orders.walletBasisRange')}
              value={t('market.orders.walletBasisRangeValue', {
                from: new Date(costBasis.oldestBuy).toLocaleDateString(),
                to: new Date(costBasis.newestBuy).toLocaleDateString(),
              })}
            />
          </>
        ) : (
          <>
            <LedgerRow
              label={t('industry.quantity')}
              value={costBasis.runQuantity.toLocaleString()}
            />
            <LedgerRow
              label={t('industry.materialCost')}
              value={`${formatIsk(costBasis.materialCost)} ISK`}
            />
            <LedgerRow label={t('industry.jobFee')} value={`${formatIsk(costBasis.jobFee)} ISK`} />
            <LedgerRow
              label={t('industry.totalCost')}
              value={`${formatIsk(costBasis.materialCost + costBasis.jobFee)} ISK`}
            />
          </>
        )}
        {/*
          Per unit, not per run — the pivot from the batch totals above to the
          per-unit figures below. `unitCost` is exactly `totalCost /
          runQuantity` (orderCostBasis.ts); 2 decimals to match the floor rows
          it feeds into, not the 0-decimal batch totals above it.
        */}
        <LedgerRow
          label={t('market.orders.costPerUnit')}
          value={`${formatMarketIsk(costBasis.unitCost)} ISK`}
        />
        {costBasis.source === 'wallet' && (
          <div className="col-span-2 space-y-0.5 text-text-dim">
            <ul>
              {costBasis.buys.map((buy, i) => (
                <li key={i}>
                  {t('market.orders.walletBasisBuyLine', {
                    quantity: buy.quantity.toLocaleString(),
                    price: formatMarketIsk(buy.unitPrice),
                    date: new Date(buy.date).toLocaleDateString(),
                  })}
                </li>
              ))}
            </ul>
            <p>{t('market.orders.walletBasisNoBuyFee')}</p>
          </div>
        )}
        {/*
          The two fee lines sum with cost per unit to exactly the relist floor
          below — `relistFees` in `orderDetailView.ts` says why they are read
          that way.
        */}
        {relistFees && (
          <>
            <LedgerRow
              label={t('industry.salesTax')}
              value={`${formatMarketIsk(relistFees.salesTax)} ISK`}
            />
            <LedgerRow
              label={t('market.orders.relistBrokerFee')}
              value={`${formatMarketIsk(relistFees.brokerFee)} ISK`}
            />
          </>
        )}
        {floorShown !== null && (
          // Only ONE floor is ever shown as a ledger number (design
          // decision): `floor.fill` — what leaving the order alone would net
          // once it sells — appears only in the prose below, which is the one
          // place the smaller number is the answer to something. The ledger
          // math itself still sums to the exact `row.floor.relist`, never the
          // rounded figure.
          <LedgerRow
            label={t('market.orders.floorLabel')}
            tooltip={t('market.orders.floorHelp')}
            value={
              <span
                className={row.floor && row.price < row.floor.relist ? 'text-danger' : undefined}
              >
                <CopyablePrice price={floorShown} /> ISK
              </span>
            }
          />
        )}
      </dl>
      {row.floor && (
        <>
          <p className="text-xs text-text-dim">
            {t(
              costBasis.source === 'wallet'
                ? 'market.orders.statFloorCaptionWallet'
                : 'market.orders.statFloorCaption'
            )}{' '}
            {t('market.orders.floorBreakEvenNote')}
          </p>
          <div className="rounded-xs border border-line bg-panel p-2">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.orders.floorWhyBroker')}
            </p>
            <p className="mt-1 text-xs text-text">
              {t('market.orders.floorWhyBrokerBody', {
                relist: formatMarketIsk(row.floor.relist),
              })}
            </p>
            <p className="mt-1 text-xs text-text-dim">
              {t('market.orders.floorWhyBrokerFill', {
                price: formatMarketIsk(row.price),
                fill: formatMarketIsk(row.floor.fill),
                difference: formatMarketIsk(row.floor.relist - row.floor.fill),
              })}
            </p>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Where my price sits among the sell orders at my own station.
 *
 * Only from a COMPLETE region book: a truncated fetch under-counts the
 * orders at my station, so both the rank and the total would be a lower
 * bound dressed up as a fact. The station tier cannot answer this at all —
 * an aggregate carries a price and no order count.
 */
function stationRank(
  row: OpenOrderRow,
  deep: RegionCompetition | null
): { rank: number; total: number } | null {
  if (!deep || deep.truncated) return null;
  const atMyStation = deep.competitors.filter(
    (c) => c.locationId === row.locationId && c.isBuyOrder === row.isBuyOrder
  );
  if (atMyStation.length === 0) return null;
  const better = atMyStation.filter((c) =>
    row.isBuyOrder ? c.price > row.price : c.price < row.price
  ).length;
  // `atMyStation` already includes my own order (`loadRegionCompetition` does
  // not filter it out), so it is the total, not the total minus me.
  return { rank: better + 1, total: atMyStation.length };
}

function LedgerRow({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: ReactNode;
  /** Explains the label's term, as a "?" after it. */
  tooltip?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <dt className="flex items-center gap-1 font-semibold tracking-widest text-text-dim uppercase">
        {label}
        {tooltip && <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />}
      </dt>
      <dd className="text-right tabular-nums text-text">{value}</dd>
    </>
  );
}
