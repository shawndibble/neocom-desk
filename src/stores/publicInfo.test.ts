import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { usePublicInfo } from './publicInfo';

const CHAR_ID = 91;
let characterRequests = 0;

const server = setupServer(
  http.get('https://esi.evetech.net/characters/:id', ({ params }) => {
    characterRequests += 1;
    if (params.id === String(CHAR_ID)) {
      return HttpResponse.json({
        name: 'Pilot One',
        corporation_id: 1001,
        alliance_id: 2001,
        birthday: '2015-01-01T00:00:00Z',
        bloodline_id: 1,
        gender: 'female',
        race_id: 1,
      });
    }
    if (params.id === '92') {
      // Corp only, no alliance.
      return HttpResponse.json({
        name: 'Pilot Two',
        corporation_id: 1001,
        birthday: '2015-01-01T00:00:00Z',
        bloodline_id: 1,
        gender: 'male',
        race_id: 1,
      });
    }
    return HttpResponse.json({ error: 'not found' }, { status: 404 });
  }),
  http.get('https://esi.evetech.net/corporations/:id', () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get('https://esi.evetech.net/alliances/:id', () =>
    HttpResponse.json({
      name: 'Test Alliance',
      ticker: 'TA',
      creator_corporation_id: 1,
      creator_id: 1,
      date_founded: '2016-01-01T00:00:00Z',
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  characterRequests = 0;
  usePublicInfo.setState({ byCharacterId: {} });
});

describe('usePublicInfo', () => {
  it('caches corp and alliance names for a character', async () => {
    await usePublicInfo.getState().load(CHAR_ID);
    expect(usePublicInfo.getState().byCharacterId[CHAR_ID]).toEqual({
      corporationName: 'Test Corp',
      allianceName: 'Test Alliance',
    });
  });

  it('leaves alliance null when the character has none', async () => {
    await usePublicInfo.getState().load(92);
    expect(usePublicInfo.getState().byCharacterId[92]).toEqual({
      corporationName: 'Test Corp',
      allianceName: null,
    });
  });

  it('does not refetch a cached character', async () => {
    await usePublicInfo.getState().load(CHAR_ID);
    await usePublicInfo.getState().load(CHAR_ID);
    expect(characterRequests).toBe(1);
  });

  it('dedupes concurrent loads', async () => {
    await Promise.all([
      usePublicInfo.getState().load(CHAR_ID),
      usePublicInfo.getState().load(CHAR_ID),
    ]);
    expect(characterRequests).toBe(1);
  });

  it('tolerates network failure without caching', async () => {
    server.use(http.get('https://esi.evetech.net/characters/:id', () => HttpResponse.error()));
    await expect(usePublicInfo.getState().load(CHAR_ID)).resolves.toBeUndefined();
    expect(usePublicInfo.getState().byCharacterId[CHAR_ID]).toBeUndefined();
  });
});
