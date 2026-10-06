import { describe, it, expect } from 'vitest';
import type { NetworkOpportunity } from '@/engine/pi/network';
import { dropOtherSystemSurplus, dropSharedSurplus } from './factoryRoomDedupe';

function opp(
  typeId: number,
  marginPerHour: number,
  inputs: { typeId: number; fromPlanetId: number | null; source: 'local' | 'routed' | 'bought' }[]
): NetworkOpportunity {
  return {
    typeId,
    name: `P${typeId}`,
    tier: 2,
    hostPlanetId: 1,
    factories: 1,
    facility: 'basic',
    inputs: inputs.map((i) => ({ ...i, name: '', unitsPerHour: 1, costPerHour: 0 })),
    unitsPerHour: 1,
    marginPerUnit: 1,
    marginPerHour,
    buyCostPerHour: 0,
    revenuePerHour: 0,
  } as unknown as NetworkOpportunity;
}

describe('dropSharedSurplus', () => {
  it('keeps the better of two wins drawing on the same routed surplus', () => {
    const a = opp(10, 5, [{ typeId: 100, fromPlanetId: 2, source: 'routed' }]);
    const b = opp(11, 9, [{ typeId: 100, fromPlanetId: 2, source: 'routed' }]);
    expect(dropSharedSurplus([a, b])).toEqual([b]);
  });
  it('keeps wins on different surpluses', () => {
    const a = opp(10, 5, [{ typeId: 100, fromPlanetId: 2, source: 'routed' }]);
    const b = opp(11, 9, [{ typeId: 101, fromPlanetId: 2, source: 'routed' }]);
    expect(dropSharedSurplus([a, b])).toHaveLength(2);
  });
  it('ignores bought inputs, which no colony surplus backs', () => {
    const a = opp(10, 5, [{ typeId: 100, fromPlanetId: null, source: 'bought' }]);
    const b = opp(11, 9, [{ typeId: 100, fromPlanetId: null, source: 'bought' }]);
    expect(dropSharedSurplus([a, b])).toHaveLength(2);
  });
  it('keeps two entries for one product only once', () => {
    const a = opp(10, 5, []);
    const b = opp(10, 9, []);
    expect(dropSharedSurplus([a, b])).toEqual([b]);
  });
});

describe('dropOtherSystemSurplus', () => {
  const systems = new Map([
    [1, 100],
    [2, 100],
    [3, 200],
  ]);
  it('drops a win routed from a colony in another system', () => {
    const far = opp(10, 5, [{ typeId: 100, fromPlanetId: 3, source: 'routed' }]);
    expect(dropOtherSystemSurplus([far], systems)).toEqual([]);
  });
  it('keeps same-system routed, local and bought wins', () => {
    const near = opp(10, 5, [{ typeId: 100, fromPlanetId: 2, source: 'routed' }]);
    const local = opp(11, 5, [{ typeId: 101, fromPlanetId: null, source: 'local' }]);
    const bought = opp(12, 5, [{ typeId: 102, fromPlanetId: null, source: 'bought' }]);
    expect(dropOtherSystemSurplus([near, local, bought], systems)).toHaveLength(3);
  });
  it('drops a win whose source system is unknown', () => {
    const lost = opp(10, 5, [{ typeId: 100, fromPlanetId: 9, source: 'routed' }]);
    expect(dropOtherSystemSurplus([lost], systems)).toEqual([]);
  });
});
