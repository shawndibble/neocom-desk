import { describe, expect, it } from 'vitest';
import {
  REMOVAL_WAIT_MS,
  cancelRemoval,
  canStartRemoval,
  isPayeeActor,
  isRemovalDue,
  payeeMayForce,
  recordRemovalNotice,
  removalRecipients,
  startRemoval,
  withPayee,
} from './removal';

const H = 3_600_000;
const by = { characterId: 7, name: 'Kestrel' };

describe('startRemoval', () => {
  it('goes pending with no clock yet', () => {
    const s = startRemoval({ status: 'active' }, by, 1000);
    expect(s.status).toBe('pending-removal');
    expect(s.removal).toEqual({ startedAt: 1000, startedBy: 7, startedByName: 'Kestrel' });
  });
  it('refuses a moon owner that is not active', () => {
    for (const status of ['pending-removal', 'left', 'removed', 'disconnected'] as const) {
      expect(canStartRemoval({ status })).toBe(false);
      expect(() => startRemoval({ status }, by, 1)).toThrow();
    }
  });
});

describe('the 24-hour clock', () => {
  const started = startRemoval({ status: 'active' }, by, 0);
  it('starts when the mail is sent, not at the click', () => {
    const sent = recordRemovalNotice(started, 5 * H);
    expect(sent.removal?.effectiveAt).toBe(5 * H + REMOVAL_WAIT_MS);
    expect(isRemovalDue(sent, 24 * H)).toBe(false);
    expect(isRemovalDue(sent, 29 * H)).toBe(true);
  });
  it('never takes effect while the mail is unsent (the mail-failed path)', () => {
    expect(isRemovalDue(started, 1000 * H)).toBe(false);
  });
  it('keeps the first notice time', () => {
    const first = recordRemovalNotice(started, 2 * H);
    expect(recordRemovalNotice(first, 9 * H)).toEqual(first);
  });
  it('ignores a notice for a removal that is not pending', () => {
    expect(recordRemovalNotice({ status: 'active' }, 1)).toEqual({ status: 'active' });
  });
});

describe('cancelRemoval', () => {
  it('returns to active and drops the removal', () => {
    const pending = recordRemovalNotice(startRemoval({ status: 'active' }, by, 0), H);
    expect(cancelRemoval(pending)).toEqual({ status: 'active' });
  });
  it('throws when nothing is pending', () => {
    expect(() => cancelRemoval({ status: 'active' })).toThrow();
  });
});

describe('removalRecipients', () => {
  it('is the other officers, the CEO and the payee, once each', () => {
    expect(
      removalRecipients({ officerIds: [7, 8, 9, 8], startedBy: 7, ceoId: 20, payeeId: 21 })
    ).toEqual([8, 9, 20, 21]);
  });
  it('merges a CEO who is also the payee or an officer', () => {
    expect(removalRecipients({ officerIds: [8], startedBy: 7, ceoId: 8, payeeId: 8 })).toEqual([8]);
  });
  it('copes with no CEO or payee known', () => {
    expect(
      removalRecipients({ officerIds: [8], startedBy: 7, ceoId: undefined, payeeId: undefined })
    ).toEqual([8]);
  });
});

describe('payeeMayForce boundaries', () => {
  const start = 1_000 * H;
  it('is open when the payee never changed', () => {
    expect(payeeMayForce({ payeeChangedAt: undefined, removalStartedAt: start })).toBe(true);
  });
  it('is blocked when changed 47 hours before the start', () => {
    expect(payeeMayForce({ payeeChangedAt: start - 47 * H, removalStartedAt: start })).toBe(false);
  });
  it('is open when changed 49 hours before the start', () => {
    expect(payeeMayForce({ payeeChangedAt: start - 49 * H, removalStartedAt: start })).toBe(true);
  });
  it('is blocked when changed after the start', () => {
    expect(payeeMayForce({ payeeChangedAt: start + H, removalStartedAt: start })).toBe(false);
  });
  it('is blocked when changed at the very start', () => {
    expect(payeeMayForce({ payeeChangedAt: start, removalStartedAt: start })).toBe(false);
  });
});

describe('isPayeeActor', () => {
  it('lets a player payee in', () => {
    const payee = { kind: 'character', id: 5 } as const;
    expect(isPayeeActor({ payee, characterId: 5, payeeCorporationCeoId: undefined })).toBe(true);
    expect(isPayeeActor({ payee, characterId: 6, payeeCorporationCeoId: undefined })).toBe(false);
  });
  it('lets only the CEO in when the payee is a corporation', () => {
    const payee = { kind: 'corporation', id: 99 } as const;
    expect(isPayeeActor({ payee, characterId: 5, payeeCorporationCeoId: 5 })).toBe(true);
    expect(isPayeeActor({ payee, characterId: 6, payeeCorporationCeoId: 5 })).toBe(false);
  });
  it('lets nobody in without a payee', () => {
    expect(isPayeeActor({ payee: undefined, characterId: 5, payeeCorporationCeoId: 5 })).toBe(
      false
    );
  });
});

describe('withPayee', () => {
  it('stamps payeeChangedAt when a payee is first set', () => {
    expect(withPayee({}, { kind: 'character', id: 1 }, 50)).toEqual({
      payee: { kind: 'character', id: 1 },
      payeeChangedAt: 50,
    });
  });
  it('stamps it when the payee changes', () => {
    const rec = { payee: { kind: 'character', id: 1 } as const, payeeChangedAt: 10 };
    expect(withPayee(rec, { kind: 'corporation', id: 2 }, 50).payeeChangedAt).toBe(50);
  });
  it('keeps the old stamp when the same payee is saved again', () => {
    const rec = { payee: { kind: 'character', id: 1 } as const, payeeChangedAt: 10 };
    expect(withPayee(rec, { kind: 'character', id: 1 }, 50).payeeChangedAt).toBe(10);
  });
});
