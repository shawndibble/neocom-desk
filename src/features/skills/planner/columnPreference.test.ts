import { describe, it, expect } from 'vitest';
import { DEFAULT_COLUMN_VISIBILITY, isColumnVisibility } from './columnPreference';

describe('isColumnVisibility', () => {
  it('accepts a fully-populated boolean record', () => {
    expect(isColumnVisibility(DEFAULT_COLUMN_VISIBILITY)).toBe(true);
    expect(
      isColumnVisibility({
        attributePair: false,
        priority: true,
        perLevelTime: false,
        cumulativeTime: true,
      })
    ).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isColumnVisibility(null)).toBe(false);
    expect(isColumnVisibility('on')).toBe(false);
    expect(isColumnVisibility(42)).toBe(false);
    expect(isColumnVisibility(undefined)).toBe(false);
  });

  it('rejects an object missing a key', () => {
    expect(isColumnVisibility({ attributePair: true, priority: true, perLevelTime: true })).toBe(
      false
    );
  });

  it('rejects an object with a non-boolean value', () => {
    expect(isColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY, priority: 'yes' })).toBe(false);
  });
});
