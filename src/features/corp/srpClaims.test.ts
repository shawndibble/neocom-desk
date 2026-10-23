import { describe, expect, it } from 'vitest';
import { toClaimRow } from './srpClaims';

describe('toClaimRow', () => {
  it('reads the fields it needs and ignores the rest', () => {
    expect(
      toClaimRow('55', {
        killmailId: 55,
        state: 'approved',
        amount: 9,
        characterName: 'A',
        hullTypeId: 1,
        solarSystemId: 2,
        filedAt: 3,
        basis: { step: 'hull-fixed' },
        extra: true,
      })
    ).toEqual({
      killmailId: 55,
      state: 'approved',
      amount: 9,
      characterName: 'A',
      hullTypeId: 1,
      solarSystemId: 2,
      filedAt: 3,
    });
  });

  it('falls back to the doc id, and tolerates missing fields', () => {
    expect(toClaimRow('7', { state: 'pending', amount: null })).toMatchObject({
      killmailId: 7,
      amount: null,
      characterName: null,
      filedAt: 0,
    });
  });

  it('drops a doc with no known state or id', () => {
    expect(toClaimRow('7', { state: 'weird' })).toBeNull();
    expect(toClaimRow('abc', { state: 'paid' })).toBeNull();
  });
});
