import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { VettingReview } from '@/engine/vetting';
import {
  buildVettingDecisionMail,
  decisionMailInput,
  offersDecisionMail,
  type VettingDecisionMailInput,
} from './vettingDecisionMail';

const t = i18n.t.bind(i18n);

const input = (over: Partial<VettingDecisionMailInput>): VettingDecisionMailInput => ({
  outcome: 'accepted',
  kind: 'application',
  pilot: 'Tamsin Vell',
  corpName: 'Brass Meridian Logistics',
  wording: 'rejected',
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

  it('rejected: the corp’s wording, and no reason line when it was handed none', () => {
    const plain = buildVettingDecisionMail(t, input({ outcome: 'rejected' }));
    expect(plain.subject).toBe('Application rejected: Brass Meridian Logistics');
    expect(plain.body).toContain('Your application to Brass Meridian Logistics was rejected.');
    expect(plain.body).not.toContain('Reason');
    expect(plain.body).not.toContain('Apply to join');

    const soft = buildVettingDecisionMail(t, input({ outcome: 'rejected', wording: 'notNow' }));
    expect(soft.subject).toBe('Application to Brass Meridian Logistics: not at this time');
    expect(soft.body).toContain('was not accepted at this time.');
    expect(soft.body).not.toContain('Reason');
  });

  it('rejected with reasons: one line each', () => {
    const mail = buildVettingDecisionMail(
      t,
      input({
        outcome: 'rejected',
        wording: 'notNow',
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
      {
        characterId: 6,
        name: 'Kestrel Vane',
        you: true,
        at: 2,
        decision: 'no',
        note: 'Too new.',
        reasonShown: true,
      },
      {
        characterId: 7,
        name: 'Ilse Marrow',
        you: false,
        at: 1,
        decision: 'yes',
        note: 'Fine.',
        reasonShown: true,
      },
      {
        characterId: 8,
        name: 'Bram Soto',
        you: false,
        at: 1,
        decision: 'no',
        note: '',
        reasonShown: true,
      },
      // Written while the corp kept reasons to itself: never the pilot's to read.
      {
        characterId: 9,
        name: 'Oda Lind',
        you: false,
        at: 1,
        decision: 'no',
        note: 'Kept quiet.',
        reasonShown: false,
      },
      // Written before sign-offs were stamped.
      { characterId: 10, name: 'Per Aske', you: false, at: 1, decision: 'no', note: 'Unstamped.' },
    ],
    ...over,
  });

  it('has nothing to say about a review that is not decided', () => {
    expect(decisionMailInput(review({ state: 'open' }), 'rejected', 'Corp')).toBeNull();
    expect(decisionMailInput(review({ state: 'withdrawn' }), 'rejected', 'Corp')).toBeNull();
  });

  it('takes the reasons only from a no stamped as shown to the pilot when it was written', () => {
    expect(decisionMailInput(review({}), 'notNow', 'Corp')).toEqual({
      outcome: 'rejected',
      kind: 'application',
      pilot: 'Tamsin Vell',
      corpName: 'Corp',
      wording: 'notNow',
      reasons: ['Too new.'],
    });
    expect(
      decisionMailInput(
        review({ state: 'accepted', kind: 'promotion', role: 'Director' }),
        'rejected',
        'Corp'
      )
    ).toMatchObject({ outcome: 'accepted', kind: 'promotion', role: 'Director' });
  });
});

describe('offersDecisionMail', () => {
  const mine = { characterId: 6, name: 'Kestrel Vane', you: true, at: 2 };
  const theirs = { ...mine, characterId: 7, you: false };
  const on = { mailDecision: true };

  it('offers a decided review to a reviewer who signed it, on any visit', () => {
    expect(offersDecisionMail({ state: 'accepted', signOffs: [theirs, mine] }, on)).toBe(true);
    expect(offersDecisionMail({ state: 'rejected', signOffs: [mine] }, on)).toBe(true);
  });

  it('offers none while open, to a reviewer who did not sign, or when the corp wants no mail', () => {
    expect(offersDecisionMail({ state: 'open', signOffs: [mine] }, on)).toBe(false);
    expect(offersDecisionMail({ state: 'accepted', signOffs: [theirs] }, on)).toBe(false);
    expect(
      offersDecisionMail({ state: 'accepted', signOffs: [mine] }, { mailDecision: false })
    ).toBe(false);
    expect(offersDecisionMail({ state: 'accepted', signOffs: [mine] }, null)).toBe(false);
  });
});
