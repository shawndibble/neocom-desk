import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptRefreshToken,
  encryptRefreshToken,
  parseAlertsKey,
  rotateStoredToken,
} from './alertGrantCrypto.js';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');
const TOKEN = 'refresh-token-abc123';

describe('parseAlertsKey', () => {
  it('accepts a base64 32-byte key', () => {
    expect(parseAlertsKey(KEY)).toHaveLength(32);
  });
  it('rejects a missing or wrong-length key without echoing it', () => {
    expect(() => parseAlertsKey(undefined)).toThrow(/ALERTS_TOKEN_KEY/);
    const short = Buffer.from('short').toString('base64');
    expect(() => parseAlertsKey(short)).toThrow(/32 bytes/);
    try {
      parseAlertsKey(short);
    } catch (e) {
      expect(String(e)).not.toContain(short);
    }
  });
});

describe('encryptRefreshToken / decryptRefreshToken', () => {
  it('round-trips', () => {
    const blob = encryptRefreshToken(TOKEN, 1, parseAlertsKey(KEY));
    expect(decryptRefreshToken(blob, 1, parseAlertsKey(KEY))).toBe(TOKEN);
  });
  it('never contains the plaintext and differs per call (random IV)', () => {
    const a = encryptRefreshToken(TOKEN, 1, parseAlertsKey(KEY));
    const b = encryptRefreshToken(TOKEN, 1, parseAlertsKey(KEY));
    expect(a).not.toContain(TOKEN);
    expect(a).not.toBe(b);
  });
  it('fails with the wrong key', () => {
    const blob = encryptRefreshToken(TOKEN, 1, parseAlertsKey(KEY));
    expect(() => decryptRefreshToken(blob, 1, parseAlertsKey(OTHER_KEY))).toThrow();
  });
  it('fails when the ciphertext is tampered', () => {
    const blob = encryptRefreshToken(TOKEN, 1, parseAlertsKey(KEY));
    const parts = blob.split('.');
    const ct = Buffer.from(parts[3]!, 'base64');
    ct[0] = ct[0]! ^ 1;
    parts[3] = ct.toString('base64');
    expect(() => decryptRefreshToken(parts.join('.'), 1, parseAlertsKey(KEY))).toThrow();
  });
  it('fails when the blob is moved to another character', () => {
    const blob = encryptRefreshToken(TOKEN, 1, parseAlertsKey(KEY));
    expect(() => decryptRefreshToken(blob, 2, parseAlertsKey(KEY))).toThrow();
  });
  it('rejects a malformed blob', () => {
    expect(() => decryptRefreshToken('nope', 1, parseAlertsKey(KEY))).toThrow();
  });
  it('error messages never contain the token', () => {
    const blob = encryptRefreshToken(TOKEN, 1, parseAlertsKey(KEY));
    try {
      decryptRefreshToken(blob, 2, parseAlertsKey(KEY));
    } catch (e) {
      expect(String(e)).not.toContain(TOKEN);
    }
  });
});

describe('rotateStoredToken', () => {
  const key = parseAlertsKey(KEY);
  it('returns null when SSO returned the same token (nothing to write back)', () => {
    const blob = encryptRefreshToken(TOKEN, 1, key);
    expect(rotateStoredToken(blob, TOKEN, 1, key)).toBeNull();
  });
  it('returns a fresh blob for a rotated token that decrypts to the new one', () => {
    const blob = encryptRefreshToken(TOKEN, 1, key);
    const next = rotateStoredToken(blob, 'rotated-token', 1, key);
    expect(next).not.toBeNull();
    expect(decryptRefreshToken(next!, 1, key)).toBe('rotated-token');
  });
});

describe('token purpose', () => {
  it('binds a blob to its collection: an Alerts blob does not decrypt as a Corp sync grant, nor the reverse', () => {
    const key = parseAlertsKey(KEY);
    const alerts = encryptRefreshToken(TOKEN, 7, key);
    const corp = encryptRefreshToken(TOKEN, 7, key, 'corpSyncGrant');
    expect(decryptRefreshToken(corp, 7, key, 'corpSyncGrant')).toBe(TOKEN);
    expect(decryptRefreshToken(alerts, 7, key)).toBe(TOKEN);
    expect(() => decryptRefreshToken(alerts, 7, key, 'corpSyncGrant')).toThrow();
    expect(() => decryptRefreshToken(corp, 7, key)).toThrow();
  });
  it('rotates under the same purpose', () => {
    const key = parseAlertsKey(KEY);
    const blob = encryptRefreshToken(TOKEN, 7, key, 'corpSyncGrant');
    expect(rotateStoredToken(blob, TOKEN, 7, key, 'corpSyncGrant')).toBeNull();
    const rotated = rotateStoredToken(blob, 'next', 7, key, 'corpSyncGrant')!;
    expect(decryptRefreshToken(rotated, 7, key, 'corpSyncGrant')).toBe('next');
  });
});
