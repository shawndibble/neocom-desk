import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from './client';
import { rejectBadEsiHeaders } from './test-helpers';
import {
  getCharacterSkills,
  getCharacterSkillQueue,
  getCharacterAttributes,
  getCharacterImplants,
  getCharacterWallet,
  getCharacterPublicInfo,
  getCorporationPublicInfo,
  getAlliancePublicInfo,
  getUniverseType,
} from './endpoints';
import type { CharacterSkills, SkillQueueEntry, CharacterAttributes } from './endpoints';

const CHARACTER_ID = 95465499;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  configureEsi({ getToken: vi.fn(async (id: number) => `token-${id}`) });
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

function authedJson(path: string, body: JsonBodyType, headers: Record<string, string> = {}) {
  return http.get(`${ESI_BASE_URL}${path}`, ({ request }) => {
    const bad = rejectBadEsiHeaders(request);
    if (bad) return bad;
    if (request.headers.get('authorization') !== `Bearer token-${CHARACTER_ID}`) {
      return HttpResponse.json({ error: 'authentication needed' }, { status: 401 });
    }
    return HttpResponse.json(body, { headers });
  });
}

describe('character skill endpoints', () => {
  it('getCharacterSkills returns the typed skills payload', async () => {
    const payload: CharacterSkills = {
      skills: [
        {
          skill_id: 3300,
          trained_skill_level: 5,
          active_skill_level: 5,
          skillpoints_in_skill: 256000,
        },
        {
          skill_id: 3301,
          trained_skill_level: 4,
          active_skill_level: 3,
          skillpoints_in_skill: 45255,
        },
      ],
      total_sp: 5000000,
      unallocated_sp: 150000,
    };
    server.use(authedJson(`/characters/${CHARACTER_ID}/skills`, payload, { ETag: '"sk1"' }));

    const result = await getCharacterSkills(CHARACTER_ID);

    expect(result.data).toEqual(payload);
    expect(result.etag).toBe('"sk1"');
    expect(result.data?.skills[0].skillpoints_in_skill).toBe(256000);
  });

  it('getCharacterSkills passes an etag and surfaces a 304 as null data', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/skills`, ({ request }) => {
        if (request.headers.get('if-none-match') === '"sk1"') {
          return new HttpResponse(null, { status: 304, headers: { ETag: '"sk1"' } });
        }
        return HttpResponse.json({ skills: [], total_sp: 0 });
      })
    );

    const result = await getCharacterSkills(CHARACTER_ID, { etag: '"sk1"' });

    expect(result.data).toBeNull();
    expect(result.etag).toBe('"sk1"');
  });

  it('getCharacterSkillQueue returns the queue entries', async () => {
    const queue: SkillQueueEntry[] = [
      {
        skill_id: 3300,
        queue_position: 0,
        finished_level: 5,
        start_date: '2026-08-01T00:00:00Z',
        finish_date: '2026-09-01T00:00:00Z',
        level_start_sp: 45255,
        level_end_sp: 256000,
        training_start_sp: 50000,
      },
      { skill_id: 3301, queue_position: 1, finished_level: 1 },
    ];
    server.use(authedJson(`/characters/${CHARACTER_ID}/skillqueue`, queue));

    const result = await getCharacterSkillQueue(CHARACTER_ID);

    expect(result.data).toEqual(queue);
    expect(result.data?.[1].finished_level).toBe(1);
  });

  it('getCharacterAttributes returns attributes and remap fields', async () => {
    const attributes: CharacterAttributes = {
      charisma: 19,
      intelligence: 27,
      memory: 21,
      perception: 21,
      willpower: 21,
      bonus_remaps: 2,
      accrued_remap_cooldown_date: '2027-01-01T00:00:00Z',
      last_remap_date: '2026-01-01T00:00:00Z',
    };
    server.use(authedJson(`/characters/${CHARACTER_ID}/attributes`, attributes));

    const result = await getCharacterAttributes(CHARACTER_ID);

    expect(result.data).toEqual(attributes);
  });
});

describe('clone and wallet endpoints', () => {
  it('getCharacterImplants returns the implant type IDs', async () => {
    server.use(authedJson(`/characters/${CHARACTER_ID}/implants`, [9899, 9941, 9942]));

    const result = await getCharacterImplants(CHARACTER_ID);

    expect(result.data).toEqual([9899, 9941, 9942]);
  });

  it('getCharacterWallet returns the ISK balance as a number', async () => {
    server.use(authedJson(`/characters/${CHARACTER_ID}/wallet`, 29500000.01));

    const result = await getCharacterWallet(CHARACTER_ID);

    expect(result.data).toBe(29500000.01);
  });
});

describe('public info endpoints', () => {
  it('getCharacterPublicInfo is unauthenticated and typed', async () => {
    let auth: string | null = 'unset';
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        auth = request.headers.get('authorization');
        return HttpResponse.json({
          name: 'CCP Bartender',
          corporation_id: 109299958,
          alliance_id: 434243723,
          birthday: '2015-03-24T11:37:00Z',
          bloodline_id: 3,
          gender: 'male',
          race_id: 2,
          security_status: 5.0,
        });
      })
    );

    const result = await getCharacterPublicInfo(CHARACTER_ID);

    expect(auth).toBeNull();
    expect(result.data?.name).toBe('CCP Bartender');
    expect(result.data?.corporation_id).toBe(109299958);
    expect(result.data?.alliance_id).toBe(434243723);
  });

  it('getCorporationPublicInfo returns corporation details', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/109299958`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        return HttpResponse.json({
          name: 'C C P',
          ticker: '-CCP-',
          ceo_id: 180548812,
          creator_id: 180548812,
          member_count: 226,
          tax_rate: 0.256,
          alliance_id: 434243723,
        });
      })
    );

    const result = await getCorporationPublicInfo(109299958);

    expect(result.data?.ticker).toBe('-CCP-');
    expect(result.data?.member_count).toBe(226);
  });

  it('getAlliancePublicInfo returns alliance details', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/alliances/434243723`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        return HttpResponse.json({
          name: 'C C P Alliance',
          ticker: '<C C P>',
          creator_corporation_id: 109299958,
          creator_id: 180548812,
          date_founded: '2016-06-26T21:00:00Z',
          executor_corporation_id: 98356193,
        });
      })
    );

    const result = await getAlliancePublicInfo(434243723);

    expect(result.data?.name).toBe('C C P Alliance');
    expect(result.data?.executor_corporation_id).toBe(98356193);
  });

  it('getUniverseType is unauthenticated and returns name + description', async () => {
    let auth: string | null = 'unset';
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/9899`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        auth = request.headers.get('authorization');
        return HttpResponse.json({
          type_id: 9899,
          name: 'Ocular Filter - Basic',
          description: 'A basic <b>ocular filter</b> implant.',
          group_id: 300,
          published: true,
        });
      })
    );

    const result = await getUniverseType(9899);

    expect(auth).toBeNull();
    expect(result.data?.name).toBe('Ocular Filter - Basic');
    expect(result.data?.description).toContain('ocular filter');
  });
});
