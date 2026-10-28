import { describe, it, expect } from 'vitest';
import { APPRAISAL_COLUMN_IDS, DEFAULT_VISIBLE_APPRAISAL_COLUMNS } from './appraisalColumns';

describe('appraisal columns', () => {
  it('offers ISK/m³ straight after volume, off until ticked', () => {
    const ids = [...APPRAISAL_COLUMN_IDS];
    expect(ids[ids.indexOf('volume') + 1]).toBe('iskPerM3');
    expect(DEFAULT_VISIBLE_APPRAISAL_COLUMNS).not.toContain('iskPerM3');
    expect(DEFAULT_VISIBLE_APPRAISAL_COLUMNS).toContain('volume');
  });

  it('offers split each straight after sell each, off until ticked', () => {
    const ids = [...APPRAISAL_COLUMN_IDS];
    expect(ids[ids.indexOf('sellEach') + 1]).toBe('splitEach');
    expect(DEFAULT_VISIBLE_APPRAISAL_COLUMNS).not.toContain('splitEach');
  });

  it('offers sales tax and the after-tax sell total, off until ticked', () => {
    const ids = [...APPRAISAL_COLUMN_IDS];
    expect(ids.indexOf('sellAfterTax')).toBe(ids.indexOf('salesTax') + 1);
    expect(DEFAULT_VISIBLE_APPRAISAL_COLUMNS).not.toContain('salesTax');
    expect(DEFAULT_VISIBLE_APPRAISAL_COLUMNS).not.toContain('sellAfterTax');
  });
});
