import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import { loadCharacterClones, loadImplantDetails } from './clones';

// Default: the baked shard lacks the type, so ESI handlers serve it.
vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn(async () => null) }));

const CHAR_ID = 91;
const server = mswServer();

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  configureEsi({ getToken: null });
  vi.mocked(loadTypeInfo).mockResolvedValue(null);
});

describe('loadCharacterClones', () => {
  it('fetches and caches the clones payload', async () => {
    const payload = {
      jump_clones: [
        {
          jump_clone_id: 1,
          location_id: 60003760,
          location_type: 'station' as const,
          implants: [19540],
        },
      ],
      last_clone_jump_date: '2026-08-01T00:00:00Z',
    };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/clones`, () => HttpResponse.json(payload))
    );
    const result = await loadCharacterClones(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    expect((await db.esiCache.get([CHAR_ID, 'clones']))?.value).toEqual(payload);
  });

  it('falls back to cache offline', async () => {
    const payload = { jump_clones: [] };
    await db.esiCache.put({ characterId: CHAR_ID, key: 'clones', value: payload, fetchedAt: 2 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/clones`, () => HttpResponse.error())
    );
    const result = await loadCharacterClones(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: payload,
      fetchedAt: new Date(2),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth when the clones scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/clones`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadCharacterClones(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});

describe('loadImplantDetails', () => {
  const type = (
    id: number,
    description: string,
    dogma_attributes?: { attribute_id: number; value: number }[]
  ) => ({
    type_id: id,
    name: `Implant ${id}`,
    description,
    group_id: 300,
    published: true,
    dogma_attributes,
  });

  it('strips markup, and omits failed lookups and empty descriptions', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/1`, () =>
        HttpResponse.json(type(1, '+3 <b>Charisma</b><br>bonus'))
      ),
      http.get(`${ESI_BASE_URL}/universe/types/2`, () => HttpResponse.json(type(2, ''))),
      http.get(`${ESI_BASE_URL}/universe/types/3`, () => HttpResponse.error())
    );
    const result = await loadImplantDetails([1, 2, 3, 1]);
    expect(result.get(1)?.description).toBe('+3 Charisma\nbonus');
    expect(result.get(2)?.description).toBeUndefined();
    expect(result.has(3)).toBe(false);
  });

  it('reads the slot and the attribute bonus', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/10209`, () =>
        HttpResponse.json(
          type(10209, '+5 Memory', [
            { attribute_id: 331, value: 2 },
            { attribute_id: 177, value: 5 },
            { attribute_id: 175, value: 0 },
          ])
        )
      )
    );
    const result = await loadImplantDetails([10209]);
    expect(result.get(10209)).toEqual({
      description: '+5 Memory',
      slot: 2,
      bonuses: { memory: 5 },
    });
  });

  it('reads a baked implant offline, without asking ESI', async () => {
    vi.mocked(loadTypeInfo).mockResolvedValue({
      description: '+5 <b>Memory</b>',
      effects: [],
      attributes: [
        [177, 5],
        [331, 2],
      ],
    });
    // No ESI handler: an ESI read would fail on the unhandled request.
    const result = await loadImplantDetails([10209]);
    expect(result.get(10209)).toEqual({
      description: '+5 Memory',
      slot: 2,
      bonuses: { memory: 5 },
    });
  });
});
