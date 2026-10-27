import { describe, it, expect } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('joins present fragments with single spaces', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('drops absent fragments rather than leaving gaps', () => {
    expect(cx('a', undefined, 'b')).toBe('a b');
    expect(cx('a', false, 'b')).toBe('a b');
    expect(cx('a', '', 'b')).toBe('a b');
  });

  it('leaves no trailing space when the last fragment is absent', () => {
    expect(cx('a', undefined)).toBe('a');
  });

  it('is empty when everything is absent', () => {
    expect(cx(undefined, false, '')).toBe('');
  });
});
