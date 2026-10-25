import { describe, expect, it } from 'vitest';
import {
  planHaul,
  type HaulCharacterInput,
  type HaulPickupInput,
  type HaulStack,
} from './haulPlan';
import type { JumpGraph } from './jumpRoute';
import { MAX_STOPS } from './tripPlan';

/** A line  HOME ─ P1 ─ P2 ─ P3 ─ DEST,  and an ISLAND no gate reaches. */
const HOME = 1;
const P1 = 2;
const P2 = 3;
const P3 = 4;
const DEST = 5;
const ISLAND = 9;
const LINE: JumpGraph = new Map([
  [HOME, [P1]],
  [P1, [HOME, P2]],
  [P2, [P1, P3]],
  [P3, [P2, DEST]],
  [DEST, [P3]],
  [ISLAND, []],
]);

const destination = { systemId: DEST, stationId: 500, name: 'Dest Station' };

function pickup(locationId: number, systemId: number | null, m3: number): HaulPickupInput {
  return { locationId, systemId, stationId: locationId, name: `Pickup ${locationId}`, m3 };
}

function character(
  pickups: HaulPickupInput[],
  extra: Partial<HaulCharacterInput> = {}
): HaulCharacterInput {
  return {
    characterId: 1,
    name: 'Pilot',
    start: { systemId: HOME, stationId: null, name: 'Home' },
    pickups,
    flown: [],
    ...extra,
  };
}

const run = (characters: HaulCharacterInput[], capacityM3 = 100, maxStops?: number) =>
  planHaul({ graph: LINE, characters, capacityM3, destination, maxStops });

describe('planHaul', () => {
  it('has nothing to plan for no pickups', () => {
    const plan = run([character([])]);
    expect(plan.sections).toEqual([]);
    expect(plan.leftOut).toEqual([]);
    expect(plan.totals).toEqual({ legs: 0, jumps: 0, m3: 0 });
  });

  it('plans nothing and says so with no hold', () => {
    const plan = run([character([pickup(10, P1, 50)])], 0);
    expect(plan.sections).toEqual([]);
    expect(plan.leftOut).toMatchObject([{ locationId: 10, m3: 50, reason: 'noCapacity' }]);
  });

  it('goes out, loads, and returns to the destination for one pickup', () => {
    const plan = run([character([pickup(10, P1, 60)])]);
    const legs = plan.sections[0].legs;
    expect(legs.map((l) => [l.kind, l.to.systemId, l.jumps, l.m3])).toEqual([
      ['pickup', P1, 1, 60],
      ['delivery', DEST, 3, 60],
    ]);
    expect(plan.totals).toEqual({ legs: 2, jumps: 4, m3: 60 });
  });

  it('packs several pickups into one trip, nearest first', () => {
    const plan = run([character([pickup(30, P3, 30), pickup(10, P1, 30), pickup(20, P2, 30)])]);
    expect(plan.sections[0].legs.map((l) => l.to.systemId)).toEqual([P1, P2, P3, DEST]);
    expect(plan.sections[0].trips).toBe(1);
  });

  it('visits a pickup once per trip its volume needs, splitting the stock', () => {
    const plan = run([character([pickup(10, P1, 250)])]);
    const legs = plan.sections[0].legs;
    expect(legs.map((l) => [l.kind, l.m3])).toEqual([
      ['pickup', 100],
      ['delivery', 100],
      ['pickup', 100],
      ['delivery', 100],
      ['pickup', 50],
      ['delivery', 50],
    ]);
    expect(plan.sections[0].trips).toBe(3);
    expect(plan.leftOut).toEqual([]);
  });

  it('starts every later trip from the destination', () => {
    const legs = run([character([pickup(10, P1, 150)])]).sections[0].legs;
    expect(legs.map((l) => [l.kind, l.from?.systemId, l.jumps])).toEqual([
      ['pickup', HOME, 1],
      ['delivery', P1, 3],
      ['pickup', DEST, 3],
      ['delivery', P1, 3],
    ]);
  });

  it('lets the leftover of a split pickup ride with the next pickup', () => {
    const plan = run([character([pickup(10, P1, 70), pickup(20, P2, 70)])]);
    const trips = plan.sections[0].legs.map((l) => `${l.trip}:${l.kind}:${l.to.systemId}:${l.m3}`);
    expect(trips).toEqual([
      `1:pickup:${P1}:70`,
      `1:pickup:${P2}:30`,
      `1:delivery:${DEST}:100`,
      `2:pickup:${P2}:40`,
      `2:delivery:${DEST}:40`,
    ]);
  });

  it('counts repeat visits against the cap but not the returns', () => {
    const plan = run([character([pickup(10, P1, 1250)])], 100, MAX_STOPS);
    const legs = plan.sections[0].legs;
    expect(legs.filter((l) => l.kind === 'pickup')).toHaveLength(MAX_STOPS);
    expect(legs.filter((l) => l.kind === 'delivery')).toHaveLength(MAX_STOPS);
    expect(plan.leftOut).toMatchObject([{ locationId: 10, m3: 250, reason: 'cap' }]);
  });

  it('delivers a partial load when the cap cuts a trip', () => {
    const plan = run(
      [character([pickup(10, P1, 50), pickup(20, P2, 50), pickup(30, P3, 50)])],
      200,
      2
    );
    const legs = plan.sections[0].legs;
    expect(legs.map((l) => `${l.kind}:${l.m3}`)).toEqual([
      'pickup:50',
      'pickup:50',
      'delivery:100',
    ]);
    expect(plan.leftOut).toMatchObject([{ locationId: 30, m3: 50, reason: 'cap' }]);
  });

  it('gives each character a section from their own start, with stable ids across them', () => {
    const plan = run([
      character([pickup(10, P1, 10)]),
      character([pickup(20, P3, 10)], {
        characterId: 2,
        name: 'Alt',
        start: { systemId: DEST, stationId: null, name: 'Far' },
      }),
    ]);
    expect(plan.sections.map((s) => s.characterId)).toEqual([1, 2]);
    expect(plan.sections[1].legs[0].jumps).toBe(1);
    expect(plan.sections.flatMap((s) => s.legs.map((l) => l.id))).toEqual([0, 1, 2, 3]);
  });

  it('starts at the first pickup when the start is unknown', () => {
    const plan = run([character([pickup(10, P1, 10)], { start: null })]);
    expect(plan.sections[0].legs[0]).toMatchObject({ from: null, jumps: null });
    expect(plan.sections[0].legs[1].jumps).toBe(3);
  });

  it('reports a pickup with no system as left out, never dropped', () => {
    const plan = run([character([pickup(10, null, 40), pickup(20, P1, 10)])]);
    expect(plan.leftOut).toMatchObject([{ locationId: 10, m3: 40, reason: 'unplaced' }]);
    expect(plan.sections[0].legs).toHaveLength(2);
  });

  it('keeps a pickup no gate route reaches, with unknown jumps', () => {
    const plan = run([character([pickup(10, ISLAND, 10)])]);
    expect(plan.sections[0].legs[0].jumps).toBeNull();
  });

  describe('flown ships', () => {
    const ship = (locationId: number, systemId: number | null, ships: string[]) => ({
      ...pickup(locationId, systemId, 0),
      ships,
    });

    it('routes a ships-only move: take the ship at its pickup, fly it to the destination', () => {
      const plan = run([character([ship(10, P1, ['Rifter'])])], 0);
      const legs = plan.sections[0]?.legs ?? [];
      expect(legs.map((l) => [l.kind, l.to.name, l.jumps, l.ships])).toEqual([
        ['pickup', 'Pickup 10', 1, ['Rifter']],
        ['delivery', 'Dest Station', 3, ['Rifter']],
      ]);
      expect(plan.sections[0]?.trips).toBe(1);
      expect(plan.flown).toEqual([]);
      expect(plan.leftOut).toEqual([]);
    });

    it('flies each ship as a trip of its own, nearest pickup first from where the last one landed', () => {
      const plan = run(
        [character([ship(20, P3, ['Merlin']), ship(10, P1, ['Rifter', 'Punisher'])])],
        0
      );
      const legs = plan.sections[0]?.legs ?? [];
      expect(legs.map((l) => [l.trip, l.kind, l.ships?.[0]])).toEqual([
        [1, 'pickup', 'Rifter'],
        [1, 'delivery', 'Rifter'],
        [2, 'pickup', 'Merlin'],
        [2, 'delivery', 'Merlin'],
        [3, 'pickup', 'Punisher'],
        [3, 'delivery', 'Punisher'],
      ]);
      expect(plan.sections[0]?.trips).toBe(3);
    });

    it('flies after the cargo trips, from the destination', () => {
      const plan = run([character([pickup(10, P1, 50), ship(20, P2, ['Rifter'])])]);
      const legs = plan.sections[0]?.legs ?? [];
      expect(legs.map((l) => [l.kind, l.ships ?? null])).toEqual([
        ['pickup', null],
        ['delivery', null],
        ['pickup', ['Rifter']],
        ['delivery', ['Rifter']],
      ]);
      expect(legs[2]?.from?.name).toBe('Dest Station');
    });

    it('keeps a ship at a place with no solar system as a note', () => {
      const plan = run([character([ship(10, null, ['Rifter'])])], 0);
      expect(plan.sections).toEqual([]);
      expect(plan.flown).toEqual([{ characterId: 1, name: 'Pilot', ships: ['Rifter'] }]);
    });
  });

  it('carries the flown-ship notes through', () => {
    const plan = run([character([pickup(10, P1, 10)], { flown: ['Rifter'] })]);
    expect(plan.flown).toEqual([{ characterId: 1, name: 'Pilot', ships: ['Rifter'] }]);
  });

  it('skips pickups with no volume', () => {
    const plan = run([character([pickup(10, P1, 0)])]);
    expect(plan.sections).toEqual([]);
  });

  describe('item stacks', () => {
    const trit: HaulStack = { typeId: 34, name: 'Tritanium', quantity: 100, unitM3: 0.5 };
    const pye: HaulStack = { typeId: 35, name: 'Pyerite', quantity: 100, unitM3: 0.5 };
    const withStacks = (stacks: HaulStack[]): HaulPickupInput => ({
      ...pickup(10, P1, 100),
      stacks,
    });

    it("puts a pickup leg's stacks on the leg and leaves them off when none were given", () => {
      const plan = run([character([withStacks([trit, pye])]), character([pickup(20, P2, 10)])]);
      expect(plan.sections[0].legs[0].stacks).toEqual([trit, pye]);
      expect(plan.sections[1].legs[0].stacks).toBeUndefined();
    });

    it("splits a pickup's stacks across trips in step with its m³, never losing a unit", () => {
      const plan = run([character([withStacks([trit, pye])])], 60);
      const pickups = plan.sections[0].legs.filter((l) => l.kind === 'pickup');
      expect(pickups.map((l) => l.m3)).toEqual([60, 40]);
      expect(pickups[0].stacks).toEqual([
        { ...trit, quantity: 100 },
        { ...pye, quantity: 20 },
      ]);
      expect(pickups[1].stacks).toEqual([{ ...pye, quantity: 80 }]);
    });

    it("does not mutate the caller's stacks", () => {
      run([character([withStacks([trit])])], 30);
      expect(trit.quantity).toBe(100);
    });
  });
});

describe('planHaul with a max ISK per haul', () => {
  const stack = (quantity: number, unitIsk?: number, typeId = 34): HaulStack => ({
    typeId,
    name: `Type ${typeId}`,
    quantity,
    unitM3: 1,
    ...(unitIsk === undefined ? {} : { unitIsk }),
  });
  const withStacks = (stacks: HaulStack[]): HaulPickupInput => ({
    ...pickup(
      P1,
      P1,
      stacks.reduce((n, s) => n + s.quantity * s.unitM3, 0)
    ),
    stacks,
  });
  const go = (stacks: HaulStack[], maxIskPerHaul?: number | null, capacityM3 = 100) =>
    planHaul({
      graph: LINE,
      characters: [character([withStacks(stacks)])],
      capacityM3,
      destination,
      maxIskPerHaul,
    });
  const deliveries = (plan: ReturnType<typeof go>) =>
    plan.sections.flatMap((s) => s.legs).filter((l) => l.kind === 'delivery');

  it('with no limit, one trip carries it all', () => {
    const plan = go([stack(10, 100)]);
    expect(plan.sections[0].trips).toBe(1);
    expect(deliveries(plan)[0].isk).toBe(1_000);
  });

  it('makes more trips under a limit and no trip is worth more than it', () => {
    const plan = go([stack(10, 100)], 350);
    expect(plan.sections[0].trips).toBe(4);
    expect(deliveries(plan).map((l) => l.isk)).toEqual([300, 300, 300, 100]);
    expect(plan.leftOut).toEqual([]);
    expect(plan.totals.m3).toBe(10);
  });

  it('counts every unit exactly once across trips', () => {
    const plan = go([stack(7, 100, 34), stack(5, 250, 35)], 600);
    const units = plan.sections
      .flatMap((s) => s.legs)
      .flatMap((l) => (l.kind === 'pickup' ? (l.stacks ?? []) : []))
      .reduce((n, s) => n + s.quantity, 0);
    expect(units).toBe(12);
    for (const d of deliveries(plan)) expect(d.isk).toBeLessThanOrEqual(600);
  });

  it('reports a unit that cannot ride at all instead of looping', () => {
    const plan = go([stack(2, 900)], 500);
    expect(plan.leftOut).toHaveLength(1);
    expect(plan.leftOut[0].reason).toBe('overLimit');
  });

  it('ignores the limit for a pickup with no stacks', () => {
    const plan = planHaul({
      graph: LINE,
      characters: [character([pickup(P1, P1, 10)])],
      capacityM3: 100,
      destination,
      maxIskPerHaul: 1,
    });
    expect(plan.sections[0].trips).toBe(1);
  });

  it('fills a trip from another pickup when the nearest cannot add a unit', () => {
    const near = { ...pickup(P1, P1, 5), stacks: [stack(5, 50, 34)] };
    const far = { ...pickup(P3, P3, 5), stacks: [stack(5, 10, 35)] };
    const plan = planHaul({
      graph: LINE,
      characters: [character([near, far])],
      capacityM3: 100,
      destination,
      maxIskPerHaul: 100,
    });
    // Trip 1: 1 x 50 ISK would fit, so take 2 of the 50s, then nothing near fits; nothing more is added.
    const first = plan.sections[0].legs.filter((l) => l.trip === 1 && l.kind === 'pickup');
    expect(first.every((l) => (l.isk ?? 0) <= 100)).toBe(true);
    const units = plan.sections
      .flatMap((s) => s.legs)
      .flatMap((l) => (l.kind === 'pickup' ? (l.stacks ?? []) : []))
      .reduce((n, s) => n + s.quantity, 0);
    expect(units).toBe(10);
  });

  it('treats an empty stack list as having no values', () => {
    const plan = planHaul({
      graph: LINE,
      characters: [character([{ ...pickup(P1, P1, 10), stacks: [] }])],
      capacityM3: 100,
      destination,
      maxIskPerHaul: 100,
    });
    expect(plan.leftOut).toEqual([]);
  });
});
