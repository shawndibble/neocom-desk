import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { syncEditableCollection } from './collectionSync';
import { syncFeed } from './feedSync';
import { syncSettings } from './settingsSync';
import {
  getSyncStatus,
  haltSync,
  resetSyncHalt,
  scheduleSync,
  subscribeSyncStatus,
  triggerSync,
} from './planSync';
import { readSeenSyncMarker, writeSeenSyncMarker } from './localBookkeeping';
import { SAFETY_RECONCILE_INTERVAL_MS, bumpRemoteMarker, readRemoteMarker } from './syncMarker';
import { EDITABLE_COLLECTIONS } from './syncedCollections';

vi.mock('@/observability/reportFailure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/observability/reportFailure')>()),
  reportFailure: vi.fn(),
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => {}),
}));
vi.mock('./firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('./syncAuth', () => ({
  ensureSignedIn: vi.fn(async (characterId: number) => `char:${characterId}`),
  uidForCharacter: (characterId: number) => `char:${characterId}`,
}));
vi.mock('./collectionSync', () => ({ syncEditableCollection: vi.fn(async () => {}) }));
vi.mock('./feedSync', () => ({ syncFeed: vi.fn(async () => {}) }));
vi.mock('./settingsSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./settingsSync')>()),
  syncSettings: vi.fn(async () => {}),
}));

const remote = vi.hoisted(() => ({ version: null as number | null }));
vi.mock('./syncMarker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./syncMarker')>()),
  readRemoteMarker: vi.fn(async () => remote.version),
  bumpRemoteMarker: vi.fn(async (_firestore: unknown, _uid: string, by: number) => {
    remote.version = (remote.version ?? 0) + by;
  }),
}));

const COLLECTION_PASSES = EDITABLE_COLLECTIONS.length + 2;

function collectionPasses(): number {
  return (
    vi.mocked(syncEditableCollection).mock.calls.length +
    vi.mocked(syncFeed).mock.calls.length +
    vi.mocked(syncSettings).mock.calls.length
  );
}

function resetPassCounts(): void {
  vi.mocked(syncEditableCollection).mockClear();
  vi.mocked(syncFeed).mockClear();
  vi.mocked(syncSettings).mockClear();
}

async function backgroundPass(): Promise<void> {
  const reads = vi.mocked(readRemoteMarker).mock.calls.length;
  let started = false;
  let settled = false;
  const stop = subscribeSyncStatus((status) => {
    if (status.characterId !== 1) return;
    if (status.state === 'syncing') started = true;
    else if (started) settled = true;
  });
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    scheduleSync(1, { priority: 'background', debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    await vi.waitFor(() => {
      expect(vi.mocked(readRemoteMarker).mock.calls.length).toBeGreaterThan(reads);
      expect(settled).toBe(true);
    });
  } finally {
    stop();
  }
}

beforeEach(async () => {
  await haltSync();
  resetSyncHalt();
  vi.clearAllMocks();
  remote.version = null;
  await db.settings.clear();
  await db.characters.clear();
  await db.characters.put({ characterId: 1, name: 'Pilot', ownerHash: 'h', addedAt: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('idle background pass', () => {
  it('reads only the marker when it is unchanged since the last full pass', async () => {
    await triggerSync(1);
    expect(collectionPasses()).toBe(COLLECTION_PASSES);
    vi.mocked(readRemoteMarker).mockClear();
    resetPassCounts();

    await backgroundPass();

    expect(readRemoteMarker).toHaveBeenCalledTimes(1);
    expect(collectionPasses()).toBe(0);
  });

  it('counts as a full pass for the sweep gate', async () => {
    await triggerSync(1);
    const before = getSyncStatus(1).lastFullSyncAt;
    vi.spyOn(Date, 'now').mockReturnValue((before ?? 0) + 60_000);
    await backgroundPass();
    expect(getSyncStatus(1).lastFullSyncAt).toBeGreaterThan(before ?? 0);
  });

  it('runs the full incremental pass when another device bumped the marker', async () => {
    await triggerSync(1);
    resetPassCounts();
    remote.version = (remote.version ?? 0) + 1;

    await backgroundPass();

    expect(collectionPasses()).toBe(COLLECTION_PASSES);
    resetPassCounts();
    await backgroundPass();
    expect(collectionPasses()).toBe(0);
  });

  it('runs a full pass when this device has seen no marker yet', async () => {
    await backgroundPass();
    expect(collectionPasses()).toBe(COLLECTION_PASSES);
  });

  it('runs the safety reconcile once the interval has passed, marker unchanged', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    await triggerSync(1);
    resetPassCounts();

    clock.mockReturnValue(1_800_000_000_000 + SAFETY_RECONCILE_INTERVAL_MS - 1);
    await backgroundPass();
    expect(collectionPasses()).toBe(0);

    clock.mockReturnValue(1_800_000_000_000 + SAFETY_RECONCILE_INTERVAL_MS);
    await backgroundPass();
    expect(collectionPasses()).toBe(COLLECTION_PASSES);
  });

  it('never skips a foreground pass (boot, sync now) whatever the marker says', async () => {
    await triggerSync(1);
    await triggerSync(1);
    expect(collectionPasses()).toBe(COLLECTION_PASSES * 2);
  });

  it('runs a full pass after the last one failed', async () => {
    await triggerSync(1);
    vi.mocked(syncFeed).mockRejectedValueOnce(new Error('offline'));
    await triggerSync(1).catch(() => {});
    expect(await readSeenSyncMarker(1)).toBeUndefined();
    vi.mocked(syncEditableCollection).mockClear();

    await backgroundPass();

    expect(syncEditableCollection).toHaveBeenCalledTimes(EDITABLE_COLLECTIONS.length);
  });
});

describe('a failed narrowed pass', () => {
  it('voids the idle skip, so the unpushed edit is retried by the next sweep', async () => {
    await triggerSync(1);
    vi.mocked(syncEditableCollection).mockRejectedValueOnce(new Error('quota'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    scheduleSync(1, { collections: ['plans'], debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    await vi.waitFor(() => expect(getSyncStatus(1).state).toBe('error'));
    expect(await readSeenSyncMarker(1)).toBeUndefined();
    resetPassCounts();

    await backgroundPass();

    expect(collectionPasses()).toBe(COLLECTION_PASSES);
  });
});

describe('bumping the marker', () => {
  function pushOnce() {
    vi.mocked(syncEditableCollection).mockImplementationOnce(async (_spec, ctx) => {
      ctx.onPush?.();
    });
  }

  it('creates the marker on a first pass that pushed nothing', async () => {
    await triggerSync(1);
    expect(remote.version).toBe(0);
    expect(bumpRemoteMarker).toHaveBeenCalledTimes(1);
  });

  it('bumps once per pass that pushed, after the pass, not once per collection', async () => {
    await triggerSync(1);
    vi.mocked(bumpRemoteMarker).mockClear();
    pushOnce();
    pushOnce();

    await triggerSync(1);

    expect(bumpRemoteMarker).toHaveBeenCalledTimes(1);
    expect(remote.version).toBe(1);
  });

  it('bumps after a narrowed pass that pushed, so another device pulls it', async () => {
    await triggerSync(1);
    vi.mocked(bumpRemoteMarker).mockClear();
    pushOnce();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    scheduleSync(1, { collections: ['plans'], debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    await vi.waitFor(() => expect(remote.version).toBe(1));
    expect(readRemoteMarker).toHaveBeenCalledTimes(1);
  });

  it('counts its own bump as seen, so the next idle pass reads only the marker', async () => {
    await triggerSync(1);
    pushOnce();
    await triggerSync(1);
    resetPassCounts();

    await backgroundPass();

    expect(collectionPasses()).toBe(0);
  });

  it('counts a narrowed pass bump as seen too', async () => {
    await triggerSync(1);
    pushOnce();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    scheduleSync(1, { collections: ['plans'], debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    await vi.waitFor(() => expect(remote.version).toBe(1));
    await vi.waitFor(() => expect(getSyncStatus(1).state).toBe('idle'));
    resetPassCounts();

    await backgroundPass();

    expect(collectionPasses()).toBe(0);
  });

  it('does not count its bump twice when another tab records the bumped marker meanwhile', async () => {
    await triggerSync(1);
    pushOnce();
    vi.mocked(bumpRemoteMarker).mockImplementationOnce(async (_firestore, _uid, by) => {
      remote.version = (remote.version ?? 0) + by;
      await writeSeenSyncMarker(1, { version: remote.version, fullAt: Date.now() });
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    scheduleSync(1, { collections: ['plans'], debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    await vi.waitFor(() => expect(remote.version).toBe(1));
    await vi.waitFor(() => expect(getSyncStatus(1).state).toBe('idle'));

    expect((await readSeenSyncMarker(1))?.version).toBe(1);
  });

  it('still reads everything when another device bumped beside its own', async () => {
    await triggerSync(1);
    pushOnce();
    await triggerSync(1);
    remote.version = (remote.version ?? 0) + 1;
    resetPassCounts();

    await backgroundPass();

    expect(collectionPasses()).toBe(COLLECTION_PASSES);
  });

  it('still reads everything when another device bumped during its pass', async () => {
    await triggerSync(1);
    vi.mocked(syncEditableCollection).mockImplementationOnce(async (_spec, ctx) => {
      ctx.onPush?.();
      remote.version = (remote.version ?? 0) + 1;
    });
    await triggerSync(1);
    resetPassCounts();

    await backgroundPass();

    expect(collectionPasses()).toBe(COLLECTION_PASSES);
  });

  it('bumps even when the pass failed after pushing', async () => {
    await triggerSync(1);
    vi.mocked(bumpRemoteMarker).mockClear();
    pushOnce();
    vi.mocked(syncFeed).mockRejectedValueOnce(new Error('offline'));

    await triggerSync(1).catch(() => {});

    expect(bumpRemoteMarker).toHaveBeenCalledTimes(1);
  });
});

describe('a marker that cannot be used', () => {
  it('still syncs when the marker read is refused (rules not deployed)', async () => {
    vi.mocked(readRemoteMarker).mockRejectedValue(
      Object.assign(new Error('denied'), { code: 'permission-denied' })
    );
    await expect(triggerSync(1)).resolves.toBeUndefined();
    expect(collectionPasses()).toBe(COLLECTION_PASSES);
    expect(await readSeenSyncMarker(1)).toBeUndefined();
    await backgroundPass();
    expect(collectionPasses()).toBe(COLLECTION_PASSES * 2);
  });

  it('still syncs when the bump fails, and does not claim the marker as seen', async () => {
    await triggerSync(1);
    vi.mocked(syncEditableCollection).mockImplementationOnce(async (_spec, ctx) => {
      ctx.onPush?.();
    });
    vi.mocked(bumpRemoteMarker).mockRejectedValueOnce(new Error('denied'));

    await expect(triggerSync(1)).resolves.toBeUndefined();

    expect(await readSeenSyncMarker(1)).toBeUndefined();
  });
});
