import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type {
  AssignmentRecordChange,
  ToleranceRecordChange,
} from '@/engine/miningTax/recordChanges';
import { loadRecordChanges, recordChangesReady, saveRecordChanges } from './recordChangeStore';

const closeOut: ToleranceRecordChange = {
  id: 'tolerance:98000001:m1:2026-11-01',
  reason: 'tolerance',
  at: '2026-11-02T10:00:00Z',
  date: '2026-11-01',
  corporationId: 98000001,
  minerId: 'm1',
  closeOut: { billed: 1_000_000, paid: 996_000, writtenOff: 4_000, tolerancePct: 0.5 },
};

const fixed: AssignmentRecordChange = {
  id: 'c1',
  reason: 'fixMyRecords',
  at: '2026-11-01T10:00:00Z',
  date: '2026-10-31',
  assignments: [
    {
      assignmentId: 'a1',
      before: { payeeId: 'p1', taxPct: 10, taxOwed: 100, oreLines: [] },
      after: null,
    },
  ],
};

beforeEach(async () => {
  await db.miningTaxRecordChanges.clear();
  await db.settings.clear();
});

describe('record changes', () => {
  it('saves each change once under its Character and reads them back oldest first', async () => {
    const saved = await saveRecordChanges([
      { characterId: 7, change: closeOut },
      { characterId: 8, change: fixed },
    ]);
    expect(saved.map((c) => c.id)).toEqual([closeOut.id, 'c1']);
    expect(await loadRecordChanges()).toEqual([fixed, closeOut]);
    expect((await db.miningTaxRecordChanges.get(closeOut.id))?.characterId).toBe(7);
  });

  it('never rewrites or duplicates a change already saved', async () => {
    await saveRecordChanges([{ characterId: 7, change: closeOut }]);
    const again = await saveRecordChanges([
      {
        characterId: 8,
        change: { ...closeOut, closeOut: { ...closeOut.closeOut, writtenOff: 9_000 } },
      },
      { characterId: 8, change: fixed },
      { characterId: 8, change: fixed },
    ]);
    expect(again.map((c) => c.id)).toEqual(['c1']);
    const stored = await db.miningTaxRecordChanges.toArray();
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.id === closeOut.id)).toMatchObject({
      characterId: 7,
      closeOut: { writtenOff: 4_000 },
    });
  });

  it('is ready to write without sync configured', async () => {
    expect(await recordChangesReady([7])).toBe(true);
  });
});
