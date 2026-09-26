import { describe, expect, it } from 'vitest';
import { defaultTacticalMode, tacticalModesFor } from './tacticalModes';

describe('tacticalModesFor', () => {
  it('lists a Tactical Destroyer’s modes, Defense first', () => {
    // Svipul: Defense, Propulsion, Sharpshooter.
    expect(tacticalModesFor(34562)).toEqual([34564, 34566, 34570]);
    expect(defaultTacticalMode(34562)).toBe(34564);
  });

  it('has none for any other hull', () => {
    expect(tacticalModesFor(587)).toEqual([]);
    expect(defaultTacticalMode(587)).toBeUndefined();
  });
});
