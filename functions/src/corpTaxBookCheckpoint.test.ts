import { describe, it, expect } from 'vitest';
import {
  lockDateFor,
  snapshotThroughFor,
  canAdvanceCheckpoint,
  checkpointFits,
  checkpointProblems,
  closedThroughFor,
  editReachesCheckpoint,
  dismissalWaives,
  isLocked,
  isSnapshot,
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

describe('checkpointProblems: a checkpoint must add up before it is stored', () => {
  // Day 2 owes 50 of its 60 (10 paid), 10 of it an officer's charge; day 5 owes all 25.
  const ok = {
    through: '2026-09-30',
    owed: [
      { date: '2026-09-02', remaining: 50, tax: 60, credited: 10, charge: 10 },
      { date: '2026-09-05', remaining: 25, tax: 25, credited: 0 },
    ],
    credit: 0,
    balance: 75,
    paidThrough: '2026-09-01',
  };
  const [a, b] = ok.owed;

  it('accepts one that adds up, and one that owes nothing', () => {
    expect(checkpointProblems(ok)).toEqual([]);
    expect(
      checkpointProblems({ ...ok, owed: [], credit: 30, balance: -30, paidThrough: '2026-09-30' })
    ).toEqual([]);
    expect(checkpointProblems({ ...ok, owed: [], balance: 0, paidThrough: null })).toEqual([]);
    // To the ISK: a fraction of rounding is no mismatch.
    expect(checkpointProblems({ ...ok, balance: 75.4 })).toEqual([]);
    // What the day tolerance wrote off is part of the day too.
    expect(
      checkpointProblems({ ...ok, owed: [{ ...a, writtenOff: 5, remaining: 45 }, b], balance: 70 })
    ).toEqual([]);
  });

  it('accepts a held day in what is owed, left out of the balance, and before paid-through', () => {
    const held = { date: '2026-08-20', remaining: 40, tax: 40, credited: 0, held: true };
    expect(checkpointProblems({ ...ok, owed: [held, a, b], paidThrough: '2026-09-01' })).toEqual(
      []
    );
  });

  it('accepts an officer’s charge still owed on a day paid through', () => {
    const charge = { date: '2026-08-20', remaining: 15, tax: 100, credited: 85, charge: 15 };
    expect(
      checkpointProblems({ ...ok, owed: [charge, a, b], balance: 90, paidThrough: '2026-09-01' })
    ).toEqual([]);
  });

  it('refuses owed days out of order, repeated or after the date it closes', () => {
    expect(checkpointProblems({ ...ok, owed: [b, a] })).toContain('owed-order');
    expect(checkpointProblems({ ...ok, owed: [a, a], balance: 100 })).toContain('owed-order');
    expect(checkpointProblems({ ...ok, owed: [a, { ...b, date: '2026-10-01' }] })).toContain(
      'owed-after-through'
    );
  });

  it('refuses a day owing nothing, figures that do not add up, or a charge beyond what it owes', () => {
    expect(
      checkpointProblems({
        ...ok,
        owed: [{ ...a, remaining: 0, credited: 60, charge: 0 }, b],
        balance: 25,
      })
    ).toEqual(['owed-remaining']);
    expect(checkpointProblems({ ...ok, owed: [{ ...a, credited: 20 }, b] })).toEqual([
      'owed-figures',
    ]);
    expect(checkpointProblems({ ...ok, owed: [{ ...a, tax: undefined }, b] })).toEqual([
      'owed-figures',
    ]);
    expect(checkpointProblems({ ...ok, owed: [{ ...a, charge: 51 }, b] })).toEqual(['owed-charge']);
    expect(checkpointProblems({ ...ok, owed: [{ ...a, charge: -1 }, b] })).toEqual(['owed-charge']);
  });

  it('refuses negative credit and a balance that does not add up', () => {
    expect(checkpointProblems({ ...ok, credit: -1, balance: 76 })).toEqual(['credit']);
    expect(checkpointProblems({ ...ok, balance: 80 })).toEqual(['balance']);
  });

  it('refuses a paid-through day after the close or on a day sync still owes', () => {
    expect(checkpointProblems({ ...ok, paidThrough: '2026-10-01' })).toEqual(['paid-through']);
    expect(checkpointProblems({ ...ok, paidThrough: '2026-09-02' })).toEqual(['paid-through']);
  });

  it('names every problem at once', () => {
    expect(
      checkpointProblems({ ...ok, credit: -1, balance: 3, paidThrough: '2026-10-01' })
    ).toEqual(['credit', 'balance', 'paid-through']);
  });
});

describe('checkpointFits: a checkpoint stands only for the characters it summed', () => {
  it('fits the same characters in any order, and nothing else', () => {
    expect(checkpointFits({ characterIds: [2, 1] }, [1, 2])).toBe(true);
    expect(checkpointFits({ characterIds: [1] }, [1, 2])).toBe(false);
    expect(checkpointFits({ characterIds: [1, 2] }, [1])).toBe(false);
    // One recorded before characters were stored is read as absent.
    expect(checkpointFits({}, [1])).toBe(false);
  });
});

describe('editReachesCheckpoint: whether an edit may change a closed day', () => {
  // On 18 Oct the book can be closed through 31 Aug at the latest.
  const today = '2026-10-18';
  it('reaches one when it is dated on or before the latest day a checkpoint can close', () => {
    expect(editReachesCheckpoint('2026-08-31', today)).toBe(true);
    expect(editReachesCheckpoint('2026-08-31T23:00:00.000Z', today)).toBe(true);
    expect(editReachesCheckpoint('2026-09-01', today)).toBe(false);
  });
  it('an edit that can reach any day (no date) always does', () => {
    expect(editReachesCheckpoint(null, today)).toBe(true);
  });
});

describe('lockDateFor', () => {
  it('is the 1st of the month two months back', () => {
    expect(lockDateFor('2026-12-01')).toBe('2026-10-01');
    expect(lockDateFor('2026-12-15')).toBe('2026-10-01');
    expect(lockDateFor('2026-12-31')).toBe('2026-10-01');
    expect(lockDateFor('2027-01-05')).toBe('2026-11-01');
    expect(lockDateFor('2027-02-28')).toBe('2026-12-01');
  });
  it('makes a snapshot cover every day before it', () => {
    expect(snapshotThroughFor('2026-12-15')).toBe('2026-09-30');
    expect(snapshotThroughFor('2028-05-02')).toBe('2028-02-29');
  });
});

describe('isLocked: history before the lock date is read-only', () => {
  // On 15 Dec the lock date is 1 Oct.
  const today = '2026-12-15';
  it('locks a day or an instant before the lock date, and nothing from it on', () => {
    expect(isLocked('2026-09-30', today)).toBe(true);
    expect(isLocked('2026-09-30T23:59:59.000Z', today)).toBe(true);
    expect(isLocked('2026-10-01', today)).toBe(false);
    expect(isLocked('2026-10-01T00:00:00.000Z', today)).toBe(false);
    expect(isLocked(today, today)).toBe(false);
  });
  it('locks nothing it cannot date', () => {
    expect(isLocked(undefined, today)).toBe(false);
    expect(isLocked('', today)).toBe(false);
  });
});

describe('isSnapshot: a checkpoint covers only days locked when it was recorded', () => {
  it('is one through a day before the lock date on the day it was recorded', () => {
    expect(isSnapshot({ through: '2026-09-30', at: '2026-12-01T10:00:00.000Z' })).toBe(true);
    expect(isSnapshot({ through: '2026-08-31', at: '2026-12-01T10:00:00.000Z' })).toBe(true);
  });
  it('is not one recorded through days still open then (the old strict cache)', () => {
    expect(isSnapshot({ through: '2026-10-31', at: '2026-12-01T10:00:00.000Z' })).toBe(false);
    expect(isSnapshot({ through: '2026-09-30', at: '2026-11-21T10:00:00.000Z' })).toBe(false);
  });
});

describe('dismissalWaives: a wide dismissal changes nothing before the lock date', () => {
  it('waives every day without `from` (one made before the lock date existed)', () => {
    expect(dismissalWaives({}, '2026-01-01')).toBe(true);
  });
  it('waives only days on or after its `from`', () => {
    expect(dismissalWaives({ from: '2026-10-01' }, '2026-09-30')).toBe(false);
    expect(dismissalWaives({ from: '2026-10-01' }, '2026-10-01')).toBe(true);
  });
  it('a reversal ends it from its own `from`, and a legacy reversal ends it outright', () => {
    const reversed = { from: '2026-08-01', reversed: { from: '2026-10-01' } };
    expect(dismissalWaives(reversed, '2026-09-30')).toBe(true);
    expect(dismissalWaives(reversed, '2026-10-01')).toBe(false);
    expect(dismissalWaives({ reversed: {} }, '2026-01-01')).toBe(false);
  });
});
