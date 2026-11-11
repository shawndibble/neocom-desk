import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeShortLink, shortStartLinkEndpoint } from './shortStartLink';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-proj');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('makeShortLink', () => {
  it('posts the start link query as JSON and returns the short link on this site', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'xk3p9q' }) });
    const url = await makeShortLink('/survey?place=Efa&placeId=7&rate=5');
    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe('https://us-central1-demo-proj.cloudfunctions.net/shortStartLink');
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

  it('has no endpoint without a Firebase project', () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    expect(shortStartLinkEndpoint()).toBeNull();
  });
});
