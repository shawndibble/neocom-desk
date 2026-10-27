import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { purgeCharacterCache, purgeCorpScopedCache } from '@/esi/cachePurge';
import {
  readRouteSnapshot,
  writeRouteSnapshot,
  forgetRouteSnapshots,
  resetRouteSnapshots,
} from './routeSnapshotCache';

const CHAR_A = 91;
const CHAR_B = 92;

beforeEach(async () => {
  resetRouteSnapshots();
  await db.esiCache.clear();
});

describe('routeSnapshotCache', () => {
  it('returns null for a route+character it has never stored', () => {
    expect(readRouteSnapshot('wallet', CHAR_A)).toBeNull();
  });

  it('reads back what it stored, per route and per character', () => {
    writeRouteSnapshot('wallet', CHAR_A, { balance: 1 });
    writeRouteSnapshot('wallet', CHAR_B, { balance: 2 });
    writeRouteSnapshot('mail', CHAR_A, { unread: 3 });

    expect(readRouteSnapshot('wallet', CHAR_A)).toEqual({ balance: 1 });
    expect(readRouteSnapshot('wallet', CHAR_B)).toEqual({ balance: 2 });
    expect(readRouteSnapshot('mail', CHAR_A)).toEqual({ unread: 3 });
  });

  it('forgets every route for one character and leaves the others alone', () => {
    writeRouteSnapshot('wallet', CHAR_A, { balance: 1 });
    writeRouteSnapshot('mail', CHAR_A, { unread: 3 });
    writeRouteSnapshot('wallet', CHAR_B, { balance: 2 });

    forgetRouteSnapshots(CHAR_A);

    expect(readRouteSnapshot('wallet', CHAR_A)).toBeNull();
    expect(readRouteSnapshot('mail', CHAR_A)).toBeNull();
    expect(readRouteSnapshot('wallet', CHAR_B)).toEqual({ balance: 2 });
  });

  it('forgets only the purged character, not one whose id merely contains it', () => {
    writeRouteSnapshot('wallet', 191, { balance: 1 });
    forgetRouteSnapshots(91);
    expect(readRouteSnapshot('wallet', 191)).toEqual({ balance: 1 });
  });

  it('forgets a character when its cached rows are purged', async () => {
    writeRouteSnapshot('wallet', CHAR_A, { balance: 1 });
    await purgeCharacterCache(CHAR_A);
    expect(readRouteSnapshot('wallet', CHAR_A)).toBeNull();
  });

  it('forgets the corp views when only the corp-scoped rows are purged', async () => {
    // A corp change deletes just the `corp:` prefix in Dexie, but a retained
    // snapshot is a whole rendered board — so the blunt signal is what keeps
    // the previous corporation's rows off the screen.
    writeRouteSnapshot('corp', CHAR_A, { board: 'old corp' });
    writeRouteSnapshot('corp-members', CHAR_A, { roster: 'old corp' });
    writeRouteSnapshot('corp', CHAR_B, { board: 'untouched' });

    await purgeCorpScopedCache(CHAR_A);

    expect(readRouteSnapshot('corp', CHAR_A)).toBeNull();
    expect(readRouteSnapshot('corp-members', CHAR_A)).toBeNull();
    expect(readRouteSnapshot('corp', CHAR_B)).toEqual({ board: 'untouched' });
  });
});
