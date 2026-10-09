import { describe, expect, it } from 'vitest';
import { formatDistanceKm, KM_PER_AU } from './formatDistanceKm';

describe('formatDistanceKm', () => {
  it('groups km below 0.1 AU', () => {
    expect(formatDistanceKm(2000)).toBe((2000).toLocaleString() + ' km');
  });
  it('switches to one-decimal AU from 0.1 AU', () => {
    expect(formatDistanceKm(KM_PER_AU / 10)).toBe('0.1 AU');
    expect(formatDistanceKm(KM_PER_AU * 9)).toBe('9.0 AU');
  });
});
