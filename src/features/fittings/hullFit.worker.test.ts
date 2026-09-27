import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HullFitRequest } from './hullFit.worker';

const loadDogmaEngine = vi.fn();
const hullRacks = vi.fn();
const checkHullCandidate = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  loadDogmaEngine: () => loadDogmaEngine(),
  hullRacks: (...args: unknown[]) => hullRacks(...args),
  checkHullCandidate: (...args: unknown[]) => checkHullCandidate(...args),
}));

import { runHullFit } from './hullFit.worker';

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
  loadDogmaEngine.mockResolvedValue(undefined);
  hullRacks.mockReturnValue(new Set(['low', 'drone']));
  checkHullCandidate.mockImplementation((_ship: number, _rack: string, typeId: number) =>
    typeId === 11 ? null : { fitsHull: true, canFly: true, fitsResources: true }
  );
});

describe('runHullFit', () => {
  it('lists what goes on the hull, skips racks the hull has no slot in, packs each check', async () => {
    const reply = await runHullFit(request(), () => true);

    expect(reply).toEqual({
      id: 1,
      entries: [
        [10, 7],
        [30, 7],
      ],
    });
    // The subsystem rack is never asked about; the pilot's skills are passed as a Map.
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
