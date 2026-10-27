import { describe, it, expect } from 'vitest';
import { sizeRuns } from './runSizing';

describe('sizeRuns', () => {
  it('sizes exactly when the need divides evenly', () => {
    expect(sizeRuns(30, 3)).toEqual({ runs: 10, unitsMade: 30, spare: 0 });
  });

  it('rounds up to the next whole run when it does not divide evenly', () => {
    expect(sizeRuns(10, 3)).toEqual({ runs: 4, unitsMade: 12, spare: 2 });
  });

  it("clamps to at least one run when the need is smaller than one run's output", () => {
    expect(sizeRuns(1, 3)).toEqual({ runs: 1, unitsMade: 3, spare: 2 });
  });

  it('clamps to at least one run when there is nothing left to cover', () => {
    expect(sizeRuns(0, 3)).toEqual({ runs: 1, unitsMade: 3, spare: 3 });
  });

  it('returns null when the recipe yields nothing per run', () => {
    expect(sizeRuns(10, 0)).toBeNull();
  });

  it('returns null for a negative output per run', () => {
    expect(sizeRuns(10, -1)).toBeNull();
  });
});
