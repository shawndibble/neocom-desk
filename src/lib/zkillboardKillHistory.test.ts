import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPilotKillHistory, parseKillHistory, resetPilotKillHistoryCache } from './zkillboard';

const PILOT = 381203226;

function entry(over: Record<string, unknown> = {}) {
  return {
    killmail_id: 1,
    killmail_time: '2026-10-08T10:00:00Z',
    solar_system_id: 30002187,
    victim: { ship_type_id: 629 },
    attackers: [
      { character_id: 111, ship_type_id: 11 },
      { character_id: PILOT, ship_type_id: 24698 },
    ],
    zkb: { hash: 'abc', labels: ['cat:6', 'loc:nullsec', 'pvp'] },
    ...over,
  };
}

describe('parseKillHistory', () => {
  it('reads time, space, system, victim hull and the pilot own hull', () => {
    expect(parseKillHistory([entry()], PILOT)).toEqual([
      {
        timeMs: Date.parse('2026-10-08T10:00:00Z'),
        space: 'nullsec',
        systemId: 30002187,
        victimShipTypeId: 629,
        ownShipTypeId: 24698,
      },
    ]);
  });

  it.each([
    ['loc:highsec', 'highsec'],
    ['loc:lowsec', 'lowsec'],
    ['loc:nullsec', 'nullsec'],
    ['loc:w-space', 'wormhole'],
  ] as const)('maps %s to %s', (label, space) => {
    const [kill] = parseKillHistory([entry({ zkb: { labels: [label] } })], PILOT);
    expect(kill.space).toBe(space);
  });

  it('leaves space null for an unknown or missing label', () => {
    const [a] = parseKillHistory([entry({ zkb: { labels: ['loc:abyssal'] } })], PILOT);
    const [b] = parseKillHistory([entry({ zkb: {} })], PILOT);
    expect(a.space).toBeNull();
    expect(b.space).toBeNull();
  });

  it('has no own hull when the pilot is not among the attackers', () => {
    const [kill] = parseKillHistory(
      [entry({ attackers: [{ character_id: 5, ship_type_id: 1 }] })],
      PILOT
    );
    expect(kill.ownShipTypeId).toBeNull();
  });

  it('drops entries with no readable time, and a body that is not a list is empty', () => {
    expect(
      parseKillHistory(
        [entry({ killmail_time: 'soon' }), entry({ killmail_time: undefined })],
        PILOT
      )
    ).toEqual([]);
    expect(parseKillHistory({ error: 'x' }, PILOT)).toEqual([]);
  });
});

describe('fetchPilotKillHistory', () => {
  beforeEach(() => resetPilotKillHistoryCache());
  afterEach(() => vi.unstubAllGlobals());

  it('asks for kills only, with no custom headers, and caches the answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([entry()])));
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchPilotKillHistory(PILOT);
    const second = await fetchPilotKillHistory(PILOT);
    expect(first).toEqual({ ok: true, kills: expect.any(Array) });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://zkillboard.com/api/kills/characterID/${PILOT}/`
    );
  });

  it('answers ok with no kills for an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]'))
    );
    expect(await fetchPilotKillHistory(PILOT)).toEqual({ ok: true, kills: [] });
  });

  it('fails, and never caches the failure, on a non-ok answer or a network error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPilotKillHistory(PILOT)).toEqual({ ok: false });
    expect(await fetchPilotKillHistory(PILOT)).toEqual({ ok: false });
    expect(await fetchPilotKillHistory(PILOT)).toEqual({ ok: true, kills: [] });
  });

  it('fails, not "no kills", when the entries carry no killmail body to date them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ killmail_id: 1, zkb: { hash: 'h' } }])))
    );
    expect(await fetchPilotKillHistory(PILOT)).toEqual({ ok: false });
  });

  it('fails when zKillboard answers with an error body instead of a list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'rate' })))
    );
    expect(await fetchPilotKillHistory(PILOT)).toEqual({ ok: false });
  });
});
