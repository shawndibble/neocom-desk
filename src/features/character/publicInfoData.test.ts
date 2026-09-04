import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import {
  loadPublicCharacterInfo,
  loadPublicCorporationInfo,
  loadPublicAllianceInfo,
} from './publicInfoData';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadPublicCharacterInfo', () => {
  it('fetches and caches a character, keeping the id alongside the ESI fields', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/91`, () =>
        HttpResponse.json({
          name: 'Some Pilot',
          corporation_id: 2,
          alliance_id: 3,
          birthday: '2020-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
          security_status: 1.5,
        })
      )
    );

    const info = await loadPublicCharacterInfo(91);

    expect(info).toMatchObject({ character_id: 91, name: 'Some Pilot', corporation_id: 2 });
    expect((await db.esiCache.get([0, 'public-character:91']))?.value).toMatchObject({
      name: 'Some Pilot',
    });
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(http.get(`${ESI_BASE_URL}/characters/404`, () => HttpResponse.error()));

    const info = await loadPublicCharacterInfo(404);

    expect(info).toBeNull();
  });
});

describe('loadPublicCorporationInfo', () => {
  it('fetches the corp and resolves the CEO name', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/2`, () =>
        HttpResponse.json({
          name: 'Some Corp',
          ticker: 'SOME',
          ceo_id: 99,
          creator_id: 99,
          member_count: 42,
          tax_rate: 0.1,
        })
      ),
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json([{ id: 99, name: 'CEO Pilot', category: 'character' }])
      )
    );

    const info = await loadPublicCorporationInfo(2);

    expect(info).toMatchObject({
      corporation_id: 2,
      name: 'Some Corp',
      ceo_id: 99,
      ceoName: 'CEO Pilot',
    });
  });

  it('resolves ceoName to null when the name lookup fails', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/5`, () =>
        HttpResponse.json({
          name: 'Other Corp',
          ticker: 'OTHR',
          ceo_id: 100,
          creator_id: 100,
          member_count: 1,
          tax_rate: 0,
        })
      ),
      http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error())
    );

    const info = await loadPublicCorporationInfo(5);

    expect(info?.ceoName).toBeNull();
  });

  it('returns null when unresolvable', async () => {
    server.use(http.get(`${ESI_BASE_URL}/corporations/404`, () => HttpResponse.error()));

    const info = await loadPublicCorporationInfo(404);

    expect(info).toBeNull();
  });
});

describe('loadPublicAllianceInfo', () => {
  it('fetches and caches an alliance', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/3`, () =>
        HttpResponse.json({
          name: 'Some Alliance',
          ticker: 'SOAL',
          creator_corporation_id: 2,
          creator_id: 99,
          date_founded: '2019-01-01T00:00:00Z',
        })
      )
    );

    const info = await loadPublicAllianceInfo(3);

    expect(info).toMatchObject({ alliance_id: 3, name: 'Some Alliance', ticker: 'SOAL' });
  });

  it('returns null when unresolvable', async () => {
    server.use(http.get(`${ESI_BASE_URL}/alliances/404`, () => HttpResponse.error()));

    const info = await loadPublicAllianceInfo(404);

    expect(info).toBeNull();
  });
});
