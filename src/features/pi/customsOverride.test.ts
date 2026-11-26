import { describe, it, expect } from 'vitest';
import {
  customsRateFor,
  parseCustomsOverrides,
  withCustomsOverride,
  withoutCustomsOverride,
} from './customsOverride';

const EFA = 30_002_187;
const AMARR = 30_002_510;

describe('parseCustomsOverrides', () => {
  it('reads a stored map of system to rate', () => {
    expect(parseCustomsOverrides({ [EFA]: 0.17, [AMARR]: 0 })).toEqual({
      [EFA]: 0.17,
      [AMARR]: 0,
    });
  });

  it('is empty for anything that is not a map', () => {
    for (const raw of [undefined, null, 'nope', 42, []]) {
      expect(parseCustomsOverrides(raw)).toEqual({});
    }
  });

  it('drops entries that are not a usable rate', () => {
    expect(
      parseCustomsOverrides({
        [EFA]: 0.1,
        1: -0.5,
        2: 1.5,
        3: 'ten',
        4: null,
        5: Number.NaN,
        6: Number.POSITIVE_INFINITY,
      })
    ).toEqual({ [EFA]: 0.1 });
  });

  it('keeps the boundaries, which are both real offices', () => {
    expect(parseCustomsOverrides({ 1: 0, 2: 1 })).toEqual({ 1: 0, 2: 1 });
  });

  it('ignores keys that are not system ids', () => {
    expect(parseCustomsOverrides({ notASystem: 0.1, [EFA]: 0.1 })).toEqual({ [EFA]: 0.1 });
  });
});

describe('customsRateFor', () => {
  it('prefers the pilot’s own figure over the derived one', () => {
    expect(customsRateFor(EFA, { [EFA]: 0.17 }, 0)).toBe(0.17);
  });

  it('falls back to the derived rate where nothing was set', () => {
    expect(customsRateFor(EFA, {}, 0.06)).toBe(0.06);
  });

  it('honours an override of zero rather than reading it as unset', () => {
    expect(customsRateFor(EFA, { [EFA]: 0 }, 0.1)).toBe(0);
  });
});

describe('withCustomsOverride', () => {
  it('sets one system without disturbing the others', () => {
    expect(withCustomsOverride({ [AMARR]: 0.05 }, EFA, 0.17)).toEqual({
      [AMARR]: 0.05,
      [EFA]: 0.17,
    });
  });

  it('clamps a rate into the range an office can actually charge', () => {
    expect(withCustomsOverride({}, EFA, 2)).toEqual({ [EFA]: 1 });
    expect(withCustomsOverride({}, EFA, -1)).toEqual({ [EFA]: 0 });
  });

  it('refuses a rate that is not a number at all', () => {
    expect(withCustomsOverride({ [EFA]: 0.1 }, EFA, Number.NaN)).toEqual({ [EFA]: 0.1 });
  });
});

describe('withoutCustomsOverride', () => {
  it('drops one system back to the derived rate', () => {
    expect(withoutCustomsOverride({ [EFA]: 0.17, [AMARR]: 0.05 }, EFA)).toEqual({
      [AMARR]: 0.05,
    });
  });

  it('is a no-op on a system that was never overridden', () => {
    expect(withoutCustomsOverride({ [AMARR]: 0.05 }, EFA)).toEqual({ [AMARR]: 0.05 });
  });
});
