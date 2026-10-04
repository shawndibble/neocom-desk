import { describe, it, expect } from 'vitest';
import { dailyGoalMessageIdOf } from './dailyGoal';

describe('dailyGoalMessageIdOf', () => {
  it("reads a daily goal payout's reason as the goal's message id", () => {
    expect(dailyGoalMessageIdOf({ ref_type: 'daily_goal_payouts', reason: '1004953' })).toBe(
      1004953
    );
  });

  it('reads the payout tax line the same way', () => {
    expect(dailyGoalMessageIdOf({ ref_type: 'daily_goal_payouts_tax', reason: ' 712791 ' })).toBe(
      712791
    );
  });

  it('is null for any other ref type, even with a numeric reason', () => {
    expect(dailyGoalMessageIdOf({ ref_type: 'player_donation', reason: '1004953' })).toBeNull();
  });

  it('is null when the reason is missing or not a bare id', () => {
    expect(dailyGoalMessageIdOf({ ref_type: 'daily_goal_payouts' })).toBeNull();
    expect(dailyGoalMessageIdOf({ ref_type: 'daily_goal_payouts', reason: 'goal 7' })).toBeNull();
  });
});
