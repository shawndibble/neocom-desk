import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { loadWithCacheStatus } from './cache';

const CHAR_ID = 92;
const KEY = 'leak-thing';

beforeEach(async () => {
  await db.esiCache.clear();
});

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
