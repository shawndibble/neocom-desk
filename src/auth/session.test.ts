import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  startLogin,
  completeLogin,
  getValidAccessToken,
  recordCharacterCorporation,
} from './session';
import { challengeFromVerifier } from './pkce';
import { db, type TokenRecord } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID, corpCacheKey, loadWithCache } from '@/esi/cache';
import {
  CACHE_PURGE_PENDING_PREFIX,
  clearCachePurgePending,
  isCachePurgePending,
} from '@/esi/cachePurge';

const CHAR_ID = 2112625428;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeAccessJwt(
  expSeconds: number,
  overrides: { scp?: string[]; owner?: string } = {}
): string {
  const payload = {
    sub: `CHARACTER:EVE:${CHAR_ID}`,
    name: 'CCP Alpha',
    owner: overrides.owner ?? 'owner-hash-1',
    exp: expSeconds,
    scp: overrides.scp ?? ['esi-skills.read_skills.v1'],
  };
  return `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

const cfg = { clientId: 'client-abc', redirectUri: 'https://app.example/neocom-desk/callback' };

let tokenRequests: URLSearchParams[] = [];

const server = setupServer(
  http.post('https://login.eveonline.com/v2/oauth/token', async ({ request }) => {
    const body = new URLSearchParams(await request.text());
    tokenRequests.push(body);
    if (body.get('grant_type') === 'authorization_code' && body.get('code') === 'good-code') {
      return HttpResponse.json({
        access_token: makeAccessJwt(Math.floor(Date.now() / 1000) + 1200),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'refresh-initial',
      });
    }
    if (body.get('grant_type') === 'refresh_token' && body.get('refresh_token') === 'refresh-old') {
      return HttpResponse.json({
        access_token: makeAccessJwt(Math.floor(Date.now() / 1000) + 1200),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'refresh-rotated',
      });
    }
    return HttpResponse.json(
      { error: 'invalid_grant', error_description: 'nope' },
      { status: 400 }
    );
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(async () => {
  sessionStorage.clear();
  tokenRequests = [];
  await db.characters.clear();
  await db.tokens.clear();
  await db.esiCache.clear();
  await db.settings.clear();
  await clearCachePurgePending(CHAR_ID);
});
afterEach(() => server.resetHandlers());

describe('startLogin', () => {
  it('stores verifier and state, returns authorize URL whose challenge matches verifier', async () => {
    const url = new URL(await startLogin(['esi-skills.read_skills.v1'], cfg));
    expect(url.origin + url.pathname).toBe('https://login.eveonline.com/v2/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('redirect_uri')).toBe(cfg.redirectUri);
    expect(url.searchParams.get('scope')).toBe('esi-skills.read_skills.v1');

    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();

    // verifier + state stashed for the callback leg
    const storedState = sessionStorage.getItem('neocom.sso.state');
    const storedVerifier = sessionStorage.getItem('neocom.sso.verifier');
    expect(storedState).toBe(state);
    expect(storedVerifier).toBeTruthy();
    await expect(challengeFromVerifier(storedVerifier!)).resolves.toBe(
      url.searchParams.get('code_challenge')
    );
  });
});

describe('startLogin env defaults', () => {
  it('falls back to VITE_EVE_CLIENT_ID and BASE_URL-based redirect when config omitted', async () => {
    vi.stubEnv('VITE_EVE_CLIENT_ID', 'env-client');
    try {
      const url = new URL(await startLogin(['esi-skills.read_skills.v1']));
      expect(url.searchParams.get('client_id')).toBe('env-client');
      expect(url.searchParams.get('redirect_uri')).toBe(
        `${location.origin}${import.meta.env.BASE_URL}callback`
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('completeLogin', () => {
  it('happy path: validates state, exchanges code, persists character + token', async () => {
    const url = new URL(await startLogin(['esi-skills.read_skills.v1'], cfg));
    const state = url.searchParams.get('state')!;
    const verifier = sessionStorage.getItem('neocom.sso.verifier')!;

    const character = await completeLogin({ code: 'good-code', state }, cfg);
    expect(character.characterId).toBe(CHAR_ID);
    expect(character.name).toBe('CCP Alpha');
    expect(character.ownerHash).toBe('owner-hash-1');

    const stored = await db.characters.get(CHAR_ID);
    expect(stored?.name).toBe('CCP Alpha');

    const token = await db.tokens.get(CHAR_ID);
    expect(token?.refreshToken).toBe('refresh-initial');
    expect(token?.scopes).toEqual(['esi-skills.read_skills.v1']);
    expect(token?.expiresAt).toBeGreaterThan(Date.now());

    // exchange used the stored verifier, and the one-shot stash was cleared
    expect(tokenRequests[0].get('code_verifier')).toBe(verifier);
    expect(sessionStorage.getItem('neocom.sso.verifier')).toBeNull();
    expect(sessionStorage.getItem('neocom.sso.state')).toBeNull();
  });

  it('rejects state mismatch without calling the token endpoint', async () => {
    await startLogin(['esi-skills.read_skills.v1'], cfg);
    await expect(completeLogin({ code: 'good-code', state: 'evil-state' }, cfg)).rejects.toThrow(
      /state/i
    );
    expect(tokenRequests).toHaveLength(0);
    expect(await db.tokens.count()).toBe(0);
  });

  it('rejects when no login is in progress', async () => {
    await expect(completeLogin({ code: 'good-code', state: 'x' }, cfg)).rejects.toThrow();
  });
});

describe('getValidAccessToken', () => {
  it('returns cached token when more than 60s from expiry', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'cached-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 120_000,
      scopes: [],
    });
    await expect(getValidAccessToken(CHAR_ID, cfg)).resolves.toBe('cached-access');
    expect(tokenRequests).toHaveLength(0);
  });

  it('refreshes near-expiry token and persists rotated refresh token', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 30_000, // < 60s buffer
      scopes: ['esi-skills.read_skills.v1'],
    });
    const access = await getValidAccessToken(CHAR_ID, cfg);
    expect(access).not.toBe('stale-access');

    const stored = await db.tokens.get(CHAR_ID);
    expect(stored?.refreshToken).toBe('refresh-rotated'); // newest ALWAYS persisted
    expect(stored?.accessToken).toBe(access);
    expect(stored?.expiresAt).toBeGreaterThan(Date.now() + 60_000);
  });

  it('single-flights concurrent refreshes: token endpoint hit exactly once', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 30_000,
      scopes: [],
    });
    const [a, b] = await Promise.all([
      getValidAccessToken(CHAR_ID, cfg),
      getValidAccessToken(CHAR_ID, cfg),
    ]);
    expect(a).toBe(b);
    expect(tokenRequests).toHaveLength(1); // second concurrent call reuses in-flight refresh
    expect((await db.tokens.get(CHAR_ID))?.refreshToken).toBe('refresh-rotated');
  });

  it('allows a fresh refresh after the in-flight one settles', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 30_000,
      scopes: [],
    });
    await getValidAccessToken(CHAR_ID, cfg);
    // force stale again with a refreshable token
    await db.tokens.update(CHAR_ID, {
      expiresAt: Date.now() + 30_000,
      refreshToken: 'refresh-old',
    });
    await getValidAccessToken(CHAR_ID, cfg);
    expect(tokenRequests).toHaveLength(2); // map entry cleared on settle
  });

  it('throws when no token exists for the character', async () => {
    await expect(getValidAccessToken(999, cfg)).rejects.toThrow();
  });

  it('regression: token record is read inside the single flight, never before it', async () => {
    // The old code read db.tokens BEFORE checking for an in-flight refresh: a
    // caller could snapshot the record, lose the microtask race to a completing
    // refresh, and then re-send the rotated (burned) refresh token. With the
    // read inside the flight, concurrent callers perform exactly ONE record
    // read (plus one inside persistTokens), always post-rotation.
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 30_000,
      scopes: [],
    });
    const getSpy = vi.spyOn(db.tokens, 'get');
    const [a, b, c] = await Promise.all([
      getValidAccessToken(CHAR_ID, cfg),
      getValidAccessToken(CHAR_ID, cfg),
      getValidAccessToken(CHAR_ID, cfg),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(tokenRequests).toHaveLength(1);
    // 1 read inside the shared flight + 1 read by persistTokens.
    expect(getSpy).toHaveBeenCalledTimes(2);
    getSpy.mockRestore();
  });

  it('keeps the stored refresh token when the refresh response omits refresh_token', async () => {
    server.use(
      http.post('https://login.eveonline.com/v2/oauth/token', async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        tokenRequests.push(body);
        if (
          body.get('grant_type') === 'refresh_token' &&
          body.get('refresh_token') === 'refresh-keeper'
        ) {
          // No refresh_token field: SSO chose not to rotate.
          return HttpResponse.json({
            access_token: makeAccessJwt(Math.floor(Date.now() / 1000) + 1200),
            token_type: 'Bearer',
            expires_in: 1199,
          });
        }
        return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 });
      })
    );
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-keeper',
      expiresAt: Date.now() + 30_000,
      scopes: [],
    });
    const access = await getValidAccessToken(CHAR_ID, cfg);
    const stored = await db.tokens.get(CHAR_ID);
    expect(stored?.accessToken).toBe(access);
    expect(stored?.refreshToken).toBe('refresh-keeper'); // NOT clobbered to undefined
  });
});

// ---------------------------------------------------------------------------
// Consent changes: a narrower scope grant or a change of owner invalidates
// every cached ESI response for that character (privacy — see
// src/esi/cachePurge.ts). persistTokens is the single funnel for both the
// login and the refresh path, so the check lives there.
// ---------------------------------------------------------------------------

const SKILLS = 'esi-skills.read_skills.v1';
const MAIL = 'esi-mail.read_mail.v1';
const WALLET = 'esi-wallet.read_character_wallet.v1';
const OTHER_CHAR_ID = 90000001;

const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';

/** Make the token endpoint answer every grant with a JWT carrying these claims. */
function respondWith(claims: { scp?: string[]; owner?: string }): void {
  server.use(
    http.post(TOKEN_URL, async ({ request }) => {
      tokenRequests.push(new URLSearchParams(await request.text()));
      return HttpResponse.json({
        access_token: makeAccessJwt(Math.floor(Date.now() / 1000) + 1200, claims),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'refresh-rotated',
      });
    })
  );
}

async function seedCache(characterId: number, key: string): Promise<void> {
  await db.esiCache.put({ characterId, key, value: 'secret', fetchedAt: 1 });
}

async function cachedKeys(characterId: number): Promise<string[]> {
  const rows = await db.esiCache.toArray();
  return rows
    .filter((r) => r.characterId === characterId)
    .map((r) => r.key)
    .sort();
}

/** Prior state of a character that already logged in once. */
async function seedPriorLogin(options: {
  scopes?: string[];
  ownerHash?: string;
  omitScopes?: boolean;
}): Promise<void> {
  await db.characters.put({
    characterId: CHAR_ID,
    name: 'CCP Alpha',
    ownerHash: options.ownerHash ?? 'owner-hash-1',
    addedAt: 1,
  });
  const record = {
    characterId: CHAR_ID,
    accessToken: 'stale-access',
    refreshToken: 'refresh-old',
    expiresAt: Date.now() + 30_000, // inside the 60s buffer: forces a refresh
    ...(options.omitScopes ? {} : { scopes: options.scopes ?? [SKILLS, MAIL, WALLET] }),
  };
  // A record written before `scopes` existed genuinely has no such field.
  await db.tokens.put(record as TokenRecord);
}

/**
 * Drive a fresh interactive login whose JWT carries `claims`.
 *
 * `requested` is what the authorize URL asked SSO for, and it is now load
 * bearing rather than decoration: the login path judges revocation as
 * *requested* vs granted (issue #295). It defaults to the widest set these
 * tests use, which is what a re-auth from a character context sends —
 * `union(SCOPES, that character's grant)` — so a scope missing from the JWT
 * is a genuine denial unless a test says otherwise.
 */
async function login(
  claims: { scp?: string[]; owner?: string },
  requested: string[] = [SKILLS, MAIL, WALLET]
): Promise<void> {
  respondWith(claims);
  const url = new URL(await startLogin(requested, cfg));
  await completeLogin({ code: 'good-code', state: url.searchParams.get('state')! }, cfg);
}

/** Drive the refresh path (getValidAccessToken) with a JWT carrying `claims`. */
async function refresh(claims: { scp?: string[]; owner?: string }): Promise<void> {
  respondWith(claims);
  await getValidAccessToken(CHAR_ID, cfg);
}

describe('persistTokens: cache purge on scope revoke', () => {
  it('purges the character cache when the new grant is NARROWER (scope revoked)', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL, WALLET] });
    await seedCache(CHAR_ID, 'mail:headers');
    await seedCache(CHAR_ID, 'wallet:journal');

    await login({ scp: [SKILLS, WALLET] }); // mail revoked

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
    expect((await db.tokens.get(CHAR_ID))?.scopes).toEqual([SKILLS, WALLET]);
  });

  it('does NOT purge when scopes are ADDED — a wider grant must never wipe the cache', async () => {
    // Guards the app-update case: shipping a batch of new scopes widens every
    // existing grant on the next login. If that purged, every user would lose
    // their whole cache on deploy.
    await seedPriorLogin({ scopes: [SKILLS] });
    await seedCache(CHAR_ID, 'skills');
    await seedCache(CHAR_ID, 'wallet:journal');

    await login({ scp: [SKILLS, MAIL, WALLET] });

    expect(await cachedKeys(CHAR_ID)).toEqual(['skills', 'wallet:journal']);
  });

  it('does NOT purge when the granted scope set is unchanged (order ignored)', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'skills');

    await login({ scp: [MAIL, SKILLS] });

    expect(await cachedKeys(CHAR_ID)).toEqual(['skills']);
  });

  it('does NOT purge on FIRST login — no prior token record is not a revocation', async () => {
    // Nothing seeded: db.tokens.get returns undefined. An undefined prior grant
    // must not be read as "previously had everything, now has none".
    await seedCache(CHAR_ID, 'skills');

    await login({ scp: [SKILLS] });

    expect(await cachedKeys(CHAR_ID)).toEqual(['skills']);
  });

  it('does NOT purge for a LEGACY token record with no scopes field', async () => {
    await seedPriorLogin({ omitScopes: true });
    await seedCache(CHAR_ID, 'skills');

    await refresh({ scp: [SKILLS] });

    expect(await cachedKeys(CHAR_ID)).toEqual(['skills']);
    expect((await db.tokens.get(CHAR_ID))?.scopes).toEqual([SKILLS]);
  });

  // -------------------------------------------------------------------------
  // Requested vs granted (issue #295). The login path asks SSO for a specific
  // set and compares the answer against *that*, not against what the character
  // happened to hold before. Two things turn on it: an add-a-character login
  // asking for the base set alone must not read a wider stored grant as a
  // revocation, and a scope the app asks for but never gets — a retired scope,
  // or one the EVE application is not registered for — must not purge the
  // cache on every login forever.
  // -------------------------------------------------------------------------

  it('does NOT purge when the login asked for LESS than the character already held', async () => {
    // Add-a-character: SSO decides who comes back, so the request is the base
    // set alone. The grant genuinely narrows — that is the accepted trade —
    // but a scope the app never asked for is no evidence of revocation, and
    // purging on it is exactly the bug #293 was fixing.
    await seedPriorLogin({ scopes: [SKILLS, MAIL, WALLET] });
    await seedCache(CHAR_ID, 'skills');
    await seedCache(CHAR_ID, 'mail:headers');

    await login({ scp: [SKILLS] }, [SKILLS]);

    expect(await cachedKeys(CHAR_ID)).toEqual(['mail:headers', 'skills']);
    expect(await isCachePurgePending(CHAR_ID)).toBe(false);
  });

  it('DOES purge when a scope the login asked for came back denied', async () => {
    // The other half: re-auth from a character context asks for the union, so
    // a scope missing from the answer is a real denial. Revocation detection
    // is not weakened by the rule above.
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');

    await login({ scp: [SKILLS] }, [SKILLS, MAIL]);

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
  });

  it('never purges over a requested scope the character never held', async () => {
    // The trap in a plain `requested \ granted` diff: `SCOPES` keeps asking, so
    // a scope SSO will never return — retired upstream, or not registered on
    // the EVE application — would wipe the cache on every login, forever. Run
    // twice: the second pass is the "forever" half.
    const UNREGISTERED = 'esi-corporations.read_structures.v1';
    await seedPriorLogin({ scopes: [SKILLS] });
    await seedCache(CHAR_ID, 'skills');

    await login({ scp: [SKILLS] }, [SKILLS, UNREGISTERED]);
    await login({ scp: [SKILLS] }, [SKILLS, UNREGISTERED]);

    expect(await cachedKeys(CHAR_ID)).toEqual(['skills']);
    expect(await isCachePurgePending(CHAR_ID)).toBe(false);
  });

  it('falls back to previous-vs-granted when the requested set was not stashed', async () => {
    // A callback completed without this tab's `startLogin` having run. The
    // conservative reading wins: with no record of what was asked for, a
    // narrower grant is treated as a revocation exactly as it was before #295.
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');
    respondWith({ scp: [SKILLS] });
    const url = new URL(await startLogin([SKILLS, MAIL], cfg));
    const state = url.searchParams.get('state')!;
    sessionStorage.removeItem('neocom.sso.scopes');

    await completeLogin({ code: 'good-code', state }, cfg);

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
  });

  it('clears the stashed request, so a later refresh judges on the stored grant', async () => {
    // The stash belongs to one authorize round trip. Left behind, it would go
    // on standing in for "what we asked for" on every later refresh — where
    // nothing is requested at all and the stored grant is the only baseline.
    await login({ scp: [SKILLS] }, [SKILLS, MAIL]);

    expect(sessionStorage.getItem('neocom.sso.scopes')).toBeNull();
  });

  it('purges on a token REFRESH whose JWT carries fewer scopes (portal revocation)', async () => {
    // A revocation performed in EVE's third-party-app portal never passes
    // through Callback.tsx — it surfaces only in the refresh grant's JWT.
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');

    await refresh({ scp: [SKILLS] });

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
  });

  it('leaves ANOTHER character cached rows untouched when one character revokes', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');
    await seedCache(OTHER_CHAR_ID, 'mail:headers');

    await refresh({ scp: [SKILLS] });

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
    expect(await cachedKeys(OTHER_CHAR_ID)).toEqual(['mail:headers']);
  });

  it('spares GLOBAL_CACHE_CHARACTER_ID rows when purging on revoke', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');
    await seedCache(GLOBAL_CACHE_CHARACTER_ID, 'type:587');
    await seedCache(GLOBAL_CACHE_CHARACTER_ID, 'name:1000035');

    await refresh({ scp: [SKILLS] });

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
    expect(await cachedKeys(GLOBAL_CACHE_CHARACTER_ID)).toEqual(['name:1000035', 'type:587']);
  });

  it('purges BEFORE overwriting the stored record, so a failed purge is retried', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');
    const cacheSpy = vi.spyOn(db.esiCache, 'where');
    const tokensSpy = vi.spyOn(db.tokens, 'put');
    const charactersSpy = vi.spyOn(db.characters, 'put');

    await refresh({ scp: [SKILLS] });

    expect(cacheSpy).toHaveBeenCalled();
    expect(cacheSpy.mock.invocationCallOrder[0]).toBeLessThan(
      charactersSpy.mock.invocationCallOrder[0]
    );
    expect(cacheSpy.mock.invocationCallOrder[0]).toBeLessThan(
      tokensSpy.mock.invocationCallOrder[0]
    );
    cacheSpy.mockRestore();
    tokensSpy.mockRestore();
    charactersSpy.mockRestore();
  });
});

describe('persistTokens: cache purge on owner change', () => {
  it('purges the character cache when the ownerHash changed (character sold or transferred)', async () => {
    // The sync-path wipe (sync/planSync.handleOwnerHashChange) only runs on a
    // successful Firebase sync, which never happens when sync is unconfigured.
    // Login is the owner-change checkpoint that always runs.
    // Scopes pinned identical on both sides: only the owner change can purge,
    // so this cannot pass by way of the scope-revoke path.
    await seedPriorLogin({ ownerHash: 'previous-owner-hash', scopes: [SKILLS] });
    await seedCache(CHAR_ID, 'wallet:journal');
    await seedCache(GLOBAL_CACHE_CHARACTER_ID, 'type:587');

    await login({ owner: 'owner-hash-1' });

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
    expect(await cachedKeys(GLOBAL_CACHE_CHARACTER_ID)).toEqual(['type:587']);
    expect((await db.characters.get(CHAR_ID))?.ownerHash).toBe('owner-hash-1');
  });

  it('leaves the sync ownerHash bookmark alone, so the sync-side plan wipe still fires', async () => {
    // The two owner-change paths compare against different baselines:
    // db.characters.ownerHash here, db.settings['sync.__ownerHash.N'] in
    // sync/planSync. Updating that setting from here would silently disarm the
    // Skill Plan / Build Plan wipe — the same bug class this fix closes.
    await seedPriorLogin({ ownerHash: 'previous-owner-hash', scopes: [SKILLS] });
    await db.settings.put({ key: `sync.__ownerHash.${CHAR_ID}`, value: 'previous-owner-hash' });

    await login({ owner: 'owner-hash-1' });

    expect((await db.settings.get(`sync.__ownerHash.${CHAR_ID}`))?.value).toBe(
      'previous-owner-hash'
    );
  });

  it('does NOT purge when the ownerHash is unchanged', async () => {
    await seedPriorLogin({ ownerHash: 'owner-hash-1', scopes: [SKILLS] });
    await seedCache(CHAR_ID, 'wallet:journal');

    await login({ owner: 'owner-hash-1' });

    expect(await cachedKeys(CHAR_ID)).toEqual(['wallet:journal']);
  });

  it('does NOT purge on first login for a character never seen before', async () => {
    await seedCache(CHAR_ID, 'wallet:journal');

    await login({ owner: 'owner-hash-1' });

    expect(await cachedKeys(CHAR_ID)).toEqual(['wallet:journal']);
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation: a broken Dexie must never cost the user their login.
// ---------------------------------------------------------------------------

describe('persistTokens: a failing purge degrades, it never fails the session', () => {
  it('login SUCCEEDS when the targeted purge fails, escalating to a full cache clear', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');
    await seedCache(GLOBAL_CACHE_CHARACTER_ID, 'type:587');
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(() => {
      throw new Error('index damaged');
    });

    await login({ scp: [SKILLS] }); // mail revoked
    where.mockRestore();

    expect((await db.tokens.get(CHAR_ID))?.scopes).toEqual([SKILLS]);
    expect(await cachedKeys(CHAR_ID)).toEqual([]);
    // Tier 2 is the whole table, global rows included: correctness over churn.
    expect(await cachedKeys(GLOBAL_CACHE_CHARACTER_ID)).toEqual([]);
    expect(await isCachePurgePending(CHAR_ID)).toBe(false);
  });

  it('refresh SUCCEEDS when BOTH purges fail, and the stale rows are NOT served', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(() => {
      throw new Error('index damaged');
    });
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));

    await expect(refresh({ scp: [SKILLS] })).resolves.toBeUndefined();
    where.mockRestore();
    clear.mockRestore();

    expect((await db.tokens.get(CHAR_ID))?.scopes).toEqual([SKILLS]);
    // Undeletable, therefore unreadable: offline shows an empty view rather
    // than data the character no longer consents to us holding.
    expect(await cachedKeys(CHAR_ID)).toEqual(['mail:headers']);
    const served = await loadWithCache(CHAR_ID, 'mail:headers', async () => {
      throw new Error('offline');
    });
    expect(served).toBeNull();
  });

  it('retries the pending purge on the NEXT refresh and clears the marker on success', async () => {
    await seedPriorLogin({ scopes: [SKILLS, MAIL] });
    await seedCache(CHAR_ID, 'mail:headers');
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(() => {
      throw new Error('index damaged');
    });
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));
    await refresh({ scp: [SKILLS] });
    where.mockRestore();
    clear.mockRestore();
    expect(await isCachePurgePending(CHAR_ID)).toBe(true);

    // Scopes now unchanged and ownerHash unchanged — the retry must be driven
    // by the marker alone, not by re-detecting the revocation (the evidence is
    // already overwritten in db.tokens).
    await db.tokens.update(CHAR_ID, {
      expiresAt: Date.now() + 30_000,
      refreshToken: 'refresh-old',
    });
    await refresh({ scp: [SKILLS] });

    expect(await isCachePurgePending(CHAR_ID)).toBe(false);
    expect(await cachedKeys(CHAR_ID)).toEqual([]);
    expect(await db.settings.get(`${CACHE_PURGE_PENDING_PREFIX}${CHAR_ID}`)).toBeUndefined();
  });

  it('a character with NO pending marker and no consent change never touches the cache', async () => {
    await seedPriorLogin({ scopes: [SKILLS] });
    await seedCache(CHAR_ID, 'skills');
    const where = vi.spyOn(db.esiCache, 'where');
    const clear = vi.spyOn(db.esiCache, 'clear');

    await login({ scp: [SKILLS] });

    expect(where).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    where.mockRestore();
    clear.mockRestore();
    expect(await cachedKeys(CHAR_ID)).toEqual(['skills']);
  });

  it('the ADDITIVE-scopes path still runs no purge of any tier', async () => {
    await seedPriorLogin({ scopes: [SKILLS] });
    await seedCache(CHAR_ID, 'skills');
    const where = vi.spyOn(db.esiCache, 'where');
    const clear = vi.spyOn(db.esiCache, 'clear');

    await login({ scp: [SKILLS, MAIL, WALLET] });

    expect(where).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    where.mockRestore();
    clear.mockRestore();
    expect(await cachedKeys(CHAR_ID)).toEqual(['skills']);
  });
});

// ---------------------------------------------------------------------------
// Corporation changes (issue #293). Corp-owned rows are fetched with a
// character's token but belong to the corporation, and neither trigger above
// fires when a pilot changes corp: the ownerHash is the same person and the
// grant is the same grant. This is the third trigger — and, unlike the other
// two, it is surgical: only the corp-scoped rows go.
// ---------------------------------------------------------------------------

const CORP_OLD = 98000001;
const CORP_NEW = 98000002;

/** A signed-in character, optionally with a corporation already recorded. */
async function seedCharacterInCorp(corporationId?: number): Promise<void> {
  await db.characters.put({
    characterId: CHAR_ID,
    name: 'CCP Alpha',
    ownerHash: 'owner-hash-1',
    addedAt: 1,
    ...(corporationId !== undefined ? { corporationId } : {}),
  });
}

describe('recordCharacterCorporation', () => {
  it('purges the corp-scoped rows, and ONLY those, when the corporation changes', async () => {
    await seedCharacterInCorp(CORP_OLD);
    await seedCache(CHAR_ID, corpCacheKey(CORP_OLD, 'structures'));
    await seedCache(CHAR_ID, corpCacheKey(CORP_OLD, 'wallets'));
    await seedCache(CHAR_ID, 'skills');
    await seedCache(CHAR_ID, 'mail:headers');

    await recordCharacterCorporation(CHAR_ID, CORP_NEW);

    // Skills and mail are the pilot's own and survive the move.
    expect(await cachedKeys(CHAR_ID)).toEqual(['mail:headers', 'skills']);
    expect((await db.characters.get(CHAR_ID))?.corporationId).toBe(CORP_NEW);
  });

  it('learning the corporation for the FIRST time purges nothing', async () => {
    // An upgraded device: the record predates `corporationId`, so there is no
    // prior to differ from — an unknown corp is not a corp change.
    await seedCharacterInCorp(undefined);
    await seedCache(CHAR_ID, corpCacheKey(CORP_OLD, 'structures'));
    await seedCache(CHAR_ID, 'skills');

    await recordCharacterCorporation(CHAR_ID, CORP_OLD);

    expect(await cachedKeys(CHAR_ID)).toEqual([corpCacheKey(CORP_OLD, 'structures'), 'skills']);
    expect((await db.characters.get(CHAR_ID))?.corporationId).toBe(CORP_OLD);
  });

  it('an unchanged corporation touches neither the cache nor the record', async () => {
    await seedCharacterInCorp(CORP_OLD);
    await seedCache(CHAR_ID, corpCacheKey(CORP_OLD, 'structures'));
    const where = vi.spyOn(db.esiCache, 'where');
    const update = vi.spyOn(db.characters, 'update');

    await recordCharacterCorporation(CHAR_ID, CORP_OLD);

    expect(where).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    where.mockRestore();
    update.mockRestore();
    expect(await cachedKeys(CHAR_ID)).toEqual([corpCacheKey(CORP_OLD, 'structures')]);
  });

  it('writes only the corporation, so a concurrent token refresh is not clobbered', async () => {
    await seedCharacterInCorp(CORP_OLD);
    const stale = { ...(await db.characters.get(CHAR_ID))! };
    // A refresh lands in the window between this call's read and its write —
    // `persistTokens` rebuilds the record from a JWT, so it moves name and
    // ownerHash. Writing back a whole snapshot here would revert both.
    await db.characters.update(CHAR_ID, { name: 'CCP Renamed', ownerHash: 'owner-hash-2' });
    const get = vi.spyOn(db.characters, 'get').mockResolvedValue(stale);

    await recordCharacterCorporation(CHAR_ID, CORP_NEW);

    get.mockRestore();
    expect(await db.characters.get(CHAR_ID)).toMatchObject({
      name: 'CCP Renamed',
      ownerHash: 'owner-hash-2',
      corporationId: CORP_NEW,
    });
  });

  it('leaves ANOTHER character corp rows alone when one character moves corp', async () => {
    await seedCharacterInCorp(CORP_OLD);
    await seedCache(CHAR_ID, corpCacheKey(CORP_OLD, 'structures'));
    await seedCache(OTHER_CHAR_ID, corpCacheKey(CORP_OLD, 'structures'));

    await recordCharacterCorporation(CHAR_ID, CORP_NEW);

    expect(await cachedKeys(CHAR_ID)).toEqual([]);
    expect(await cachedKeys(OTHER_CHAR_ID)).toEqual([corpCacheKey(CORP_OLD, 'structures')]);
  });

  it('is a no-op for a character that is not signed in on this device', async () => {
    await recordCharacterCorporation(CHAR_ID, CORP_NEW);

    expect(await db.characters.get(CHAR_ID)).toBeUndefined();
  });

  it('still records the new corporation when the purge itself fails', async () => {
    // A failed delete leaves ORPHANS, not a cross-corp read: the corp id is in
    // the key, so nothing can reach the old rows under the new corp.
    await seedCharacterInCorp(CORP_OLD);
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(() => {
      throw new Error('index damaged');
    });

    await expect(recordCharacterCorporation(CHAR_ID, CORP_NEW)).resolves.toBeUndefined();

    where.mockRestore();
    expect((await db.characters.get(CHAR_ID))?.corporationId).toBe(CORP_NEW);
  });
});

describe('persistTokens: the character upsert preserves corporationId', () => {
  it('keeps the recorded corporation across a token REFRESH', async () => {
    await seedPriorLogin({});
    await db.characters.update(CHAR_ID, { corporationId: CORP_OLD });

    await refresh({ scp: [SKILLS, MAIL, WALLET] });

    // Without this the corp trigger would look implemented and silently never
    // fire: every refresh would reset the field to "not yet learned".
    expect((await db.characters.get(CHAR_ID))?.corporationId).toBe(CORP_OLD);
  });

  it('leaves it absent for a character whose corporation is not known yet', async () => {
    await login({ scp: [SKILLS] });

    expect((await db.characters.get(CHAR_ID))?.corporationId).toBeUndefined();
  });
});
