import { describe, expect, it, vi } from 'vitest';
import { runBpcWatchPoll, type BpcWatchPollDependencies } from './watchPoller';
import type { BpcSearchWatchRecord } from '@/db';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

function watch(overrides: Partial<BpcSearchWatchRecord>): BpcSearchWatchRecord {
  return {
    id: 'w1',
    name: 'My Watch',
    typeIds: null,
    regionId: null,
    minMe: null,
    minTe: null,
    minRuns: null,
    maxPrice: null,
    spaceKinds: null,
    seenContractIds: [],
    minPriceSeen: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function row(overrides: Partial<BpcContractRow>): BpcContractRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 999,
    price: 1_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 1,
    quantity: 1,
    dateExpired: Date.now() + 86_400_000,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<BpcWatchPollDependencies> = {}): BpcWatchPollDependencies {
  return {
    masterEnabled: vi.fn(async () => true),
    feedChannelEnabled: vi.fn(async () => true),
    activeCharacterId: vi.fn(() => 100),
    listWatches: vi.fn(async () => []),
    loadRows: vi.fn(async () => []),
    resolveTypeName: vi.fn(async () => 'Rifter Blueprint'),
    saveWatchState: vi.fn(async () => {}),
    recordFeedEntry: vi.fn(async () => {}),
    now: vi.fn(() => 1_000_000),
    ...overrides,
  };
}

describe('runBpcWatchPoll', () => {
  it('does nothing when the master notification switch is off', async () => {
    const deps = makeDeps({ masterEnabled: vi.fn(async () => false) });
    await runBpcWatchPoll(deps);
    expect(deps.listWatches).not.toHaveBeenCalled();
  });

  it('does nothing when the feed channel is off', async () => {
    const deps = makeDeps({ feedChannelEnabled: vi.fn(async () => false) });
    await runBpcWatchPoll(deps);
    expect(deps.listWatches).not.toHaveBeenCalled();
  });

  it('does nothing when there are no watches — no snapshot fetch at all', async () => {
    const deps = makeDeps({ listWatches: vi.fn(async () => []) });
    await runBpcWatchPoll(deps);
    expect(deps.loadRows).not.toHaveBeenCalled();
  });

  it('does nothing when there is no active character to file a feed row under', async () => {
    const deps = makeDeps({
      listWatches: vi.fn(async () => [watch({})]),
      activeCharacterId: vi.fn(() => null),
    });
    await runBpcWatchPoll(deps);
    expect(deps.loadRows).not.toHaveBeenCalled();
  });

  it('establishes a baseline and fires nothing on a watch’s first poll', async () => {
    const deps = makeDeps({
      listWatches: vi.fn(async () => [watch({})]),
      loadRows: vi.fn(async () => [row({ contractId: 5, price: 2_000_000 })]),
    });
    await runBpcWatchPoll(deps);
    expect(deps.recordFeedEntry).not.toHaveBeenCalled();
    expect(deps.saveWatchState).toHaveBeenCalledWith('w1', {
      seenContractIds: [5],
      minPriceSeen: 2_000_000,
    });
  });

  it('records a feed entry for a genuinely new match, keyed by watch and contract', async () => {
    const deps = makeDeps({
      listWatches: vi.fn(async () => [watch({ seenContractIds: [1], minPriceSeen: 5_000_000 })]),
      loadRows: vi.fn(async () => [
        row({ contractId: 1, price: 5_000_000 }),
        row({ contractId: 2, typeId: 999, price: 4_000_000 }),
      ]),
    });
    await runBpcWatchPoll(deps);
    expect(deps.recordFeedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bpcSearchWatch:w1:2',
        characterId: 100,
        eventId: 'bpcSearchWatchMatch',
        subjectId: 2,
        firedAt: 1_000_000,
      })
    );
  });

  it('never re-fires for an already-seen, non-cheaper match', async () => {
    const deps = makeDeps({
      listWatches: vi.fn(async () => [watch({ seenContractIds: [1], minPriceSeen: 5_000_000 })]),
      loadRows: vi.fn(async () => [row({ contractId: 1, price: 5_000_000 })]),
    });
    await runBpcWatchPoll(deps);
    expect(deps.recordFeedEntry).not.toHaveBeenCalled();
  });

  it('polls every watch independently in one pass', async () => {
    const deps = makeDeps({
      listWatches: vi.fn(async () => [
        watch({ id: 'w1', seenContractIds: [], minPriceSeen: null }),
        watch({ id: 'w2', seenContractIds: [], minPriceSeen: null }),
      ]),
      loadRows: vi.fn(async () => [row({ contractId: 9, price: 1_000 })]),
    });
    await runBpcWatchPoll(deps);
    expect(deps.saveWatchState).toHaveBeenCalledTimes(2);
    expect(deps.saveWatchState).toHaveBeenCalledWith('w1', {
      seenContractIds: [9],
      minPriceSeen: 1_000,
    });
    expect(deps.saveWatchState).toHaveBeenCalledWith('w2', {
      seenContractIds: [9],
      minPriceSeen: 1_000,
    });
  });
});
