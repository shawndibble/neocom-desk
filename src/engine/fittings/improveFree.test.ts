import { describe, expect, it } from 'vitest';
import { baseFittingStats } from './__fixtures__/fittingStats';
import { IMPLANT_GOAL, overBudgetResources, TRAIN_SORT } from './improveFree';

describe('overBudgetResources', () => {
  it('is empty for a fit within budget', () => {
    expect(overBudgetResources(baseFittingStats())).toEqual([]);
  });

  it('lists every budget the fit is over, CPU first', () => {
    const stats = {
      ...baseFittingStats(),
      cpuUsed: 120,
      cpuTotal: 100,
      calibrationUsed: 400,
      calibrationTotal: 350,
    };
    expect(overBudgetResources(stats)).toEqual(['cpu', 'calibration']);
  });
});

describe('goal maps', () => {
  it('gives Cheaper no training and no implants', () => {
    expect(TRAIN_SORT.cheaper).toBeUndefined();
    expect(IMPLANT_GOAL.cheaper).toBeUndefined();
  });
  it('points a goal at its own stat', () => {
    expect(TRAIN_SORT.damage).toBe('dps');
    expect(IMPLANT_GOAL.tank).toBe('ehp');
  });
});
