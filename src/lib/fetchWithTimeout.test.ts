import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FETCH_TIMEOUT_MS, fetchWithTimeout } from './fetchWithTimeout';

/** A fetch that never answers and rejects only when its signal aborts, as a real hung request does. */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithTimeout', () => {
  it('resolves with the response when the request answers in time', async () => {
    const response = new Response('ok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response)
    );
    await expect(fetchWithTimeout('https://example.test/')).resolves.toBe(response);
  });

  it('rejects with a TimeoutError once the default window passes with no answer', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const pending = fetchWithTimeout('https://example.test/');
    const settled = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS);
    await settled;
  });

  it('honours a caller-chosen window', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const pending = fetchWithTimeout('https://example.test/', undefined, 40_000);
    const settled = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS + 1);
    let early = false;
    void pending.catch(() => (early = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(early).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    await settled;
  });

  it('passes the other init fields on', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response());
    vi.stubGlobal('fetch', fetchMock);
    await fetchWithTimeout('https://example.test/', { headers: { 'X-Test': '1' } });
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'X-Test': '1' });
  });
});
