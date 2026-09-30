import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHullLosses, parseHullLosses } from './zkillboard';

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
