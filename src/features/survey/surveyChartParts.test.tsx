import { describe, expect, it } from 'vitest';
import type { SurveySummary } from '@/engine/survey/series';
import { timeAxis } from './surveyChartParts';

const summary = (over: Partial<SurveySummary>) =>
  ({ firstAt: 1_000_000, lastAt: 2_000_000, etaAt: null, ...over }) as SurveySummary;

describe('timeAxis', () => {
  it('ends within 1% of the projected finish, leaving no empty gap right of it', () => {
    const { domain } = timeAxis(summary({ etaAt: 3_000_000 }));
    expect(domain[0]).toBe(1_000_000);
    expect(domain[1]).toBeGreaterThanOrEqual(3_000_000);
    expect(domain[1] - 3_000_000).toBeLessThanOrEqual((3_000_000 - 1_000_000) * 0.01 + 1);
  });

  it('falls back to the last scan when there is no finish estimate', () => {
    const { domain } = timeAxis(summary({}));
    expect(domain[1]).toBeGreaterThanOrEqual(2_000_000);
    expect(domain[1] - 2_000_000).toBeLessThanOrEqual(10_001);
  });
});
