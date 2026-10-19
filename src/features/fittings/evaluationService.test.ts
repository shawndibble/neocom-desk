import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';

const computeFittingStats = vi.fn();
const fittingSkillSources = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  computeFittingStats: (...args: unknown[]) => computeFittingStats(...args),
  fittingSkillSources: (...args: unknown[]) => fittingSkillSources(...args),
}));
vi.mock('./yieldToEventLoop', () => ({ yieldToEventLoop: () => Promise.resolve() }));

const fitting: Fitting = { name: 'Fit', shipTypeId: 587, modules: [], drones: [], cargo: [] };
const pilot: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };
const stats = { ehp: 1 } as unknown as FittingStats;

/** A Worker the test answers by hand. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  reply(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent);
  }
}

describe('evaluationService without a Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('works the stats out on the page', async () => {
    computeFittingStats.mockResolvedValue(stats);
    const { computeStatsOffThread } = await import('./evaluationService');

    expect(await computeStatsOffThread(fitting, pilot, undefined, { overheated: false })).toBe(
      stats
    );
    expect(computeFittingStats).toHaveBeenCalledWith(fitting, pilot, undefined, undefined, {
      overheated: false,
    });
  });

  it('works the skill sources out on the page', async () => {
    fittingSkillSources.mockResolvedValue([3300]);
    const { skillSourcesOffThread } = await import('./evaluationService');

    expect(await skillSourcesOffThread(fitting, pilot, undefined, {})).toEqual([3300]);
  });

  it('does not calculate for a signal already aborted', async () => {
    const { computeStatsOffThread } = await import('./evaluationService');
    const controller = new AbortController();
    controller.abort();

    await expect(
      computeStatsOffThread(fitting, pilot, undefined, {}, controller.signal)
    ).rejects.toThrow('aborted');
    expect(computeFittingStats).not.toHaveBeenCalled();
  });
});

describe('evaluationService with a Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends a stats job and resolves with the worker's answer, not calculating on the page", async () => {
    const { computeStatsOffThread } = await import('./evaluationService');

    const result = computeStatsOffThread(fitting, pilot, undefined, { overheated: false });
    const [worker] = FakeWorker.instances;
    expect(worker.sent).toEqual([
      { kind: 'stats', id: 1, fitting, pilot, options: { overheated: false } },
    ]);
    worker.reply({ id: 1, stats });

    expect(await result).toBe(stats);
    expect(computeFittingStats).not.toHaveBeenCalled();
  });

  it('sends a skill-sources job', async () => {
    const { skillSourcesOffThread } = await import('./evaluationService');

    const result = skillSourcesOffThread(fitting, pilot, undefined, {});
    FakeWorker.instances[0].reply({ id: 1, sources: [3300, 3301] });

    expect(await result).toEqual([3300, 3301]);
  });

  it('works on the page when the worker answers with an error', async () => {
    computeFittingStats.mockResolvedValue(stats);
    const { computeStatsOffThread } = await import('./evaluationService');

    const result = computeStatsOffThread(fitting, pilot, undefined, {});
    FakeWorker.instances[0].reply({ id: 1, error: 'engine failed to load' });

    expect(await result).toBe(stats);
  });

  it('aborts at once and tells the worker to drop the job', async () => {
    const { computeStatsOffThread } = await import('./evaluationService');
    const controller = new AbortController();

    const result = computeStatsOffThread(fitting, pilot, undefined, {}, controller.signal);
    controller.abort();

    await expect(result).rejects.toThrow('aborted');
    expect(FakeWorker.instances[0].sent.at(-1)).toEqual({ kind: 'cancel', id: 1 });
    // The late reply for a dropped job is ignored.
    FakeWorker.instances[0].reply({ id: 1, stats });
  });

  it('works on the page when the worker fails', async () => {
    computeFittingStats.mockResolvedValue(stats);
    const { computeStatsOffThread } = await import('./evaluationService');

    const result = computeStatsOffThread(fitting, pilot, undefined, {});
    FakeWorker.instances[0].onerror?.();

    expect(await result).toBe(stats);
    expect(computeFittingStats).toHaveBeenCalledTimes(1);
  });
});
