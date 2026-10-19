import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adviceInput } from './map/mapFixtures.testutil';
import { buildPlanAdvice } from './planAdviceModel';
import { answerPlanAdvice, emptyPlanAdviceState } from './planAdvice.worker';
import type { PlanAdviceRequest } from './planAdviceWire';

/** A Worker that answers on a later tick with the real worker logic, structured-cloning each way. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static failPost = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  received: PlanAdviceRequest[] = [];
  terminated = false;
  private state = emptyPlanAdviceState();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: PlanAdviceRequest) {
    if (FakeWorker.failPost) throw new Error('clone failed');
    const request = structuredClone(message);
    this.received.push(request);
    if (request.kind === 'pi') this.state.pi = request.pi;
    else if (request.kind === 'cancel') clearTimeout(this.timers.get(request.id));
    else {
      const reply = answerPlanAdvice(this.state, request);
      this.timers.set(
        request.id,
        setTimeout(() => this.onmessage?.({ data: structuredClone(reply) } as MessageEvent), 0)
      );
    }
  }
  terminate() {
    this.terminated = true;
  }
}

async function loadService() {
  vi.resetModules();
  return import('./planAdviceService');
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failPost = false;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('askPlanAdvice', () => {
  it('answers like the model, through the worker', async () => {
    const { askPlanAdvice } = await loadService();
    const input = adviceInput('lean');
    expect(await askPlanAdvice(input)).toEqual(buildPlanAdvice(input));
  });

  it('sends the SDE slice once per object and never inside a request', async () => {
    const { askPlanAdvice } = await loadService();
    const input = adviceInput('lean');
    await askPlanAdvice(input);
    await askPlanAdvice({ ...input, preference: 'least-hauling' as never });
    const [worker] = FakeWorker.instances;
    expect(worker.received.map((r) => r.kind)).toEqual(['pi', 'advice', 'advice']);
    const advice = worker.received[1];
    expect(advice.kind === 'advice' && 'pi' in advice.input.snapshot).toBe(false);
  });

  it('runs once per input object and remembers the answer', async () => {
    const { askPlanAdvice, peekPlanAdvice } = await loadService();
    const input = adviceInput('lean');
    expect(peekPlanAdvice(input)).toBeNull();
    const first = askPlanAdvice(input);
    expect(askPlanAdvice(input)).toBe(first);
    const advice = await first;
    expect(peekPlanAdvice(input)).toEqual({ advice });
    expect(await askPlanAdvice(input)).toBe(advice);
    expect(FakeWorker.instances[0].received.filter((r) => r.kind === 'advice')).toHaveLength(1);
  });

  it('remembers a model error and rejects with a plain Error', async () => {
    const { askPlanAdvice, peekPlanAdvice, PlanAdviceWorkerUnavailable } = await loadService();
    const bad = { ...adviceInput('lean'), books: null } as never;
    const error = await askPlanAdvice(bad).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PlanAdviceWorkerUnavailable);
    expect(peekPlanAdvice(bad)).toEqual({ error });
  });

  it('reports the worker unavailable when the request cannot be posted, without remembering it', async () => {
    const { askPlanAdvice, peekPlanAdvice, PlanAdviceWorkerUnavailable } = await loadService();
    FakeWorker.failPost = true;
    const input = adviceInput('lean');
    await expect(askPlanAdvice(input)).rejects.toBeInstanceOf(PlanAdviceWorkerUnavailable);
    expect(peekPlanAdvice(input)).toBeNull();
  });

  it('gives up on the worker for good after it errors, failing what was waiting', async () => {
    const { askPlanAdvice, planAdviceWorkerAvailable, PlanAdviceWorkerUnavailable } =
      await loadService();
    const waiting = askPlanAdvice(adviceInput('lean'));
    FakeWorker.instances[0].onerror?.();
    await expect(waiting).rejects.toBeInstanceOf(PlanAdviceWorkerUnavailable);
    expect(planAdviceWorkerAvailable()).toBe(false);
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it('treats a request that outran its SDE slice as a worker fault, not a model error', async () => {
    const { askPlanAdvice, PlanAdviceWorkerUnavailable } = await loadService();
    const original = FakeWorker.prototype.postMessage;
    FakeWorker.prototype.postMessage = function (message: PlanAdviceRequest) {
      if (message.kind !== 'pi') original.call(this, message);
    };
    try {
      await expect(askPlanAdvice(adviceInput('lean'))).rejects.toBeInstanceOf(
        PlanAdviceWorkerUnavailable
      );
    } finally {
      FakeWorker.prototype.postMessage = original;
    }
  });

  describe('abort', () => {
    it('withdraws a queued request, rejects, and does not remember it', async () => {
      const { askPlanAdvice, peekPlanAdvice } = await loadService();
      const input = adviceInput('lean');
      const abort = new AbortController();
      const asked = askPlanAdvice(input, abort.signal);
      abort.abort();
      await expect(asked).rejects.toMatchObject({ name: 'AbortError' });
      const [worker] = FakeWorker.instances;
      expect(worker.received.map((r) => r.kind)).toEqual(['pi', 'advice', 'cancel']);
      expect(peekPlanAdvice(input)).toBeNull();
      // The same input can be asked again afterwards.
      expect(await askPlanAdvice(input)).toEqual(buildPlanAdvice(input));
    });

    it('keeps the request while another caller still waits on it', async () => {
      const { askPlanAdvice } = await loadService();
      const input = adviceInput('lean');
      const first = new AbortController();
      const second = new AbortController();
      const a = askPlanAdvice(input, first.signal);
      const b = askPlanAdvice(input, second.signal);
      first.abort();
      await expect(a).rejects.toMatchObject({ name: 'AbortError' });
      expect(await b).toEqual(buildPlanAdvice(input));
      expect(FakeWorker.instances[0].received.some((r) => r.kind === 'cancel')).toBe(false);
    });

    it('starts a fresh request when the same input is asked again right after an abort', async () => {
      const { askPlanAdvice } = await loadService();
      const input = adviceInput('lean');
      const abort = new AbortController();
      const first = askPlanAdvice(input, abort.signal);
      abort.abort();
      const again = askPlanAdvice(input, new AbortController().signal);
      await expect(first).rejects.toMatchObject({ name: 'AbortError' });
      expect(await again).toEqual(buildPlanAdvice(input));
    });

    it('never posts for a signal that is already aborted', async () => {
      const { askPlanAdvice } = await loadService();
      const abort = new AbortController();
      abort.abort();
      await expect(askPlanAdvice(adviceInput('lean'), abort.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(FakeWorker.instances[0]?.received.filter((r) => r.kind === 'advice') ?? []).toEqual(
        []
      );
    });
  });

  it('is unavailable where there is no Worker', async () => {
    vi.stubGlobal('Worker', undefined);
    const { askPlanAdvice, planAdviceWorkerAvailable, PlanAdviceWorkerUnavailable } =
      await loadService();
    expect(planAdviceWorkerAvailable()).toBe(false);
    await expect(askPlanAdvice(adviceInput('lean'))).rejects.toBeInstanceOf(
      PlanAdviceWorkerUnavailable
    );
  });
});
