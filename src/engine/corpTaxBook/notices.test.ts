import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTICE_RULES, parseNoticeRules } from './notices';

describe('parseNoticeRules', () => {
  it('fills every missing part with its default', () => {
    expect(parseNoticeRules(undefined)).toEqual(DEFAULT_NOTICE_RULES);
    expect(parseNoticeRules({ minimum: 'x', after: { kind: 'behind' } })).toEqual(
      DEFAULT_NOTICE_RULES
    );
    expect(
      parseNoticeRules({ after: { kind: 'dayOfMonth', day: 31 }, minimum: -1, cooldownDays: 0 })
    ).toEqual(DEFAULT_NOTICE_RULES);
  });

  it('reads a day-of-month rule and the corp’s own figures', () => {
    expect(
      parseNoticeRules({ after: { kind: 'dayOfMonth', day: 5 }, minimum: 1, cooldownDays: 3 })
    ).toEqual({ after: { kind: 'dayOfMonth', day: 5 }, minimum: 1, cooldownDays: 3 });
  });
});
