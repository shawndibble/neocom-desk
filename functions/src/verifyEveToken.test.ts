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
const CLIENT_ID = '0fcb066da13a4bae873716ccaa7ff674';
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
  azp?: string;
  expiresAt?: number;
  key?: CryptoKey;
}

async function makeToken(overrides: TokenOverrides = {}): Promise<string> {
  const jwt = new SignJWT({
    scp: ['esi-skills.read_skills.v1'],
    name: 'Test Pilot',
    ...(overrides.owner !== null ? { owner: overrides.owner ?? OWNER_HASH } : {}),
    ...(overrides.azp !== undefined ? { azp: overrides.azp } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? ISSUER)
    // Real EVE tokens carry aud: [client_id, "EVE Online"].
    .setAudience(overrides.audience ?? [CLIENT_ID, 'EVE Online'])
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
  opts = {
    getKey: createLocalJWKSet(jwks),
    issuer: DEFAULT_ISSUERS,
    audience: DEFAULT_AUDIENCE,
    clientIds: [CLIENT_ID],
  };
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

  it('rejects a token minted for a different EVE application', async () => {
    // Valid EVE token ("EVE Online" audience present), but issued to some
    // OTHER app's client_id — must not mint a Firebase credential here.
    const token = await makeToken({ audience: ['other-apps-client-id', 'EVE Online'] });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow(/client/i);
  });

  it('accepts a token whose azp matches when aud carries only "EVE Online"', async () => {
    const token = await makeToken({ audience: 'EVE Online', azp: CLIENT_ID });
    await expect(verifyEveAccessToken(token, opts)).resolves.toMatchObject({
      characterId: CHARACTER_ID,
    });
  });

  it('rejects when neither aud nor azp carries the configured client_id', async () => {
    const token = await makeToken({ audience: 'EVE Online', azp: 'other-apps-client-id' });
    await expect(verifyEveAccessToken(token, opts)).rejects.toThrow(/client/i);
  });

  it('accepts a token bound to any client_id in a multi-app allow list', async () => {
    // Dev and prod builds register separate EVE applications (different
    // callback URLs), so one deployed function must accept both client_ids.
    const otherAppOpts: VerifyOptions = { ...opts, clientIds: ['dev-app-id', CLIENT_ID] };
    const token = await makeToken({ audience: [CLIENT_ID, 'EVE Online'] });
    await expect(verifyEveAccessToken(token, otherAppOpts)).resolves.toMatchObject({
      characterId: CHARACTER_ID,
    });
  });

  it('rejects a token from an app not in the multi-app allow list', async () => {
    const multiAppOpts: VerifyOptions = { ...opts, clientIds: ['dev-app-id', 'prod-app-id'] };
    const token = await makeToken({ audience: [CLIENT_ID, 'EVE Online'] });
    await expect(verifyEveAccessToken(token, multiAppOpts)).rejects.toThrow(/client/i);
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
    process.env.EVE_CLIENT_ID = CLIENT_ID;
  });

  afterAll(async () => {
    delete process.env.EVE_JWKS_URL;
    delete process.env.EVE_CLIENT_ID;
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

  it('rejects tokens minted for another app when using env-derived options', async () => {
    const token = await makeToken({ audience: ['other-apps-client-id', 'EVE Online'] });
    await expect(verifyEveAccessToken(token, verifyOptionsFromEnv())).rejects.toThrow(/client/i);
  });

  it('accepts either app when EVE_CLIENT_ID lists dev and prod client_ids', async () => {
    const saved = process.env.EVE_CLIENT_ID;
    // Whitespace around commas must be tolerated — it's a hand-edited env file.
    process.env.EVE_CLIENT_ID = ` ${CLIENT_ID} , prod-app-id `;
    try {
      const devToken = await makeToken({ audience: [CLIENT_ID, 'EVE Online'] });
      await expect(verifyEveAccessToken(devToken, verifyOptionsFromEnv())).resolves.toMatchObject(
        { characterId: CHARACTER_ID }
      );
      const prodToken = await makeToken({ audience: ['prod-app-id', 'EVE Online'] });
      await expect(
        verifyEveAccessToken(prodToken, verifyOptionsFromEnv())
      ).resolves.toMatchObject({ characterId: CHARACTER_ID });
      const otherToken = await makeToken({ audience: ['some-other-app', 'EVE Online'] });
      await expect(verifyEveAccessToken(otherToken, verifyOptionsFromEnv())).rejects.toThrow(
        /client/i
      );
    } finally {
      process.env.EVE_CLIENT_ID = saved;
    }
  });

  it('fails closed: throws at construction when EVE_CLIENT_ID is not set', () => {
    const saved = process.env.EVE_CLIENT_ID;
    delete process.env.EVE_CLIENT_ID;
    try {
      expect(() => verifyOptionsFromEnv()).toThrow(/EVE_CLIENT_ID/);
    } finally {
      process.env.EVE_CLIENT_ID = saved;
    }
  });
});

describe('uidForCharacter', () => {
  it('formats the shared cross-device uid', () => {
    expect(uidForCharacter(94832766)).toBe('char:94832766');
  });
});
