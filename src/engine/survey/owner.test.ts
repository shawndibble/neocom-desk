import { describe, expect, it } from 'vitest';
import { ownsSurvey } from './owner';

describe('ownsSurvey', () => {
  it('is true when any Character on the account carries the owner name', () => {
    expect(ownsSurvey('Shawn Dibble', ['Alt One', 'Shawn Dibble'])).toBe(true);
  });

  it('ignores case and surrounding space, which EVE names do not distinguish', () => {
    expect(ownsSurvey('shawn dibble ', ['Shawn Dibble'])).toBe(true);
  });

  it('is false for someone else, for no characters, and for a survey with no owner', () => {
    expect(ownsSurvey('Someone Else', ['Shawn Dibble'])).toBe(false);
    expect(ownsSurvey('Shawn Dibble', [])).toBe(false);
    expect(ownsSurvey(null, ['Shawn Dibble'])).toBe(false);
  });
});
