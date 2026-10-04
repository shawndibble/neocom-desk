import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { dailyGoalMessageIdOf, journalDescriptionText } from './dailyGoal';

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

describe('journalDescriptionText', () => {
  const t = i18n.t.bind(i18n);

  it("is a daily goal line's goal name", () => {
    expect(
      journalDescriptionText(
        { ref_type: 'daily_goal_payouts', description: '-', reason: '697670' },
        t
      )
    ).toBe('Mine 2000 units of Ore');
  });

  it('is the plain label for a daily goal it has no name for', () => {
    expect(
      journalDescriptionText({ ref_type: 'daily_goal_payouts', description: '-', reason: '999' }, t)
    ).toBe('Daily goal');
  });

  it("is ESI's description for any other line", () => {
    expect(
      journalDescriptionText({ ref_type: 'player_donation', description: 'Gift', reason: '1' }, t)
    ).toBe('Gift');
  });
});
