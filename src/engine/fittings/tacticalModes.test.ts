import { describe, expect, it } from 'vitest';
import {
  defaultTacticalMode,
  tacticalModeHulls,
  tacticalModeKind,
  tacticalModesFor,
} from './tacticalModes';

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

describe('tacticalModeKind', () => {
  it('names each mode by its kind, as its SDE type name does', () => {
    // Svipul Defense / Propulsion / Sharpshooter Mode; Anhinga Primary Mode.
    expect(tacticalModeKind(34564)).toBe('defense');
    expect(tacticalModeKind(34566)).toBe('propulsion');
    expect(tacticalModeKind(34570)).toBe('sharpshooter');
    expect(tacticalModeKind(90061)).toBe('primary');
    expect(tacticalModeKind(587)).toBeUndefined();
  });

  it('knows the kind of every mode of every hull with modes', () => {
    expect(tacticalModeHulls().length).toBe(6);
    for (const hull of tacticalModeHulls()) {
      for (const mode of tacticalModesFor(hull)) expect(tacticalModeKind(mode)).toBeDefined();
    }
  });
});
