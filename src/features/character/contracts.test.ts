import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadContracts } from './contracts';

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

const CONTRACT = (id: number) => ({
  contract_id: id,
  issuer_id: 1,
  issuer_corporation_id: 2,
  assignee_id: 3,
  acceptor_id: 0,
  type: 'item_exchange' as const,
  status: 'outstanding' as const,
  for_corporation: false,
  availability: 'personal' as const,
  date_issued: '2026-08-01T00:00:00Z',
  date_expired: '2026-08-10T00:00:00Z',
});

describe('loadContracts', () => {
  it('concatenates every page and caches the combined result', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json([CONTRACT(page === '2' ? 2 : 1)], { headers: { 'X-Pages': '2' } });
      })
    );

    const result = await loadContracts(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data.map((c) => c.contract_id)).toEqual([1, 2]);
  });

  it('falls back to cache offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contracts',
      value: [CONTRACT(1)],
      fetchedAt: 9,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts`, () => HttpResponse.error())
    );

    const result = await loadContracts(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({ data: [CONTRACT(1)], fetchedAt: new Date(9), fromCache: true });
  });

  it('reports needsReauth when the contracts scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadContracts(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});
