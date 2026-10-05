import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchHullLosses,
  fetchRegionRecentKills,
  REGION_PAGE_SIZE,
  fetchSystemRecentKills,
  parseHullLosses,
  parseRegionKills,
  parseSystemKills,
  systemZkillUrl,
} from './zkillboard';

const VICTIM = {
  ship_type_id: 626,
  items: [{ item_type_id: 100, flag: 27, quantity_destroyed: 1, singleton: 0 }],
};

describe('parseHullLosses', () => {
  it('reads the hash-only shape, with no victim or time', () => {
    const losses = parseHullLosses([
      { killmail_id: 7, zkb: { hash: 'aa', fittedValue: 1000, totalValue: 5000 } },
    ]);
    expect(losses).toEqual([{ killmailId: 7, hash: 'aa', value: 1000, time: null, victim: null }]);
  });

  it('reads an inline killmail body, victim and time included', () => {
    const losses = parseHullLosses([
      {
        killmail_id: 8,
        killmail_time: '2026-09-01T12:00:00Z',
        victim: VICTIM,
        zkb: { hash: 'bb', totalValue: 5000 },
      },
    ]);
    expect(losses).toEqual([
      { killmailId: 8, hash: 'bb', value: 5000, time: '2026-09-01T12:00:00Z', victim: VICTIM },
    ]);
  });

  it('keeps the most recent entries only, newest first', () => {
    const body = [1, 5, 3, 4, 2].map((id) => ({ killmail_id: id, zkb: { hash: `h${id}` } }));
    expect(parseHullLosses(body, 3).map((loss) => loss.killmailId)).toEqual([5, 4, 3]);
  });

  it('drops malformed entries and a victim without a hull', () => {
    const losses = parseHullLosses([
      null,
      { killmail_id: 'x', zkb: { hash: 'a' } },
      { killmail_id: 9 },
      { killmail_id: 10, zkb: { hash: 'c' }, victim: { items: [] } },
    ]);
    expect(losses).toEqual([{ killmailId: 10, hash: 'c', value: null, time: null, victim: null }]);
  });

  it('reads anything but an array as no losses', () => {
    expect(parseHullLosses({ error: 'nope' })).toEqual([]);
  });
});

describe('fetchHullLosses', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(response: Partial<Response> | Error) {
    const fetchMock = vi.fn(() =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it("asks zKillboard's losses API for the hull, with no custom headers", async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ killmail_id: 1, zkb: { hash: 'a' } }]),
    });
    const result = await fetchHullLosses(626);
    expect(fetchMock).toHaveBeenCalledWith('https://zkillboard.com/api/losses/shipTypeID/626/');
    expect(result).toEqual({
      ok: true,
      losses: [{ killmailId: 1, hash: 'a', value: null, time: null, victim: null }],
    });
  });

  it('fails on a rate limit, an empty body or a network error', async () => {
    stubFetch({ ok: false, status: 429, json: () => Promise.resolve([]) });
    expect(await fetchHullLosses(626)).toEqual({ ok: false, losses: [] });

    stubFetch({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('empty')) });
    expect(await fetchHullLosses(626)).toEqual({ ok: false, losses: [] });

    stubFetch(new TypeError('network'));
    expect(await fetchHullLosses(626)).toEqual({ ok: false, losses: [] });
  });
});

// Trimmed from a real `kills/systemID/{id}/pastSeconds/3600/` body.
const SYSTEM_KILL = {
  attackers: [
    { character_id: 1, ship_type_id: 17720, weapon_type_id: 2921, final_blow: true },
    { character_id: 2, ship_type_id: 17722, weapon_type_id: 47702 },
  ],
  killmail_id: 138801220,
  killmail_time: '2026-09-30T04:55:10Z',
  solar_system_id: 30002813,
  victim: { ship_type_id: 670, items: [] },
  zkb: { locationID: 50014002, hash: 'e3dc', npc: false, labels: ['pvp', 'loc:lowsec'] },
};

describe('parseSystemKills', () => {
  it("reads each kill's time, location and attacker ships and weapons", () => {
    expect(parseSystemKills([SYSTEM_KILL])).toEqual([
      {
        killmailId: 138801220,
        time: Date.parse('2026-09-30T04:55:10Z'),
        locationId: 50014002,
        attackers: [
          { shipTypeId: 17720, weaponTypeId: 2921 },
          { shipTypeId: 17722, weaponTypeId: 47702 },
        ],
      },
    ]);
  });

  it('drops NPC kills', () => {
    const npc = { ...SYSTEM_KILL, killmail_id: 2, zkb: { ...SYSTEM_KILL.zkb, npc: true } };
    expect(parseSystemKills([npc, SYSTEM_KILL]).map((kill) => kill.killmailId)).toEqual([
      138801220,
    ]);
  });

  it('keeps a kill with no location or attackers, and drops one with no id or time', () => {
    const bare = { killmail_id: 3, killmail_time: '2026-09-30T05:00:00Z', zkb: {} };
    expect(parseSystemKills([bare])).toEqual([
      { killmailId: 3, time: Date.parse('2026-09-30T05:00:00Z'), locationId: null, attackers: [] },
    ]);
    expect(
      parseSystemKills([
        { killmail_time: '2026-09-30T05:00:00Z' },
        { killmail_id: 4 },
        { killmail_id: 5, killmail_time: 'not a date' },
        null,
      ])
    ).toEqual([]);
  });

  it('reads anything but an array as no kills', () => {
    expect(parseSystemKills({ error: 'nope' })).toEqual([]);
  });
});

describe('fetchSystemRecentKills', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(response: Partial<Response> | Error) {
    const fetchMock = vi.fn(() =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it("asks zKillboard for the system's last hour, with no custom headers", async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve([SYSTEM_KILL]),
    });
    const result = await fetchSystemRecentKills(30002813);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://zkillboard.com/api/kills/systemID/30002813/pastSeconds/3600/'
    );
    expect(result.ok && result.kills.map((kill) => kill.killmailId)).toEqual([138801220]);
  });

  it('fails on a rate limit, an unreadable body or a network error', async () => {
    stubFetch({ ok: false, status: 429, json: () => Promise.resolve([]) });
    expect(await fetchSystemRecentKills(1)).toEqual({ ok: false });

    stubFetch({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('empty')) });
    expect(await fetchSystemRecentKills(1)).toEqual({ ok: false });

    stubFetch(new TypeError('network'));
    expect(await fetchSystemRecentKills(1)).toEqual({ ok: false });
  });
});

describe('parseRegionKills', () => {
  it('groups player kills by the system they happened in', () => {
    const other = { ...SYSTEM_KILL, killmail_id: 2, solar_system_id: 30000142 };
    const sameSystem = { ...SYSTEM_KILL, killmail_id: 3 };
    const byId = parseRegionKills([SYSTEM_KILL, other, sameSystem]);
    expect([...byId.keys()]).toEqual([30002813, 30000142]);
    expect(byId.get(30002813)?.map((kill) => kill.killmailId)).toEqual([138801220, 3]);
    expect(byId.get(30000142)?.map((kill) => kill.killmailId)).toEqual([2]);
  });

  it('drops NPC kills and kills with no system', () => {
    const npc = { ...SYSTEM_KILL, killmail_id: 2, zkb: { ...SYSTEM_KILL.zkb, npc: true } };
    const noSystem = { ...SYSTEM_KILL, killmail_id: 3, solar_system_id: undefined };
    expect([...parseRegionKills([npc, noSystem]).keys()]).toEqual([]);
  });

  it('reads anything but an array as no kills', () => {
    expect(parseRegionKills({ error: 'nope' }).size).toBe(0);
  });
});

describe('fetchRegionRecentKills', () => {
  afterEach(() => vi.unstubAllGlobals());

  const page = (count: number, firstId = 1) =>
    Array.from({ length: count }, (_, i) => ({ ...SYSTEM_KILL, killmail_id: firstId + i }));

  function stubPages(pages: unknown[]) {
    const fetchMock = vi.fn((url: string) => {
      const n = Number(/\/page\/(\d+)\//.exec(url)?.[1] ?? 1);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(pages[n - 1] ?? []),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it("asks zKillboard for the region's last hour, with no custom headers", async () => {
    const fetchMock = stubPages([[SYSTEM_KILL]]);
    const result = await fetchRegionRecentKills(10000002);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://zkillboard.com/api/kills/regionID/10000002/pastSeconds/3600/'
    );
    expect(result.ok && result.bySystem.get(30002813)).toHaveLength(1);
  });

  it('reads the next page while a page comes back full, so nothing is cut off', async () => {
    const fetchMock = stubPages([
      page(REGION_PAGE_SIZE),
      page(REGION_PAGE_SIZE, 5000),
      page(2, 9000),
    ]);
    const result = await fetchRegionRecentKills(10000002);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://zkillboard.com/api/kills/regionID/10000002/pastSeconds/3600/page/3/'
    );
    expect(result.ok && result.bySystem.get(30002813)).toHaveLength(2 * REGION_PAGE_SIZE + 2);
  });

  it('counts a kill once when it shows on two pages', async () => {
    stubPages([page(REGION_PAGE_SIZE), page(3, REGION_PAGE_SIZE)]);
    const result = await fetchRegionRecentKills(1);
    expect(result.ok && result.bySystem.get(30002813)).toHaveLength(REGION_PAGE_SIZE + 2);
  });

  it('fails when the pages never end, rather than show a cut-off hour', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(page(REGION_PAGE_SIZE)),
        } as Response)
      )
    );
    expect(await fetchRegionRecentKills(1)).toEqual({ ok: false });
  });

  it('fails on an error body, rather than read it as no kills', async () => {
    stubPages([{ error: 'nope' }]);
    expect(await fetchRegionRecentKills(1)).toEqual({ ok: false });
  });

  it('fails when any page fails, rather than show a partial hour', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        return Promise.resolve({
          ok: call === 1,
          status: call === 1 ? 200 : 429,
          json: () => Promise.resolve(page(REGION_PAGE_SIZE)),
        } as Response);
      })
    );
    expect(await fetchRegionRecentKills(1)).toEqual({ ok: false });
  });

  it('fails on a network error or an unreadable body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('network')))
    );
    expect(await fetchRegionRecentKills(1)).toEqual({ ok: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('x')) } as Response)
      )
    );
    expect(await fetchRegionRecentKills(1)).toEqual({ ok: false });
  });
});

describe('systemZkillUrl', () => {
  it("links zKillboard's system page", () => {
    expect(systemZkillUrl(30002813)).toBe('https://zkillboard.com/system/30002813/');
  });
});
