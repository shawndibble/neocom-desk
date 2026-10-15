import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonWithIdleTimeout, fetchWithIdleTimeout, IDLE_TIMEOUT_MS } from './idleTimeout';

/** A body that emits one byte per `gapMs`, `count` times, and errors if the request is aborted. */
function trickleFetch(count: number, gapMs: number, hangAfter = false) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
        for (let i = 0; i < count; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, gapMs));
          if (init?.signal?.aborted) return;
          controller.enqueue(new TextEncoder().encode(['[', '1,', '1,', '1,', '1', ']'][i] ?? ''));
        }
        if (!hangAfter) controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithIdleTimeout', () => {
  it('lets a slow body finish even when the whole download outlasts the idle window', async () => {
    const gap = IDLE_TIMEOUT_MS - 1_000;
    vi.stubGlobal('fetch', trickleFetch(6, gap));
    const loading = fetchJsonWithIdleTimeout<number[]>('https://example.test/big.json', 'big.json');
    await vi.advanceTimersByTimeAsync(gap * 6);
    expect(await loading).toEqual([1, 1, 1, 1]);
  });

  it('aborts when nothing answers at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          })
      )
    );
    const loading = expect(
      fetchWithIdleTimeout('https://example.test/x.json')
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
    await loading;
  });

  it('aborts when the body goes quiet partway through', async () => {
    vi.stubGlobal('fetch', trickleFetch(2, 1_000, true));
    const loading = expect(
      fetchWithIdleTimeout('https://example.test/x.json')
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1_000 + IDLE_TIMEOUT_MS + 1_000);
    await loading;
  });

  it('names the file and status for an error answer, without reading its body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 }))
    );
    await expect(fetchJsonWithIdleTimeout('https://example.test/x.json', 'x.json')).rejects.toThrow(
      'Failed to load x.json: HTTP 503'
    );
  });
});

describe('fetchWithIdleTimeout with drain', () => {
  it('survives a slow body like the reader does, and keeps no bytes', async () => {
    const gap = IDLE_TIMEOUT_MS - 1_000;
    vi.stubGlobal('fetch', trickleFetch(6, gap));
    const loading = fetchWithIdleTimeout('https://example.test/big.json', { drain: true });
    await vi.advanceTimersByTimeAsync(gap * 6);
    expect(await loading).toEqual({ ok: true, status: 200, bytes: new Uint8Array() });
  });

  it('aborts when the body goes quiet partway through', async () => {
    vi.stubGlobal('fetch', trickleFetch(2, 1_000, true));
    const loading = expect(
      fetchWithIdleTimeout('https://example.test/x.json', { drain: true })
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1_000 + IDLE_TIMEOUT_MS + 1_000);
    await loading;
  });
});

describe('fetchWithIdleTimeout on an error answer', () => {
  it('cancels the unread body', async () => {
    const cancel = vi.fn(async () => {});
    const response = new Response('nope', { status: 503 });
    Object.defineProperty(response, 'body', { value: { cancel } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response)
    );
    expect(await fetchWithIdleTimeout('https://example.test/x.json')).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
