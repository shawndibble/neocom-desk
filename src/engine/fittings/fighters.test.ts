import { describe, expect, it } from 'vitest';
import { fighterClass, isFighter, squadronSize, squadronsOf } from './fighters';

describe('fighters', () => {
  it('knows a fighter’s class and squadron size', () => {
    expect(fighterClass(23055)).toBe('light');
    expect(squadronSize(23055)).toBe(6);
    expect(fighterClass(37599)).toBe('support');
    expect(squadronSize(37599)).toBe(3);
    expect(fighterClass(32325)).toBe('heavy');
  });

  it('knows nothing of drones or structure fighters', () => {
    expect(isFighter(2488)).toBe(false);
    expect(isFighter(47035)).toBe(false);
    expect(fighterClass(2488)).toBeNull();
  });

  it('splits a stack into full squadrons and a short one, in the bay', () => {
    expect(squadronsOf(23055, 14)).toEqual([
      { typeId: 23055, quantity: 6, state: 'online' },
      { typeId: 23055, quantity: 6, state: 'online' },
      { typeId: 23055, quantity: 2, state: 'online' },
    ]);
  });
});
