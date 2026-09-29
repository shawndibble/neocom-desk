import { describe, it, expect } from 'vitest';
import { employmentHistoryCsvColumns } from './employmentHistoryCsv';
import type { EmploymentHistoryRow } from './employmentHistory';

const t = (k: string) => k;

function row(overrides: Partial<EmploymentHistoryRow> = {}): EmploymentHistoryRow {
  return {
    recordId: 1,
    corporationId: 98000001,
    startDate: '2024-03-01T12:00:00Z',
    tenureSeconds: 10 * 86_400 + 3_600,
    ongoing: false,
    ...overrides,
  };
}

function valuesOf(r: EmploymentHistoryRow, names: ReadonlyMap<number, string> = new Map()) {
  const columns = employmentHistoryCsvColumns(t, names);
  return Object.fromEntries(columns.map((c) => [c.header, c.value(r)]));
}

describe('employmentHistoryCsvColumns', () => {
  it('orders columns corporation, joined, duration in days', () => {
    expect(employmentHistoryCsvColumns(t, new Map()).map((c) => c.header)).toEqual([
      'employmentHistory.corporation',
      'employmentHistory.started',
      'employmentHistory.csvDurationDays',
    ]);
  });

  it('names the corporation, falling back to its id', () => {
    expect(valuesOf(row(), new Map([[98000001, 'Brave Newbies']]))).toMatchObject({
      'employmentHistory.corporation': 'Brave Newbies',
    });
    expect(valuesOf(row())['employmentHistory.corporation']).toBe('#98000001');
  });

  it('passes the start date through as the raw ESI timestamp', () => {
    expect(valuesOf(row())['employmentHistory.started']).toBe('2024-03-01T12:00:00Z');
  });

  it('emits the tenure as a number of whole days, not a formatted duration', () => {
    expect(valuesOf(row())['employmentHistory.csvDurationDays']).toBe(10);
  });
});
