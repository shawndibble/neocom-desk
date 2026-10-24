import { describe, expect, it } from 'vitest';
import { planTrendSeries, TREND_MAX_SERIES } from './trendSeries';

const none = () => false;

describe('planTrendSeries', () => {
  it('crosses items with hubs, item by item', () => {
    const plan = planTrendSeries([34, 35], ['jita', 'amarr'], none);
    expect(plan.refs.map((r) => r.key)).toEqual(['34@jita', '34@amarr', '35@jita', '35@amarr']);
    expect(plan.omitted).toBe(0);
  });

  it('draws a global-market item once, whatever the hubs', () => {
    const plan = planTrendSeries([44992], ['jita', 'amarr', 'rens'], (id) => id === 44992);
    expect(plan.refs).toEqual([{ typeId: 44992, hubId: null, key: '44992@global' }]);
  });

  it('caps the lines and counts what it left out', () => {
    const plan = planTrendSeries([1, 2, 3, 4], ['jita', 'amarr'], none);
    expect(plan.refs).toHaveLength(TREND_MAX_SERIES);
    expect(plan.omitted).toBe(2);
  });

  it('drops a repeated item or hub', () => {
    const plan = planTrendSeries([34, 34], ['jita', 'jita'], none);
    expect(plan.refs.map((r) => r.key)).toEqual(['34@jita']);
  });

  it('plans nothing without items or hubs', () => {
    expect(planTrendSeries([], ['jita'], none).refs).toEqual([]);
    expect(planTrendSeries([34], [], none).refs).toEqual([]);
  });
});
