/**
 * The pure reads behind the Order Detail modal's scope table and sections:
 * what each scope (station / system / region) says about my order, the
 * sell-through estimate, my rank at my own station, and the scope table's CSV
 * rows. No JSX — `OrderDetailModal.tsx` renders them.
 */
import type { useTranslation } from 'react-i18next';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { UndercutRival, UndercutScope } from '@/engine/market/undercut';
import { sellThrough, type SellThrough } from '@/engine/market/orderHealth';
import { filterPriceHistoryRange } from '@/engine/market/priceHistory';
import type { OpenOrderRow } from './openOrdersModel';
import type { RegionCompetition, StructureCompetition } from './orderCompetition';
import type { PriceHistoryResult } from './priceHistory';
import type { ScopeOrderCsvRow } from './scopeOrdersCsv';

export type ScopeState =
  | { kind: 'unavailable' }
  | { kind: 'notChecked' }
  | { kind: 'clear' }
  | { kind: 'rival'; rival: UndercutRival };

/** The tightest scope carrying a rival, for the "Who is cheaper" disclosure's trailing read — or `'clear'`/`'notChecked'` when none of the three do. */
export function tightestRivalScope(
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

/**
 * `'known'` — the NPC-station lookup loaded and resolved this location.
 * `'structure'` — it loaded but this location isn't in it (a player
 * structure). `'unknown'` — the lookup itself hasn't loaded, so nothing
 * about this location can be claimed either way.
 */
export type LocationState = 'known' | 'structure' | 'unknown';

export function stationScopeState(
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
export function structureStationScopeState(
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

export function deepScopeState(
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

export type Translate = ReturnType<typeof useTranslation>['t'];

export function scopeLabelText(scope: UndercutScope, t: Translate): string {
  return t(`market.orders.badge.undercut${scope[0].toUpperCase()}${scope.slice(1)}`);
}

/** Distance as words, the way `JumpsAwayText` renders it. */
export function jumpsText(jumps: JumpsAwayResult, t: Translate): string {
  return jumps.kind === 'known'
    ? t('assets.jumpsAway.value', { count: jumps.jumps })
    : t('assets.jumpsAway.unknown');
}

/** One scope line of the grid as exported (`scopeOrdersCsv.ts`), mirroring `ScopeRow`. */
export function scopeCsvRow(
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
export function computeSellThrough(
  row: OpenOrderRow,
  deep: RegionCompetition | null,
  history: PriceHistoryResult | null,
  now: Date
): SellThrough {
  if (!history || history.points.length === 0) return { kind: 'unknown', reason: 'noHistory' };

  const recentDays = 30;
  const recent = filterPriceHistoryRange(history.points, '30d', now);
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

/**
 * Where my price sits among the sell orders at my own station.
 *
 * Only from a COMPLETE region book: a truncated fetch under-counts the
 * orders at my station, so both the rank and the total would be a lower
 * bound dressed up as a fact. The station tier cannot answer this at all —
 * an aggregate carries a price and no order count.
 */
export function stationRank(
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
export const CELL = 'border-t border-line px-2 py-1.5';

/** A scope table column header. */
export const COLUMN_HEADER =
  'px-2 pt-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';
