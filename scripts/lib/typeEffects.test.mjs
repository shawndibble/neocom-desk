import { describe, expect, it } from 'vitest';
import { COVERT_CLOAK_EFFECT } from '../../src/engine/fittings/explore';
import { bakeTypeEffects, TYPE_EFFECTS_OF_INTEREST } from './typeEffects.mjs';

const type = (_key, published = true) => ({ _key, published });
const dogma = (_key, ...effectIDs) => ({
  _key,
  dogmaEffects: effectIDs.map((effectID) => ({ effectID })),
});

describe('bakeTypeEffects', () => {
  it('bakes the effect id the app reads', () => {
    expect(Object.keys(TYPE_EFFECTS_OF_INTEREST)).toContain(String(COVERT_CLOAK_EFFECT));
  });

  it('lists the published types with an allow-listed effect, ids sorted', () => {
    const baked = bakeTypeEffects(
      [type(30), type(10), type(20)],
      [dogma(30, 980, 5), dogma(10, 980), dogma(20, 5)]
    );
    expect(baked).toEqual({ 980: [10, 30] });
  });

  it('skips unpublished types and effects off the allow-list', () => {
    const baked = bakeTypeEffects([type(1, false), type(2)], [dogma(1, 980), dogma(2, 7)]);
    expect(baked).toEqual({ 980: [] });
  });

  it('copes with a type with no effects list', () => {
    expect(bakeTypeEffects([type(1)], [{ _key: 1 }])).toEqual({ 980: [] });
  });
});
