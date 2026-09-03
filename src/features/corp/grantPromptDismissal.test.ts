import { describe, it, expect } from 'vitest';
import {
  NO_DISMISSALS,
  isGrantPromptDismissed,
  parseGrantPromptDismissals,
  withGrantPromptDismissed,
} from './grantPromptDismissal';

const CHAR_A = 42;
const CHAR_B = 99;

describe('isGrantPromptDismissed', () => {
  it('is false for a character that has never seen the prompt', () => {
    expect(isGrantPromptDismissed(NO_DISMISSALS, CHAR_A)).toBe(false);
  });

  it('is true once that character dismissed it', () => {
    expect(isGrantPromptDismissed(withGrantPromptDismissed(NO_DISMISSALS, CHAR_A), CHAR_A)).toBe(
      true
    );
  });

  /** AC 5 is per character: an alt's Director roles deserve their own offer. */
  it('does not carry one character’s dismissal over to another', () => {
    const dismissed = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A);
    expect(isGrantPromptDismissed(dismissed, CHAR_B)).toBe(false);
  });
});

describe('withGrantPromptDismissed', () => {
  it('keeps earlier dismissals', () => {
    const both = withGrantPromptDismissed(withGrantPromptDismissed(NO_DISMISSALS, CHAR_A), CHAR_B);
    expect(isGrantPromptDismissed(both, CHAR_A)).toBe(true);
    expect(isGrantPromptDismissed(both, CHAR_B)).toBe(true);
  });

  it('records a character once, however often it is dismissed', () => {
    const twice = withGrantPromptDismissed(withGrantPromptDismissed(NO_DISMISSALS, CHAR_A), CHAR_A);
    expect(twice.characterIds).toEqual([CHAR_A]);
  });

  it('does not mutate the value it was given', () => {
    const before = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A);
    withGrantPromptDismissed(before, CHAR_B);
    expect(before.characterIds).toEqual([CHAR_A]);
  });
});

describe('parseGrantPromptDismissals', () => {
  it('accepts a well-formed stored value', () => {
    expect(parseGrantPromptDismissals({ characterIds: [CHAR_A] })).toEqual({
      characterIds: [CHAR_A],
    });
  });

  /**
   * Rejecting rather than repairing: `createLocalSetting` falls back to the
   * default on null, and the worst a fallback costs here is one extra offer of
   * a prompt — far better than a malformed row silently suppressing it forever.
   */
  it('rejects anything that is not a list of numbers', () => {
    expect(parseGrantPromptDismissals(null)).toBeNull();
    expect(parseGrantPromptDismissals([CHAR_A])).toBeNull();
    expect(parseGrantPromptDismissals({ characterIds: 'nope' })).toBeNull();
    expect(parseGrantPromptDismissals({ characterIds: [CHAR_A, '99'] })).toBeNull();
  });
});
