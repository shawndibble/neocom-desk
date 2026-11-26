import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
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
  return [station, system, region].some((s) => s.kind === 'notChecked' || s.kind === 'unavailable')
    ? 'notChecked'
    : 'clear';
}

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

export function structureStationScopeState(
  row: OpenOrderRow,
  structureMarket: StructureCompetition | null
): ScopeState {
  const byScope = row.deepUndercut?.byScope ?? {};
  if (!('station' in byScope)) return { kind: 'unavailable' };
  const rival = byScope.station;
  if (rival) return { kind: 'rival', rival };
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
  if (deep.truncated) return { kind: 'notChecked' };
  return { kind: 'clear' };
}

export type Translate = ReturnType<typeof useTranslation>['t'];

export function scopeLabelText(scope: UndercutScope, t: Translate): string {
  return t(`market.orders.badge.undercut${scope[0].toUpperCase()}${scope.slice(1)}`);
}

export function jumpsText(jumps: JumpsAwayResult, t: Translate): string {
  return jumps.kind === 'known'
    ? t('assets.jumpsAway.value', { count: jumps.jumps })
    : t('assets.jumpsAway.unknown');
}

export function scopeCsvRow(
  scope: UndercutScope,
  state: ScopeState,
  t: Translate,
  where: { stationName?: string | null; distance?: string; jumps?: JumpsAwayResult }
): ScopeOrderCsvRow {
  const base = {
    scope: scopeLabelText(scope, t),
    price: null,
    gapIsk: null,
    gapPct: null,
    ordersBeatingMe: null,
    unitsBeatingMe: null,
  };
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
  const countsKnown = rival.ordersBeatingMe > 0;
  return {
    ...base,
    ordersBeatingMe: countsKnown ? rival.ordersBeatingMe : null,
    unitsBeatingMe: countsKnown ? rival.unitsBeatingMe : null,
    seller: where.stationName ?? t('market.unknownStructure'),
    price: rival.price,
    gapIsk: rival.gapIsk,
    gapPct: rival.gapPct,
    distance: where.jumps ? jumpsText(where.jumps, t) : (where.distance ?? null),
  };
}

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
  return { rank: better + 1, total: atMyStation.length };
}

export const CELL = 'border-t border-line px-2 py-1.5';

export const COLUMN_HEADER = `px-2 pt-2 ${eyebrowClassName}`;
