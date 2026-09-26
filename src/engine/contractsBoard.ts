/**
 * What the Overview's Contracts row and card answer: which contracts are on a clock.
 *
 * Two kinds qualify. An accepted courier is always on one — delivery is owed by
 * `courierDeliveryDeadlineMs`, and missing it forfeits the collateral. The
 * pilot's own outstanding listing is only on one in its last day: a trader with
 * a dozen listings weeks from expiry must not have them take over the "Next
 * deadline" strip, so anything further out is not counted at all.
 */
import type { Contract } from '@/esi/endpoints';
import { courierDeliveryDeadlineMs } from '@/engine/courierDeadline';
import { parseInstant } from '@/engine/esiInstant';

export const LISTING_WINDOW_MS = 24 * 3_600_000;

export interface ContractDeadlineItem {
  contractId: number;
  kind: 'courier' | 'listing';
  atMs: number;
  overdue: boolean;
  startLocationId?: number;
  endLocationId?: number;
}

export interface ContractsBoardSummary {
  /** Accepted couriers, whatever their deliver-by. */
  inProgress: number;
  /** Couriers and own listings due within the window (overdue couriers included). */
  dueSoon: number;
  /** Accepted couriers already past their deliver-by. */
  overdue: number;
  soonest: ContractDeadlineItem | null;
}

export function summarizeContractsBoard(
  contracts: readonly Contract[],
  characterId: number,
  nowMs: number
): ContractsBoardSummary {
  let inProgress = 0;
  let dueSoon = 0;
  let overdue = 0;
  let soonest: ContractDeadlineItem | null = null;
  const consider = (item: ContractDeadlineItem) => {
    if (soonest === null || item.atMs < soonest.atMs) soonest = item;
  };

  for (const c of contracts) {
    if (c.type === 'courier' && c.status === 'in_progress') {
      // Keep the offer expiry rather than guess, as the other courier surfaces do.
      const atMs = courierDeliveryDeadlineMs(c) ?? parseInstant(c.date_expired);
      inProgress += 1;
      if (atMs === null) continue;
      const isOverdue = atMs <= nowMs;
      if (isOverdue) overdue += 1;
      if (atMs <= nowMs + LISTING_WINDOW_MS) dueSoon += 1;
      consider({
        contractId: c.contract_id,
        kind: 'courier',
        atMs,
        overdue: isOverdue,
        startLocationId: c.start_location_id,
        endLocationId: c.end_location_id,
      });
    } else if (c.status === 'outstanding' && c.issuer_id === characterId && !c.for_corporation) {
      const atMs = parseInstant(c.date_expired);
      // An expired listing is stale, not a deadline.
      if (atMs === null || atMs < nowMs || atMs > nowMs + LISTING_WINDOW_MS) continue;
      dueSoon += 1;
      consider({ contractId: c.contract_id, kind: 'listing', atMs, overdue: false });
    }
  }
  return { inProgress, dueSoon, overdue, soonest };
}
