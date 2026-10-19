import { describe, it, expect } from 'vitest';
import { parseInstant } from './esiInstant';

describe('parseInstant', () => {
  it('parses an ESI ISO timestamp to epoch ms', () => {
    expect(parseInstant('2026-01-02T03:04:05Z')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
  });

  it('returns null for undefined', () => {
    expect(parseInstant(undefined)).toBeNull();
  });

  it('returns null, not NaN, for an unparseable string', () => {
    expect(parseInstant('not a date')).toBeNull();
    expect(parseInstant('')).toBeNull();
  });
});
