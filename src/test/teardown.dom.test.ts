import { describe, expect, it, vi } from 'vitest';
import { http } from 'msw';
import { mswServer } from '@/test/msw';

/**
 * The tests in each block run in order and depend on it: the first leaves
 * something behind, the second checks the shared teardown cleared it.
 */
mswServer(
  // Never answers: only the test-end abort can end this request.
  http.get('https://teardown.test/hang', () => new Promise<never>(() => {}))
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
    // eslint-disable-next-line no-restricted-syntax -- proves a dropped timer never fires: an absence, so only real time past its 10ms can show it
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(false);
  });
});
