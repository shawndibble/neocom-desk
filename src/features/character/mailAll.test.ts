import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { invalidateFreshness } from '@/esi/cache';
import { db } from '@/db';
import {
  loadMailForCharacters,
  resetMailRefreshThrottle,
  MAIL_REFRESH_MIN_GAP_MS,
} from './mailAll';

const MAIL_SCOPE = 'esi-mail.read_mail.v1';
const characters = [
  { characterId: 91, name: 'One' },
  { characterId: 92, name: 'Two' },
  { characterId: 93, name: 'NoGrant' },
];
const headerFetches: number[] = [];
const server = setupServer(
  http.get(`${ESI_BASE_URL}/characters/:id/mail`, ({ params }) => {
    headerFetches.push(Number(params.id));
    return HttpResponse.json([{ mail_id: 1, timestamp: '2026-08-01T00:00:00Z', is_read: false }]);
  }),
  http.get(`${ESI_BASE_URL}/characters/:id/mail/labels`, () =>
    HttpResponse.json({ labels: [{ label_id: 1, name: 'Inbox', unread_count: 2 }] })
  ),
  http.get(`${ESI_BASE_URL}/characters/:id/mail/lists`, () => HttpResponse.json([]))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.tokens.clear();
  headerFetches.length = 0;
  resetMailRefreshThrottle();
  for (const c of characters) {
    await db.tokens.put({
      characterId: c.characterId,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      scopes: c.characterId === 93 ? [] : [MAIL_SCOPE],
    });
  }
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadMailForCharacters', () => {
  it('loads every granted Character and skips, by name, one without the mail grant', async () => {
    const { owners, skipped } = await loadMailForCharacters(characters, 1_000);
    expect(owners.map((o) => o.name)).toEqual(['One', 'Two']);
    expect(skipped).toEqual([{ characterId: 93, name: 'NoGrant', granted: false }]);
    expect(headerFetches).not.toContain(93);
  });

  it('does not refetch a Character on a second refresh within a minute', async () => {
    await loadMailForCharacters(characters, 1_000);
    expect(headerFetches.sort()).toEqual([91, 92]);
    invalidateFreshness();
    const again = await loadMailForCharacters(characters, 1_000 + MAIL_REFRESH_MIN_GAP_MS - 1);
    expect(headerFetches).toHaveLength(2);
    // Still shown, from cache.
    expect(again.owners.map((o) => o.headers?.data.length)).toEqual([1, 1]);
  });

  it('refetches once the minute has passed', async () => {
    await loadMailForCharacters(characters, 1_000);
    invalidateFreshness();
    await loadMailForCharacters(characters, 1_000 + MAIL_REFRESH_MIN_GAP_MS);
    expect(headerFetches).toHaveLength(4);
  });
});
