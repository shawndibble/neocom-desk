import { describe, it, expect } from 'vitest';
import { scopesForGroup } from '@/esi/scopes';
import {
  NO_DISMISSALS,
  isGrantPromptDismissed,
  parseGrantPromptDismissals,
  withGrantPromptDismissed,
} from './grantPromptDismissal';

const CHAR_A = 42;
const CHAR_B = 99;

// The real corp group, and a #327-shaped "one scope short" predecessor of it —
// exercising the actual defect (a group that grew by one scope) rather than a
// synthetic stand-in.
const CORP_SCOPES = scopesForGroup('corp');
const NARROWER_CORP_SCOPES = CORP_SCOPES.slice(0, -1);

describe('isGrantPromptDismissed', () => {
  it('is false for a character that has never seen the prompt', () => {
    expect(isGrantPromptDismissed(NO_DISMISSALS, CHAR_A, CORP_SCOPES)).toBe(false);
  });

  it('is true once that character dismissed it for the same scopes', () => {
    const dismissed = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A, CORP_SCOPES);
    expect(isGrantPromptDismissed(dismissed, CHAR_A, CORP_SCOPES)).toBe(true);
  });

  /** AC 5 is per character: an alt's Director roles deserve their own offer. */
  it('does not carry one character’s dismissal over to another', () => {
    const dismissed = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A, CORP_SCOPES);
    expect(isGrantPromptDismissed(dismissed, CHAR_B, CORP_SCOPES)).toBe(false);
  });

  /**
   * The actual #331 defect: a Character dismissed the prompt when the group
   * was seven scopes wide. The group has since grown to eight. The recorded
   * offer is no longer a superset of what's on offer now, so this Character
   * is not dismissed for it — they get re-offered exactly once, as AC 1/3
   * require.
   */
  it('is false once the group has grown past what was offered', () => {
    const dismissed = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A, NARROWER_CORP_SCOPES);
    expect(isGrantPromptDismissed(dismissed, CHAR_A, CORP_SCOPES)).toBe(false);
  });

  /**
   * The converse: a Character dismissed for the current (wider) group stays
   * dismissed when asked about a narrower snapshot of it — the recorded set
   * only has to be a superset, not an exact match (AC 2).
   */
  it('stays dismissed when asked about a scope set narrower than what was offered', () => {
    const dismissed = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A, CORP_SCOPES);
    expect(isGrantPromptDismissed(dismissed, CHAR_A, NARROWER_CORP_SCOPES)).toBe(true);
  });
});

describe('withGrantPromptDismissed', () => {
  it('keeps earlier dismissals for other characters', () => {
    const both = withGrantPromptDismissed(
      withGrantPromptDismissed(NO_DISMISSALS, CHAR_A, CORP_SCOPES),
      CHAR_B,
      CORP_SCOPES
    );
    expect(isGrantPromptDismissed(both, CHAR_A, CORP_SCOPES)).toBe(true);
    expect(isGrantPromptDismissed(both, CHAR_B, CORP_SCOPES)).toBe(true);
  });

  /** AC 3: dismissing again after a growth records the new (wider) offer. */
  it('replaces a previous offer for the same character with the latest one', () => {
    const first = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A, NARROWER_CORP_SCOPES);
    const second = withGrantPromptDismissed(first, CHAR_A, CORP_SCOPES);
    expect(isGrantPromptDismissed(second, CHAR_A, CORP_SCOPES)).toBe(true);
  });

  it('does not mutate the value it was given', () => {
    const before = withGrantPromptDismissed(NO_DISMISSALS, CHAR_A, CORP_SCOPES);
    withGrantPromptDismissed(before, CHAR_B, CORP_SCOPES);
    expect(isGrantPromptDismissed(before, CHAR_B, CORP_SCOPES)).toBe(false);
  });
});

describe('parseGrantPromptDismissals', () => {
  it('accepts a well-formed stored value', () => {
    expect(parseGrantPromptDismissals({ offeredScopes: { [CHAR_A]: CORP_SCOPES } })).toEqual({
      offeredScopes: { [CHAR_A]: CORP_SCOPES },
    });
  });

  it('accepts an empty record', () => {
    expect(parseGrantPromptDismissals({ offeredScopes: {} })).toEqual({ offeredScopes: {} });
  });

  /**
   * Rejecting rather than repairing: `createLocalSetting` falls back to the
   * default on null, and the worst a fallback costs here is one extra offer of
   * a prompt — far better than a malformed row silently suppressing it forever.
   */
  it('rejects anything that is not a record of scope lists', () => {
    expect(parseGrantPromptDismissals(null)).toBeNull();
    expect(parseGrantPromptDismissals([CHAR_A])).toBeNull();
    expect(parseGrantPromptDismissals({ offeredScopes: 'nope' })).toBeNull();
    expect(parseGrantPromptDismissals({ offeredScopes: { [CHAR_A]: 'nope' } })).toBeNull();
    expect(parseGrantPromptDismissals({ offeredScopes: { [CHAR_A]: [123] } })).toBeNull();
  });

  /**
   * AC 6: the pre-#331 shape (`{ characterIds: number[] }`) records *that* a
   * Character was offered the prompt, never *what* was offered — there is no
   * scope set to recover from it. It must parse as "nothing recorded," which
   * re-offers every Character it names exactly once. That is the fix, not a
   * bug in the fallback.
   */
  it('treats the old flat characterIds shape as nothing recorded', () => {
    expect(parseGrantPromptDismissals({ characterIds: [CHAR_A, CHAR_B] })).toBeNull();
  });
});
