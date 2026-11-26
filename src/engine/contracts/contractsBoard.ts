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
  title: string | null;
  reward: number | null;
  collateral: number | null;
  price: number | null;
}

export interface ContractTableRow extends ContractDeadlineItem {
  state: 'in_progress' | 'outstanding';
}

export interface ContractsBoardSummary {
  inProgress: number;
  exchanges: number;
  outstanding: number;
  dueSoon: number;
  overdue: number;
  soonest: ContractDeadlineItem | null;
  items: ContractDeadlineItem[];
  rows: ContractTableRow[];
}

const isOwnOffer = (c: Contract, owns: (id: number) => boolean) =>
  (owns(c.issuer_id) && !c.for_corporation) || owns(c.assignee_id);

export function summarizeContractsBoard(
  contracts: readonly Contract[],
  pilot: number | ReadonlySet<number>,
  nowMs: number
): ContractsBoardSummary {
  const owns =
    typeof pilot === 'number' ? (id: number) => id === pilot : (id: number) => pilot.has(id);
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
    if (c.status === 'outstanding' && isOwnOffer(c, owns)) {
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
    if (c.type === 'item_exchange' && c.status === 'outstanding' && isOwnOffer(c, owns)) {
      exchanges += 1;
    }
    if (c.type === 'courier' && c.status === 'in_progress' && owns(c.acceptor_id)) {
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
    } else if (c.status === 'outstanding' && owns(c.issuer_id) && !c.for_corporation) {
      const atMs = parseInstant(c.date_expired);
      if (atMs === null || atMs < nowMs || atMs > nowMs + LISTING_WINDOW_MS) continue;
      dueSoon += 1;
      consider({ contractId: c.contract_id, kind: 'listing', atMs, overdue: false, ...facts(c) });
    }
  }
  items.sort((a, b) => a.atMs - b.atMs);
  rows.sort(
    (a, b) =>
      Number(a.state === 'outstanding') - Number(b.state === 'outstanding') || a.atMs - b.atMs
  );
  return { inProgress, exchanges, outstanding, dueSoon, overdue, soonest, items, rows };
}
