import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { corpWideRoles, loadCharacterRoles } from './roles';

const CHAR_ID = 91;
const server = mswServer();

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  configureEsi({ getToken: null });
});

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
