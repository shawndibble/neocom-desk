import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { corpWideRoles, loadCharacterRoles } from './roles';

const CHAR_ID = 91;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadCharacterRoles', () => {
  it('fetches and caches the roles payload', async () => {
    const payload = { roles: ['Director'], roles_at_hq: ['Station_Manager'] };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/roles`, () => HttpResponse.json(payload))
    );
    const result = await loadCharacterRoles(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    expect((await db.esiCache.get([CHAR_ID, 'corpRoles']))?.value).toEqual(payload);
  });

  /**
   * AC4: this endpoint has no role gate of its own, so a character with no
   * roles gets a 200 with the arrays omitted — not a 403, and not an error
   * surface. `needsReauth` staying false is the assertion that matters: a true
   * here would paint a re-login banner over a perfectly healthy line member.
   */
  it('treats a roleless character as an ordinary success, not a failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/roles`, () => HttpResponse.json({}))
    );
    const result = await loadCharacterRoles(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual({});
    expect(corpWideRoles(result.cached?.data)).toEqual([]);
  });

  it('falls back to cache offline', async () => {
    const payload = { roles: ['Accountant'] };
    await db.esiCache.put({ characterId: CHAR_ID, key: 'corpRoles', value: payload, fetchedAt: 2 });
    server.use(http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/roles`, () => HttpResponse.error()));
    const result = await loadCharacterRoles(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    expect(result.cached?.fromCache).toBe(true);
  });

  it('reports needsReauth when the roles scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/roles`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadCharacterRoles(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});

describe('corpWideRoles', () => {
  it('returns the corporation-wide roles', () => {
    expect(corpWideRoles({ roles: ['Director', 'Accountant'] })).toEqual([
      'Director',
      'Accountant',
    ]);
  });

  /**
   * The location-scoped grants open one office, not the corporation-wide
   * endpoints the capabilities stand for — reading them here would hand a
   * Station_Manager-at-HQ the whole corp structure list.
   */
  it('ignores the location-scoped role lists', () => {
    expect(
      corpWideRoles({
        roles_at_hq: ['Station_Manager'],
        roles_at_base: ['Accountant'],
        roles_at_other: ['Director'],
      })
    ).toEqual([]);
  });

  it('reads an absent payload and an absent roles field alike as no roles', () => {
    expect(corpWideRoles(undefined)).toEqual([]);
    expect(corpWideRoles(null)).toEqual([]);
    expect(corpWideRoles({})).toEqual([]);
  });
});
