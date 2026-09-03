import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { db, type TokenRecord } from '@/db';
import { SCOPES, revokedScopes } from '@/esi/scopes';
import { completeLogin } from '@/auth/session';

const { assignLocation } = vi.hoisted(() => ({ assignLocation: vi.fn<(url: string) => void>() }));
vi.mock('./navigation', () => ({ assignLocation }));

import { beginEveLogin } from './loginFlow';

const CHAR_ID = 2112625428;
const OTHER_CHAR_ID = 90000001;
/** A scope no registry endpoint declares — stands in for an incrementally granted one. */
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
 * what makes this an end-to-end check of the union rather than of a fixture.
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
  await db.tokens.clear();
  await db.characters.clear();
  await db.esiCache.clear();
  await db.settings.clear();
});

describe('beginEveLogin', () => {
  it('sends the base SCOPES when no character has logged in yet', async () => {
    await beginEveLogin();

    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  it('sends the UNION of SCOPES and a stored grant, so a re-auth is never a narrowing', async () => {
    // The whole defect: a character granted MORE than the base set, then sent
    // back through the ordinary login, which used to ask for the base set
    // alone — read downstream as a revocation, wiping the cache.
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);

    await beginEveLogin();

    const requested = requestedScopes();
    expect(requested).toContain(EXTRA_SCOPE);
    expect(revokedScopes([...SCOPES, EXTRA_SCOPE], requested)).toEqual([]);
  });

  it('unions across EVERY stored character — SSO picks who comes back, not us', async () => {
    await seedGrant(CHAR_ID, [...SCOPES]);
    await seedGrant(OTHER_CHAR_ID, [...SCOPES, EXTRA_SCOPE]);

    await beginEveLogin();

    expect(requestedScopes()).toContain(EXTRA_SCOPE);
  });

  it('sends each scope once, however many characters granted it', async () => {
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);
    await seedGrant(OTHER_CHAR_ID, [...SCOPES, EXTRA_SCOPE]);

    await beginEveLogin();

    const requested = requestedScopes();
    expect(requested).toEqual([...new Set(requested)]);
  });

  it('ignores a LEGACY token record with no scopes field', async () => {
    await seedGrant(CHAR_ID, undefined);

    await beginEveLogin();

    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  it('falls back to the base SCOPES when the stored grants cannot be read', async () => {
    // A broken Dexie must cost the user their cache, never their way back in.
    const toArray = vi.spyOn(db.tokens, 'toArray').mockRejectedValue(new Error('store closed'));

    await beginEveLogin();

    toArray.mockRestore();
    expect(requestedScopes().sort()).toEqual([...SCOPES].sort());
  });

  it('end to end: a widened grant re-running the BASE login keeps its cache', async () => {
    // The defect in full (issue #293 AC 3). Before the union, this exact path
    // — a character holding more than the base set, sent back through the
    // ordinary login button — read as a revocation and wiped everything.
    await db.characters.put({
      characterId: CHAR_ID,
      name: 'CCP Alpha',
      ownerHash: 'owner-hash-1',
      addedAt: 1,
    });
    await seedGrant(CHAR_ID, [...SCOPES, EXTRA_SCOPE]);
    await db.esiCache.put({ characterId: CHAR_ID, key: 'skills', value: 'mine', fetchedAt: 1 });

    await beginEveLogin();
    const state = new URL(assignLocation.mock.calls.at(-1)![0]).searchParams.get('state')!;
    await completeLogin({ code: 'good-code', state });

    expect((await db.esiCache.get([CHAR_ID, 'skills']))?.value).toBe('mine');
    expect((await db.tokens.get(CHAR_ID))?.scopes).toContain(EXTRA_SCOPE);
  });
});
