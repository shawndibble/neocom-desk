import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerClient, isAbortError } from './workerClient';

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  sent: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}

function make(reset = vi.fn()) {
  const client = createWorkerClient<{ id: number; value?: string }, string>({
    spawn: () => new FakeWorker() as unknown as Worker,
    settle: (reply, waiting) => waiting.resolve(reply.value ?? ''),
    unavailable: (message) => new Error(`unavailable: ${message}`),
    reset,
    cancel: (id) => ({ cancel: id }),
  });
  return { client, reset };
}

beforeEach(() => vi.stubGlobal('Worker', FakeWorker));
afterEach(() => vi.unstubAllGlobals());

describe('createWorkerClient', () => {
  it('routes each reply to the request with its id', async () => {
    const { client } = make();
    const a = client.send((w, id) => w.postMessage({ id }));
    const b = client.send((w, id) => w.postMessage({ id }));
    const worker = FakeWorker.last;
    worker.onmessage?.({ data: { id: 2, value: 'b' } } as MessageEvent);
    worker.onmessage?.({ data: { id: 1, value: 'a' } } as MessageEvent);
    expect(await Promise.all([a, b])).toEqual(['a', 'b']);
  });

  it('fails what is waiting, resets and stops offering the worker after an error', async () => {
    const { client, reset } = make();
    const waiting = client.send(() => {});
    FakeWorker.last.onerror?.();
    await expect(waiting).rejects.toThrow('unavailable: worker failed');
    expect(reset).toHaveBeenCalled();
    expect(FakeWorker.last.terminated).toBe(true);
    expect(client.available()).toBe(false);
  });

  it('resets and rejects when the post throws', async () => {
    const { client, reset } = make();
    await expect(
      client.send(() => {
        throw new Error('clone failed');
      })
    ).rejects.toThrow('unavailable: clone failed');
    expect(reset).toHaveBeenCalled();
  });

  it('posts a cancel and rejects with an abort when the signal fires', async () => {
    const { client } = make();
    const abort = new AbortController();
    const sent = client.send(() => {}, abort.signal);
    abort.abort();
    const error = await sent.catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
    expect(FakeWorker.last.sent).toEqual([{ cancel: 1 }]);
  });

  it('is unavailable where there is no Worker', async () => {
    vi.stubGlobal('Worker', undefined);
    const { client } = make();
    expect(client.available()).toBe(false);
    await expect(client.send(() => {})).rejects.toThrow('unavailable: no worker');
  });
});
