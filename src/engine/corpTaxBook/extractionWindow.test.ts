import { describe, expect, it } from 'vitest';
import { extractionWindowDays } from './extractionWindow';

describe('extractionWindowDays', () => {
  it('counts whole days from the extraction start to the chunk arrival', () => {
    expect(extractionWindowDays('2026-10-18T14:00:00Z', '2026-10-24T14:00:00Z')).toBe(6);
  });
  it('rounds a part day to the nearest day', () => {
    expect(extractionWindowDays('2026-10-18T14:00:00Z', '2026-10-24T20:00:00Z')).toBe(6);
    expect(extractionWindowDays('2026-10-18T14:00:00Z', '2026-10-25T04:00:00Z')).toBe(7);
  });
  it('is never negative', () => {
    expect(extractionWindowDays('2026-10-20T00:00:00Z', '2026-10-18T00:00:00Z')).toBe(0);
  });
});
