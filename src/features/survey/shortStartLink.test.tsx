import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHORT_LINK_ENDPOINT, ShortLinkLimited, makeShortLink } from './shortStartLink';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('makeShortLink', () => {
  it('posts the start link query as JSON and returns the short link on this site', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'xk3p9q' }) });
    const url = await makeShortLink('/survey?place=Efa&placeId=7&rate=5');
    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe('https://api.neocomdesk.com/short');
    expect(endpoint).toBe(SHORT_LINK_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ place: 'Efa', placeId: '7', rate: '5' });
    expect(url.endsWith('/s/xk3p9q')).toBe(true);
  });

  it('fails when the service refuses or answers with nothing usable', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'bad' }) });
    await expect(makeShortLink('/survey?rate=500')).rejects.toThrow();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    await expect(makeShortLink('/survey?rate=5')).rejects.toThrow();
  });

  it('reports a rate limit with how long to wait', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ retryAfterSeconds: 17 }),
    });
    await expect(makeShortLink('/survey?rate=5')).rejects.toEqual(new ShortLinkLimited(17));
  });
});
