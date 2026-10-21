import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { loadWithCacheStatus } from './cache';

const CHAR_ID = 92;
const KEY = 'leak-thing';

beforeEach(async () => {
  await db.esiCache.clear();
});

// The global afterEach in vitest.setup.dom.ts settles the first test's load
// before the second test's beforeEach clears the cache, so the row can't leak.
describe('a cache load that outlives its test', () => {
  it('starts a load and ends without awaiting it', () => {
    void loadWithCacheStatus(CHAR_ID, KEY, async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'late';
    });
  });

  it('does not see that load’s row', async () => {
    expect(await db.esiCache.get([CHAR_ID, KEY])).toBeUndefined();
  });
});
