import { describe, expect, it } from 'vitest';
import { EMPTY_EXPLORE, EXPLORE_ATTRIBUTE, exploreFigures, extractExplore } from './explore';

const attrs = (values: Record<number, number>) => ({
  get: (id: number) => (id in values ? { value: values[id] } : undefined),
});
const item = (typeId: number, slot = 'high', state = 'active', charge?: number) => ({
  type_id: typeId,
  slot: { type: slot },
  state,
  ...(charge === undefined ? {} : { charge: { type_id: charge } }),
});

describe('extractExplore', () => {
  it('reads an active analyzer from the engine, and a loaded probe', () => {
    const items = [item(30834), item(4258, 'high', 'active', 30013)];
    const results = [
      {
        state: 'active',
        attributes: attrs({
          [EXPLORE_ATTRIBUTE.virusCoherence]: 110,
          [EXPLORE_ATTRIBUTE.virusStrength]: 35,
          [EXPLORE_ATTRIBUTE.accessDifficultyBonus]: 14,
        }),
      },
      {
        state: 'active',
        attributes: attrs({}),
        charge: { attributes: attrs({ [EXPLORE_ATTRIBUTE.baseSensorStrength]: 78.9 }) },
      },
    ];
    expect(extractExplore(items, results)).toEqual({
      hacking: { coherence: 110, strength: 35, access: 14 },
      probeStrength: 78.9,
    });
  });

  it('adds up every running analyzer, and takes the strongest probe', () => {
    const items = [
      item(30834),
      item(30832),
      item(4258, 'high', 'active', 1),
      item(4258, 'high', 'active', 2),
    ];
    const analyzer = {
      state: 'active',
      attributes: attrs({ [EXPLORE_ATTRIBUTE.virusCoherence]: 60 }),
    };
    const probe = (strength: number) => ({
      state: 'active',
      attributes: attrs({}),
      charge: { attributes: attrs({ [EXPLORE_ATTRIBUTE.baseSensorStrength]: strength }) },
    });
    const stats = extractExplore(items, [analyzer, analyzer, probe(70), probe(80)]);
    expect(stats.hacking.coherence).toBe(120);
    expect(stats.probeStrength).toBe(80);
  });

  it('ignores a module that is not running and an empty launcher', () => {
    const items = [item(30834, 'high', 'online'), item(4258, 'high', 'active')];
    const results = [
      { state: 'online', attributes: attrs({ [EXPLORE_ATTRIBUTE.virusCoherence]: 110 }) },
      { state: 'active', attributes: attrs({}) },
    ];
    expect(extractExplore(items, results)).toEqual(EMPTY_EXPLORE);
  });

  it('ignores a rig and a drone, which carry the attribute as a bonus', () => {
    const items = [item(31244, 'rig', 'online'), item(1, 'drone_bay', 'active')];
    const results = [
      { state: 'online', attributes: attrs({ [EXPLORE_ATTRIBUTE.virusCoherence]: 20 }) },
      { state: 'active', attributes: attrs({ [EXPLORE_ATTRIBUTE.virusCoherence]: 20 }) },
    ];
    expect(extractExplore(items, results)).toEqual(EMPTY_EXPLORE);
  });
});

describe('exploreFigures', () => {
  it('lists only the figures a fit has', () => {
    expect(exploreFigures(EMPTY_EXPLORE, EMPTY_EXPLORE)).toEqual([]);
    const was = { hacking: { coherence: 100, strength: 35, access: 0 }, probeStrength: 0 };
    const now = { hacking: { coherence: 120, strength: 35, access: 10 }, probeStrength: 70 };
    expect(exploreFigures(was, now)).toEqual([
      [100, 120],
      [35, 35],
    ]);
  });
});
