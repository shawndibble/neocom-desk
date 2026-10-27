/**
 * Test-only builder for a day of market history.
 *
 * `MarketHistoryPoint` carries every field ESI sends, and most tests care
 * about one or two of them. Spelling all five out at each call site buried
 * the field under test in noise, and four test files had already grown their
 * own inline literals of the three fields the type used to have.
 */
import type { MarketHistoryPoint } from '../priceHistory';

/**
 * Defaults `highest`/`lowest` to the day's own `average`, so a point built
 * without them is still internally consistent — a fixture whose low sat above
 * its average would make any assertion about the high/low band meaningless.
 */
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
