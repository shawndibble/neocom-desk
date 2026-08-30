import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { IndustryJob } from '@/esi/endpoints';
import { jobsCsvColumns } from './jobsCsv';

const t = (k: string) => k;
const nameFor = (typeID: number) => `Item ${typeID}`;

function job(overrides: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 100,
    facility_id: 60003760,
    station_id: 60003760,
    runs: 5,
    start_date: '2026-08-29T12:00:00Z',
    end_date: '2026-08-30T12:00:00Z',
    status: 'active',
    ...overrides,
  };
}

describe('jobsCsvColumns', () => {
  it('orders columns activity, blueprint, blueprint type id, runs, start, end, cost, status, using the i18n keys as headers', () => {
    const columns = jobsCsvColumns(t, nameFor);
    expect(columns.map((c) => c.header)).toEqual([
      'industry.csvJobActivity',
      'industry.csvJobBlueprint',
      'industry.csvJobBlueprintTypeId',
      'industry.csvJobRuns',
      'industry.csvJobStart',
      'industry.csvJobEnd',
      'industry.csvJobCostIsk',
      'industry.csvJobStatus',
    ]);
  });

  it('passes start_date and end_date through unchanged as raw ISO strings', () => {
    const columns = jobsCsvColumns(t, nameFor);
    const row = job({ start_date: '2026-08-29T12:00:00Z', end_date: '2026-08-30T12:00:00Z' });
    const values = Object.fromEntries(columns.map((c) => [c.header, c.value(row)]));
    expect(values['industry.csvJobStart']).toBe('2026-08-29T12:00:00Z');
    expect(values['industry.csvJobEnd']).toBe('2026-08-30T12:00:00Z');
  });

  it('emits raw numbers for runs and blueprint type id', () => {
    const columns = jobsCsvColumns(t, nameFor);
    const row = job({ blueprint_type_id: 999, runs: 42 });
    const values = Object.fromEntries(columns.map((c) => [c.header, c.value(row)]));
    expect(values['industry.csvJobBlueprintTypeId']).toBe(999);
    expect(typeof values['industry.csvJobBlueprintTypeId']).toBe('number');
    expect(values['industry.csvJobRuns']).toBe(42);
    expect(typeof values['industry.csvJobRuns']).toBe('number');
  });

  it('routes the activity column through activityI18nKey with the { id } interpolation', () => {
    const seen: Array<{ key: string; opts?: Record<string, unknown> }> = [];
    const spyT = (key: string, opts?: Record<string, unknown>) => {
      seen.push({ key, opts });
      return key;
    };
    const columns = jobsCsvColumns(spyT, nameFor);
    const activityColumn = columns.find((c) => c.header === 'industry.csvJobActivity')!;
    activityColumn.value(job({ activity_id: 1 }));
    const activityCall = seen.find((c) => c.key === 'industry.activity.manufacturing');
    expect(activityCall).toBeDefined();
    expect(activityCall?.opts).toEqual({ id: 1 });
  });

  it('uses activityI18nKey unknown fallback for an unrecognized activity id', () => {
    const seen: string[] = [];
    const spyT = (key: string) => {
      seen.push(key);
      return key;
    };
    const columns = jobsCsvColumns(spyT, nameFor);
    const activityColumn = columns.find((c) => c.header === 'industry.csvJobActivity')!;
    activityColumn.value(job({ activity_id: 999 }));
    expect(seen).toContain('industry.activity.unknown');
  });

  it('resolves the blueprint name via nameFor', () => {
    const columns = jobsCsvColumns(t, nameFor);
    const blueprintColumn = columns.find((c) => c.header === 'industry.csvJobBlueprint')!;
    expect(blueprintColumn.value(job({ blueprint_type_id: 555 }))).toBe('Item 555');
  });

  it('passes through status', () => {
    const columns = jobsCsvColumns(t, nameFor);
    const statusColumn = columns.find((c) => c.header === 'industry.csvJobStatus')!;
    expect(statusColumn.value(job({ status: 'ready' }))).toBe('ready');
  });

  it('emits a blank cost cell for a job with no cost, never a string', () => {
    const columns = jobsCsvColumns(t, nameFor);
    const row = job({ cost: undefined });
    const csv = toCsv([row], columns);
    const dataLine = csv.split('\r\n')[1];
    const fields = dataLine.split(',');
    // cost is the 7th column (index 6).
    expect(fields[6]).toBe('');
  });

  it('emits 0 (not blank) for a job whose cost is exactly 0', () => {
    const columns = jobsCsvColumns(t, nameFor);
    const row = job({ cost: 0 });
    const csv = toCsv([row], columns);
    const dataLine = csv.split('\r\n')[1];
    const fields = dataLine.split(',');
    expect(fields[6]).toBe('0');
  });

  it('emits the raw cost number when present', () => {
    const columns = jobsCsvColumns(t, nameFor);
    const costColumn = columns.find((c) => c.header === 'industry.csvJobCostIsk')!;
    expect(costColumn.value(job({ cost: 12345.5 }))).toBe(12345.5);
  });
});
