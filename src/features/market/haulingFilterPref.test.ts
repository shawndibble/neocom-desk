import { describe, expect, it } from 'vitest';
import { DEFAULT_HAULING_FILTER, parseStoredHaulingFilter } from './haulingFilterPref';

describe('parseStoredHaulingFilter', () => {
  it('accepts a well-formed stored filter', () => {
    const stored = { days: 7, margin: 10, demand: 'any' as const };
    expect(parseStoredHaulingFilter(stored)).toEqual(stored);
  });

  it('rejects null, non-objects, and arrays', () => {
    expect(parseStoredHaulingFilter(null)).toBeNull();
    expect(parseStoredHaulingFilter(undefined)).toBeNull();
    expect(parseStoredHaulingFilter('nope')).toBeNull();
    expect(parseStoredHaulingFilter(42)).toBeNull();
  });

  it('rejects a row missing or mistyping days/margin', () => {
    expect(parseStoredHaulingFilter({ margin: 3, demand: 'steady' })).toBeNull();
    expect(parseStoredHaulingFilter({ days: '7', margin: 3, demand: 'steady' })).toBeNull();
    expect(parseStoredHaulingFilter({ days: 7, demand: 'steady' })).toBeNull();
  });

  it('rejects a demand value outside the known set', () => {
    expect(parseStoredHaulingFilter({ days: 7, margin: 3, demand: 'always' })).toBeNull();
    expect(parseStoredHaulingFilter({ days: 7, margin: 3 })).toBeNull();
  });

  it('DEFAULT_HAULING_FILTER round-trips through the parser', () => {
    expect(parseStoredHaulingFilter(DEFAULT_HAULING_FILTER)).toEqual(DEFAULT_HAULING_FILTER);
  });
});
