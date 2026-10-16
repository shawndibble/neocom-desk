import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { resetRevalidationState } from '@/esi/cache';
import { db } from '@/db';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import { loadImplantBonuses, loadImplantTypeBonuses, loadTypeDetail } from './typeDetail';

vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn(async () => null) }));

const mockedLoadTypeInfo = vi.mocked(loadTypeInfo);

const CHAR_ID = 91;
const RIFTER = 587;
const MEMORY_IMPLANT = 10209;
const OCULAR_FILTER = 9899;

const esiRifter = {
  type_id: RIFTER,
  name: 'Rifter',
  description: 'From ESI.',
  group_id: 25,
  published: true,
  volume: 27289,
  dogma_attributes: [{ attribute_id: 9, value: 350 }],
};

function esiImplant(typeId: number, attributeId: number, value: number) {
  return {
    type_id: typeId,
    name: `Implant ${typeId}`,
    description: '',
    group_id: 300,
    published: true,
    dogma_attributes: [{ attribute_id: attributeId, value }],
  };
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  resetRevalidationState();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
  mockedLoadTypeInfo.mockReset();
  mockedLoadTypeInfo.mockResolvedValue(null);
});
afterAll(() => server.close());

describe('loadTypeDetail', () => {
  it('maps the baked record to the ESI shape, without asking ESI', async () => {
    mockedLoadTypeInfo.mockResolvedValue({
      description: 'Baked.',
      attributes: [
        [9, 350],
        [161, 27289],
      ],
      effects: [12, 42],
      defaultEffect: 12,
      volume: 27289,
      packagedVolume: 2500,
    });

    // No ESI handler: an ESI read would fail the test on the unhandled request.
    expect(await loadTypeDetail(RIFTER)).toEqual({
      description: 'Baked.',
      volume: 27289,
      packaged_volume: 2500,
      dogma_attributes: [
        { attribute_id: 9, value: 350 },
        { attribute_id: 161, value: 27289 },
      ],
      dogma_effects: [
        { effect_id: 12, is_default: true },
        { effect_id: 42, is_default: false },
      ],
    });
  });

  it('gives packaged volume as volume when the record carries no distinct one, as ESI does', async () => {
    mockedLoadTypeInfo.mockResolvedValue({
      description: '',
      attributes: [],
      effects: [],
      volume: 0.01,
    });

    expect(await loadTypeDetail(RIFTER)).toMatchObject({ volume: 0.01, packaged_volume: 0.01 });
  });

  it('leaves both volumes absent when the baked record has none, as ESI does', async () => {
    mockedLoadTypeInfo.mockResolvedValue({ description: '', attributes: [], effects: [] });

    expect(await loadTypeDetail(RIFTER)).toEqual({
      description: '',
      dogma_attributes: [],
      dogma_effects: [],
    });
  });

  it('falls back to cached ESI for a type the shard does not carry', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${RIFTER}`, () => HttpResponse.json(esiRifter))
    );

    expect(await loadTypeDetail(RIFTER)).toEqual(esiRifter);
  });

  it('falls back to cached ESI when the shard cannot be fetched', async () => {
    mockedLoadTypeInfo.mockRejectedValue(new TypeError('Failed to fetch'));
    await db.esiCache.put({
      characterId: 0,
      key: `universeType:${RIFTER}`,
      value: esiRifter,
      fetchedAt: Date.now(),
    });

    expect(await loadTypeDetail(RIFTER)).toEqual(esiRifter);
  });

  it('resolves null, never rejects, when neither source has the type', async () => {
    mockedLoadTypeInfo.mockRejectedValue(new TypeError('Failed to fetch'));
    server.use(http.get(`${ESI_BASE_URL}/universe/types/${RIFTER}`, () => HttpResponse.error()));

    expect(await loadTypeDetail(RIFTER)).toBeNull();
  });

  it('asks ESI once by default, and twice with retry on a transient failure', async () => {
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${RIFTER}`, () => {
        requests += 1;
        return requests % 2 === 1 ? HttpResponse.error() : HttpResponse.json(esiRifter);
      })
    );

    expect(await loadTypeDetail(RIFTER)).toBeNull();
    expect(requests).toBe(1);

    requests = 0;
    expect(await loadTypeDetail(RIFTER, { retry: true })).toEqual(esiRifter);
    expect(requests).toBe(2);
  });
});

describe('loadImplantTypeBonuses', () => {
  it('sums baked bonuses, falling back to ESI for a type the shard lacks', async () => {
    mockedLoadTypeInfo.mockImplementation(async (typeId) =>
      typeId === MEMORY_IMPLANT
        ? {
            description: '',
            effects: [],
            attributes: [
              [176, 0],
              [177, 5],
            ],
          }
        : null
    );
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${OCULAR_FILTER}`, () =>
        HttpResponse.json(esiImplant(OCULAR_FILTER, 178, 1))
      )
    );

    expect(await loadImplantTypeBonuses([MEMORY_IMPLANT, OCULAR_FILTER])).toEqual({
      memory: 5,
      perception: 1,
    });
  });

  it('is {} for no implants', async () => {
    expect(await loadImplantTypeBonuses([])).toEqual({});
  });
});

describe('loadImplantBonuses', () => {
  it("sums the fitted implants' bonuses from the baked shards, offline", async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'implants',
      value: [MEMORY_IMPLANT, OCULAR_FILTER],
      fetchedAt: Date.now(),
    });
    mockedLoadTypeInfo.mockImplementation(async (typeId) => ({
      description: '',
      effects: [],
      attributes: typeId === MEMORY_IMPLANT ? [[177, 5]] : [[178, 1]],
    }));
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/implants`, () => HttpResponse.error())
    );

    expect(await loadImplantBonuses(CHAR_ID)).toEqual({ memory: 5, perception: 1 });
  });

  it('returns {} when implants are unfetchable and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/implants`, () => HttpResponse.error())
    );
    expect(await loadImplantBonuses(CHAR_ID)).toEqual({});
  });

  it('recovers a transiently-failing unbaked implant so its bonus reaches the sum', async () => {
    let memoryTypeRequests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/implants`, () =>
        HttpResponse.json([MEMORY_IMPLANT, OCULAR_FILTER])
      ),
      http.get(`${ESI_BASE_URL}/universe/types/${MEMORY_IMPLANT}`, () => {
        memoryTypeRequests += 1;
        if (memoryTypeRequests === 1) return HttpResponse.error();
        return HttpResponse.json(esiImplant(MEMORY_IMPLANT, 177, 5));
      }),
      http.get(`${ESI_BASE_URL}/universe/types/${OCULAR_FILTER}`, () =>
        HttpResponse.json(esiImplant(OCULAR_FILTER, 178, 1))
      )
    );

    expect(await loadImplantBonuses(CHAR_ID)).toEqual({ memory: 5, perception: 1 });
    expect(memoryTypeRequests).toBe(2);
  });
});
