import { describe, expect, it } from 'vitest';
import { parseInstant } from './esiInstant';

describe('parseInstant', () => {
  it('parses an ESI timestamp to epoch ms', () => {
    expect(parseInstant('2026-01-02T03:04:05Z')).toBe(Date.parse('2026-01-02T03:04:05Z'));
  });

  it('is null for undefined', () => {
    expect(parseInstant(undefined)).toBeNull();
  });

  it('is null for a malformed or empty string, never NaN', () => {
    expect(parseInstant('not a date')).toBeNull();
    expect(parseInstant('')).toBeNull();
  });
});
