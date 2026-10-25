import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAWLESS_CORRUPTION_STATE, LAWLESS_HEARTBEAT_MS } from './lawlessSystems.js';

// The one `systemConditions/lawless` doc, counting reads and writes.
const store = vi.hoisted(() => ({
  data: undefined as Record<string, unknown> | undefined,
  reads: 0,
  writes: 0,
}));
vi.mock('./firestore.js', () => ({
  firestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => {
          store.reads += 1;
          return { data: () => store.data };
        },
        set: async (data: Record<string, unknown>) => {
          store.writes += 1;
          store.data = data;
        },
      }),
    }),
  }),
}));
vi.mock('firebase-functions/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const campaign = (id: number) => ({
  insurgencies: [{ corruptionState: LAWLESS_CORRUPTION_STATE, solarSystem: { id } }],
});

describe('runSyncLawlessSystems', () => {
  let now = 1_800_000_000_000;
  beforeEach(() => {
    store.data = undefined;
    store.reads = 0;
    store.writes = 0;
    vi.resetModules();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [campaign(30000001)] }))
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads its last state once per warm instance, then trusts what it wrote', async () => {
    const { runSyncLawlessSystems } = await import('./marketHistoryJob.js');
    await runSyncLawlessSystems();
    expect(store).toMatchObject({ reads: 1, writes: 1 });

    now += 15 * 60 * 1000; // unchanged and inside the heartbeat: nothing to do
    await runSyncLawlessSystems();
    expect(store).toMatchObject({ reads: 1, writes: 1 });

    now += LAWLESS_HEARTBEAT_MS; // the heartbeat still rewrites it
    await runSyncLawlessSystems();
    expect(store).toMatchObject({ reads: 1, writes: 2 });
  });

  it('a cold instance starts from the stored doc', async () => {
    store.data = { systemIds: [30000001], updatedAt: now - 1000 };
    const { runSyncLawlessSystems } = await import('./marketHistoryJob.js');
    await runSyncLawlessSystems();
    expect(store).toMatchObject({ reads: 1, writes: 0 });
  });
});
