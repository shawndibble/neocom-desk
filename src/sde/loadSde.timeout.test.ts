import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  // Fresh module per test: the loader memoizes for the whole session.
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('an SDE file that never answers', () => {
  it('rejects after the timeout, and a later call retries instead of memoizing the failure', async () => {
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })
    );
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([])));
    const { loadSkills } = await import('./loadSde');

    const hung = expect(loadSkills()).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(20_000);
    await hung;

    expect(await loadSkills()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
