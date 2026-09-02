import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadContractItems } from './contractItems';

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

describe('loadContractItems', () => {
  it("fetches and caches a contract's item lines under a per-contract key", async () => {
    const items = [
      { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json(items)
      )
    );

    const result = await loadContractItems(CHAR_ID, 12345);

    expect(result?.data).toEqual(items);
    expect((await db.esiCache.get([CHAR_ID, 'contract-items:12345']))?.value).toEqual(items);
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/999/items`, () =>
        HttpResponse.error()
      )
    );

    const result = await loadContractItems(CHAR_ID, 999);

    expect(result).toBeNull();
  });
});
