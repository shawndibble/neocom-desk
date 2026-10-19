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
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: PlanAdviceRequest) {
    if (FakeWorker.failPost) throw new Error('clone failed');
    const request = structuredClone(message);
    this.received.push(request);
    if (request.kind === 'pi') this.state.pi = request.pi;
    else {
      const reply = answerPlanAdvice(this.state, request);
      setTimeout(() => this.onmessage?.({ data: structuredClone(reply) } as MessageEvent), 0);
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
