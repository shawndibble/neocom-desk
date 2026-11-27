import { describe, expect, it } from 'vitest';
import { dismissPopLink } from './surveyPref';

describe('dismissPopLink', () => {
  it('adds the Survey once and keeps the others', () => {
    expect(dismissPopLink(['abc234'], 'def567')).toEqual(['abc234', 'def567']);
    expect(dismissPopLink(['abc234', 'def567'], 'abc234')).toEqual(['def567', 'abc234']);
  });

  it('forgets the oldest once the list is full', () => {
    const full = Array.from({ length: 50 }, (_, i) => `id${i}`);
    const next = dismissPopLink(full, 'fresh2');
    expect(next).toHaveLength(50);
    expect(next[0]).toBe('id1');
    expect(next.at(-1)).toBe('fresh2');
  });
});
