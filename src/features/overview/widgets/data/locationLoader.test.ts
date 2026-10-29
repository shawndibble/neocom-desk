import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { db } from '@/db';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadLocationWidget } from './kindLoaders';

const CHARACTER_ID = 42;
const server = mswServer();

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.tokens.put({
    characterId: CHARACTER_ID,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 600_000,
    scopes: [ESI_REGISTRY.getCharacterLocation.scope, ESI_REGISTRY.getCharacterShip.scope],
  });
});
afterEach(() => {
  configureEsi({ getToken: null });
});

describe('loadLocationWidget age', () => {
  it('reports the age of the cached reads, not the time of the call, when offline', async () => {
    const locationAt = Date.now() - 5 * 60_000;
    const shipAt = Date.now() - 3 * 60 * 60_000;
    await db.esiCache.bulkPut([
      {
        characterId: CHARACTER_ID,
        key: 'characterLocation',
        value: 30000142,
        fetchedAt: locationAt,
      },
      { characterId: CHARACTER_ID, key: 'characterShip', value: 587, fetchedAt: shipAt },
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/ship`, () => HttpResponse.error()),
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () => HttpResponse.error())
    );

    const widget = await loadLocationWidget(CHARACTER_ID);

    expect(widget.shipTypeId).toBe(587);
    // The older of the two rows, so the badge never flatters the stalest half.
    expect(widget.fetchedAt?.getTime()).toBe(shipAt);
  });

  it('has no age when nothing could be read', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/ship`, () => HttpResponse.error()),
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () => HttpResponse.error())
    );
    expect((await loadLocationWidget(CHARACTER_ID)).fetchedAt).toBeNull();
  });
});
