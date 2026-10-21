import { describe, expect, it } from 'vitest';
import { composeRateChangeMail, moonOwnerMailRecipients } from './ownerRateMail';

const base = { accountingCorporationName: 'B-UH Moons', recipientName: 'Ada' };

describe('composeRateChangeMail', () => {
  it('says the new rate, the date and what they asked for', () => {
    const mail = composeRateChangeMail({
      ...base,
      change: { date: '2026-10-01', oldPct: 5, newPct: 8, requestedPct: 6 },
    });
    expect(mail.subject).toBe('Your moon mining rate is now 8%');
    expect(mail.body).toContain('B-UH Moons set your moon mining rate to 8% from 2026-10-01.');
    expect(mail.body).toContain('You asked for 6%.');
  });

  it('leaves out the ask when there was none or it equals the new rate', () => {
    for (const requestedPct of [undefined, 8]) {
      const mail = composeRateChangeMail({
        ...base,
        change: { date: '2026-10-01', newPct: 8, ...(requestedPct ? { requestedPct } : {}) },
      });
      expect(mail.body).not.toContain('asked');
    }
  });

  it('never carries the miner rate, the margin or a dev term', () => {
    const { subject, body } = composeRateChangeMail({
      ...base,
      change: { date: '2026-10-01', newPct: 8, requestedPct: 6 },
    });
    expect(`${subject} ${body}`).not.toMatch(/miner|margin|feeder|collector/i);
  });
});

describe('moonOwnerMailRecipients', () => {
  it('is the CEO and the payee', () => {
    expect(moonOwnerMailRecipients({ ceoId: 1, payee: { kind: 'character', id: 2 } })).toEqual([
      1, 2,
    ]);
  });
  it('reaches a corporation payee through its CEO, once each', () => {
    expect(
      moonOwnerMailRecipients({ ceoId: 1, payee: { kind: 'corporation', id: 99 }, payeeCeoId: 1 })
    ).toEqual([1]);
    expect(
      moonOwnerMailRecipients({
        ceoId: null,
        payee: { kind: 'corporation', id: 99 },
        payeeCeoId: 3,
      })
    ).toEqual([3]);
  });
  it('drops what is unknown', () => {
    expect(moonOwnerMailRecipients({ ceoId: null })).toEqual([]);
  });
});
