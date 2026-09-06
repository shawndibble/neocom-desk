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
    // A synced blob is whatever the last device wrote, including a version of
    // this app that stored something else entirely.
    for (const raw of [undefined, null, 'nope', 42, []]) {
      expect(parseCustomsOverrides(raw)).toEqual({});
    }
  });

  it('drops entries that are not a usable rate', () => {
    // A rate outside 0-100% is not a customs office, it is a corrupt row —
    // and a NaN would silently price every chain at nothing.
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
    // 0% is a POCO owner taking nothing; 100% is one taking everything, which
    // is a setting a player can actually choose.
    expect(parseCustomsOverrides({ 1: 0, 2: 1 })).toEqual({ 1: 0, 2: 1 });
  });

  it('ignores keys that are not system ids', () => {
    expect(parseCustomsOverrides({ notASystem: 0.1, [EFA]: 0.1 })).toEqual({ [EFA]: 0.1 });
  });
});

describe('customsRateFor', () => {
  it('prefers the pilot’s own figure over the derived one', () => {
    // The whole point outside highsec: the office is player-owned, its tax is
    // in no ESI field, and the derived default is 0 — which understates every
    // margin on the tab until the pilot says otherwise.
    expect(customsRateFor(EFA, { [EFA]: 0.17 }, 0)).toBe(0.17);
  });

  it('falls back to the derived rate where nothing was set', () => {
    expect(customsRateFor(EFA, {}, 0.06)).toBe(0.06);
  });

  it('honours an override of zero rather than reading it as unset', () => {
    // 0% is a real answer a pilot may give — a POCO of their own, or one their
    // corp does not tax them at — and it must out-rank a derived 10%.
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
    // A half-typed field reads NaN, and storing it would price every chain
    // here at nothing until the pilot noticed.
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
