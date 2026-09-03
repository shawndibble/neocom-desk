import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { db, type TokenRecord } from '@/db';
import { SCOPES, revokedScopes, scopesForGroup } from '@/esi/scopes';
import { completeLogin } from '@/auth/session';
import { useActiveCharacter } from '@/stores/activeCharacter';

const { assignLocation } = vi.hoisted(() => ({ assignLocation: vi.fn<(url: string) => void>() }));
vi.mock('./navigation', () => ({ assignLocation }));

import { beginAddCharacterLogin, beginEveLogin } from './loginFlow';

const CHAR_ID = 2112625428;
const OTHER_CHAR_ID = 90000001;
/**
 * A scope no *ungrouped* registry endpoint declares — an incrementally granted
 * one. It is a real corp-group scope, which is the case that matters: the base
 * consent screen must not carry it.
 */
const EXTRA_SCOPE = 'esi-corporations.read_structures.v1';

/** The `scope` parameter of the authorize URL the flow navigated to. */
function requestedScopes(): string[] {
  const url = new URL(assignLocation.mock.calls.at(-1)![0]);
  return (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean);
}

async function seedGrant(characterId: number, scopes: string[] | undefined): Promise<void> {
  await db.tokens.put({
    characterId,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 600_000,
    ...(scopes === undefined ? {} : { scopes }),
  } as TokenRecord);
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * SSO echoing back exactly the scopes the authorize URL asked for — which is
 * what makes the end-to-end cases below a check of the flow rather than of a
 * fixture, and what makes them mirror EVE's real behaviour: the token carries
 * what was requested and approved, never a scope the request omitted.
 */
const server = setupServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () => {
    const payload = {
      sub: `CHARACTER:EVE:${CHAR_ID}`,
      name: 'CCP Alpha',
      owner: 'owner-hash-1',
      exp: Math.floor(Date.now() / 1000) + 1200,
      scp: requestedScopes(),
    };
    return HttpResponse.json({
      access_token: `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.sig`,
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'refresh-rotated',
    });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(async () => {
  sessionStorage.clear();
  assignLocation.mockClear();
  // Set explicitly in every test that cares: `beginEveLogin` defaults to the
  // active Character, so a test relying on the store's initial value would be
  // proving the default rather than the branch it names.
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  await db.tokens.clear();
  await db.characters.clear();
  await db.esiCache.clear();
  await db.settings.clear();
});

// ---------------------------------------------------------------------------
// Branch 1 — add a character. SSO decides who comes back, after this redirect,
// so the app cannot know whose grant to union with. It asks for the base set
// and nothing else, and `auth/session` judges the answer against *that*
// (issue #295).
// ---------------------------------------------------------------------------

describe('beginAddCharacterLogin', () => {
  it('sends the base SCOPES when no character has logged in yet', async () => {
    await beginAddCharacterLogin();

    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  it('puts NO corp scope on the consent screen (AC 1)', async () => {
    await beginAddCharacterLogin();

    const requested = new Set(requestedScopes());
    for (const scope of scopesForGroup('corp')) expect(requested.has(scope), scope).toBe(false);
    expect(requested.has('esi-characters.read_corporation_roles.v1')).toBe(true);
  });

  it('does NOT inherit another character’s wider grant', async () => {
    // #293 unioned across every stored character, because it could not
    // under-ask without tripping the purge. Now the purge judges requested vs
    // granted, so the union is no longer needed to stay safe — and asking an
    // alt for corp scopes only a main ever granted is the consent bloat this
    // whole ticket exists to prevent.
    await seedGrant(OTHER_CHAR_ID, [...SCOPES, EXTRA_SCOPE]);

    await beginAddCharacterLogin();

    expect(requestedScopes()).not.toContain(EXTRA_SCOPE);
  });

  it('does NOT inherit the ACTIVE character’s grant either', async () => {
    // The reason this is its own entry point rather than `beginEveLogin()`:
    // somebody is usually signed in when Add character is pressed, and the
    // character arriving is by definition somebody else.
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);
    useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });

    await beginAddCharacterLogin();

    expect(requestedScopes()).not.toContain(EXTRA_SCOPE);
  });

  it('ignores a LEGACY token record with no scopes field', async () => {
    await seedGrant(CHAR_ID, undefined);
    useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });

    await beginAddCharacterLogin();

    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  it('end to end: a widened grant re-running the BASE login keeps its cache', async () => {
    // #293 AC 3, preserved through the change of mechanism. The narrowing is
    // now real — the new refresh token genuinely carries only what was asked
    // for, so the stored grant drops back to the base set — but the cache
    // survives, because a scope the app never asked for is no evidence that
    // the character revoked it. Re-granting is one click in Settings.
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'CCP Alpha',
      ownerHash: 'owner-hash-1',
      addedAt: 1,
    });
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);
    await db.esiCache.put({ characterId: CHAR_ID, key: 'skills', value: 'mine', fetchedAt: 1 });

    await beginAddCharacterLogin();
    const state = new URL(assignLocation.mock.calls.at(-1)![0]).searchParams.get('state')!;
    await completeLogin({ code: 'good-code', state });

    expect((await db.esiCache.get([CHAR_ID, 'skills']))?.value).toBe('mine');
    expect((await db.tokens.get(CHAR_ID))?.scopes).not.toContain(EXTRA_SCOPE);
  });
});

// ---------------------------------------------------------------------------
// Branch 2 — a known character. Every entry point here is initiated from a
// character context (the Settings Corp access row, the role-gain prompt, the
// ReauthBanner), so the grant to union with *is* knowable, and asking for less
// than it would throw away a grant the character already made.
// ---------------------------------------------------------------------------

describe('beginEveLogin: re-auth for a known character', () => {
  it('unions with THAT character’s stored grant, so a re-auth is never a narrowing', async () => {
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);

    await beginEveLogin({ characterId: CHAR_ID });

    const requested = requestedScopes();
    expect(requested).toContain(EXTRA_SCOPE);
    expect(revokedScopes([...SCOPES, EXTRA_SCOPE], requested)).toEqual([]);
  });

  it('unions with that character ONLY, never with an alt’s grant', async () => {
    await seedGrant(CHAR_ID, [...SCOPES]);
    await seedGrant(OTHER_CHAR_ID, [...SCOPES, EXTRA_SCOPE]);

    await beginEveLogin({ characterId: CHAR_ID });

    expect(requestedScopes()).not.toContain(EXTRA_SCOPE);
  });

  it('sends the base set for a character with no stored grant at all', async () => {
    await beginEveLogin({ characterId: CHAR_ID });

    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  /**
   * The default is what makes the ~15 `ReauthBanner` / `ScopeGate` /
   * `AuthFailureNotice` call sites branch 2 without each naming a character:
   * every one of them is pressed while looking at the active Character's data,
   * and asking for less than that Character holds would silently drop their
   * corp grant.
   */
  it('defaults to the ACTIVE character, so a bare re-auth is not a narrowing', async () => {
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);
    useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });

    await beginEveLogin();

    expect(requestedScopes()).toContain(EXTRA_SCOPE);
  });

  it('sends the base set when there is no active character to default to', async () => {
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);

    await beginEveLogin();

    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  it('lets an explicit characterId win over the active one', async () => {
    await seedGrant(CHAR_ID, [...SCOPES]);
    await seedGrant(OTHER_CHAR_ID, [...SCOPES, EXTRA_SCOPE]);
    useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });

    await beginEveLogin({ characterId: OTHER_CHAR_ID });

    expect(requestedScopes()).toContain(EXTRA_SCOPE);
  });
});

// ---------------------------------------------------------------------------
// Requesting an opt-in group.
// ---------------------------------------------------------------------------

describe('beginEveLogin: requesting a scope group', () => {
  it('adds every scope in the group to the base set', async () => {
    await beginEveLogin({ characterId: CHAR_ID, groups: ['corp'] });

    const requested = new Set(requestedScopes());
    for (const scope of SCOPES) expect(requested.has(scope), scope).toBe(true);
    for (const scope of scopesForGroup('corp')) expect(requested.has(scope), scope).toBe(true);
  });

  it('keeps the character’s existing grant alongside the new group', async () => {
    const ALREADY_GRANTED = 'esi-corporations.track_members.v1';
    await seedGrant(CHAR_ID, [...SCOPES, ALREADY_GRANTED]);

    await beginEveLogin({ characterId: CHAR_ID, groups: ['corp'] });

    expect(requestedScopes()).toContain(ALREADY_GRANTED);
  });

  it('sends each scope once, however many sources contribute it', async () => {
    await seedGrant(CHAR_ID, [...SCOPES, ...scopesForGroup('corp')]);

    await beginEveLogin({ characterId: CHAR_ID, groups: ['corp'] });

    const requested = requestedScopes();
    expect(requested).toEqual([...new Set(requested)]);
  });

  it('end to end: granting the group widens the stored grant and purges no cache (AC 2)', async () => {
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'CCP Alpha',
      ownerHash: 'owner-hash-1',
      addedAt: 1,
    });
    await seedGrant(CHAR_ID, [...SCOPES]);
    await db.esiCache.put({ characterId: CHAR_ID, key: 'skills', value: 'mine', fetchedAt: 1 });

    await beginEveLogin({ characterId: CHAR_ID, groups: ['corp'] });
    const state = new URL(assignLocation.mock.calls.at(-1)![0]).searchParams.get('state')!;
    await completeLogin({ code: 'good-code', state });

    expect((await db.esiCache.get([CHAR_ID, 'skills']))?.value).toBe('mine');
    const stored = (await db.tokens.get(CHAR_ID))?.scopes ?? [];
    for (const scope of scopesForGroup('corp')) expect(stored, scope).toContain(scope);
  });
});

describe('beginEveLogin: a broken Dexie', () => {
  it('falls back to the base SCOPES when the stored grant cannot be read', async () => {
    // A broken Dexie must cost the user their cache, never their way back in.
    const get = vi.spyOn(db.tokens, 'get').mockRejectedValue(new Error('store closed'));

    await beginEveLogin({ characterId: CHAR_ID });

    get.mockRestore();
    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  it('still asks for a requested group when the stored grant cannot be read', async () => {
    // The group is named by the caller, not read from Dexie, so a failed read
    // must not silently turn a Grant press into an ordinary re-auth.
    const get = vi.spyOn(db.tokens, 'get').mockRejectedValue(new Error('store closed'));

    await beginEveLogin({ characterId: CHAR_ID, groups: ['corp'] });

    get.mockRestore();
    expect(requestedScopes()).toEqual(expect.arrayContaining([...scopesForGroup('corp')]));
  });
});
