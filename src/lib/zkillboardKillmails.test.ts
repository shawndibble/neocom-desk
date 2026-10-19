import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPilotKillmailHistory,
  fetchPilotKillmails,
  parsePilotKillmails,
  PILOT_KILLMAIL_LIMIT,
  PILOT_LIST_PAGE_SIZE,
  readKillmailDetail,
  resetPilotKillmailsCache,
} from './zkillboard';

const INLINE = {
  killmail_id: 101,
  killmail_time: '2026-09-01T12:00:00Z',
  solar_system_id: 30000142,
  victim: {
    character_id: 900,
    corporation_id: 901,
    ship_type_id: 626,
    items: [{ item_type_id: 100, flag: 27, quantity_destroyed: 1, singleton: 0 }],
  },
  attackers: [
    { character_id: 42, corporation_id: 200, ship_type_id: 11, final_blow: false },
    { character_id: 43, corporation_id: 201, ship_type_id: 12, final_blow: true },
  ],
  zkb: { hash: 'aa', fittedValue: 10, totalValue: 5000 },
};

describe('readKillmailDetail', () => {
  it('reads time, system, victim and final blow from a killmail body', () => {
    expect(readKillmailDetail(INLINE)).toEqual({
      time: '2026-09-01T12:00:00Z',
      systemId: 30000142,
      victim: { ship_type_id: 626, items: INLINE.victim.items },
      victimParty: { characterId: 900, corporationId: 901, shipTypeId: 626 },
      finalBlow: { characterId: 43, corporationId: 201, shipTypeId: 12 },
    });
  });

  it('falls back to the first attacker, and to nulls for an NPC with no pilot', () => {
    const detail = readKillmailDetail({
      ...INLINE,
      attackers: [{ ship_type_id: 3000 }],
    });
    expect(detail?.finalBlow).toEqual({ characterId: null, corporationId: null, shipTypeId: 3000 });
  });

  it('is null without a readable victim', () => {
    expect(readKillmailDetail({ killmail_id: 1 })).toBeNull();
    expect(readKillmailDetail(null)).toBeNull();
  });
});

describe('parsePilotKillmails', () => {
  it('reads an inline entry with its detail and zKillboard total value', () => {
    const [entry] = parsePilotKillmails([INLINE], 'kill');
    expect(entry).toMatchObject({ killmailId: 101, hash: 'aa', side: 'kill', value: 5000 });
    expect(entry?.detail?.systemId).toBe(30000142);
  });

  it('reads a hash-only entry with no detail', () => {
    expect(parsePilotKillmails([{ killmail_id: 7, zkb: { hash: 'bb' } }], 'loss')).toEqual([
      { killmailId: 7, hash: 'bb', side: 'loss', value: null, detail: null },
    ]);
  });

  it('drops entries without an id or hash', () => {
    expect(parsePilotKillmails([{ killmail_id: 7 }, { zkb: { hash: 'x' } }, 3], 'kill')).toEqual(
      []
    );
    expect(parsePilotKillmails({ error: 'nope' }, 'kill')).toEqual([]);
  });
});

describe('fetchPilotKillmails', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetPilotKillmailsCache();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function respond(bodies: Record<string, unknown>) {
    fetchMock.mockImplementation((url: string) => {
      const body = bodies[url];
      return Promise.resolve(
        body === undefined
          ? { ok: false, json: () => Promise.resolve(null) }
          : { ok: true, json: () => Promise.resolve(body) }
      );
    });
  }

  it('merges kills and losses newest first, capped', async () => {
    const kills = Array.from({ length: 20 }, (_, i) => ({
      killmail_id: 1000 + i * 2,
      zkb: { hash: `k${i}` },
    }));
    const losses = Array.from({ length: 20 }, (_, i) => ({
      killmail_id: 1001 + i * 2,
      zkb: { hash: `l${i}` },
    }));
    respond({
      'https://zkillboard.com/api/kills/characterID/42/': kills,
      'https://zkillboard.com/api/losses/characterID/42/': losses,
    });
    const result = await fetchPilotKillmails(42);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(PILOT_KILLMAIL_LIMIT);
    expect(result.entries[0]).toMatchObject({ killmailId: 1039, side: 'loss' });
    expect(result.entries[1]).toMatchObject({ killmailId: 1038, side: 'kill' });
  });

  it('fails when either list fails, and does not cache the failure', async () => {
    respond({ 'https://zkillboard.com/api/kills/characterID/42/': [] });
    expect(await fetchPilotKillmails(42)).toEqual({ ok: false, reason: 'http' });
    respond({
      'https://zkillboard.com/api/kills/characterID/42/': [],
      'https://zkillboard.com/api/losses/characterID/42/': [],
    });
    expect(await fetchPilotKillmails(42)).toEqual({ ok: true, entries: [] });
  });

  it('reuses an answer for the cache window', async () => {
    respond({
      'https://zkillboard.com/api/kills/characterID/42/': [],
      'https://zkillboard.com/api/losses/characterID/42/': [],
    });
    await fetchPilotKillmails(42);
    await fetchPilotKillmails(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchPilotKillmailHistory', () => {
  const fetchMock = vi.fn();
  const KILLS = 'https://zkillboard.com/api/kills/characterID/42/';
  const LOSSES = 'https://zkillboard.com/api/losses/characterID/42/';
  const at = (id: number, time: string) => ({
    ...INLINE,
    killmail_id: id,
    killmail_time: time,
    zkb: { hash: `h${id}`, totalValue: id },
  });
  beforeEach(() => {
    resetPilotKillmailsCache();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });
  function respond(bodies: Record<string, unknown>) {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        bodies[url] === undefined
          ? { ok: false, json: () => Promise.resolve(null) }
          : { ok: true, json: () => Promise.resolve(bodies[url]) }
      )
    );
  }

  it('merges both lists newest first, uncapped, with the whole record held', async () => {
    respond({
      [KILLS]: [at(1, '2026-09-01T00:00:00Z'), at(3, '2026-09-03T00:00:00Z')],
      [LOSSES]: [at(2, '2026-09-02T00:00:00Z')],
    });
    const result = await fetchPilotKillmailHistory(42);
    expect(result.ok && result.entries.map((e) => [e.killmailId, e.side])).toEqual([
      [3, 'kill'],
      [2, 'loss'],
      [1, 'kill'],
    ]);
    expect(result.ok && result.reachesBackTo).toBeNull();
  });

  it('reports how far back a full page reaches', async () => {
    const full = Array.from({ length: PILOT_LIST_PAGE_SIZE }, (_, i) =>
      at(1000 + i, new Date(Date.parse('2026-10-01T00:00:00Z') - i * 3_600_000).toISOString())
    );
    respond({ [KILLS]: full, [LOSSES]: [at(5, '2026-01-01T00:00:00Z')] });
    const result = await fetchPilotKillmailHistory(42);
    expect(result.ok && result.reachesBackTo).toBe(
      Date.parse('2026-10-01T00:00:00Z') - (PILOT_LIST_PAGE_SIZE - 1) * 3_600_000
    );
  });

  it('shares the cached lists: a second read asks zKillboard nothing', async () => {
    respond({ [KILLS]: [], [LOSSES]: [] });
    await fetchPilotKillmailHistory(42);
    await fetchPilotKillmailHistory(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails when a list fails, and when entries carry no time to count by', async () => {
    respond({ [KILLS]: [] });
    expect(await fetchPilotKillmailHistory(42)).toEqual({ ok: false, reason: 'http' });
    resetPilotKillmailsCache();
    respond({ [KILLS]: [{ killmail_id: 7, zkb: { hash: 'bb' } }], [LOSSES]: [] });
    expect(await fetchPilotKillmailHistory(42)).toEqual({ ok: false, reason: 'parse' });
  });
});
