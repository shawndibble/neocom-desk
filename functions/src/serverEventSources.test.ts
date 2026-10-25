import { describe, expect, it, vi } from 'vitest';
import { fetchFuzzworkPrices, fetchZkillLosses, parseZkillLosses } from './serverEventSources.js';

const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('parseZkillLosses', () => {
  it('reads the inline killmail, and drops entries with no time, like the Overview widget', () => {
    expect(
      parseZkillLosses([
        {
          killmail_id: 2,
          killmail_time: '2026-10-25T10:00:00Z',
          solar_system_id: 30000142,
          victim: { ship_type_id: 587 },
          zkb: { hash: 'h', totalValue: 1234.5 },
        },
        { killmail_id: 3, zkb: { hash: 'h' } },
        { killmail_id: 4, killmail_time: '2026-10-25T10:00:00Z', victim: {}, zkb: { hash: 'h' } },
        { killmail_id: 'x' },
      ])
    ).toEqual([
      {
        killmailId: 2,
        timeMs: Date.parse('2026-10-25T10:00:00Z'),
        shipTypeId: 587,
        systemId: 30000142,
        value: 1234.5,
      },
    ]);
    expect(parseZkillLosses({})).toBeNull();
  });
});

describe('fetchZkillLosses', () => {
  it('sends a descriptive User-Agent with no email address', async () => {
    const fetchImpl = vi.fn(async () => response(200, []));
    await fetchZkillLosses(7, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://zkillboard.com/api/losses/characterID/7/');
    const agent = (init.headers as Record<string, string>)['User-Agent'];
    expect(agent).toMatch(/Neocom Desk/);
    expect(agent).not.toMatch(/@/);
  });

  it('backs off on 429 and reports other failures as errors', async () => {
    expect(await fetchZkillLosses(7, (async () => response(429, {})) as typeof fetch)).toEqual({
      kind: 'backoff',
    });
    expect(await fetchZkillLosses(7, (async () => response(500, {})) as typeof fetch)).toEqual({
      kind: 'error',
    });
    expect(
      await fetchZkillLosses(7, (async () => response(200, { no: 1 })) as typeof fetch)
    ).toEqual({ kind: 'error' });
    // Hash-only entries: not an empty list, or the next good read would be a burst.
    const hashOnly = [{ killmail_id: 1, zkb: { hash: 'h' } }];
    expect(
      await fetchZkillLosses(7, (async () => response(200, hashOnly)) as typeof fetch)
    ).toEqual({ kind: 'error' });
    expect(await fetchZkillLosses(7, (async () => response(200, [])) as typeof fetch)).toEqual({
      kind: 'ok',
      losses: [],
    });
  });
});

describe('fetchFuzzworkPrices', () => {
  it('reads the lowest sell per type, null where the station has no sell order', async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, {
        '34': { sell: { min: '5.5', orderCount: '3' } },
        '35': { sell: { min: '0', orderCount: '0' } },
      })
    );
    const prices = await fetchFuzzworkPrices(
      60003760,
      [34, 35, 36],
      fetchImpl as unknown as typeof fetch
    );
    expect(prices).toEqual(
      new Map([
        [34, 5.5],
        [35, null],
        [36, null],
      ])
    );
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://market.fuzzwork.co.uk/aggregates/?station=60003760&types=34,35,36');
  });

  it('answers null when a read fails, so no price reads as missing', async () => {
    expect(
      await fetchFuzzworkPrices(1, [34], (async () => response(503, {})) as typeof fetch)
    ).toBeNull();
  });
});
