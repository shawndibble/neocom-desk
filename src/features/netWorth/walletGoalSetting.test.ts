import { describe, expect, it } from 'vitest';
import { parseWalletGoals } from './walletGoalSetting';

describe('parseWalletGoals', () => {
  it('reads the single Goal an earlier version stored', () => {
    expect(parseWalletGoals({ name: 'Nyx fund', target: 25_000_000_000 })).toEqual([
      {
        id: 'goal-0',
        name: 'Nyx fund',
        target: 25_000_000_000,
        fittingId: null,
        fittingName: null,
      },
    ]);
  });

  it('reads a list, with a Fitting-priced Goal, and drops entries with neither a target nor a Fitting', () => {
    const goals = parseWalletGoals([
      { id: 'a', name: 'Ship', target: 5, fittingId: 'ignored' },
      { id: 'b', name: 'Raven', target: null, fittingId: 'fit-1', fittingName: 'Raven PvE' },
      { id: 'c', name: 'Empty', target: null, fittingId: null },
      { id: 'd', name: 'Too big', target: 1e18 },
      'junk',
    ]);
    expect(goals).toEqual([
      { id: 'a', name: 'Ship', target: 5, fittingId: null, fittingName: null },
      { id: 'b', name: 'Raven', target: null, fittingId: 'fit-1', fittingName: 'Raven PvE' },
    ]);
  });

  it('keeps one Goal per id', () => {
    expect(
      parseWalletGoals([
        { id: 'a', name: 'One', target: 1 },
        { id: 'a', name: 'Two', target: 2 },
      ])
    ).toHaveLength(1);
  });

  it('is empty for nothing or an unreadable value', () => {
    expect(parseWalletGoals(null)).toEqual([]);
    expect(parseWalletGoals(undefined)).toEqual([]);
    expect(parseWalletGoals(42)).toEqual([]);
  });
});
