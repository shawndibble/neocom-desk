import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { purgeCharacterCache } from '@/esi/cachePurge';
import { DAY_MS } from './age';
import {
  ACCOUNT_SNAPSHOT_ID,
  flushRouteSnapshotWrites,
  hydrateRouteSnapshots,
  readRouteSnapshot,
  resetRouteSnapshots,
  setRouteSnapshotPersistence,
  writeRouteSnapshot,
} from './routeSnapshotCache';

const CHAR_A = 91;
const CHAR_B = 92;

/** A reload: memory gone, Dexie kept. */
const reload = () => resetRouteSnapshots();

beforeEach(async () => {
  setRouteSnapshotPersistence(true);
  resetRouteSnapshots();
  await db.routeSnapshots.clear();
  await db.esiCache.clear();
});

afterEach(() => {
  setRouteSnapshotPersistence(false);
  vi.restoreAllMocks();
});

describe('routeSnapshotCache persistence', () => {
  it('brings a view back after a reload', async () => {
    const data = { rows: [1, 2], at: new Date(5), byId: new Map([[1, 'a']]) };
    writeRouteSnapshot('wallet', CHAR_A, data);
    await flushRouteSnapshotWrites();
    reload();
    expect(readRouteSnapshot('wallet', CHAR_A)).toBeNull();
    await hydrateRouteSnapshots(CHAR_A);
    expect(readRouteSnapshot('wallet', CHAR_A)).toEqual(data);
  });

  it('hydrates one Character without touching another', async () => {
    writeRouteSnapshot('wallet', CHAR_A, { a: 1 });
    writeRouteSnapshot('wallet', CHAR_B, { b: 1 });
    await flushRouteSnapshotWrites();
    reload();
    await hydrateRouteSnapshots(CHAR_A);
    expect(readRouteSnapshot('wallet', CHAR_A)).toEqual({ a: 1 });
    expect(readRouteSnapshot('wallet', CHAR_B)).toBeNull();
  });

  it('never replaces a snapshot already in memory with an older stored one', async () => {
    writeRouteSnapshot('wallet', CHAR_A, { v: 'stored' });
    await flushRouteSnapshotWrites();
    reload();
    writeRouteSnapshot('wallet', CHAR_A, { v: 'fresh' });
    await hydrateRouteSnapshots(CHAR_A);
    expect(readRouteSnapshot('wallet', CHAR_A)).toEqual({ v: 'fresh' });
  });

  it('drops a snapshot another build wrote', async () => {
    await db.routeSnapshots.put({
      characterId: CHAR_A,
      name: 'wallet',
      data: { old: true },
      savedAt: Date.now(),
      appVersion: 'some-other-build',
    });
    await hydrateRouteSnapshots(CHAR_A);
    expect(readRouteSnapshot('wallet', CHAR_A)).toBeNull();
  });

  it('drops a snapshot older than a week', async () => {
    writeRouteSnapshot('wallet', CHAR_A, { v: 1 });
    await flushRouteSnapshotWrites();
    reload();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * DAY_MS);
    await hydrateRouteSnapshots(CHAR_A);
    expect(readRouteSnapshot('wallet', CHAR_A)).toBeNull();
  });

  it('keeps a snapshot holding a class instance in memory only', async () => {
    class Thing {
      method() {
        return 1;
      }
    }
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeRouteSnapshot('fit', CHAR_A, { thing: new Thing() });
    writeRouteSnapshot('fn', CHAR_A, { run: () => 1 });
    await flushRouteSnapshotWrites();
    expect(await db.routeSnapshots.count()).toBe(0);
    expect(readRouteSnapshot('fit', CHAR_A)).not.toBeNull();
  });

  it('deletes a Character’s stored snapshots, and the account-wide ones, on its purge', async () => {
    writeRouteSnapshot('wallet', CHAR_A, { a: 1 });
    writeRouteSnapshot('assets', ACCOUNT_SNAPSHOT_ID, { all: 1 });
    writeRouteSnapshot('wallet', CHAR_B, { b: 1 });
    await flushRouteSnapshotWrites();
    await purgeCharacterCache(CHAR_A);
    await flushRouteSnapshotWrites();
    const left = await db.routeSnapshots.toArray();
    expect(left.map((row) => row.characterId)).toEqual([CHAR_B]);
  });

  it('never writes back a snapshot queued before its Character was purged', async () => {
    writeRouteSnapshot('wallet', CHAR_A, { a: 1 });
    await purgeCharacterCache(CHAR_A);
    await flushRouteSnapshotWrites();
    expect(await db.routeSnapshots.count()).toBe(0);
  });

  it('discards a hydrate that was running when its Character was purged', async () => {
    writeRouteSnapshot('wallet', CHAR_A, { a: 1 });
    await flushRouteSnapshotWrites();
    reload();
    const hydrating = hydrateRouteSnapshots(CHAR_A);
    await purgeCharacterCache(CHAR_A);
    await hydrating;
    expect(readRouteSnapshot('wallet', CHAR_A)).toBeNull();
  });

  it('writes nothing while persistence is off', async () => {
    setRouteSnapshotPersistence(false);
    writeRouteSnapshot('wallet', CHAR_A, { a: 1 });
    await flushRouteSnapshotWrites();
    expect(await db.routeSnapshots.count()).toBe(0);
  });
});
