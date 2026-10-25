import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ALERTS_LOCATION_SCOPE,
  ALERTS_SCOPE,
  AlertGrantError,
  grantCoversNearby,
  deleteAlertGrant,
  parseSaveAlertGrantInput,
  refreshAtSso,
  revokeAtSso,
  saveAlertGrant,
  type AlertGrantDeps,
  type AlertGrantDoc,
} from './alertGrant.js';
import { decryptRefreshToken, parseAlertsKey } from './alertGrantCrypto.js';
import type { EveTokenClaims } from './verifyEveToken.js';

const KEY = parseAlertsKey(randomBytes(32).toString('base64'));
const REFRESH = 'refresh-secret-xyz';

function claims(over: Partial<EveTokenClaims> = {}): EveTokenClaims {
  return {
    characterId: 42,
    ownerHash: 'h',
    name: 'Pilot',
    scopes: [ALERTS_SCOPE],
    clientId: 'client-1',
    ...over,
  };
}

function makeDeps(over: Partial<AlertGrantDeps> = {}) {
  const docs = new Map<number, AlertGrantDoc>();
  const logged: unknown[] = [];
  const deps: AlertGrantDeps = {
    store: {
      get: async (id) => docs.get(id) ?? null,
      getMany: async (ids) => new Map(ids.map((id) => [id, docs.get(id) ?? null])),
      set: async (id, doc) => void docs.set(id, doc),
      delete: async (id) => void docs.delete(id),
    },
    key: () => KEY,
    verify: async () => claims(),
    // SSO rotates: the refreshed token differs from the one supplied.
    refresh: vi.fn(async (_c: string, t: string) => ({
      accessToken: 'fresh-access',
      refreshToken: `${t}-rotated`,
    })),
    revoke: vi.fn(async () => undefined),
    now: () => 1_000,
    log: (...a) => void logged.push(a),
    ...over,
  };
  return { deps, docs, logged };
}

describe('parseSaveAlertGrantInput', () => {
  it('requires both tokens as non-empty strings', () => {
    expect(parseSaveAlertGrantInput({ accessToken: 'a', refreshToken: 'r' })).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(() => parseSaveAlertGrantInput({ accessToken: 'a' })).toThrow(AlertGrantError);
    expect(() => parseSaveAlertGrantInput(null)).toThrow(AlertGrantError);
    expect(() => parseSaveAlertGrantInput({ accessToken: '', refreshToken: 'r' })).toThrow(
      AlertGrantError
    );
  });
});

describe('saveAlertGrant', () => {
  it('stores an encrypted token, never the plaintext, and returns no token', async () => {
    const { deps, docs } = makeDeps();
    const res = await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    expect(res).toEqual({ characterId: 42, enabledAt: 1_000, nearby: false });
    const doc = docs.get(42)!;
    expect(JSON.stringify(doc)).not.toContain(REFRESH);
    expect(decryptRefreshToken(doc.encryptedRefreshToken, 42, KEY)).toBe(`${REFRESH}-rotated`);
    expect(doc).toMatchObject({
      enabledAt: 1_000,
      highWaterId: null,
      etag: null,
      seenTypes: [],
      status: 'active',
      clientId: 'client-1',
      scopes: [ALERTS_SCOPE],
    });
    expect(JSON.stringify(res)).not.toContain(REFRESH);
  });

  it('accepts the location scope beside notifications and says the grant covers nearby alerts', async () => {
    const scopes = [ALERTS_LOCATION_SCOPE, ALERTS_SCOPE];
    const { deps, docs } = makeDeps({ verify: async () => claims({ scopes }) });
    const res = await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    expect(res).toEqual({ characterId: 42, enabledAt: 1_000, nearby: true });
    expect(docs.get(42)?.scopes).toEqual([ALERTS_SCOPE, ALERTS_LOCATION_SCOPE].sort());
    expect(grantCoversNearby(docs.get(42)!)).toBe(true);
  });

  it('rejects a token that fails verification, storing nothing', async () => {
    const { deps, docs } = makeDeps({
      verify: async () => {
        throw new Error('bad sig');
      },
    });
    await expect(
      saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(docs.size).toBe(0);
  });

  it.each([
    ['a wrong scope', ['esi-skills.read_skills.v1']],
    ['an extra scope', [ALERTS_SCOPE, 'esi-skills.read_skills.v1']],
    ['no scope', []],
    ['location alone', [ALERTS_LOCATION_SCOPE]],
    [
      'location with another scope',
      [ALERTS_SCOPE, ALERTS_LOCATION_SCOPE, 'esi-skills.read_skills.v1'],
    ],
    ['a repeated scope', [ALERTS_SCOPE, ALERTS_SCOPE]],
  ])('rejects %s', async (_n, scopes) => {
    const { deps, docs } = makeDeps({ verify: async () => claims({ scopes }) });
    await expect(
      saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(docs.size).toBe(0);
  });

  it('never logs the tokens when verification fails', async () => {
    const { deps, logged } = makeDeps({
      verify: async () => {
        throw new Error('bad');
      },
    });
    await saveAlertGrant(deps, { accessToken: 'ACCESS-SECRET', refreshToken: REFRESH }).catch(
      () => undefined
    );
    expect(JSON.stringify(logged)).not.toMatch(/ACCESS-SECRET|refresh-secret/);
  });

  it('re-saving an active grant swaps the token, keeps progress, revokes the old token', async () => {
    const { deps, docs } = makeDeps();
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    docs.set(42, { ...docs.get(42)!, highWaterId: 99, etag: 'e', seenTypes: ['T'] });
    await saveAlertGrant(
      { ...deps, now: () => 5_000 },
      { accessToken: 'a', refreshToken: 'second-token' }
    );
    const doc = docs.get(42)!;
    expect(decryptRefreshToken(doc.encryptedRefreshToken, 42, KEY)).toBe('second-token-rotated');
    expect(doc).toMatchObject({ enabledAt: 1_000, highWaterId: 99, etag: 'e', seenTypes: ['T'] });
    expect(deps.revoke).toHaveBeenCalledWith('client-1', `${REFRESH}-rotated`);
  });

  it('re-saving the token already stored does not revoke the live token', async () => {
    const { deps } = makeDeps({
      refresh: vi.fn(async (_c: string, t: string) => ({ accessToken: 'fresh', refreshToken: t })),
    });
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    expect(deps.revoke).not.toHaveBeenCalled();
  });

  it('rejects a refresh token SSO will not redeem, storing nothing', async () => {
    const { deps, docs } = makeDeps({
      refresh: vi.fn(async () => {
        throw new Error('SSO refresh failed (400)');
      }),
    });
    await expect(
      saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(docs.size).toBe(0);
  });

  it('rejects a refresh token that belongs to another Character', async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(claims())
      .mockResolvedValueOnce(claims({ characterId: 77 }));
    const { deps, docs } = makeDeps({ verify });
    await expect(
      saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(docs.size).toBe(0);
  });

  it('re-saving a revoked grant starts fresh', async () => {
    const { deps, docs } = makeDeps();
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    docs.set(42, { ...docs.get(42)!, status: 'revoked', highWaterId: 99 });
    await saveAlertGrant({ ...deps, now: () => 7_000 }, { accessToken: 'a', refreshToken: 'n' });
    expect(docs.get(42)).toMatchObject({ status: 'active', enabledAt: 7_000, highWaterId: null });
  });
});

describe('deleteAlertGrant', () => {
  it('save then delete round-trips: doc gone, token revoked at SSO', async () => {
    const { deps, docs } = makeDeps();
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    const res = await deleteAlertGrant(deps, 42);
    expect(res).toEqual({ deleted: true, revoked: true });
    expect(docs.size).toBe(0);
    expect(deps.revoke).toHaveBeenCalledWith('client-1', `${REFRESH}-rotated`);
  });

  it('is a no-op when no grant exists', async () => {
    const { deps } = makeDeps();
    expect(await deleteAlertGrant(deps, 42)).toEqual({ deleted: false, revoked: false });
    expect(deps.revoke).not.toHaveBeenCalled();
  });

  it('still deletes the doc when SSO revoke fails, without logging the token', async () => {
    const { deps, docs, logged } = makeDeps({
      revoke: vi.fn(async () => {
        throw new Error(`revoke failed for ${REFRESH}`.replace(REFRESH, 'x'));
      }),
    });
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    const res = await deleteAlertGrant(deps, 42);
    expect(res).toEqual({ deleted: true, revoked: false });
    expect(docs.size).toBe(0);
    expect(JSON.stringify(logged)).not.toContain(REFRESH);
  });

  it('still deletes the doc when the stored blob cannot be decrypted', async () => {
    const { deps, docs } = makeDeps();
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    docs.set(42, { ...docs.get(42)!, encryptedRefreshToken: 'garbage' });
    expect(await deleteAlertGrant(deps, 42)).toEqual({ deleted: true, revoked: false });
    expect(docs.size).toBe(0);
  });
});

describe('revokeAtSso', () => {
  it('posts the refresh token and client id to /v2/oauth/revoke', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await revokeAtSso('client-1', REFRESH, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://login.eveonline.com/v2/oauth/revoke');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('token')).toBe(REFRESH);
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('client-1');
  });

  it('throws a token-free error on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => new Response('no', { status: 400 }));
    await expect(
      revokeAtSso('client-1', REFRESH, fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/400/);
    await revokeAtSso('c', REFRESH, fetchMock as unknown as typeof fetch).catch((e) =>
      expect(String(e)).not.toContain(REFRESH)
    );
  });
});

describe('refreshAtSso', () => {
  it('posts a refresh_token grant and returns both tokens', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: 'acc', refresh_token: 'ref2' }, { status: 200 })
    );
    const out = await refreshAtSso('client-1', REFRESH, fetchMock as unknown as typeof fetch);
    expect(out).toEqual({ accessToken: 'acc', refreshToken: 'ref2' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://login.eveonline.com/v2/oauth/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('client-1');
  });

  it('throws a token-free error on failure or a malformed body', async () => {
    const bad = vi.fn(async () => new Response('x', { status: 400 }));
    await expect(refreshAtSso('c', REFRESH, bad as unknown as typeof fetch)).rejects.toThrow(/400/);
    const odd = vi.fn(async () => Response.json({}, { status: 200 }));
    await expect(refreshAtSso('c', REFRESH, odd as unknown as typeof fetch)).rejects.toThrow(
      /malformed/
    );
  });
});

describe('grantCoversNearby', () => {
  it('is false for a grant saved before the location scope existed (no scopes field)', () => {
    expect(grantCoversNearby({ scopes: undefined })).toBe(false);
    expect(grantCoversNearby({ scopes: [ALERTS_SCOPE] })).toBe(false);
    expect(grantCoversNearby({ scopes: [ALERTS_SCOPE, ALERTS_LOCATION_SCOPE] })).toBe(true);
  });
});

describe('deleteAlertGrant: nearby state (ADR 0027)', () => {
  it('drops the Character from its devices’ nearby state, and a failure there still deletes and revokes', async () => {
    const forgetNearby = vi.fn(async () => {
      throw new Error('offline');
    });
    const { deps, docs } = makeDeps({ forgetNearby });
    await saveAlertGrant(deps, { accessToken: 'a', refreshToken: REFRESH });
    expect(await deleteAlertGrant(deps, 42)).toEqual({ deleted: true, revoked: true });
    expect(forgetNearby).toHaveBeenCalledWith(42);
    expect(docs.size).toBe(0);
  });
});
