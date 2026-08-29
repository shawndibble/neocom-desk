/**
 * ESI global market prices — fallback price source (ADR 0002), and the
 * source of adjusted_price used for job-cost EIV (estimated item value).
 * GET /markets/prices via esiFetch, which already pins X-Compatibility-Date
 * and X-User-Agent (src/esi/client.ts).
 */
import { esiFetch } from '@/esi/client';

export interface AdjustedPrice {
  /** Estimated item value used as the base for manufacturing job cost. */
  adjusted: number | null;
  average: number | null;
}

interface RawMarketPrice {
  type_id: number;
  adjusted_price?: number;
  average_price?: number;
}

export async function fetchAdjustedPrices(): Promise<Map<number, AdjustedPrice>> {
  const result = await esiFetch<RawMarketPrice[]>('/markets/prices');
  const prices = new Map<number, AdjustedPrice>();
  for (const entry of result.data ?? []) {
    prices.set(entry.type_id, {
      adjusted: entry.adjusted_price ?? null,
      average: entry.average_price ?? null,
    });
  }
  return prices;
}
