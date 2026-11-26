import { createPrivateKey, sign, type JsonWebKeyInput } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EXP_SECONDS } from '../mockSso';
import { EVE_CLIENT_ID, KEY_DIR } from './runEnv';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export interface TokenIdentity {
  characterId: number;
  name: string;
  ownerHash: string;
  scopes: readonly string[];
}

export function signedAccessToken(who: TokenIdentity): string {
  const { kid, jwk } = JSON.parse(readFileSync(`${KEY_DIR}/signing.json`, 'utf8')) as {
    kid: string;
    jwk: JsonWebKeyInput['key'];
  };
  const head = b64({ alg: 'ES256', typ: 'JWT', kid });
  const body = b64({
    sub: `CHARACTER:EVE:${who.characterId}`,
    name: who.name,
    owner: who.ownerHash,
    exp: EXP_SECONDS,
    iat: Math.floor(Date.now() / 1000) - 60,
    scp: [...who.scopes],
    iss: 'https://login.eveonline.com',
    aud: [EVE_CLIENT_ID, 'EVE Online'],
    azp: EVE_CLIENT_ID,
  });
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), {
    key: createPrivateKey({ key: jwk, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${head}.${body}.${signature}`;
}
