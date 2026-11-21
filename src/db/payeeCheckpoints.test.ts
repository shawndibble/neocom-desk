import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import {
  dropPayeeCheckpointsFrom,
  earliestDay,
  PAYEE_CHECKPOINTS_KEY,
  readPayeeHistoryGen,
  readStoredCheckpoints,
} from './payeeCheckpoints';

const cp = (through: string) => ({ checkpoint: { through } });

beforeEach(async () => {
  await db.settings.clear();
  await db.settings.put({
    key: PAYEE_CHECKPOINTS_KEY,
    value: { p1: cp('2026-08-31'), p2: cp('2026-09-30') },
  });
});

describe('dropPayeeCheckpointsFrom', () => {
  it('drops the checkpoints a write dated on or before them reaches, and counts the write', async () => {
    await dropPayeeCheckpointsFrom('2026-09-10');
    expect(Object.keys(await readStoredCheckpoints())).toEqual(['p1']);
    expect(await readPayeeHistoryGen()).toBe(1);
  });

  it('keeps them all for a write after them, and drops them all for null', async () => {
    await dropPayeeCheckpointsFrom('2026-10-01');
    expect(Object.keys(await readStoredCheckpoints())).toEqual(['p1', 'p2']);
    await dropPayeeCheckpointsFrom(null);
    expect(await readStoredCheckpoints()).toEqual({});
    expect(await readPayeeHistoryGen()).toBe(2);
  });
});

describe('earliestDay', () => {
  it('reads days and instants alike, skipping what is missing', () => {
    expect(earliestDay(['2026-10-02', undefined, '2026-09-30T12:00:00Z'])).toBe('2026-09-30');
    expect(earliestDay([])).toBeUndefined();
  });
});
