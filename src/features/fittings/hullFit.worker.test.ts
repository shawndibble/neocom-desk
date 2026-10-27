import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { HullFitRequest } from './hullFit.worker';
import { fakeDogmaEngine } from './__fixtures__/fakeDogmaEngine';

const loadDogmaEngine = vi.fn();
const computeFittingStats = vi.fn();
const fittingSkillSources = vi.fn();
const hullRacks = vi.fn<(shipTypeId: number, skills: Map<number, number>) => Set<CandidateRack>>();
const checkHullCandidate = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  loadDogmaEngine: () => loadDogmaEngine(),
  computeFittingStats: (...args: unknown[]) => computeFittingStats(...args),
  fittingSkillSources: (...args: unknown[]) => fittingSkillSources(...args),
}));

import { runEvaluation, runHullFit, type StatsRequest } from './hullFit.worker';

const request = (overrides: Partial<HullFitRequest> = {}): HullFitRequest => ({
  id: 1,
  shipTypeId: 587,
  jobs: [
    ['low', [10, 11]],
    ['subsystem', [20]],
    ['drone', [30]],
  ],
  skillLevels: [[3300, 5]],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  loadDogmaEngine.mockResolvedValue(fakeDogmaEngine({ hullRacks, checkHullCandidate }));
  hullRacks.mockReturnValue(new Set(['low', 'drone']));
  checkHullCandidate.mockImplementation((_ship: number, _rack: string, typeId: number) =>
    typeId === 11
      ? { fitsHull: false, canFly: false, fitsResources: false }
      : { fitsHull: true, canFly: true, fitsResources: true }
  );
});

describe('runHullFit', () => {
  it('lists every item, answering racks the hull has no slot in without asking the engine', async () => {
    const reply = await runHullFit(request(), () => true);

    expect(reply).toEqual({
      id: 1,
      entries: [
        [10, 7],
        [11, 0],
        [20, 0],
        [30, 7],
      ],
    });
    // The subsystem rack (20) is never asked about; the pilot's skills are passed as a Map.
    expect(checkHullCandidate.mock.calls.map((call) => call[2])).toEqual([10, 11, 30]);
    expect(checkHullCandidate.mock.calls[0][3]).toEqual(new Map([[3300, 5]]));
  });

  it('stops and says so when a newer request has come in', async () => {
    let calls = 0;
    // Still latest for the first batch, superseded by the second.
    const isLatest = () => ++calls <= 1;

    const reply = await runHullFit(request(), isLatest);

    expect(reply).toEqual({ id: 1, aborted: true });
  });

  it('does not return a finished answer that was superseded at the last moment', async () => {
    let calls = 0;
    // Latest through every batch, superseded only at the final check.
    const isLatest = () => ++calls <= 2;

    expect(await runHullFit(request(), isLatest)).toEqual({ id: 1, aborted: true });
  });

  it('rejects when the engine cannot load, for the caller to turn into an error reply', async () => {
    loadDogmaEngine.mockRejectedValue(new Error('offline'));

    await expect(runHullFit(request(), () => true)).rejects.toThrow('offline');
  });
});

describe('runEvaluation', () => {
  const job = (overrides: Partial<StatsRequest> = {}): StatsRequest => ({
    kind: 'stats',
    id: 7,
    fitting: { name: 'Fit', shipTypeId: 587, modules: [], drones: [], cargo: [] },
    pilot: { skillLevels: new Map([[3300, 5]]), implantTypeIds: [], boosterTypeIds: [] },
    options: { overheated: false },
    ...overrides,
  });

  it("answers a stats job from the engine seam, under the job's pilot, profile and options", async () => {
    computeFittingStats.mockResolvedValue({ ehp: 1 });
    const request = job();

    expect(await runEvaluation(request, () => false)).toEqual({ id: 7, stats: { ehp: 1 } });
    expect(computeFittingStats).toHaveBeenCalledWith(
      request.fitting,
      request.pilot,
      undefined,
      undefined,
      { overheated: false }
    );
  });

  it('answers a skill-sources job with the skills that modify the fit', async () => {
    fittingSkillSources.mockResolvedValue([3300, 3301]);
    const request = { ...job(), kind: 'skillSources' as const };

    expect(await runEvaluation(request, () => false)).toEqual({ id: 7, sources: [3300, 3301] });
    expect(fittingSkillSources).toHaveBeenCalledWith(
      request.fitting,
      request.pilot,
      undefined,
      request.options
    );
  });

  it('skips a job cancelled before it started, without touching the engine', async () => {
    expect(await runEvaluation(job(), (id) => id === 7)).toEqual({ id: 7, aborted: true });
    expect(computeFittingStats).not.toHaveBeenCalled();
  });

  it('rejects when the calculation throws, for the caller to turn into an error reply', async () => {
    computeFittingStats.mockRejectedValue(new Error('bad fit'));

    await expect(runEvaluation(job(), () => false)).rejects.toThrow('bad fit');
  });
});
