import { describe, it, expect } from 'vitest';
import { canAdvanceCheckpoint, closedThroughFor } from './corpTaxBookCheckpoint.js';

describe('closedThroughFor', () => {
  it('is the end of the last month that ended at least 31 days ago', () => {
    expect(closedThroughFor('2026-11-21')).toBe('2026-09-30');
    expect(closedThroughFor('2026-11-30')).toBe('2026-09-30');
    expect(closedThroughFor('2026-12-01')).toBe('2026-10-31');
    expect(closedThroughFor('2026-12-02')).toBe('2026-10-31');
  });

  it('crosses a year and a leap February', () => {
    expect(closedThroughFor('2027-01-15')).toBe('2026-11-30');
    expect(closedThroughFor('2028-04-01')).toBe('2028-02-29');
  });
});

describe('canAdvanceCheckpoint', () => {
  it('only moves forward, and never past what may close', () => {
    const today = '2026-12-02';
    expect(canAdvanceCheckpoint(undefined, { through: '2026-10-31' }, today)).toBe(true);
    expect(canAdvanceCheckpoint({ through: '2026-09-30' }, { through: '2026-10-31' }, today)).toBe(
      true
    );
    expect(canAdvanceCheckpoint({ through: '2026-10-31' }, { through: '2026-10-31' }, today)).toBe(
      false
    );
    expect(canAdvanceCheckpoint({ through: '2026-10-31' }, { through: '2026-09-30' }, today)).toBe(
      false
    );
    expect(canAdvanceCheckpoint(undefined, { through: '2026-11-30' }, today)).toBe(false);
  });
});
