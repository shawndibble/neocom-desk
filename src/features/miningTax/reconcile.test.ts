import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { reconcileAssignments } from './reconcile';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const CHAR_A = 1;
const TYPE_A = 45490;

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'p',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.miningTaxAssignments.clear();
});

describe('reconcileAssignments', () => {
  it('does nothing when there are no assignments', async () => {
    await reconcileAssignments(CHAR_A, []);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('leaves an assignment alone when the fresh entry matches exactly', async () => {
    await db.miningTaxAssignments.put(assignment());
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('flips to needs-review with an explicit diff when ESI reports more ore', async () => {
    await db.miningTaxAssignments.put(assignment());
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 150 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.status).toBe('needs-review');
    expect(updated?.reviewDiff).toEqual([{ typeId: TYPE_A, before: 100, after: 150 }]);
    // The stored snapshot itself is untouched — only status/reviewDiff moved.
    expect(updated?.oreLines).toEqual([{ typeId: TYPE_A, quantity: 100 }]);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('flips a paid assignment too, since the debt grew after payment', async () => {
    await db.miningTaxAssignments.put(assignment({ status: 'paid', paidAt: 5 }));
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 200 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('needs-review');
  });

  it('leaves the assignment alone when its entry has aged out of the fresh read', async () => {
    await db.miningTaxAssignments.put(assignment());
    await reconcileAssignments(CHAR_A, []);
    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('does not re-write (or re-sync) an assignment already needs-review with the identical diff', async () => {
    await db.miningTaxAssignments.put(
      assignment({
        status: 'needs-review',
        reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      })
    );
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 150 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('re-writes when a needs-review assignment grows again with a new diff', async () => {
    await db.miningTaxAssignments.put(
      assignment({
        status: 'needs-review',
        reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      })
    );
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 200 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect((await db.miningTaxAssignments.get('a1'))?.reviewDiff).toEqual([
      { typeId: TYPE_A, before: 100, after: 200 },
    ]);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });
});
