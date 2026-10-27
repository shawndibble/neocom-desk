import { describe, expect, it, vi } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import { JANICE_PROXY_URL, requestJaniceAppraisal } from './janice';

const jita = TRADE_HUBS[0];

function call(response: Response | Error) {
  const fetchFn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return {
    fetchFn,
    result: requestJaniceAppraisal({
      text: 'Tritanium 5',
      hub: jita,
      pricePercent: 95,
      fetchFn: fetchFn as unknown as typeof fetch,
    }),
  };
}

describe('requestJaniceAppraisal', () => {
  it('posts the text, hub and Price Percent to the proxy and returns the link', async () => {
    const { fetchFn, result } = call(Response.json({ url: 'https://janice.e-351.com/a/Gb7io5' }));
    expect(await result).toEqual({ ok: true, url: 'https://janice.e-351.com/a/Gb7io5' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JANICE_PROXY_URL);
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'Tritanium 5',
      hub: 'jita',
      pricePercent: 95,
    });
  });

  it('names the failures the user can act on', async () => {
    for (const error of ['too-large', 'nothing-parsed', 'rate-limited'] as const) {
      const { result } = call(Response.json({ error }, { status: 422 }));
      expect(await result).toEqual({ ok: false, reason: error });
    }
  });

  it('reports anything else as a plain failure', async () => {
    expect(await call(Response.json({ error: 'janice-failed' }, { status: 502 })).result).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(await call(new Error('offline')).result).toEqual({ ok: false, reason: 'failed' });
    for (const url of [
      'javascript:alert(1)',
      'https://evil.example/a/x',
      'https://janice.e-351.com.evil.example/a/x',
    ]) {
      expect(await call(Response.json({ url })).result).toEqual({ ok: false, reason: 'failed' });
    }
  });
});
