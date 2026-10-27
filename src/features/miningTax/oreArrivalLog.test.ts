import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { EMPTY_ORE_ARRIVAL_LOG } from '@/engine/miningTax/oreArrival';
import type { CharacterMiningLedger } from './ledger';
import { recordLedgerArrivals, useOreArrivalLog } from './oreArrivalLog';

function ledger(
  quantities: number[],
  fetchedAt: string | null,
  characterId = 91
): CharacterMiningLedger {
  return {
    characterId,
    characterName: 'Pilot One',
    entries: [
      {
        characterId,
        date: '2026-10-04',
        solarSystemId: 30000142,
        oreLines: quantities.map((quantity, i) => ({ typeId: 45490 + i, quantity })),
      },
    ],
    unclassifiedTypeIds: [],
    needsReauth: false,
    fetchedAt: fetchedAt === null ? null : new Date(fetchedAt),
    fromCache: false,
  };
}

beforeEach(async () => {
  await db.settings.clear();
  useOreArrivalLog.setState({ value: EMPTY_ORE_ARRIVAL_LOG, hydrated: false });
});

describe('recordLedgerArrivals', () => {
  it("records each entry's moon-ore total and when its character was fetched", async () => {
    await recordLedgerArrivals([ledger([100, 50], '2026-10-04T12:00:00Z')]);

    const log = useOreArrivalLog.getState().value;
    expect(log.entries['91:2026-10-04:30000142']).toMatchObject({ quantity: 150, grewAt: null });
    expect(log.checkedAt['91']).toBe(Date.parse('2026-10-04T12:00:00Z'));
    expect(await db.settings.get('miningTaxOreArrivals')).toBeDefined();
  });

  it('marks growth on the next newer fetch', async () => {
    await recordLedgerArrivals([ledger([100], '2026-10-04T12:00:00Z')]);
    await recordLedgerArrivals([ledger([130], '2026-10-04T12:10:00Z')]);

    expect(useOreArrivalLog.getState().value.entries['91:2026-10-04:30000142'].grewAt).toBe(
      Date.parse('2026-10-04T12:10:00Z')
    );
  });

  it('skips a character with no ledger at all', async () => {
    await recordLedgerArrivals([ledger([100], null)]);
    expect(useOreArrivalLog.getState().value).toEqual(EMPTY_ORE_ARRIVAL_LOG);
  });

  it("never fails the Tax tab's load when the write fails", async () => {
    const put = vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('QuotaExceeded'));
    await expect(
      recordLedgerArrivals([ledger([100], '2026-10-04T12:00:00Z')])
    ).resolves.toBeUndefined();
    put.mockRestore();
  });
});
