import { describe, it, expect } from 'vitest';
import { cloneStateFor, parseCloneStates, withCloneState } from './cloneState';

describe('clone state setting', () => {
  it('defaults every Character to Omega', () => {
    expect(cloneStateFor({}, 42)).toBe('omega');
  });

  it('stores Alpha and drops the entry on a return to Omega', () => {
    const alpha = withCloneState({}, 42, 'alpha');
    expect(cloneStateFor(alpha, 42)).toBe('alpha');
    expect(cloneStateFor(alpha, 7)).toBe('omega');
    expect(withCloneState(alpha, 42, 'omega')).toEqual({});
  });

  it('keeps usable entries and drops damaged ones', () => {
    expect(parseCloneStates({ 42: 'alpha', 7: 'omega', 9: 1, x: 'alpha' })).toEqual({
      42: 'alpha',
    });
    expect(parseCloneStates('alpha')).toEqual({});
  });
});
