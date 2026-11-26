import { describe, it, expect } from 'vitest';
import { cappedRows } from './colonyPlan';

describe('cappedRows', () => {
  it('leads with removals when there is nothing to gain', () => {
    expect(cappedRows(['r1', 'r2', 'r3'], [], 2)).toEqual(['r1', 'r2']);
  });

  it('shows gains in order when nothing is idle', () => {
    expect(cappedRows([], ['g1', 'g2', 'g3'], 2)).toEqual(['g1', 'g2']);
  });

  it('never spends every slot on removals while a gain is waiting', () => {
    expect(cappedRows(['r1', 'r2'], ['g1'], 2)).toEqual(['r1', 'g1']);
  });

  it('keeps the best-paying gain, not the last one', () => {
    expect(cappedRows(['r1'], ['g1', 'g2'], 2)).toEqual(['r1', 'g1']);
  });

  it('still shows a removal first at a limit of one', () => {
    expect(cappedRows(['r1'], ['g1'], 1)).toEqual(['r1']);
  });
});
