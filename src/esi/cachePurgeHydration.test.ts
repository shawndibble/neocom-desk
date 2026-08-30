/**
 * Hydrating the purge-pending marker off disk — "a previous session gave up on
 * purging and this one has to honour that".
 *
 * Own file on purpose: `cachePurge.ts` memoizes the pending set per module
 * registry, and vitest gives each test *file* a fresh one — the only faithful
 * stand-in for a fresh browser session. Folded into `cachePurge.test.ts`,
 * these assertions would depend on running before anything touches the memo.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from './cache';
import { CACHE_PURGE_PENDING_PREFIX, isCachePurgePending } from './cachePurge';

const STUCK_CHAR_ID = 91;
const HEALTHY_CHAR_ID = 92;

// Seeded before ANY isCachePurgePending call: the first one hydrates the memo.
beforeAll(async () => {
  await db.settings.clear();
  await db.settings.put({ key: `${CACHE_PURGE_PENDING_PREFIX}${STUCK_CHAR_ID}`, value: true });
  await db.settings.put({ key: 'activeCharacterId', value: HEALTHY_CHAR_ID });
  // Hydration parses character ids out of key suffixes, so it must tolerate
  // junk left by any earlier shape of this marker.
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
    // NaN must not enter the suppression set, and must not abort the scan.
    expect(await isCachePurgePending(Number.NaN)).toBe(false);
    expect(await isCachePurgePending(STUCK_CHAR_ID)).toBe(true);
  });
});
