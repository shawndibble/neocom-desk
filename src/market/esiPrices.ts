/**
 * ESI global market prices — fallback price source (ADR 0002), and the
 * source of adjusted_price used for job-cost EIV (estimated item value).
 * Routed through the getMarketsPrices wrapper (src/esi/endpoints.ts) rather
 * than esiFetch directly, so the registry stays the one place every ESI call
 * is accounted for.
 */
import { getMarketsPrices } from '@/esi/endpoints';

export interface AdjustedPrice {
  /** Estimated item value used as the base for manufacturing job cost. */
  adjusted: number | null;
  average: number | null;
}

export async function fetchAdjustedPrices(): Promise<Map<number, AdjustedPrice>> {
  const result = await getMarketsPrices();
  const prices = new Map<number, AdjustedPrice>();
  for (const entry of result.data ?? []) {
    prices.set(entry.type_id, {
      adjusted: entry.adjusted_price ?? null,
      average: entry.average_price ?? null,
    });
  }
  return prices;
}
