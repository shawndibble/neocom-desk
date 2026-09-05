import { describe, it, expect, beforeEach } from 'vitest';
import {
  readRouteSnapshot,
  writeRouteSnapshot,
  forgetRouteSnapshots,
  resetRouteSnapshots,
} from './routeSnapshotCache';

const CHAR_A = 91;
const CHAR_B = 92;

beforeEach(() => {
  resetRouteSnapshots();
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

  it('does not forget a character whose id merely ends with the purged one', () => {
    // Keys are `${cacheKey}:${characterId}`, so a suffix match must not treat
    // 191 as 91.
    writeRouteSnapshot('wallet', 191, { balance: 1 });
    forgetRouteSnapshots(91);
    expect(readRouteSnapshot('wallet', 191)).toEqual({ balance: 1 });
  });
});
