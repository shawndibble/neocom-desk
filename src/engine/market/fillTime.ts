import { MINUTE_MS } from '@/lib/age';

export interface FillMatch {
  typeId: number;
  locationId: number;
  price: number;
  issuedMs: number;
  quantity: number;
}

export interface FillTransaction {
  dateMs: number;
  typeId: number;
  locationId: number;
  unitPrice: number;
  quantity: number;
  isBuy: boolean;
}

export type FillTimeResolution =
  { status: 'settled'; fillMs: number } | { status: 'unmatched' } | { status: 'pending' };

export const WALLET_TRANSACTIONS_LAG_MS = 65 * MINUTE_MS;

const CLOCK_SKEW_MS = 5 * MINUTE_MS;

function sameCents(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function resolveFillTime(
  match: FillMatch,
  transactions: readonly FillTransaction[],
  observedAtMs: number,
  fetchedAtMs: number
): FillTimeResolution {
  let newestMs = -Infinity;
  let sold = 0;
  for (const row of transactions) {
    if (row.isBuy) continue;
    if (row.typeId !== match.typeId || row.locationId !== match.locationId) continue;
    if (!sameCents(row.unitPrice, match.price)) continue;
    if (row.dateMs < match.issuedMs) continue;
    if (row.dateMs > observedAtMs + CLOCK_SKEW_MS) continue;
    sold += row.quantity;
    newestMs = Math.max(newestMs, row.dateMs);
  }

  const found = sold > 0;
  const settled = (): FillTimeResolution => ({
    status: 'settled',
    fillMs: Math.min(newestMs, observedAtMs),
  });
  if (found && sold >= match.quantity) return settled();
  if (fetchedAtMs - WALLET_TRANSACTIONS_LAG_MS < observedAtMs) return { status: 'pending' };
  return found ? settled() : { status: 'unmatched' };
}
