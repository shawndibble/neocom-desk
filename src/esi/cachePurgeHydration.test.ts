import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from './cache';
import { CACHE_PURGE_PENDING_PREFIX, isCachePurgePending } from './cachePurge';

const STUCK_CHAR_ID = 91;
const HEALTHY_CHAR_ID = 92;

beforeAll(async () => {
  await db.settings.clear();
  await db.settings.put({ key: `${CACHE_PURGE_PENDING_PREFIX}${STUCK_CHAR_ID}`, value: true });
  await db.settings.put({ key: 'activeCharacterId', value: HEALTHY_CHAR_ID });
  await db.settings.put({ key: `${CACHE_PURGE_PENDING_PREFIX}not-a-character`, value: true });
});

describe('isCachePurgePending — durable marker left by a previous session', () => {
  it('suppresses a character whose marker survived the reload', async () => {
    expect(await isCachePurgePending(STUCK_CHAR_ID)).toBe(true);
  });

  it('leaves a character with no marker alone', async () => {
    expect(await isCachePurgePending(HEALTHY_CHAR_ID)).toBe(false);
  });

  it('never suppresses the global sentinel — public data belongs to no owner', async () => {
    expect(await isCachePurgePending(GLOBAL_CACHE_CHARACTER_ID)).toBe(false);
  });

  it('survives an unparseable marker key without dropping the valid ones', async () => {
    expect(await isCachePurgePending(Number.NaN)).toBe(false);
    expect(await isCachePurgePending(STUCK_CHAR_ID)).toBe(true);
  });
});
