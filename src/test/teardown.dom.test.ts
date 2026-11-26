import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { loadWithCache } from '@/esi/cache';
import { mswServer } from '@/test/msw';
import { settleOrWarn } from '@/test/teardown';

let lateHits = 0;
const server = mswServer(
  http.get('https://teardown.test/hang', () => new Promise<never>(() => {})),
  http.get('https://teardown.test/late', () => {
    lateHits += 1;
    return new Promise<never>(() => {});
  })
);

describe('a request still in flight when its test ends', () => {
  let leftover: Promise<unknown> | undefined;

  it('is left running', () => {
    leftover = fetch('https://teardown.test/hang').catch((error: unknown) => error);
  });

  it('was aborted before the next test started', async () => {
    const outcome = await leftover;
    expect(outcome).toMatchObject({ name: 'AbortError' });
  });

  it('keeps its caller’s own signal working', async () => {
    const controller = new AbortController();
    const request = fetch('https://teardown.test/hang', { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('a request a test’s load starts after the test ended', () => {
  const CHAR_ID = 77;
  const KEY = 'teardown:late';
  let leftover: Promise<unknown> | undefined;

  function loadLate(): Promise<unknown> {
    return loadWithCache(CHAR_ID, KEY, async () => {
      const response = await fetch('https://teardown.test/late');
      return (await response.json()) as string;
    });
  }

  it('ends before its load reaches the network', async () => {
    await db.esiCache.clear();
    lateHits = 0;
    leftover = loadLate().catch((error: unknown) => error);
  });

  it('was refused without being sent, and the same load runs again at once', async () => {
    expect(lateHits).toBe(0);
    await expect(leftover).resolves.toBeNull();
    server.use(http.get('https://teardown.test/late', () => HttpResponse.json('fresh')));
    let cap: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      loadLate(),
      new Promise((resolve) => {
        cap = setTimeout(() => resolve('still joined'), 2000);
      }),
    ]);
    clearTimeout(cap);
    expect(settled).toMatchObject({ data: 'fresh' });
  });
});

describe('fake timers a test never restored', () => {
  let fired = false;

  it('are left on, with a timer pending', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    setTimeout(() => {
      fired = true;
    }, 10);
  });

  it('are real again, the pending timer dropped', async () => {
    expect(vi.isFakeTimers()).toBe(false);
    expect(new Date().getUTCFullYear()).toBeGreaterThan(2020);
    // eslint-disable-next-line no-restricted-syntax -- proves a dropped fake timer never fires: real time must pass its 10ms
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(false);
  });
});

describe('work a test leaves running past the settle window', () => {
  it('fails the test when failing is switched on', async () => {
    void fetch('https://teardown.test/hang').catch(() => {});
    await expect(settleOrWarn('leaky test', 'fetch', true)).rejects.toThrow(
      /\[teardown\] leaky test: still pending/
    );
  });

  it('only warns locally', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    void fetch('https://teardown.test/hang').catch(() => {});
    await settleOrWarn('leaky test', 'fetch', false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/leaky test: still pending/));
    warn.mockRestore();
  });
});
