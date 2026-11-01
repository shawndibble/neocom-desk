import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { KillRecord } from '@/engine/pilotList/killActivity';
import { DAY_MS, MINUTE_MS } from '@/lib/age';
import {
  classifyKillHistoryAge,
  readStoredCharacterIds,
  readStoredKillHistories,
  storeCharacterIds,
  storeKillHistory,
} from './pilotHistoryStore';

const kill: KillRecord = {
  timeMs: 1_000,
  space: 'highsec',
  systemId: 30000142,
  victimShipTypeId: 587,
  ownShipTypeId: 11184,
};

describe('classifyKillHistoryAge', () => {
  it('is fresh under 30 minutes, stale up to 24 hours, then expired', () => {
    expect(classifyKillHistoryAge(0)).toBe('fresh');
    expect(classifyKillHistoryAge(30 * MINUTE_MS - 1)).toBe('fresh');
    expect(classifyKillHistoryAge(30 * MINUTE_MS)).toBe('stale');
    expect(classifyKillHistoryAge(DAY_MS - 1)).toBe('stale');
    expect(classifyKillHistoryAge(DAY_MS)).toBe('expired');
  });
});

describe('stored kill history', () => {
  beforeEach(async () => {
    await db.esiCache.clear();
    await db.esiCacheMeta.clear();
  });

  it('round-trips a pilot and leaves unknown pilots out', async () => {
    await storeKillHistory(7, [kill], 5_000);
    const read = await readStoredKillHistories([7, 8]);
    expect(read.get(7)).toEqual({ kills: [kill], extras: null, fetchedAt: 5_000 });
    expect(read.has(8)).toBe(false);
  });

  it('keeps the verdict extras beside the kills', async () => {
    const extras = { dangerRatio: 0.8, killerRatio: 0.4, lossTimesMs: null };
    await storeKillHistory(7, [kill], 5_000, extras);
    expect((await readStoredKillHistories([7])).get(7)?.extras).toEqual(extras);
  });

  it('keeps an empty history: a pilot with no kills is an answer, not a miss', async () => {
    await storeKillHistory(7, [], 5_000);
    expect((await readStoredKillHistories([7])).get(7)?.kills).toEqual([]);
  });
});

describe('stored character ids', () => {
  beforeEach(async () => {
    await db.esiCache.clear();
    await db.esiCacheMeta.clear();
  });

  it('matches names case-insensitively', async () => {
    await storeCharacterIds([{ id: 42, name: 'Blue Tractor' }], 1_000);
    const read = await readStoredCharacterIds(['blue TRACTOR'], 1_000 + MINUTE_MS);
    expect(read.get('blue tractor')).toEqual({ id: 42, name: 'Blue Tractor' });
  });

  it('forgets an answer older than a day, so a renamed pilot is looked up again', async () => {
    await storeCharacterIds([{ id: 42, name: 'Blue Tractor' }], 1_000);
    expect((await readStoredCharacterIds(['Blue Tractor'], 1_000 + DAY_MS)).size).toBe(0);
  });
});
