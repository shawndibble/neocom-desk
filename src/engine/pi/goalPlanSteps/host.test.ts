import { describe, it, expect } from 'vitest';
import { chooseHost, eligibleHosts, madeHighOf, placeHost } from './host';
import { triageGoals } from './triage';
import {
  COOLANT,
  POLICY,
  REACTIVE_METALS,
  WATER_COOLED_CPU,
  WETWARE_MAINFRAME,
  colony,
  goal,
  pi,
} from './test-helpers';
import type { PlannerColony } from '../goalTypes';

const noBaselines = new Map();
const ctx = (colonies: PlannerColony[], hostPlanetId?: number) => ({
  colonies,
  pi,
  baselines: noBaselines,
  hostPlanetId,
});

describe('madeHighOf', () => {
  it('lists every P2+ a goal chain makes, and nothing for a P1 goal', () => {
    expect(madeHighOf([goal(REACTIVE_METALS, 40)], pi)).toEqual([]);
    expect(madeHighOf([goal(WATER_COOLED_CPU, 5)], pi)).toEqual([WATER_COOLED_CPU]);
    const p4 = madeHighOf([goal(WETWARE_MAINFRAME, 1)], pi);
    expect(p4).toContain(WETWARE_MAINFRAME);
    expect(p4).toEqual([...p4].sort((a, b) => a - b));
  });
});

describe('eligibleHosts', () => {
  it('keeps a P4 on Barren or Temperate only: the High-Tech plant exists nowhere else', () => {
    const made = madeHighOf([goal(WETWARE_MAINFRAME, 1)], pi);
    const colonies = [colony(1, 'lava'), colony(2, 'gas'), colony(3, 'temperate')];
    expect(eligibleHosts(made, colonies, pi).map((c) => c.planetId)).toEqual([3]);
  });
});

describe('chooseHost', () => {
  it('names the factory with nowhere to go when no colony can carry it', () => {
    const made = madeHighOf([goal(WETWARE_MAINFRAME, 1)], pi);
    expect(chooseHost(made, [], ctx([colony(1, 'lava'), colony(2, 'gas')]))).toEqual({
      host: null,
      facility: 'highTech',
    });
  });

  it('says why: the only eligible colony, or the one whose extraction is least needed', () => {
    const made = madeHighOf([goal(WETWARE_MAINFRAME, 1)], pi);
    expect(chooseHost(made, [], ctx([colony(1, 'lava'), colony(3, 'temperate')]))).toMatchObject({
      host: { planetId: 3 },
      reason: 'only-eligible',
    });
    expect(
      chooseHost(made, [], ctx([colony(4, 'temperate'), colony(3, 'temperate')]))
    ).toMatchObject({ host: { planetId: 3 }, reason: 'least-needed-extraction' });
  });

  it('takes a forced host, and throws when the forced planet cannot carry the factories', () => {
    const made = madeHighOf([goal(WETWARE_MAINFRAME, 1)], pi);
    const colonies = [colony(1, 'lava'), colony(3, 'temperate'), colony(4, 'temperate')];
    expect(chooseHost(made, [], ctx(colonies, 4))).toMatchObject({
      host: { planetId: 4 },
      reason: 'forced',
    });
    expect(() => chooseHost(made, [], ctx(colonies, 1))).toThrow(/cannot host/);
  });
});

describe('placeHost', () => {
  it('fits the factories on the chosen host', () => {
    const colonies = [colony(1, 'gas'), colony(2, 'storm'), colony(3, 'temperate')];
    const goals = [goal(COOLANT, 5)];
    const placed = placeHost(goals, triageGoals(goals, colonies, POLICY, pi), ctx(colonies));
    expect(placed.host?.planetId).toBe(3);
    expect(placed.factories).toEqual({ advanced: 1 });
    expect(placed.shortfalls).toEqual([]);
    expect(placed.dead).toEqual([]);
  });

  it('kills every P2+ goal on a host that cannot carry its factories', () => {
    const colonies = [colony(1, 'gas'), colony(2, 'storm'), colony(3, 'temperate', 0)];
    const goals = [goal(COOLANT, 5)];
    const placed = placeHost(goals, triageGoals(goals, colonies, POLICY, pi), ctx(colonies));
    expect(placed.host).toBeNull();
    expect(placed.shortfalls).toMatchObject([{ kind: 'host-over-budget', planetId: 3 }]);
    expect(placed.dead).toEqual(goals);
  });

  it('reports a missing host once, even for a P4 a type gap also blocks', () => {
    const colonies = [colony(1, 'lava'), colony(2, 'gas')];
    const goals = [goal(WETWARE_MAINFRAME, 1)];
    const placed = placeHost(goals, triageGoals(goals, colonies, POLICY, pi), ctx(colonies));
    expect(placed.shortfalls).toEqual([{ kind: 'no-factory-host', facility: 'highTech' }]);
  });
});
