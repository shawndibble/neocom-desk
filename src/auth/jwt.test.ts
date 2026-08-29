import { describe, it, expect } from 'vitest';
import { decodeAccessToken } from './jwt';

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  return `${header}.${b64url(JSON.stringify(payload))}.fakesig`;
}

const base = {
  sub: 'CHARACTER:EVE:2112625428',
  name: 'CCP Alpha',
  owner: '8PmzCeTKb4VFUDrHLc/AeZXDSWM=',
  exp: 1_900_000_000,
  scp: ['esi-skills.read_skills.v1', 'esi-wallet.read_character_wallet.v1']
};

describe('decodeAccessToken', () => {
  it('decodes character info from EVE JWT payload', () => {
    const t = decodeAccessToken(makeJwt(base));
    expect(t).toEqual({
      characterId: 2112625428,
      name: 'CCP Alpha',
      ownerHash: '8PmzCeTKb4VFUDrHLc/AeZXDSWM=',
      expiresAt: 1_900_000_000 * 1000,
      scopes: ['esi-skills.read_skills.v1', 'esi-wallet.read_character_wallet.v1']
    });
  });

  it('accepts scp as a single string', () => {
    expect(decodeAccessToken(makeJwt({ ...base, scp: 'esi-skills.read_skills.v1' })).scopes).toEqual([
      'esi-skills.read_skills.v1'
    ]);
  });

  it('accepts missing scp (no scopes requested)', () => {
    expect(decodeAccessToken(makeJwt({ ...base, scp: undefined })).scopes).toEqual([]);
  });

  it('throws on malformed sub', () => {
    expect(() => decodeAccessToken(makeJwt({ ...base, sub: 'not-a-character' }))).toThrow();
  });

  it('throws on non-JWT input', () => {
    expect(() => decodeAccessToken('garbage')).toThrow();
  });
});
