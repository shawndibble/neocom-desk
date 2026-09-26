import { describe, expect, it } from 'vitest';
import { toChartPoints } from './walletBalanceChartPoints';

describe('toChartPoints', () => {
  it('places points by timestamp: an hour apart sits closer than a week apart', () => {
    const [a, b, c] = toChartPoints(
      [
        { date: '2026-09-01T00:00:00Z', balance: 1 },
        { date: '2026-09-01T01:00:00Z', balance: 2 },
        { date: '2026-09-08T01:00:00Z', balance: 3 },
      ],
      'UTC'
    );
    expect(b!.x - a!.x).toBeLessThan(c!.x - b!.x);
    expect(a!.x).toBe(Date.parse('2026-09-01T00:00:00Z'));
  });
});
