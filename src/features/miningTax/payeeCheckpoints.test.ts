import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { notifyRecordsChanged } from '@/sync/recordsChanged';
import {
  dropPayeeCheckpointsReachedBy,
  earliestKnownDay,
  PAYEE_CHECKPOINTS_KEY,
  readPayeeHistoryGen,
  readStoredCheckpoints,
} from './payeeCheckpoints';

const cp = (through: string) => ({ checkpoint: { through } });
// Today a checkpoint closes through 2026-09-30 at the latest (`closedThroughFor`).
const TODAY = '2026-11-21';

beforeEach(async () => {
  await db.settings.clear();
  await db.settings.put({
    key: PAYEE_CHECKPOINTS_KEY,
    value: { p1: cp('2026-08-31'), p2: cp('2026-09-30') },
  });
});

describe('dropPayeeCheckpointsReachedBy (the books’ rule, editReachesCheckpoint)', () => {
  it('drops them for a write dated on or before the newest day a checkpoint can close', async () => {
    await dropPayeeCheckpointsReachedBy('2026-09-10', TODAY);
    expect(await readStoredCheckpoints()).toEqual({});
    expect(await readPayeeHistoryGen()).toBe(1);
  });

  it('keeps them for a write after it, and counts nothing; null reaches every day', async () => {
    await dropPayeeCheckpointsReachedBy('2026-10-01', TODAY);
    expect(Object.keys(await readStoredCheckpoints())).toEqual(['p1', 'p2']);
    expect(await readPayeeHistoryGen()).toBe(0);
    await dropPayeeCheckpointsReachedBy(null, TODAY);
    expect(await readStoredCheckpoints()).toEqual({});
  });
});

describe('a sync pull', () => {
  it("drops them when another device's row it pulled reaches a closed day", async () => {
    await notifyRecordsChanged('miningTaxAssignments', {
      upserted: [{ date: '2026-08-04' }],
      before: [],
      deleted: [],
    });
    expect(await readStoredCheckpoints()).toEqual({});
  });
});

describe('earliestKnownDay', () => {
  it('reads days and instants alike, skipping what is missing', () => {
    expect(earliestKnownDay(['2026-10-02', undefined, '2026-09-30T12:00:00Z'])).toBe('2026-09-30');
    expect(earliestKnownDay([])).toBeUndefined();
  });
});
