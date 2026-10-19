// Pure crypto for the Alerts Grant refresh token (issue #3753, ADR 0020).
// AES-256-GCM; the characterId is bound as AAD so a blob copied onto another
// Character's doc fails to decrypt. No Firestore, no fetch, never logs. Error
// messages never carry a token or key.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Decode the `ALERTS_TOKEN_KEY` secret: base64 of exactly 32 bytes. */
export function parseAlertsKey(raw: string | undefined): Buffer {
  const key = Buffer.from((raw ?? '').trim(), 'base64');
  if (!raw || key.length !== KEY_BYTES) {
    throw new Error(`ALERTS_TOKEN_KEY must be base64 of exactly ${KEY_BYTES} bytes`);
  }
  return key;
}

/**
 * What a blob is bound to besides the Character: the Corp Tax Book sync grant
 * (ADR 0025) reuses this envelope under its own purpose, so a blob copied from
 * one collection into the other fails to decrypt.
 */
export type TokenPurpose = 'alertGrant' | 'corpSyncGrant';

function aad(characterId: number, purpose: TokenPurpose): Buffer {
  return Buffer.from(`${purpose}:${characterId}`);
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64. */
export function encryptRefreshToken(
  token: string,
  characterId: number,
  key: Buffer,
  purpose: TokenPurpose = 'alertGrant'
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(characterId, purpose));
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const b64 = (b: Buffer) => b.toString('base64');
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join('.');
}

export function decryptRefreshToken(
  blob: string,
  characterId: number,
  key: Buffer,
  purpose: TokenPurpose = 'alertGrant'
): string {
  const [version, iv, tag, ct, ...rest] = blob.split('.');
  if (version !== VERSION || !iv || !tag || !ct || rest.length > 0) {
    throw new Error('Malformed alert grant blob');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAAD(aad(characterId, purpose));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString(
      'utf8'
    );
  } catch {
    throw new Error('Alert grant blob failed to decrypt');
  }
}

/**
 * SSO may rotate the refresh token on every refresh. Returns the blob to write
 * back (in the same transaction that read the old one), or null when SSO
 * returned the token already stored.
 */
export function rotateStoredToken(
  currentBlob: string,
  returnedToken: string,
  characterId: number,
  key: Buffer,
  purpose: TokenPurpose = 'alertGrant'
): string | null {
  if (decryptRefreshToken(currentBlob, characterId, key, purpose) === returnedToken) return null;
  return encryptRefreshToken(returnedToken, characterId, key, purpose);
}
