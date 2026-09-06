/**
 * The one plain-English fact a row states beside its badge (CONTEXT.md's
 * redesigned Market > Open Orders tab). The badge says WHICH problem; this
 * says WHAT is actually happening — the rival's own price, how far under
 * you they are, and (only when a cost basis exists) whether following them
 * would still pay.
 *
 * Pure and view-free, the same way `orderBadgeKind.ts` is: it returns
 * FACTS, never a formatted sentence. ISK and percentage formatting is
 * locale work that belongs to the caller, and an i18n string assembled by
 * concatenating fragments here could never be translated.
 *
 * The tier asymmetry is load-bearing. The always-on station tier reads a
 * Fuzzwork aggregate, which carries a best price but NO order count — so
 * `sellersUnderMe` is null there and the row must not claim "3 sellers
 * under you". That count only exists once the deep region-book check has
 * run, which is why the deep rival for a scope is preferred over the
 * station tier whenever both are in hand.
 */
import type { UndercutScope } from '@/engine/market/undercut';
import type { OpenOrderRow } from './openOrdersModel';

/** What matching the rival's price would do to a unit, once the fees are paid. Only ever known when the order has a cost basis. */
export interface MatchOutcome {
  kind: 'profit' | 'loss';
  /** Always positive — `kind` carries the sign. */
  amount: number;
}

export type OrderRowSummary =
  | {
      kind: 'undercut';
      scope: UndercutScope;
      rivalPrice: number;
      gapIsk: number;
      /** How many rivals beat me in this scope, or null when only the aggregate tier has been read. */
      sellersUnderMe: number | null;
      match: MatchOutcome | null;
    }
  | { kind: 'belowFloor'; lossPerUnit: number }
  | { kind: 'expiring'; daysLeft: number | null; volumeRemain: number }
  | { kind: 'outbid'; rivalPrice: number; gapIsk: number; sellersUnderMe: number | null }
  | { kind: 'noCostBasis' }
  | { kind: 'best' };

function matchOutcome(row: OpenOrderRow, rivalPrice: number): MatchOutcome | null {
  if (row.isBuyOrder || !row.floor) return null;
  const margin = rivalPrice - row.floor.relist;
  return margin >= 0 ? { kind: 'profit', amount: margin } : { kind: 'loss', amount: -margin };
}

/** The rival to quote for `scope`: the deep book's when it has been read, else the cheap station aggregate. */
function rivalFor(
  row: OpenOrderRow,
  scope: UndercutScope
): { price: number; gapIsk: number; sellersUnderMe: number | null } | null {
  const deep = row.deepUndercut?.byScope[scope];
  if (deep) {
    return { price: deep.price, gapIsk: deep.gapIsk, sellersUnderMe: deep.ordersBeatingMe };
  }
  if (scope !== 'station' || !row.station.beatsMe || row.station.bestPrice === null) return null;
  return { price: row.station.bestPrice, gapIsk: row.station.gapIsk, sellersUnderMe: null };
}

/**
 * The row's one sentence-worth of facts, or null when there is nothing
 * honest to say — a badge with no backing numbers renders alone rather
 * than beside an invented claim.
 */
export function orderRowSummary(row: OpenOrderRow): OrderRowSummary | null {
  switch (row.problem) {
    case 'belowFloor':
      if (!row.floor) return null;
      return { kind: 'belowFloor', lossPerUnit: row.floor.relist - row.price };
    case 'undercutStation':
    case 'undercutSystem':
    case 'undercutRegion': {
      const scope: UndercutScope =
        row.problem === 'undercutStation'
          ? 'station'
          : row.problem === 'undercutSystem'
            ? 'system'
            : 'region';
      const rival = rivalFor(row, scope);
      if (!rival) return null;
      return {
        kind: 'undercut',
        scope,
        rivalPrice: rival.price,
        gapIsk: rival.gapIsk,
        sellersUnderMe: rival.sellersUnderMe,
        match: matchOutcome(row, rival.price),
      };
    }
    case 'expiringOrStale':
      return {
        kind: 'expiring',
        daysLeft: row.expiry?.daysLeft ?? null,
        volumeRemain: row.volumeRemain,
      };
    case 'outbid': {
      const scope = row.worstScope;
      const rival = scope ? rivalFor(row, scope) : null;
      if (!rival) return null;
      return {
        kind: 'outbid',
        rivalPrice: rival.price,
        gapIsk: rival.gapIsk,
        sellersUnderMe: rival.sellersUnderMe,
      };
    }
    case 'healthy':
    default:
      if (!row.isBuyOrder && row.costBasis === null) return { kind: 'noCostBasis' };
      if (row.station.bestPrice !== null) return { kind: 'best' };
      return null;
  }
}
