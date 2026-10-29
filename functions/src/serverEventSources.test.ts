import { describe, expect, it, vi } from 'vitest';
import { fetchFuzzworkPrices } from './serverEventSources.js';

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

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

  it('sends a descriptive User-Agent with no email address', async () => {
    const fetchImpl = vi.fn(async () => response(200, {}));
    await fetchFuzzworkPrices(1, [34], fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const agent = (init.headers as Record<string, string>)['User-Agent'];
    expect(agent).toMatch(/Neocom Desk/);
    expect(agent).not.toMatch(/@/);
  });

  it('answers null when a read fails, so no price reads as missing', async () => {
    expect(
      await fetchFuzzworkPrices(1, [34], (async () => response(503, {})) as typeof fetch)
    ).toBeNull();
  });
});
