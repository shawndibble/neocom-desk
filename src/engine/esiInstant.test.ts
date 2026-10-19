import { describe, expect, it } from 'vitest';
import { parseInstant } from './esiInstant';

describe('parseInstant', () => {
  it('parses an ESI timestamp to epoch ms', () => {
    expect(parseInstant('2026-10-19T12:00:00Z')).toBe(Date.UTC(2026, 9, 19, 12));
  });

  it('returns null for undefined', () => {
    expect(parseInstant(undefined)).toBeNull();
  });

  it('returns null, not NaN, for garbage', () => {
    expect(parseInstant('not a date')).toBeNull();
    expect(parseInstant('')).toBeNull();
  });
});
