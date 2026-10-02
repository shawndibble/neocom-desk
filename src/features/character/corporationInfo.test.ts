import { describe, expect, it } from 'vitest';
import { corporationAge, deriveAllianceHistoryRows } from './corporationInfo';

describe('deriveAllianceHistoryRows', () => {
  it('lists the most recent first, each ending where the next one began', () => {
    const rows = deriveAllianceHistoryRows([
      { record_id: 1, alliance_id: 99000001, start_date: '2019-06-01T00:00:00Z' },
      { record_id: 3, alliance_id: 99000002, start_date: '2022-03-10T00:00:00Z' },
      { record_id: 2, start_date: '2021-11-05T00:00:00Z' },
    ]);
    expect(rows).toEqual([
      {
        recordId: 3,
        allianceId: 99000002,
        startDate: '2022-03-10T00:00:00Z',
        endDate: null,
        deleted: false,
      },
      {
        recordId: 2,
        allianceId: null,
        startDate: '2021-11-05T00:00:00Z',
        endDate: '2022-03-10T00:00:00Z',
        deleted: false,
      },
      {
        recordId: 1,
        allianceId: 99000001,
        startDate: '2019-06-01T00:00:00Z',
        endDate: '2021-11-05T00:00:00Z',
        deleted: false,
      },
    ]);
  });

  it('keeps a since-closed alliance, marked deleted', () => {
    const [row] = deriveAllianceHistoryRows([
      { record_id: 1, alliance_id: 99000001, start_date: '2019-06-01T00:00:00Z', is_deleted: true },
    ]);
    expect(row.deleted).toBe(true);
  });

  it('is empty for a corporation that has never had a record', () => {
    expect(deriveAllianceHistoryRows([])).toEqual([]);
  });
});

describe('corporationAge', () => {
  const now = new Date('2026-10-02T12:00:00Z');

  it('counts whole years and the months past them', () => {
    expect(corporationAge('2019-04-12T08:00:00Z', now)).toEqual({ years: 7, months: 5 });
  });

  it('does not count a month whose day has not come round yet', () => {
    expect(corporationAge('2026-09-05T00:00:00Z', now)).toEqual({ years: 0, months: 0 });
    expect(corporationAge('2025-10-01T00:00:00Z', now)).toEqual({ years: 1, months: 0 });
  });

  it('is unknown with no founding date, or one it cannot read', () => {
    expect(corporationAge(undefined, now)).toBeNull();
    expect(corporationAge('not a date', now)).toBeNull();
  });
});
