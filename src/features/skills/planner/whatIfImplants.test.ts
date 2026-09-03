import { describe, it, expect } from 'vitest';
import type { Implants } from '@/engine/types';
import {
  DEFAULT_WHAT_IF_SELECTION,
  setWhatIfBonus,
  whatIfImplants,
  type WhatIfImplantSelection,
} from './whatIfImplants';

const preset = (p: 'none' | 'current' | '+1' | '+2' | '+3' | '+4' | '+5'): WhatIfImplantSelection =>
  ({ kind: 'preset', preset: p }) as const;
const custom = (bonuses: Implants): WhatIfImplantSelection => ({ kind: 'custom', bonuses });

describe('whatIfImplants presets', () => {
  it('"none" drops every implant bonus', () => {
    expect(whatIfImplants(preset('none'), { memory: 5, perception: 3 })).toEqual({
      intelligence: 0,
      memory: 0,
      perception: 0,
      willpower: 0,
      charisma: 0,
    });
  });

  it('"current" is the clone\'s real implants, with an unfitted slot reading +0', () => {
    expect(whatIfImplants(preset('current'), { memory: 5, perception: 3 })).toEqual({
      intelligence: 0,
      memory: 5,
      perception: 3,
      willpower: 0,
      charisma: 0,
    });
  });

  it('"+N" is a uniform bonus across all 5 attributes, ignoring current implants', () => {
    expect(whatIfImplants(preset('+3'), { memory: 5 })).toEqual({
      intelligence: 3,
      memory: 3,
      perception: 3,
      willpower: 3,
      charisma: 3,
    });
  });

  it('"+5" is the max uniform tier', () => {
    expect(whatIfImplants(preset('+5'), {})).toEqual({
      intelligence: 5,
      memory: 5,
      perception: 5,
      willpower: 5,
      charisma: 5,
    });
  });

  it("defaults to the clone's own implants, so the planner opens on the truth", () => {
    expect(DEFAULT_WHAT_IF_SELECTION).toEqual(preset('current'));
  });
});

describe('whatIfImplants per-attribute sets', () => {
  it('resolves each slot on its own — the case a uniform +N cannot express', () => {
    expect(
      whatIfImplants(custom({ perception: 4, intelligence: 5, memory: 3 }), { willpower: 5 })
    ).toEqual({
      intelligence: 5,
      memory: 3,
      perception: 4,
      willpower: 0,
      charisma: 0,
    });
  });

  it('never lets an out-of-range or NaN value through to the scheduler', () => {
    // Implants are documented +0..+5 (engine/types.ts). computeSchedule adds
    // whatever it is handed straight onto the attribute, so the clamp lives
    // here rather than only on the input that produced the number.
    expect(
      whatIfImplants(
        custom({
          intelligence: 9,
          memory: -2,
          perception: Number.NaN,
          willpower: Number.POSITIVE_INFINITY,
          charisma: 3.7,
        }),
        {}
      )
    ).toEqual({
      intelligence: 5,
      memory: 0,
      perception: 0,
      willpower: 5,
      charisma: 4,
    });
  });

  it("clamps the clone's own implants too, so a bad stored value cannot leak in", () => {
    expect(whatIfImplants(preset('current'), { memory: 42, charisma: Number.NaN })).toEqual({
      intelligence: 0,
      memory: 5,
      perception: 0,
      willpower: 0,
      charisma: 0,
    });
  });
});

describe('setWhatIfBonus', () => {
  it('seeds a custom set from the preset in force, changing only the named slot', () => {
    const next = setWhatIfBonus(preset('+4'), {}, 'perception', 5);

    expect(next.kind).toBe('custom');
    // The other four keep the +4 the preset was showing — editing one value
    // must not silently zero the rest.
    expect(whatIfImplants(next, {})).toEqual({
      intelligence: 4,
      memory: 4,
      perception: 5,
      willpower: 4,
      charisma: 4,
    });
  });

  it('seeds from "current" against the clone, so an edit builds on the real set', () => {
    const next = setWhatIfBonus(preset('current'), { perception: 4, memory: 3 }, 'intelligence', 5);

    expect(whatIfImplants(next, { perception: 4, memory: 3 })).toEqual({
      intelligence: 5,
      memory: 3,
      perception: 4,
      willpower: 0,
      charisma: 0,
    });
  });

  it('is frozen against the clone at edit time — a later implant swap does not move it', () => {
    // Only the 'current' preset tracks the live clone. Once the user has
    // edited a slot they are describing a hypothetical set, and re-reading
    // the character's implants underneath it would rewrite their hypothesis.
    const next = setWhatIfBonus(preset('current'), { perception: 4 }, 'memory', 2);

    expect(whatIfImplants(next, { perception: 1, charisma: 5 })).toEqual({
      intelligence: 0,
      memory: 2,
      perception: 4,
      willpower: 0,
      charisma: 0,
    });
  });

  it('edits an existing custom set in place, leaving its other four alone', () => {
    const next = setWhatIfBonus(custom({ perception: 4, memory: 3 }), {}, 'memory', 1);

    expect(whatIfImplants(next, {})).toEqual({
      intelligence: 0,
      memory: 1,
      perception: 4,
      willpower: 0,
      charisma: 0,
    });
  });

  it('clamps at the edit as well as at the resolve', () => {
    expect(whatIfImplants(setWhatIfBonus(preset('none'), {}, 'memory', 12), {}).memory).toBe(5);
    expect(whatIfImplants(setWhatIfBonus(preset('none'), {}, 'memory', -4), {}).memory).toBe(0);
    // A cleared number field reports '' — Number('') is 0, not NaN, so the
    // slot empties to +0 rather than sticking on its old value.
    expect(whatIfImplants(setWhatIfBonus(preset('+5'), {}, 'memory', Number('')), {}).memory).toBe(
      0
    );
    expect(
      whatIfImplants(setWhatIfBonus(preset('+5'), {}, 'memory', Number('abc')), {}).memory
    ).toBe(0);
  });

  it('does not mutate the selection it was given', () => {
    const before = custom({ perception: 4 });
    setWhatIfBonus(before, {}, 'perception', 1);

    expect(before).toEqual(custom({ perception: 4 }));
  });
});
