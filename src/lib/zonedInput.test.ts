import { describe, expect, it } from 'vitest';
import { instantToInputValue, inputValueToInstant } from './zonedInput';

describe('zonedInput (UTC)', () => {
  it('round-trips an instant through a datetime-local value read as EVE time', () => {
    const at = Date.UTC(2026, 10, 3, 14, 5);
    expect(instantToInputValue(at, 'UTC')).toBe('2026-11-03T14:05');
    expect(inputValueToInstant('2026-11-03T14:05', 'UTC')).toBe(at);
  });

  it('rejects an empty or malformed value', () => {
    expect(inputValueToInstant('', 'UTC')).toBeNull();
    expect(inputValueToInstant('not a date', 'UTC')).toBeNull();
  });
});

describe('zonedInput (local)', () => {
  it('round-trips an instant through the browser’s own zone', () => {
    const at = new Date(2026, 10, 3, 14, 5).getTime();
    const text = instantToInputValue(at, undefined);
    expect(text).toBe('2026-11-03T14:05');
    expect(inputValueToInstant(text, undefined)).toBe(at);
  });
});
