import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
} from 'jose';
import {
  DEFAULT_AUDIENCE,
  DEFAULT_ISSUERS,
  uidForCharacter,
  verifyEveAccessToken,
  verifyOptionsFromEnv,
  type VerifyOptions,
} from './verifyEveToken.js';

const ISSUER = 'https://login.eveonline.com';
const CHARACTER_ID = 94832766;
const OWNER_HASH = 'aK1zLbmSepUgLYDkq2fnLZK0MnA=';

let privateKey: CryptoKey;
let jwks: { keys: JWK[] };
let opts: VerifyOptions;

interface TokenOverrides {
  sub?: string | null;
  owner?: string | null;
  issuer?: string;
  audience?: string | string[];
  expiresAt?: number;
  key?: CryptoKey;
}

async function makeToken(overrides: TokenOverrides = {}): Promise<string> {
  const jwt = new SignJWT({
    scp: ['esi-skills.read_skills.v1'],
    name: 'Test Pilot',
    ...(overrides.owner !== null ? { owner: overrides.owner ?? OWNER_HASH } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? ISSUER)
    // Real EVE tokens carry aud: [client_id, "EVE Online"].
    .setAudience(overrides.audience ?? ['0fcb066da13a4bae873716ccaa7ff674', 'EVE Online'])
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? Math.floor(Date.now() / 1000) + 1200);
  if (overrides.sub !== null) jwt.setSubject(overrides.sub ?? `CHARACTER:EVE:${CHARACTER_ID}`);
  return jwt.sign(overrides.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] };
  opts = { getKey: createLocalJWKSet(jwks), issuer: DEFAULT_ISSUERS, audience: DEFAULT_AUDIENCE };
});

describe('verifyEveAccessToken', () => {
  it('accepts a valid token and extracts characterId + ownerHash + name', async () => {
    const claims = await verifyEveAccessToken(await makeToken(), opts);
    expect(claims).toEqual({
      characterId: CHARACTER_ID,
      ownerHash: OWNER_HASH,
      name: 'Test Pilot',
    });
  });

  it('accepts the bare-hostname issuer variant documented by CCP', async () => {
    const token = await makeToken({ issuer: 'login.eveonline.com' });
    await expect(verifyEveAccessToken(token, opts)).resolves.toMatchObject({
      characterId: CHARACTER_ID,
    });
  });

  it('rejects a token signed by a different key', async () => {
    const rogue = await generateKeyPair('RS256');
    const token = await makeToken({ key: rogue.privateKey });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow();
  });

  it('rejects a wrong issuer', async () => {
    const token = await makeToken({ issuer: 'https://evil.example' });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow();
  });

  it('rejects when audience does not include "EVE Online"', async () => {
    const token = await makeToken({ audience: ['some-client-id'] });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await makeToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow();
  });

  it('rejects a non-character sub', async () => {
    const token = await makeToken({ sub: 'USER:EVE:123' });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow(/sub/i);
  });

  it('rejects a missing owner claim', async () => {
    const token = await makeToken({ owner: null });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow(/owner/i);
  });

  it('rejects garbage input', async () => {
    await expect(verifyEveAccessToken('not-a-jwt', opts)).rejects.toThrow();
  });
});

describe('verifyOptionsFromEnv', () => {
  let server: Server;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(jwks));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    process.env.EVE_JWKS_URL = `http://127.0.0.1:${port}/oauth/jwks`;
  });

  afterAll(async () => {
    delete process.env.EVE_JWKS_URL;
    server.close();
    await once(server, 'close');
  });

  it('verifies end-to-end against a JWKS endpoint injected via env', async () => {
    const claims = await verifyEveAccessToken(await makeToken(), verifyOptionsFromEnv());
    expect(claims.characterId).toBe(CHARACTER_ID);
    expect(claims.ownerHash).toBe(OWNER_HASH);
  });

  it('still rejects bad signatures when using the remote key set', async () => {
    const rogue = await generateKeyPair('RS256');
    const token = await makeToken({ key: rogue.privateKey });
    await expect(verifyEveAccessToken(token, verifyOptionsFromEnv())).rejects.toThrow();
  });
});

describe('uidForCharacter', () => {
  it('formats the shared cross-device uid', () => {
    expect(uidForCharacter(94832766)).toBe('char:94832766');
  });
});
