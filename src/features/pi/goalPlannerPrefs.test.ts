import { describe, it, expect } from 'vitest';
import { DEFAULT_GOAL_PLANNER_PREFS, parseGoalPlannerPrefs } from './goalPlannerPrefs';

describe('parseGoalPlannerPrefs', () => {
  it('accepts a whole stored value', () => {
    expect(
      parseGoalPlannerPrefs({ fallbackRatePerHour: 5_500, maxP0Types: 1, priceHub: 'amarr' })
    ).toEqual({ fallbackRatePerHour: 5_500, maxP0Types: 1, priceHub: 'amarr' });
  });

  it('repairs each bad field to its default rather than discarding the rest', () => {
    expect(
      parseGoalPlannerPrefs({ fallbackRatePerHour: -1, maxP0Types: 3, priceHub: 'nowhere' })
    ).toEqual(DEFAULT_GOAL_PLANNER_PREFS);
    expect(parseGoalPlannerPrefs({ maxP0Types: 1 })).toEqual({
      ...DEFAULT_GOAL_PLANNER_PREFS,
      maxP0Types: 1,
    });
  });

  it('refuses a value that is not an object', () => {
    expect(parseGoalPlannerPrefs('x')).toBeNull();
    expect(parseGoalPlannerPrefs(null)).toBeNull();
  });

  it('defaults to two P0 types, Jita pricing and a stated fallback rate', () => {
    expect(DEFAULT_GOAL_PLANNER_PREFS.maxP0Types).toBe(2);
    expect(DEFAULT_GOAL_PLANNER_PREFS.priceHub).toBe('jita');
    expect(DEFAULT_GOAL_PLANNER_PREFS.fallbackRatePerHour).toBeGreaterThan(0);
  });
});
