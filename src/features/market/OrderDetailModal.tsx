/**
 * Full breakdown of one open order (CONTEXT.md's redesigned Market > Open
 * Orders tab): what to do about it, the numbers behind that call, who is
 * cheaper and where, and — for a sell order — the cost-basis ledger the
 * floor came from.
 *
 * Kept dumb on purpose: every prop is already-loaded data plus loading flags.
 * `OpenOrdersPanel` owns every fetch (`ensureDeepChecked`, jump lookups,
 * price history for the "sells out in" chip) — this component only renders
 * what it is handed and asks for more via `onCheckDeeper`.
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
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, InfoTooltip } from '@/components/ui';
import { cx } from '@/lib/cx';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { Link } from 'react-router-dom';
import { formatIsk } from '@/lib/isk';
import { salesTax, brokerFee } from '@/engine/industry/fees';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { JumpsAwayText } from '@/features/character/assetBrowserRows';
import type { UndercutRival, UndercutScope } from '@/engine/market/undercut';
import { sellThrough, type SellThrough } from '@/engine/market/orderHealth';
import { filterPriceHistoryRange } from '@/engine/market/priceHistory';
import type { CharacterSkills, OpenOrderRow } from './openOrdersModel';
import type { RegionCompetition, StructureCompetition } from './orderCompetition';
import type { PriceHistoryResult } from './priceHistory';
import { OrderProblemBadge } from './OrderProblemBadge';
import { orderBadgeFor } from './orderBadgeKind';
import { OrderRowSummaryText } from './OrderRowSummaryText';
import { orderVerdict, type OrderVerdictKind } from './orderVerdict';
import { orderExits, hubHaulGaps, type HubBuyPrice, type ReprocessingInput } from './orderExits';
import { BASE_STATION_REPROCESSING_RATE } from '@/engine/industry/reprocessing';

export interface OrderDetailModalProps {
  open: boolean;
  row: OpenOrderRow;
  /** Undefined only if the character's own skills failed to load — the ledger still renders, just without tax/broker lines. */
  skills: CharacterSkills | undefined;
  /** Null: not fetched yet (or the fetch failed and hasn't been retried). */
  deep: RegionCompetition | null;
  loadingDeep: boolean;
  /**
   * Null: not fetched yet (or the fetch failed and hasn't been retried) —
   * renders the same honest "can't tell yet" as no history at all, since
   * neither case can support a number.
   */
  history: PriceHistoryResult | null;
  /** Whether the cheap station-price tier actually returned an aggregate for this row's station+item. */
  stationChecked: boolean;
  /**
   * Whether the NPC-station lookup itself loaded. False (e.g. a first
   * offline visit — that file is deliberately outside the install precache)
   * must read as "not checked" for station/system, never as the false claim
   * that this order sits at a player structure.
   */
  stationsLoaded: boolean;
  /** Undefined while not yet requested/resolved. */
  regionJumps: JumpsAwayResult | undefined;
  /** The refine comparison, once its yield and material prices have loaded. Undefined keeps the row greyed as "not built for this item yet". */
  reprocessing?: ReprocessingInput;
  /**
   * What each trade hub pays for this item, once the aggregates land.
   * Undefined until then — distinct from an empty list, which is the real
   * answer that no hub bids at all.
   */
  hubs?: readonly HubBuyPrice[];
  /** The hub lookup failed. Says so, rather than leaving "checking…" standing forever. */
  hubsFailed?: boolean;
  /** Resolves a rival's location to a name, so the three scopes can be told apart when they quote the same seller. Returns null for a player structure. */
  stationNameFor: (locationId: number) => string | null;
  /**
   * This order's own structure's market book (issue #538), when this is a
   * player structure and that book has been fetched. Null for every reason
   * the station scope can't answer here: not a structure, no fetch attempted
   * yet, the `structureMarkets` scope isn't granted, or this character isn't
   * on the structure's ACL — all render as the same "unavailable" row.
   */
  structureMarket?: StructureCompetition | null;
  onCheckDeeper: () => void;
  onClose: () => void;
}

type ScopeState =
  | { kind: 'unavailable' }
  | { kind: 'notChecked' }
  | { kind: 'clear' }
  | { kind: 'rival'; rival: UndercutRival };

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

/**
 * One scope's line in the "who is cheaper, and where" table.
 *
 * Five columns, because the three scopes routinely carry the SAME rival —
 * one seller at your own station is, by construction, also the cheapest in
 * your system and can be the cheapest in the region too. Three identical
 * ISK figures on three bare rows read as a bug; the same three beside the
 * station they sit in, the ISK gap, and the distance read as what they are.
 *
 * A state that isn't a rival (not checked, clear, structure) has nothing to
 * put in those four columns, so it spans them rather than printing dashes.
 */
/** Scope pill colours: the same station/system/region ladder the row badges use. */
const SCOPE_PILL: Record<UndercutScope, string> = {
  station: 'border-danger/50 bg-danger/15 text-danger',
  system: 'border-warning/50 bg-warning/15 text-warning',
  region: 'border-accent/50 bg-accent/15 text-accent',
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
    <span className={cx(CELL, 'pl-3')}>
      <span
        className={cx(
          'inline-flex h-5 w-fit items-center rounded-xs border px-1.5 text-[0.625rem] font-semibold tracking-widest uppercase',
          SCOPE_PILL[scope]
        )}
      >
        {t(`market.orders.badge.undercut${scope[0].toUpperCase()}${scope.slice(1)}`)}
      </span>
    </span>
  );

  if (state.kind !== 'rival') {
    return (
      <>
        {scopeLabel}
        <span
          className={cx(
            CELL,
            'col-span-2 pr-3 md:col-span-4',
            state.kind === 'clear' ? 'text-success' : 'text-text-dim'
          )}
        >
          {state.kind === 'unavailable' && t('market.orders.structureMarketUnavailable')}
          {state.kind === 'notChecked' && t('market.orders.scopeNotChecked')}
          {state.kind === 'clear' && t('market.orders.scopeClear')}
        </span>
      </>
    );
  }

  const { rival } = state;
  // The station tier is a Fuzzwork aggregate: a price, never an order count.
  // `stationScopeState` fills those fields with 0, so they are only ever read
  // when the deep book actually supplied them.
  const countsKnown = rival.ordersBeatingMe > 0;
  const distanceText = jumps ? <JumpsAwayText result={jumps} t={t} /> : (distance ?? '');
  const whoText = countsKnown
    ? [
        t('market.orders.rowSummary.sellersUnderMe', { count: rival.ordersBeatingMe }),
        t('market.orders.scopeUnitsUnder', { count: rival.unitsBeatingMe }),
      ].join(' · ')
    : t('market.orders.scopeAggregateOnly');

  return (
    <>
      {scopeLabel}
      <span className={cx(CELL, 'flex flex-col gap-0.5')}>
        <span>{stationName ?? t('market.unknownStructure')}</span>
        <span className="text-[0.6875rem] text-text-dim">{whoText}</span>
        {/*
          The gap and distance columns are dropped below `md`, where their
          headers would be too — a bare red number under no label says
          nothing. They come back here as labelled words instead, since a
          phone is the read-only surface for this page.
        */}
        <span className="text-[0.6875rem] text-text-dim md:hidden">
          {t('market.orders.scopeOverBy')}: {formatIsk(rival.gapIsk, 2)} · {rival.gapPct.toFixed(1)}
          %
        </span>
        {distanceText !== '' && (
          <span className="text-[0.6875rem] text-text-dim md:hidden">
            {t('market.orders.scopeDistance')}: {distanceText}
          </span>
        )}
      </span>
      <span className={cx(CELL, 'pr-3 text-right tabular-nums md:pr-2')}>
        {formatIsk(rival.price, 2)}
      </span>
      <span className={cx(CELL, 'hidden text-right text-danger tabular-nums md:block')}>
        {formatIsk(rival.gapIsk, 2)} · {rival.gapPct.toFixed(1)}%
      </span>
      <span className={cx(CELL, 'hidden pr-3 text-right text-text-dim tabular-nums md:block')}>
        {distanceText}
      </span>
    </>
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

export function OrderDetailModal({
  open,
  row,
  skills,
  deep,
  loadingDeep,
  history,
  stationChecked,
  stationsLoaded,
  regionJumps,
  reprocessing,
  hubs,
  hubsFailed = false,
  stationNameFor,
  structureMarket = null,
  onCheckDeeper,
  onClose,
}: OrderDetailModalProps) {
  const { t } = useTranslation();
  const location: LocationState = !stationsLoaded
    ? 'unknown'
    : row.stationName === null
      ? 'structure'
      : 'known';

  const badge = orderBadgeFor(row);
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
  const allClean =
    !row.isBuyOrder &&
    station.kind === 'clear' &&
    (system.kind === 'clear' || system.kind === 'unavailable' || system.kind === 'notChecked') &&
    region.kind === 'clear';
  const verdict = orderVerdict(row);
  const exits = orderExits({ row, competitors: deep?.competitors, reprocessing });
  const haulGaps = hubHaulGaps({ row, hubs: hubs ?? [], competitors: deep?.competitors });
  const refine = exits.find((exit) => exit.kind === 'reprocess');
  const rank = stationRank(row, deep);
  const netIfSellsAsListed = row.floor ? row.price - row.floor.fill : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${row.characterName} · ${row.typeName}`}
      placement="wide"
    >
      <div className="space-y-3">
        {/*
          The call and the numbers behind it, side by side on a wide screen
          and stacked on a phone — the two things anyone opening this modal
          came for, above every explanation.
        */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,19rem)_1fr]">
          <section className="rounded-xs border border-line bg-panel-2 p-3">
            <h3 className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-widest text-text-dim uppercase">
              {t('market.orders.quickAnswer')}
              {badge && <OrderProblemBadge kind={badge.kind} detail={badge.detail} />}
            </h3>
            {verdict ? (
              <>
                {/*
                  A real call, only ever reachable with an Order Floor. With
                  no cost basis linked there is no way to tell "match them"
                  from "let this one go", so the badge's generic advice is
                  the fallback below — which is the common case, not the
                  exception.
                */}
                <p className={cx('mt-1.5 text-lg font-semibold', VERDICT_TONE[verdict.kind])}>
                  {t(`market.orders.verdict.${verdict.kind}`)}
                </p>
                <p className="mt-1 text-sm text-text-dim">
                  {t(`market.orders.verdict.${verdict.kind}Detail`, {
                    amount: verdict.amount === null ? '' : formatIsk(verdict.amount, 2),
                  })}
                </p>
              </>
            ) : badge ? (
              <>
                <p className="mt-1.5 text-base font-semibold text-text">
                  {t(`market.orders.badge.${badge.kind}Action`)}
                </p>
                <p className="mt-1 text-sm text-text-dim">
                  {t(`market.orders.badge.${badge.kind}Help`)}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-text-dim">{t('market.orders.scopeNotChecked')}</p>
            )}
            <p className="mt-2">
              <OrderRowSummaryText row={row} />
            </p>
          </section>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <StatCard
              label={t('market.orders.statMyPrice')}
              value={formatIsk(row.price, 2)}
              caption={
                rank ? t('market.orders.statRank', { rank: rank.rank, total: rank.total }) : null
              }
            />
            <StatCard
              label={t('market.orders.floorLabel')}
              tooltip={t('market.orders.floorHelp')}
              value={row.floor ? formatIsk(row.floor.relist, 2) : t('common.unknown')}
              tone={row.floor && row.price < row.floor.relist ? 'danger' : 'default'}
              caption={t(
                row.costBasis ? 'market.orders.statFloorCaption' : 'market.orders.statFloorNoBasis'
              )}
            />
            <StatCard
              label={t('market.orders.sellsOutIn')}
              tooltip={t('market.orders.sellsOutHelp')}
              value={sellValue}
              tone={sellPastExpiry ? 'danger' : 'default'}
              caption={
                sell.kind === 'known'
                  ? t('market.orders.statSellsOutCaption', {
                      count: Math.round(sell.unitsPerDay),
                    })
                  : null
              }
            />
            <StatCard
              label={t('market.orders.statVolumeLeft')}
              value={`${row.volumeRemain.toLocaleString()} / ${row.volumeTotal.toLocaleString()}`}
            >
              {row.volumeTotal > 0 && (
                <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-xs bg-line">
                  <span
                    className="block h-full bg-accent"
                    style={{
                      width: `${Math.min(100, (row.volumeRemain / row.volumeTotal) * 100)}%`,
                    }}
                  />
                </span>
              )}
            </StatCard>
            <StatCard
              label={t('market.orders.statOrderExpires')}
              value={row.expiry ? `${row.expiry.daysLeft}d` : t('common.unknown')}
              tone={row.expiry && row.expiry.daysLeft <= 7 ? 'warning' : 'default'}
              caption={
                row.expiry
                  ? t('market.orders.statExpiresCaption', {
                      date: new Date(row.expiry.expiresAt).toLocaleDateString(),
                      listed: new Date(row.issued).toLocaleDateString(),
                    })
                  : null
              }
            />
            <StatCard
              label={t('market.orders.statIfSellsAsListed')}
              value={
                netIfSellsAsListed === null
                  ? t('common.unknown')
                  : `${netIfSellsAsListed >= 0 ? '+' : ''}${formatIsk(netIfSellsAsListed, 2)}`
              }
              tone={
                netIfSellsAsListed === null
                  ? 'default'
                  : netIfSellsAsListed >= 0
                    ? 'success'
                    : 'danger'
              }
              caption={netIfSellsAsListed === null ? null : t('market.orders.statPerUnitAfterFees')}
            />
          </div>
        </div>

        {sellPastExpiry && (
          <p className="text-xs text-danger">{t('market.orders.sellsOutPastExpiry')}</p>
        )}

        <section className="rounded-xs border border-line">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-panel-2 px-3 py-2">
            <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
              {t('market.orders.whoIsCheaper')}
            </h3>
            <p className="text-[0.6875rem] text-text-faint">
              {t('market.orders.scopeTightestBites')}
            </p>
          </div>
          {/*
            ONE grid for the whole table: header, every scope row and the
            player's own order all contribute cells to these tracks, so the
            price, gap and distance columns line up down the table. Rows
            cannot own a background or a border here, so the rule between
            rows and the "my order" tint are painted per cell.
          */}
          <div className="grid grid-cols-[auto_1fr_auto] text-xs md:grid-cols-[auto_1fr_auto_auto_auto]">
            <span className="px-2 pt-2 pl-3 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.orders.scopeColumn')}
            </span>
            <span className="px-2 pt-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.orders.scopeCheapestSeller')}
            </span>
            <span className="px-2 pt-2 pr-3 text-right text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase md:pr-2">
              {t('market.orders.scopeTheirPrice')}
            </span>
            <span className="hidden px-2 pt-2 text-right text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase md:block">
              {t('market.orders.scopeOverBy')}
            </span>
            <span className="hidden px-2 pt-2 pr-3 text-right text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase md:block">
              {t('market.orders.scopeDistance')}
            </span>
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
            <span
              className={cx(
                CELL,
                'bg-panel-2 pl-3 font-semibold tracking-widest text-accent uppercase'
              )}
            >
              {t('market.orders.scopeMyOrder')}
            </span>
            <span className={cx(CELL, 'bg-panel-2')}>
              {row.stationName ?? t('market.unknownStructure')}
            </span>
            <span className={cx(CELL, 'bg-panel-2 pr-3 text-right tabular-nums md:pr-2')}>
              {formatIsk(row.price, 2)}
            </span>
            <span className={cx(CELL, 'hidden bg-panel-2 md:block')} />
            <span className={cx(CELL, 'hidden bg-panel-2 md:block')} />
          </div>
          <div className="px-3 pb-2">
            {allClean && (
              <p className="pt-1.5 text-xs text-success">{t('market.orders.onlySeller')}</p>
            )}
            {deep?.truncated && (
              // A truncated fetch isn't the pre-fetch state (the button below
              // stays hidden, same as any other resolved `deep`) — say why
              // system/region above read "not checked" instead of leaving the
              // user to wonder where the "check deeper" button went. Same
              // key/shape `OrderHistoryPanel.tsx` and `VariationsTable.tsx` use
              // for their own truncated fetches.
              <p className="pt-1.5 text-[0.6875rem] text-warning uppercase">
                {t('common.incompleteTitle')}
              </p>
            )}
            {showCheckDeeper && (
              <p className="pt-2">
                <Button size="sm" onClick={onCheckDeeper}>
                  {t('market.orders.checkDeeper')}
                </Button>
              </p>
            )}
            {loadingDeep && (
              <p className="pt-1.5 text-xs text-text-dim">{t('market.orders.checkingDeeper')}</p>
            )}
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-xs border border-line">
            <h3 className="border-b border-line bg-panel-2 px-3 py-2 text-xs font-semibold tracking-widest text-text-dim uppercase">
              {t('market.orders.floorWorking')}
            </h3>
            <div className="space-y-1.5 px-3 py-2">
              {row.costBasis === null ? (
                <>
                  <p className="text-sm text-text">{t('market.orders.noCostBasisTitle')}</p>
                  <p className="text-xs text-text-dim">{t('market.orders.noCostBasisHint')}</p>
                  <Link
                    to="/industry"
                    className={buttonClassName({ variant: 'ghost', size: 'sm' })}
                  >
                    {t('market.orders.linkBuild')}
                  </Link>
                </>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <LedgerRow
                      label={t('industry.quantity')}
                      value={row.costBasis.runQuantity.toLocaleString()}
                    />
                    <LedgerRow
                      label={t('industry.materialCost')}
                      value={`${formatIsk(row.costBasis.materialCost)} ISK`}
                    />
                    <LedgerRow
                      label={t('industry.jobFee')}
                      value={`${formatIsk(row.costBasis.jobFee)} ISK`}
                    />
                    <LedgerRow
                      label={t('industry.totalCost')}
                      value={`${formatIsk(row.costBasis.materialCost + row.costBasis.jobFee)} ISK`}
                    />
                    {/*
                      Per unit, not per run — the pivot from the batch totals
                      above to the per-unit figures below. `unitCost` is
                      exactly `totalCost / runQuantity` (orderCostBasis.ts);
                      2 decimals to match the floor rows it feeds into, not
                      the 0-decimal batch totals above it.
                    */}
                    <LedgerRow
                      label={t('market.orders.costPerUnit')}
                      value={`${formatIsk(row.costBasis.unitCost, 2)} ISK`}
                    />
                    {/*
                      Rendered as ISK off `floor.relist`, not as a bare
                      percentage: `unitCost + salesTax(relist) +
                      brokerFee(relist) === relist` by construction
                      (`breakEvenPrice` solves for exactly that revenue),
                      including its 100 ISK minimum-broker-fee floor — which a
                      percentage-of-unitCost readout would silently miss. This
                      is what makes the ledger's lines actually sum to the
                      floor shown below, so gated on `row.floor` (not `skills`
                      alone): there is no relist price to read the fee off
                      without it.
                    */}
                    {skills && row.floor && (
                      <>
                        <LedgerRow
                          label={t('industry.salesTax')}
                          value={`${formatIsk(salesTax(row.floor.relist, skills.accountingLevel), 2)} ISK`}
                        />
                        <LedgerRow
                          label={t('industry.brokerFee')}
                          value={`${formatIsk(brokerFee(row.floor.relist, skills.brokerRelationsLevel), 2)} ISK`}
                        />
                      </>
                    )}
                    {row.floor && (
                      // Only ONE floor is ever shown as a ledger number
                      // (design decision): `floor.fill` — what leaving the
                      // order alone would net once it sells — appears only in
                      // the prose below, which is the one place the smaller
                      // number is the answer to something.
                      <LedgerRow
                        label={t('market.orders.floorLabel')}
                        value={`${formatIsk(row.floor.relist, 2)} ISK`}
                      />
                    )}
                  </dl>
                  {row.floor && (
                    <>
                      <p className="text-xs text-text-dim">
                        {t('market.orders.floorBreakEvenNote')}
                      </p>
                      <div className="rounded-xs border border-line bg-panel-2 p-2">
                        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                          {t('market.orders.floorWhyBroker')}
                        </p>
                        <p className="mt-1 text-xs text-text">
                          {t('market.orders.floorWhyBrokerBody', {
                            relist: formatIsk(row.floor.relist, 2),
                          })}
                        </p>
                        <p className="mt-1 text-xs text-text-dim">
                          {t('market.orders.floorWhyBrokerFill', {
                            price: formatIsk(row.price, 2),
                            fill: formatIsk(row.floor.fill, 2),
                            difference: formatIsk(row.floor.relist - row.floor.fill, 2),
                          })}
                        </p>
                      </div>
                    </>
                  )}
                  <Link
                    to="/industry"
                    className={buttonClassName({ variant: 'ghost', size: 'sm' })}
                  >
                    {t('market.orders.linkBuild')}
                  </Link>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xs border border-line">
            <h3 className="border-b border-line bg-panel-2 px-3 py-2 text-xs font-semibold tracking-widest text-text-dim uppercase">
              {t('market.orders.exitsTitle')}
            </h3>
            <div className="space-y-1.5 px-3 py-2 text-xs">
              {exits.length === 0 ? (
                <p className="text-text-dim">{t('market.orders.exitsNoFloor')}</p>
              ) : (
                exits.map((exit) => (
                  <p key={exit.kind} className="flex items-baseline justify-between gap-3">
                    <span className="text-text-dim">
                      {exit.kind === 'hold' && sell.kind === 'known'
                        ? t('market.orders.exitHoldSellsIn', {
                            price: formatIsk(exit.price, 2),
                            days: sell.daysToClear,
                          })
                        : t(
                            `market.orders.exit${exit.kind[0].toUpperCase()}${exit.kind.slice(1)}`,
                            {
                              price: formatIsk(exit.price, 2),
                            }
                          )}
                    </span>
                    <span
                      className={cx(
                        'shrink-0 tabular-nums',
                        exit.netPerUnit >= 0 ? 'text-success' : 'text-danger'
                      )}
                    >
                      {t('market.orders.exitPerUnit', {
                        amount: `${exit.netPerUnit >= 0 ? '+' : ''}${formatIsk(exit.netPerUnit, 2)}`,
                      })}
                    </span>
                  </p>
                ))
              )}
              {/*
                Hauling is a gap and a distance, never a net: what a hub pays
                is knowable, what a courier charges is not. The rows survive a
                missing Order Floor for the same reason — "Amarr bids more
                than anyone here" needs no cost basis behind it.
              */}
              {!row.isBuyOrder && (
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
                              price: formatIsk(gap.price, 2),
                            })}{' '}
                            <JumpsAwayText result={gap.jumps} t={t} />
                          </span>
                          <span className="shrink-0 tabular-nums text-success">
                            {t('market.orders.exitHaulGap', {
                              amount: formatIsk(gap.overLocal, 2),
                              total: formatIsk(gap.totalIsk, 2),
                            })}
                          </span>
                        </p>
                      ))}
                      <p className="mt-1 text-text-dim">{t('market.orders.exitHaulNote')}</p>
                    </>
                  )}
                </div>
              )}
              {!reprocessing && (
                <p className="flex items-baseline justify-between gap-3 text-text-faint">
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
              <p className="text-text-faint">{t('market.orders.orderSoFarNotBuilt')}</p>
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

type StatCardTone = 'default' | 'success' | 'warning' | 'danger';

const STAT_TONE: Record<StatCardTone, string> = {
  default: 'text-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const VERDICT_TONE: Record<OrderVerdictKind, string> = {
  letGo: 'text-danger',
  matchThem: 'text-success',
  raisePrice: 'text-danger',
  leaveItAlone: 'text-success',
};

/**
 * One captioned figure in the modal's stat grid.
 *
 * Not `StatChip`: that component is a fixed-height single-line pill whose
 * own docblock rules out a second line of text, and every figure here needs
 * the caption underneath it — "rank 4 of 22 at this station" is what turns
 * a price into something the reader can judge.
 */
function StatCard({
  label,
  value,
  caption,
  tooltip,
  tone = 'default',
  children,
}: {
  label: string;
  value: ReactNode;
  caption?: string | null;
  tooltip?: string;
  tone?: StatCardTone;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xs border border-line bg-panel-2 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
        {tooltip && <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />}
      </p>
      <p className={cx('mt-0.5 text-sm font-semibold tabular-nums', STAT_TONE[tone])}>{value}</p>
      {caption && <p className="mt-0.5 text-[0.6875rem] text-text-dim">{caption}</p>}
      {children}
    </div>
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

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-dim uppercase tracking-widest font-semibold">{label}</dt>
      <dd className="text-right tabular-nums text-text">{value}</dd>
    </>
  );
}
