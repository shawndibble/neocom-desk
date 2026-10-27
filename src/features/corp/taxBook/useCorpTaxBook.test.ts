import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncDeps } from './syncCorpTaxBook';
import {
  AUTO_SYNC_MIN_AGE_MS,
  runTaxBookSync,
  shouldAutoSync,
  useTaxBookRuns,
} from './useCorpTaxBook';
import type { BookSummary } from './bookClient';

const summary = (lastSyncAgeMs: number | null, active = true): BookSummary => ({
  active,
  startDate: '2026-01-01',
  divisions: [1],
  structureExpiryHours: {},
  lastSync:
    lastSyncAgeMs === null
      ? null
      : { at: 1_000_000 - lastSyncAgeMs, byCharacterId: 1, byName: 'Ann', gaps: [] },
});

describe('shouldAutoSync', () => {
  it('syncs a book never synced, and one last synced a while ago', () => {
    expect(shouldAutoSync(summary(null), 1_000_000)).toBe(true);
    expect(shouldAutoSync(summary(AUTO_SYNC_MIN_AGE_MS), 1_000_000)).toBe(true);
  });
  it('leaves a book someone synced just now, and one with no active book', () => {
    expect(shouldAutoSync(summary(60_000), 1_000_000)).toBe(false);
    expect(shouldAutoSync(summary(null, false), 1_000_000)).toBe(false);
    expect(shouldAutoSync(null, 1_000_000)).toBe(false);
  });
});

describe('runTaxBookSync', () => {
  beforeEach(() => useTaxBookRuns.setState({ byCorp: {} }));
  const args = {
    characterId: 1,
    corporationId: 77,
    capabilities: {
      canReadMiningLedger: false,
      canReadMoonExtractions: false,
      canReadWallet: false,
    },
  };

  it('runs one sync at a time per corporation and files the outcome', async () => {
    const verify = vi.fn();
    const deps = { verifyOfficer: verify } as unknown as SyncDeps;
    const first = runTaxBookSync(args, deps);
    expect(useTaxBookRuns.getState().byCorp[77]).toEqual({ phase: 'syncing' });
    expect(runTaxBookSync(args, deps)).toBe(first);
    await first;
    expect(useTaxBookRuns.getState().byCorp[77]).toMatchObject({
      phase: 'done',
      outcome: { kind: 'skipped', reason: 'missing-mining-scope' },
    });
  });

  it('files a failure instead of throwing', async () => {
    const deps = {
      verifyOfficer: async () => {
        throw new Error('boom');
      },
    } as unknown as SyncDeps;
    await runTaxBookSync(
      { ...args, capabilities: { ...args.capabilities, canReadMiningLedger: true } },
      deps
    );
    expect(useTaxBookRuns.getState().byCorp[77]).toMatchObject({
      phase: 'failed',
      message: 'boom',
    });
  });
});
