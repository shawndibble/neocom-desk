import { describe, expect, it } from 'vitest';
import { entityLinkClassName } from './entityLinkClassName';

describe('entityLinkClassName', () => {
  it('is accent text with a decoration that appears on hover and focus', () => {
    const tokens = entityLinkClassName().split(' ');
    for (const token of [
      'text-accent',
      'underline',
      'decoration-transparent',
      'underline-offset-2',
      'hover:decoration-current',
      'focus-visible:decoration-current',
      'active:text-accent/75',
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it('carries the accent focus ring', () => {
    const tokens = entityLinkClassName().split(' ');
    for (const token of [
      'focus-visible:outline-2',
      'focus-visible:outline-offset-2',
      'focus-visible:outline-accent',
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it('appends per-site extras', () => {
    expect(entityLinkClassName('min-w-0 truncate').endsWith(' min-w-0 truncate')).toBe(true);
  });
});
