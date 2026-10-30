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
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { parseInstant } from '@/engine/esiInstant';
import { HOUR_MS } from '@/lib/age';

export const LISTING_WINDOW_MS = 24 * HOUR_MS;

export interface ContractDeadlineItem {
  contractId: number;
  kind: 'courier' | 'listing';
  atMs: number;
  overdue: boolean;
  startLocationId?: number;
  endLocationId?: number;
  /** The pilot's own title for it, when it has one. */
  title: string | null;
  /** ISK the courier pays, or the listing's asking price. */
  reward: number | null;
  collateral: number | null;
  price: number | null;
}

/** A contract the Table view lists: a haul being carried, or an outstanding offer the pilot made or was sent. */
export interface ContractTableRow extends ContractDeadlineItem {
  state: 'in_progress' | 'outstanding';
}

export interface ContractsBoardSummary {
  /** Accepted couriers, whatever their deliver-by. */
  inProgress: number;
  /** Item exchanges nobody has accepted yet, issued by the pilot or sent to them, whatever their expiry. */
  exchanges: number;
  /** Outstanding contracts of any type the pilot issued or was sent, not yet expired. */
  outstanding: number;
  /** Couriers and own listings due within the window (overdue couriers included). */
  dueSoon: number;
  /** Accepted couriers already past their deliver-by. */
  overdue: number;
  soonest: ContractDeadlineItem | null;
  /** Every contract counted above that has a clock, soonest first. */
  items: ContractDeadlineItem[];
  /** Everything the Table view lists: hauls in progress, then outstanding contracts, soonest first. */
  rows: ContractTableRow[];
}

/** An offer the pilot made themselves, or one sent to them (never a corporation's). */
const isOwnOffer = (c: Contract, characterId: number) =>
  (c.issuer_id === characterId && !c.for_corporation) || c.assignee_id === characterId;

export function summarizeContractsBoard(
  contracts: readonly Contract[],
  characterId: number,
  nowMs: number
): ContractsBoardSummary {
  let inProgress = 0;
  let exchanges = 0;
  let outstanding = 0;
  let dueSoon = 0;
  let overdue = 0;
  let soonest: ContractDeadlineItem | null = null;
  const items: ContractDeadlineItem[] = [];
  const rows: ContractTableRow[] = [];
  const consider = (item: ContractDeadlineItem) => {
    items.push(item);
    if (soonest === null || item.atMs < soonest.atMs) soonest = item;
  };
  const facts = (c: Contract) => ({
    title: c.title?.trim() || null,
    reward: c.reward ?? null,
    collateral: c.collateral ?? null,
    price: c.price ?? null,
  });

  for (const c of contracts) {
    if (c.status === 'outstanding' && isOwnOffer(c, characterId)) {
      const expiresMs = parseInstant(c.date_expired);
      if (expiresMs !== null && expiresMs > nowMs) {
        outstanding += 1;
        rows.push({
          contractId: c.contract_id,
          kind: c.type === 'courier' ? 'courier' : 'listing',
          state: 'outstanding',
          atMs: expiresMs,
          overdue: false,
          startLocationId: c.start_location_id,
          endLocationId: c.end_location_id,
          ...facts(c),
        });
      }
    }
    if (c.type === 'item_exchange' && c.status === 'outstanding' && isOwnOffer(c, characterId)) {
      exchanges += 1;
    }
    // Only hauls this pilot is carrying: the feed also lists couriers they issued for someone else to deliver.
    if (c.type === 'courier' && c.status === 'in_progress' && c.acceptor_id === characterId) {
      // Keep the offer expiry rather than guess, as the other courier surfaces do.
      const atMs = courierDeliveryDeadlineMs(c) ?? parseInstant(c.date_expired);
      inProgress += 1;
      if (atMs === null) continue;
      const isOverdue = atMs <= nowMs;
      if (isOverdue) overdue += 1;
      if (atMs <= nowMs + LISTING_WINDOW_MS) dueSoon += 1;
      const haul: ContractDeadlineItem = {
        contractId: c.contract_id,
        kind: 'courier',
        atMs,
        overdue: isOverdue,
        startLocationId: c.start_location_id,
        endLocationId: c.end_location_id,
        ...facts(c),
      };
      consider(haul);
      rows.push({ ...haul, state: 'in_progress' });
    } else if (c.status === 'outstanding' && c.issuer_id === characterId && !c.for_corporation) {
      const atMs = parseInstant(c.date_expired);
      // An expired listing is stale, not a deadline.
      if (atMs === null || atMs < nowMs || atMs > nowMs + LISTING_WINDOW_MS) continue;
      dueSoon += 1;
      consider({ contractId: c.contract_id, kind: 'listing', atMs, overdue: false, ...facts(c) });
    }
  }
  items.sort((a, b) => a.atMs - b.atMs);
  // Hauls first: they are the ones owed, and an overdue one must not sink below offers.
  rows.sort(
    (a, b) =>
      Number(a.state === 'outstanding') - Number(b.state === 'outstanding') || a.atMs - b.atMs
  );
  return { inProgress, exchanges, outstanding, dueSoon, overdue, soonest, items, rows };
}
