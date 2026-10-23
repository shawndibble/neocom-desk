import { describe, expect, it } from 'vitest';
import { toMemberClaim } from './srpMemberBackend';

const base = {
  killmailId: 7,
  killmailHash: 'a'.repeat(40),
  hullTypeId: 100,
  classId: 10,
  solarSystemId: 30000142,
  killedAt: 1000,
  filedAt: 2000,
  state: 'rejected',
  amount: 5_000_000,
  rejectionReason: 'No FC listed',
  refileCount: 1,
};

describe('toMemberClaim', () => {
  it('reads a claim document', () => {
    expect(toMemberClaim(base)).toMatchObject({
      killmailId: 7,
      state: 'rejected',
      amount: 5_000_000,
      rejectionReason: 'No FC listed',
      refileCount: 1,
    });
  });
  it('reads a missing amount, reason and count as null, null and 0', () => {
    const rest: Record<string, unknown> = { ...base, state: 'pending' };
    delete rest.amount;
    delete rest.rejectionReason;
    delete rest.refileCount;
    expect(toMemberClaim(rest)).toMatchObject({
      amount: null,
      rejectionReason: null,
      refileCount: 0,
    });
  });
  it('drops a document with an unknown state or no killmail id rather than guess', () => {
    expect(toMemberClaim({ ...base, state: 'weird' })).toBeNull();
    expect(toMemberClaim({ ...base, killmailId: undefined })).toBeNull();
  });
});
