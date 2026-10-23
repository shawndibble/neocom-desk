import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLatestRelease, compareRelease, RELEASE_FILE } from './latestRelease';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const reply = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: async () => body });

describe('compareRelease', () => {
  it('is same for equal releases', () => {
    expect(compareRelease('neocom-desk@1+abc', 'neocom-desk@1+abc')).toBe('same');
  });
  it('is newer when the published release differs from the running one', () => {
    expect(compareRelease('neocom-desk@1+def', 'neocom-desk@1+abc')).toBe('newer');
  });
  it('is unknown when the published release could not be read', () => {
    expect(compareRelease(null, 'neocom-desk@1+abc')).toBe('unknown');
  });
});

describe('fetchLatestRelease', () => {
  it('reads the release past every cache', async () => {
    const fetchFn = reply({ release: 'neocom-desk@1+def' });
    vi.stubGlobal('fetch', fetchFn);
    expect(await fetchLatestRelease()).toBe('neocom-desk@1+def');
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain(RELEASE_FILE);
    expect(init.cache).toBe('no-store');
  });

  it.each([
    ['a failed response', reply({ release: 'x' }, false)],
    ['a body without a release', reply({})],
    ['a non-string release', reply({ release: 3 })],
    [
      'a body that is not JSON (the SPA fallback page)',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    ],
    ['a network error', vi.fn().mockRejectedValue(new TypeError('offline'))],
  ])('is null for %s', async (_name, fetchFn) => {
    vi.stubGlobal('fetch', fetchFn);
    expect(await fetchLatestRelease()).toBeNull();
  });

  it('is null when the read does not settle in time', async () => {
    vi.useFakeTimers();
    // Like a real fetch, rejects when its signal aborts.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
          )
      )
    );
    const result = fetchLatestRelease(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBeNull();
  });
});
