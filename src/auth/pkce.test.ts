import { describe, it, expect } from 'vitest';
import { generateVerifier, challengeFromVerifier } from './pkce';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

describe('generateVerifier', () => {
  it('returns base64url string of 32 random bytes (43 chars, no padding)', () => {
    const v = generateVerifier();
    expect(v).toHaveLength(43); // ceil(32 * 4 / 3) unpadded
    expect(v).toMatch(BASE64URL_RE);
  });

  it('returns a different value each call', () => {
    expect(generateVerifier()).not.toBe(generateVerifier());
  });
});

describe('challengeFromVerifier', () => {
  it('matches RFC 7636 appendix B vector', async () => {
    await expect(
      challengeFromVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('produces base64url output without padding', async () => {
    const c = await challengeFromVerifier(generateVerifier());
    expect(c).toHaveLength(43);
    expect(c).toMatch(BASE64URL_RE);
  });
});
