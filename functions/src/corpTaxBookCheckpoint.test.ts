import { describe, it, expect } from 'vitest';
import {
  canAdvanceCheckpoint,
  checkpointProblem,
  closedThroughFor,
} from './corpTaxBookCheckpoint.js';

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

describe('checkpointProblem: a checkpoint must add up before it is stored', () => {
  const ok = {
    through: '2026-09-30',
    owed: [
      { date: '2026-09-02', remaining: 50, charge: 10 },
      { date: '2026-09-05', remaining: 25 },
    ],
    credit: 0,
    balance: 75,
    paidThrough: '2026-09-01',
  };

  it('accepts one that adds up, and one that owes nothing', () => {
    expect(checkpointProblem(ok)).toBeNull();
    expect(
      checkpointProblem({ ...ok, owed: [], credit: 30, balance: -30, paidThrough: '2026-09-30' })
    ).toBeNull();
    expect(checkpointProblem({ ...ok, owed: [], balance: 0, paidThrough: null })).toBeNull();
    // To the ISK: a fraction of rounding is no mismatch.
    expect(checkpointProblem({ ...ok, balance: 75.4 })).toBeNull();
  });

  it('refuses owed days out of order, repeated or after the date it closes', () => {
    const [a, b] = ok.owed;
    expect(checkpointProblem({ ...ok, owed: [b, a] })).toBe('owed-order');
    expect(checkpointProblem({ ...ok, owed: [a, a], balance: 100 })).toBe('owed-order');
    expect(checkpointProblem({ ...ok, owed: [a, { ...b, date: '2026-10-01' }] })).toBe(
      'owed-after-through'
    );
  });

  it('refuses a day owing nothing, or a charge beyond what it owes', () => {
    const [a, b] = ok.owed;
    expect(checkpointProblem({ ...ok, owed: [{ ...a, remaining: 0 }, b], balance: 25 })).toBe(
      'owed-remaining'
    );
    expect(checkpointProblem({ ...ok, owed: [{ ...a, charge: 51 }, b] })).toBe('owed-charge');
    expect(checkpointProblem({ ...ok, owed: [{ ...a, charge: -1 }, b] })).toBe('owed-charge');
  });

  it('refuses negative credit and a balance that does not add up', () => {
    expect(checkpointProblem({ ...ok, credit: -1, balance: 76 })).toBe('credit');
    expect(checkpointProblem({ ...ok, balance: 80 })).toBe('balance');
  });

  it('refuses a paid-through day after the close or on an owed day', () => {
    expect(checkpointProblem({ ...ok, paidThrough: '2026-10-01' })).toBe('paid-through');
    expect(checkpointProblem({ ...ok, paidThrough: '2026-09-02' })).toBe('paid-through');
  });
});
