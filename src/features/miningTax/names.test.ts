import { describe, expect, it } from 'vitest';
import { systemLabel } from './names';

describe('systemLabel', () => {
  it('returns the resolved name', () => {
    expect(systemLabel(new Map([[1, 'Jita']]), 1)).toBe('Jita');
  });

  it('falls back to #id when unresolved', () => {
    expect(systemLabel(new Map(), 30000142)).toBe('#30000142');
  });
});
