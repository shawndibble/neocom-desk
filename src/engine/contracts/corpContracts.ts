import type { Contract } from '@/esi/endpoints';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { LISTING_WINDOW_MS } from '@/engine/contracts/contractsBoard';
import { parseInstant } from '@/engine/esiInstant';

export interface CorpContractRow {
  contractId: number;
  type: 'courier' | 'item_exchange';
  state: 'outstanding' | 'in_progress';
  issuerId: number;
  assigneeId: number;
  title: string | null;
  collateral: number | null;
  reward: number | null;
  price: number | null;
  startLocationId?: number;
  endLocationId?: number;
  atMs: number;
  overdue: boolean;
  expiringSoon: boolean;
}

export interface CorpContractsSummary {
  outstanding: number;
  expiringSoon: number;
  overdue: number;
  collateral: number;
  rows: CorpContractRow[];
}

export function summarizeCorpContracts(
  contracts: readonly Contract[],
  nowMs: number
): CorpContractsSummary {
  const rows: CorpContractRow[] = [];
  let collateral = 0;
  for (const c of contracts) {
    if (c.type !== 'courier' && c.type !== 'item_exchange') continue;
    if (c.status !== 'outstanding' && c.status !== 'in_progress') continue;
    const expiresMs = parseInstant(c.date_expired);
    const atMs = courierDeliveryDeadlineMs(c) ?? expiresMs;
    if (atMs === null) continue;
    const overdue = c.status === 'in_progress' && atMs <= nowMs;
    if (c.status === 'outstanding' && atMs <= nowMs) continue;
    if (c.type === 'courier') collateral += c.collateral ?? 0;
    rows.push({
      contractId: c.contract_id,
      type: c.type,
      state: c.status,
      issuerId: c.issuer_id,
      assigneeId: c.assignee_id,
      title: c.title?.trim() || null,
      collateral: c.collateral ?? null,
      reward: c.reward ?? null,
      price: c.price ?? null,
      startLocationId: c.start_location_id,
      endLocationId: c.end_location_id,
      atMs,
      overdue,
      expiringSoon: atMs <= nowMs + LISTING_WINDOW_MS,
    });
  }
  rows.sort((a, b) => a.atMs - b.atMs);
  return {
    outstanding: rows.length,
    expiringSoon: rows.filter((r) => r.expiringSoon).length,
    overdue: rows.filter((r) => r.overdue).length,
    collateral,
    rows,
  };
}
