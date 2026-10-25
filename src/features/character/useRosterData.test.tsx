import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { writeCached } from '@/esi/cache';
import { useRosterData } from './useRosterData';

const ID = 91;
const CHARACTERS = [{ characterId: ID }];

beforeEach(async () => {
  await Promise.all([db.characters.clear(), db.esiCache.clear(), db.esiCacheMeta.clear()]);
  await db.characters.put({ characterId: ID, name: 'Pilot', ownerHash: 'h', addedAt: 1 });
});

describe('useRosterData', () => {
  it('fills a row in when its cache lands after the page opened (a first login still syncing)', async () => {
    const { result } = renderHook(() => useRosterData(CHARACTERS));
    await waitFor(() => expect(result.current.rosterCore.get(ID)).toBeDefined());
    expect(result.current.rosterCore.get(ID)?.stats.wallet).toBeUndefined();

    await writeCached(ID, 'wallet:balance', 1_234, Date.now());
    await waitFor(() => expect(result.current.rosterCore.get(ID)?.stats.wallet).toBe(1_234));
  });
});
