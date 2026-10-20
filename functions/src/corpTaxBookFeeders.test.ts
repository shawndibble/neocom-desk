import { describe, expect, it } from 'vitest';
import {
  hashInviteCode,
  parseAcceptFeederInviteInput,
  parseCreateFeederInviteInput,
  parseRevokeFeederInviteInput,
} from './corpTaxBookFeeders.js';

describe('feeder invite parsers', () => {
  it('reads an optional offered owner rate', () => {
    expect(parseCreateFeederInviteInput({ corporationId: 5, accessToken: 't' })).toMatchObject({
      corporationId: 5,
    });
    expect(
      parseCreateFeederInviteInput({ corporationId: 5, accessToken: 't', offeredOwnerRatePct: 7.5 })
        .offeredOwnerRatePct
    ).toBe(7.5);
  });

  it.each([-1, 101, Number.NaN, '5'])('rejects an offered rate of %s', (rate) => {
    expect(() =>
      parseCreateFeederInviteInput({ corporationId: 5, offeredOwnerRatePct: rate })
    ).toThrow();
  });

  it('only accepts a hex hash as an invite id', () => {
    const inviteId = hashInviteCode('abc');
    expect(parseRevokeFeederInviteInput({ corporationId: 5, inviteId }).inviteId).toBe(inviteId);
    expect(() => parseRevokeFeederInviteInput({ corporationId: 5, inviteId: 'nope' })).toThrow();
  });

  it('needs a code and an access token to accept', () => {
    expect(parseAcceptFeederInviteInput({ code: 'c', accessToken: 't' })).toEqual({
      code: 'c',
      accessToken: 't',
    });
    expect(() => parseAcceptFeederInviteInput({ code: 'c' })).toThrow();
  });

  it('hashes a code to a stable 64-char id', () => {
    expect(hashInviteCode('abc')).toBe(hashInviteCode('abc'));
    expect(hashInviteCode('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
