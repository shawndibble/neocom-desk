import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { applyPath, minimumLine, statusStateLabel } from './vettingText';

const t = i18n.t.bind(i18n);

describe('applyPath', () => {
  it('is the bare apply page with no invite, blank ones included', () => {
    expect(applyPath(98000001)).toBe('/apply/98000001');
    expect(applyPath(98000001, '  ')).toBe('/apply/98000001');
  });

  it('carries the invite code as a query, escaped', () => {
    expect(applyPath(98000001, 'aB3-xy')).toBe('/apply/98000001?invite=aB3-xy');
    expect(applyPath(98000001, 'a b&c')).toBe('/apply/98000001?invite=a%20b%26c');
  });
});

describe('minimumLine', () => {
  it('words each minimum as the applicant reads it', () => {
    expect(minimumLine('ageDays', 365, t)).toBe('A character at least 365 days old');
    expect(minimumLine('ageDays', 1, t)).toBe('A character at least 1 day old');
    expect(minimumLine('skillPoints', 50_000_000, t)).toBe('50,000,000 skill points');
    expect(minimumLine('characters', 2, t)).toBe('At least 2 characters');
  });
});

describe('statusStateLabel', () => {
  it('uses the corp’s wording for a no, and the state for everything else', () => {
    expect(statusStateLabel({ state: 'rejected' }, t)).toBe('Rejected');
    expect(
      statusStateLabel({ state: 'rejected', rejection: { wording: 'notNow', reasons: [] } }, t)
    ).toBe('Not at this time');
    expect(statusStateLabel({ state: 'accepted' }, t)).toBe('Accepted');
    expect(
      statusStateLabel({ state: 'open', rejection: { wording: 'notNow', reasons: [] } }, t)
    ).toBe('Waiting');
  });
});

describe('refusal wording', () => {
  it('has a line for each refusal the corp’s settings add', () => {
    expect(t('vetting.errors.invite-required')).toMatch(/takes applications by invite/);
    expect(t('vetting.errors.invites-full')).toMatch(/Revoke one/);
    expect(t('vetting.errors.answers-required')).toMatch(/required questions/);
    expect(t('vetting.errors.below-minimum')).toMatch(/does not meet/);
  });
});
