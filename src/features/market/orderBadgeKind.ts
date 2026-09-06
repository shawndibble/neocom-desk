/**
 * The one badge choice for an Open Orders row (CONTEXT.md's redesigned
 * Market > Open Orders tab) — pulled out of `OpenOrdersPanel` (the row's own
 * badge column) and `OrderDetailModal` (its "quick answer" header), which
 * used to each carry their own copy of this switch. Two copies "must agree"
 * is exactly the duplication this repo's architecture rules forbid; this is
 * the one place the mapping is written, so the row and the modal it opens
 * can never disagree about what an order's badge says.
 *
 * Pure: reads only fields already computed onto `OpenOrderRow` by
 * `openOrdersModel.ts` (`problem`, `floor`, `station`, `deepUndercut`,
 * `expiry`, `worstScope`, `costBasis`). Formatting an ISK/percentage value
 * for i18n stays with the caller — this only decides *which* badge and what
 * short, already-formatted detail string (if any) goes beside it.
 *
 * `'stale'` and `'offHub'` are real `OrderBadgeKind`s (shown in
 * `OrderBadgeLegend`) but no `OrderProblem` ever maps to either one here —
 * neither `orderProblems.ts` nor this function can produce them today, so
 * their absence below is not missing coverage.
 */
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderBadgeKind } from './OrderProblemBadge';

export interface OrderBadgeChoice {
  kind: OrderBadgeKind;
  detail?: string;
}

/** The one badge a row wears, and the short detail beside it. Null renders no badge — never a false "best"/"noCostBasis" claim the data can't back up. */
export function orderBadgeFor(row: OpenOrderRow): OrderBadgeChoice | null {
  switch (row.problem) {
    case 'belowFloor': {
      if (!row.floor) return null;
      const pct = ((row.floor.relist - row.price) / row.floor.relist) * 100;
      return { kind: 'belowFloor', detail: `-${pct.toFixed(1)}%` };
    }
    case 'undercutStation':
      return { kind: 'undercutStation', detail: `-${row.station.gapPct.toFixed(1)}%` };
    case 'undercutSystem':
    case 'undercutRegion': {
      const pct = row.deepUndercut?.worst?.gapPct;
      return { kind: row.problem, detail: pct !== undefined ? `-${pct.toFixed(1)}%` : undefined };
    }
    case 'expiringOrStale': {
      const days = row.expiry?.daysLeft;
      return {
        kind: 'expiring',
        detail: days !== null && days !== undefined ? `${days}d` : undefined,
      };
    }
    case 'outbid': {
      const pct =
        row.worstScope === 'station' ? row.station.gapPct : row.deepUndercut?.worst?.gapPct;
      return { kind: 'outbid', detail: pct !== undefined ? `+${pct.toFixed(1)}%` : undefined };
    }
    case 'healthy':
    default:
      if (!row.isBuyOrder && row.costBasis === null) return { kind: 'noCostBasis' };
      if (row.station.bestPrice !== null) return { kind: 'best' };
      return null;
  }
}
