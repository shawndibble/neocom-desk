import type { MarketHistoryPoint } from '../priceHistory';

export function historyPoint(
  fields: Partial<MarketHistoryPoint> & { date: string }
): MarketHistoryPoint {
  const average = fields.average ?? 1;
  return {
    average,
    lowest: average,
    highest: average,
    volume: 1,
    orderCount: 1,
    ...fields,
  };
}
