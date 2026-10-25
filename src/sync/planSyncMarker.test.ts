// The change marker (issue #5073) as the sync driver uses it: what a background
// pass reads when nothing changed, what bumps the marker, and every way a pass
// falls back to the full incremental read. The collection passes are stubs —
// what they would read is theirs to test; here only whether they ran.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { syncEditableCollection } from './collectionSync';
import { syncFeed } from './feedSync';
import { syncSettings } from './settingsSync';
import { getSyncStatus, haltSync, resetSyncHalt, scheduleSync, triggerSync } from './planSync';
import { readSeenSyncMarker } from './localBookkeeping';
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

/** The remote marker, as another device or this one would leave it. */
const remote = vi.hoisted(() => ({ version: null as number | null }));
vi.mock('./syncMarker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./syncMarker')>()),
  readRemoteMarker: vi.fn(async () => remote.version),
  bumpRemoteMarker: vi.fn(async (_firestore: unknown, _uid: string, by: number) => {
    remote.version = (remote.version ?? 0) + by;
  }),
}));

const COLLECTION_PASSES = EDITABLE_COLLECTIONS.length + 2; // + feed + settings

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

/** One background sweep pass, awaited to the end. */
async function backgroundPass(): Promise<void> {
  const reads = vi.mocked(readRemoteMarker).mock.calls.length;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  scheduleSync(1, { priority: 'background', debounceMs: 0 });
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  await vi.waitFor(() => {
    expect(vi.mocked(readRemoteMarker).mock.calls.length).toBeGreaterThan(reads);
    expect(getSyncStatus(1).state).toBe('idle');
  });
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
    await new Promise((resolve) => setTimeout(resolve, 5));
    await backgroundPass();
    expect(getSyncStatus(1).lastFullSyncAt).toBeGreaterThan(before ?? 0);
  });

  it('runs the full incremental pass when another device bumped the marker', async () => {
    await triggerSync(1);
    resetPassCounts();
    remote.version = (remote.version ?? 0) + 1;

    await backgroundPass();

    expect(collectionPasses()).toBe(COLLECTION_PASSES);
    // ...and the next idle one is cheap again.
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
    // A narrowed pass reads no marker of its own.
    expect(readRemoteMarker).toHaveBeenCalledTimes(1);
  });

  it('lets this device skip the pass its own push earns only after one more full read', async () => {
    await triggerSync(1);
    pushOnce();
    await triggerSync(1);
    resetPassCounts();

    await backgroundPass(); // marker moved by our own push: one full read
    expect(collectionPasses()).toBe(COLLECTION_PASSES);
    resetPassCounts();
    await backgroundPass(); // now it is idle
    expect(collectionPasses()).toBe(0);
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
