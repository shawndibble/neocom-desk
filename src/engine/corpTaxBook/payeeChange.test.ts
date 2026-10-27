import { describe, expect, it } from 'vitest';
import { composePayeeChangeMail, payeeChangeNotice } from './payeeChange';

const at = Date.parse('2026-10-21T15:30:00Z');

describe('payeeChangeNotice', () => {
  const payee = { kind: 'corporation' as const, id: 98000009 };

  it('tells each side about a change the other side made', () => {
    expect(
      payeeChangeNotice({ payee, payeeSetBy: { side: 'accounting', at }, viewer: 'moon-owner' })
    ).toEqual({ payee, by: 'accounting', date: '2026-10-21', at });
    expect(
      payeeChangeNotice({ payee, payeeSetBy: { side: 'moon-owner', at }, viewer: 'accounting' })
    ).toEqual({ payee, by: 'moon-owner', date: '2026-10-21', at });
  });

  it('is quiet about its own side’s change, an unknown setter and no payee', () => {
    expect(
      payeeChangeNotice({ payee, payeeSetBy: { side: 'accounting', at }, viewer: 'accounting' })
    ).toBeUndefined();
    expect(payeeChangeNotice({ payee, payeeSetBy: null, viewer: 'accounting' })).toBeUndefined();
    expect(payeeChangeNotice({ payee, viewer: 'moon-owner' })).toBeUndefined();
    expect(
      payeeChangeNotice({ payeeSetBy: { side: 'accounting', at }, viewer: 'moon-owner' })
    ).toBeUndefined();
  });
});

describe('composePayeeChangeMail', () => {
  const input = {
    recipientName: 'Ada',
    changedByName: 'B-UH Moons',
    moonOwnerName: 'Rock Holders',
    payeeName: 'Kara Vex',
    date: '2026-10-21',
  };

  it('says who gets paid now, for whom, who changed it and when', () => {
    const mail = composePayeeChangeMail(input);
    expect(mail.subject).toBe('Moon mining payments now go to Kara Vex');
    expect(mail.body).toContain(
      'Hi Ada, moon mining payments for Rock Holders now go to Kara Vex. B-UH Moons changed this on 2026-10-21.'
    );
  });

  it('never carries a rate, the margin, timing rules or a dev term', () => {
    const { subject, body } = composePayeeChangeMail(input);
    expect(`${subject} ${body}`).not.toMatch(
      /%|rate|margin|miner|hour|48|remov|force|feeder|collector/i
    );
  });
});
