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
  getCharacterBlueprints,
  getCharacterPublicInfo,
  getCorporationPublicInfo,
  getAlliancePublicInfo,
  getUniverseType,
  getCharacterWalletJournal,
  getCharacterWalletTransactions,
  getCharacterAssets,
  getUniverseStation,
  getCharacterMailHeaders,
  getCharacterMail,
  postUniverseNames,
  getCharacterCalendar,
  getCharacterCalendarEvent,
  getCharacterContracts,
  getCharacterOrders,
  getCharacterOrderHistory,
  getCharacterIndustryJobs,
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

  it('getCharacterBlueprints fetches every page and returns owned blueprints', async () => {
    const page1 = [
      {
        item_id: 1,
        type_id: 638,
        runs: -1,
        material_efficiency: 10,
        time_efficiency: 20,
        quantity: 1,
      },
    ];
    const page2 = [
      {
        item_id: 2,
        type_id: 640,
        runs: 5,
        material_efficiency: 4,
        time_efficiency: 6,
        quantity: 1,
      },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/blueprints`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        if (request.headers.get('authorization') !== `Bearer token-${CHARACTER_ID}`) {
          return HttpResponse.json({ error: 'authentication needed' }, { status: 401 });
        }
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? page2 : page1, {
          headers: { 'X-Pages': '2' },
        });
      })
    );

    const blueprints = await getCharacterBlueprints(CHARACTER_ID);

    expect(blueprints).toEqual([...page1, ...page2]);
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

  it('getUniverseType passes through dogma_attributes when present', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/10209`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        return HttpResponse.json({
          type_id: 10209,
          name: 'Memory Augmentation - Improved',
          description: 'Grants a bonus to memory.',
          group_id: 745,
          published: true,
          dogma_attributes: [
            { attribute_id: 177, value: 5.0 },
            { attribute_id: 176, value: 0.0 },
          ],
        });
      })
    );

    const result = await getUniverseType(10209);

    expect(result.data?.dogma_attributes).toEqual([
      { attribute_id: 177, value: 5.0 },
      { attribute_id: 176, value: 0.0 },
    ]);
  });

  it('getUniverseStation is unauthenticated and returns the station name', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        return HttpResponse.json({
          station_id: 60003760,
          name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
          type_id: 1531,
          system_id: 30000142,
        });
      })
    );

    const result = await getUniverseStation(60003760);

    expect(result.data?.name).toBe('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
  });
});

describe('wallet journal + transactions', () => {
  it('getCharacterWalletJournal fetches every page', async () => {
    const page1 = [
      { id: 1, date: '2026-08-01T00:00:00Z', ref_type: 'player_donation', description: 'a' },
    ];
    const page2 = [
      { id: 2, date: '2026-08-02T00:00:00Z', ref_type: 'player_donation', description: 'b' },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/wallet/journal`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? page2 : page1, { headers: { 'X-Pages': '2' } });
      })
    );

    const entries = await getCharacterWalletJournal(CHARACTER_ID);

    expect(entries).toEqual([...page1, ...page2]);
  });

  it('getCharacterWalletTransactions cursors through from_id until a page is empty', async () => {
    const fromIds: (string | null)[] = [];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/wallet/transactions`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        const fromId = new URL(request.url).searchParams.get('from_id');
        fromIds.push(fromId);
        if (fromId === null) {
          return HttpResponse.json([
            {
              transaction_id: 20,
              date: '2026-08-02T00:00:00Z',
              location_id: 1,
              type_id: 34,
              unit_price: 5,
              quantity: 10,
              client_id: 1,
              is_buy: true,
              is_personal: true,
              journal_ref_id: 1,
            },
          ]);
        }
        if (fromId === '19') {
          return HttpResponse.json([
            {
              transaction_id: 10,
              date: '2026-08-01T00:00:00Z',
              location_id: 1,
              type_id: 34,
              unit_price: 4,
              quantity: 5,
              client_id: 1,
              is_buy: true,
              is_personal: true,
              journal_ref_id: 2,
            },
          ]);
        }
        return HttpResponse.json([]);
      })
    );

    const transactions = await getCharacterWalletTransactions(CHARACTER_ID);

    expect(fromIds).toEqual([null, '19', '9']);
    expect(transactions.map((t) => t.transaction_id)).toEqual([20, 10]);
  });
});

describe('assets', () => {
  it('getCharacterAssets fetches every page', async () => {
    const page1 = [
      {
        item_id: 1,
        type_id: 34,
        quantity: 100,
        location_id: 60003760,
        location_type: 'station' as const,
        location_flag: 'Hangar',
        is_singleton: false,
      },
    ];
    const page2 = [
      {
        item_id: 2,
        type_id: 35,
        quantity: 5,
        location_id: 60003760,
        location_type: 'station' as const,
        location_flag: 'Hangar',
        is_singleton: true,
      },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/assets`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? page2 : page1, { headers: { 'X-Pages': '2' } });
      })
    );

    const assets = await getCharacterAssets(CHARACTER_ID);

    expect(assets).toEqual([...page1, ...page2]);
  });
});

describe('mail', () => {
  it('getCharacterMailHeaders returns recent headers', async () => {
    server.use(
      authedJson(`/characters/${CHARACTER_ID}/mail`, [
        {
          mail_id: 1,
          from: 90000001,
          subject: 'Hello',
          timestamp: '2026-08-01T00:00:00Z',
          is_read: false,
          labels: [],
        },
      ])
    );

    const result = await getCharacterMailHeaders(CHARACTER_ID);

    expect(result.data?.[0].subject).toBe('Hello');
    expect(result.data?.[0].is_read).toBe(false);
  });

  it('getCharacterMail returns the body, using `read` not `is_read`', async () => {
    server.use(
      authedJson(`/characters/${CHARACTER_ID}/mail/1`, {
        from: 90000001,
        subject: 'Hello',
        body: 'Hi <b>there</b>',
        read: true,
      })
    );

    const result = await getCharacterMail(CHARACTER_ID, 1);

    expect(result.data?.body).toBe('Hi <b>there</b>');
    expect(result.data?.read).toBe(true);
  });
});

describe('postUniverseNames', () => {
  it('POSTs the id array and returns resolved names, sending the ESI headers', async () => {
    let capturedBody: unknown;
    let capturedHeaders: Headers | null = null;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        capturedHeaders = request.headers;
        capturedBody = await request.json();
        return HttpResponse.json([{ id: 90000001, name: 'Some Pilot', category: 'character' }]);
      })
    );

    const names = await postUniverseNames([90000001]);

    expect(names).toEqual([{ id: 90000001, name: 'Some Pilot', category: 'character' }]);
    expect(capturedBody).toEqual([90000001]);
    const headers = capturedHeaders as Headers | null;
    expect(headers?.get('content-type')).toContain('application/json');
  });

  it('returns an empty array without a request when given no ids', async () => {
    let called = false;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => {
        called = true;
        return HttpResponse.json([]);
      })
    );

    const names = await postUniverseNames([]);

    expect(names).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('calendar', () => {
  it('getCharacterCalendar returns event summaries', async () => {
    server.use(
      authedJson(`/characters/${CHARACTER_ID}/calendar`, [
        {
          event_id: 1,
          event_date: '2026-09-01T18:00:00Z',
          title: 'Fleet Op',
          importance: 1,
          event_response: 'accepted',
        },
      ])
    );

    const result = await getCharacterCalendar(CHARACTER_ID);

    expect(result.data?.[0].title).toBe('Fleet Op');
  });

  it('getCharacterCalendarEvent returns full detail', async () => {
    server.use(
      authedJson(`/characters/${CHARACTER_ID}/calendar/1`, {
        event_id: 1,
        title: 'Fleet Op',
        date: '2026-09-01T18:00:00Z',
        duration: 60,
        importance: 1,
        owner_id: 1,
        owner_name: 'Fleet Commander',
        owner_type: 'character',
        response: 'accepted',
        text: 'Bring your ship',
      })
    );

    const result = await getCharacterCalendarEvent(CHARACTER_ID, 1);

    expect(result.data?.text).toBe('Bring your ship');
  });
});

describe('contracts', () => {
  it('getCharacterContracts fetches every page', async () => {
    const base = {
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
    };
    const page1 = [{ ...base, contract_id: 1 }];
    const page2 = [{ ...base, contract_id: 2 }];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/contracts`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? page2 : page1, { headers: { 'X-Pages': '2' } });
      })
    );

    const contracts = await getCharacterContracts(CHARACTER_ID);

    expect(contracts.map((c) => c.contract_id)).toEqual([1, 2]);
  });
});

describe('orders', () => {
  it('getCharacterOrders returns open orders (single call)', async () => {
    server.use(
      authedJson(`/characters/${CHARACTER_ID}/orders`, [
        {
          order_id: 1,
          type_id: 34,
          region_id: 10000002,
          location_id: 60003760,
          is_buy_order: false,
          is_corporation: false,
          price: 5.5,
          volume_remain: 100,
          volume_total: 200,
          issued: '2026-08-01T00:00:00Z',
          duration: 90,
          range: 'region',
        },
      ])
    );

    const result = await getCharacterOrders(CHARACTER_ID);

    expect(result.data?.[0].order_id).toBe(1);
  });

  it('getCharacterOrderHistory fetches every page', async () => {
    const base = {
      type_id: 34,
      region_id: 10000002,
      location_id: 60003760,
      is_corporation: false,
      price: 5.5,
      volume_remain: 0,
      volume_total: 200,
      issued: '2026-08-01T00:00:00Z',
      duration: 90,
      range: 'region',
      state: 'expired' as const,
    };
    const page1 = [{ ...base, order_id: 1 }];
    const page2 = [{ ...base, order_id: 2 }];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/orders/history`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? page2 : page1, { headers: { 'X-Pages': '2' } });
      })
    );

    const history = await getCharacterOrderHistory(CHARACTER_ID);

    expect(history.map((o) => o.order_id)).toEqual([1, 2]);
  });
});

describe('industry jobs', () => {
  it('getCharacterIndustryJobs sends include_completed=false by default (single call, not paginated)', async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/industry/jobs`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        query = new URL(request.url).searchParams;
        return HttpResponse.json([
          {
            job_id: 1,
            activity_id: 1,
            blueprint_type_id: 638,
            facility_id: 60003760,
            station_id: 60003760,
            runs: 1,
            start_date: '2026-08-01T00:00:00Z',
            end_date: '2026-08-01T01:00:00Z',
            status: 'active',
          },
        ]);
      })
    );

    const result = await getCharacterIndustryJobs(CHARACTER_ID);

    expect(query?.get('include_completed')).toBe('false');
    expect(result.data?.[0].job_id).toBe(1);
    expect(result.pages).toBe(1);
  });

  it('getCharacterIndustryJobs forwards includeCompleted: true', async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/industry/jobs`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      })
    );

    await getCharacterIndustryJobs(CHARACTER_ID, { includeCompleted: true });

    expect(query?.get('include_completed')).toBe('true');
  });
});
