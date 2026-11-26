import { getMarketsPrices } from '@/esi/endpoints';

export interface AdjustedPrice {
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
