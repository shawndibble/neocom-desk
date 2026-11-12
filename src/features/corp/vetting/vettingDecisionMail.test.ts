import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { VettingReview } from '@/engine/vetting';
import {
  buildVettingDecisionMail,
  decisionMailInput,
  type VettingDecisionMailInput,
} from './vettingDecisionMail';

const t = i18n.t.bind(i18n);

const input = (over: Partial<VettingDecisionMailInput>): VettingDecisionMailInput => ({
  outcome: 'accepted',
  kind: 'application',
  pilot: 'Tamsin Vell',
  corpName: 'Brass Meridian Logistics',
  rejection: { wording: 'rejected', showReason: false },
  reasons: [],
  ...over,
});

describe('buildVettingDecisionMail', () => {
  it('accepted application: names the in-game step', () => {
    const mail = buildVettingDecisionMail(t, input({}));
    expect(mail.subject).toBe('Application accepted: Brass Meridian Logistics');
    expect(mail.body).toBe(
      [
        'Hi Tamsin Vell,',
        'Your application to Brass Meridian Logistics was accepted.',
        "In EVE, open Brass Meridian Logistics's corporation window and press Apply to join. A recruiter accepts it in game.",
      ].join('\n\n')
    );
  });

  it('accepted promotion: names the role and who changes it', () => {
    const mail = buildVettingDecisionMail(t, input({ kind: 'promotion', role: 'Director' }));
    expect(mail.subject).toBe('Review approved: Director');
    expect(mail.body).toContain(
      'Your review for Director in Brass Meridian Logistics was approved.'
    );
    expect(mail.body).toContain('An officer changes your role in game.');
  });

  it('rejected: the corp’s wording, and no reason unless the corp shows it', () => {
    const reasons = ['Too many corps this year.'];
    const plain = buildVettingDecisionMail(t, input({ outcome: 'rejected', reasons }));
    expect(plain.subject).toBe('Application rejected: Brass Meridian Logistics');
    expect(plain.body).toContain('Your application to Brass Meridian Logistics was rejected.');
    expect(plain.body).not.toContain('Too many corps');
    expect(plain.body).not.toContain('Apply to join');

    const soft = buildVettingDecisionMail(
      t,
      input({ outcome: 'rejected', reasons, rejection: { wording: 'notNow', showReason: false } })
    );
    expect(soft.subject).toBe('Application to Brass Meridian Logistics: not at this time');
    expect(soft.body).toContain('was not accepted at this time.');
    expect(soft.body).not.toContain('Reason');
  });

  it('rejected with the reason shown: one line per reviewer who said no', () => {
    const mail = buildVettingDecisionMail(
      t,
      input({
        outcome: 'rejected',
        rejection: { wording: 'notNow', showReason: true },
        reasons: ['Full on haulers.', '  ', 'Ask again in <b>March</b>.'],
      })
    );
    expect(mail.body.split('\n\n').at(-1)).toBe(
      'Reason: Full on haulers.\nReason: Ask again in bMarch/b.'
    );
  });

  it('keeps markup out of names and clips a long subject', () => {
    const mail = buildVettingDecisionMail(
      t,
      input({ pilot: '<i>Tamsin</i>', corpName: `<b>${'x'.repeat(200)}</b>` })
    );
    expect(mail.body).toContain('Hi iTamsin/i,');
    expect(mail.subject).not.toMatch(/[<>]/);
    expect([...mail.subject].length).toBeLessThanOrEqual(100);
  });
});

describe('decisionMailInput', () => {
  const review = (
    over: Partial<VettingReview>
  ): Pick<VettingReview, 'state' | 'kind' | 'role' | 'pilot' | 'signOffs'> => ({
    state: 'rejected',
    kind: 'application',
    pilot: { characterId: 1, name: 'Tamsin Vell', corporationName: 'Hollow Reach Mining' },
    signOffs: [
      { characterId: 6, name: 'Kestrel Vane', you: true, at: 2, decision: 'no', note: 'Too new.' },
      { characterId: 7, name: 'Ilse Marrow', you: false, at: 1, decision: 'yes', note: 'Fine.' },
      { characterId: 8, name: 'Bram Soto', you: false, at: 1, decision: 'no', note: '' },
    ],
    ...over,
  });
  const rejection = { wording: 'rejected', showReason: true } as const;

  it('has nothing to say about a review that is not decided', () => {
    expect(decisionMailInput(review({ state: 'open' }), rejection, 'Corp')).toBeNull();
    expect(decisionMailInput(review({ state: 'withdrawn' }), rejection, 'Corp')).toBeNull();
  });

  it('takes the reasons from the reviewers who said no and wrote one', () => {
    expect(decisionMailInput(review({}), rejection, 'Corp')).toEqual({
      outcome: 'rejected',
      kind: 'application',
      pilot: 'Tamsin Vell',
      corpName: 'Corp',
      rejection,
      reasons: ['Too new.'],
    });
    expect(
      decisionMailInput(
        review({ state: 'accepted', kind: 'promotion', role: 'Director' }),
        rejection,
        'Corp'
      )
    ).toMatchObject({ outcome: 'accepted', kind: 'promotion', role: 'Director' });
  });
});
