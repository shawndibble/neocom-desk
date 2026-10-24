import { describe, expect, it } from 'vitest';
import type { ConsolidationAsset } from './consolidation';
import { planMove, type MoveHull } from './movePlan';

const DEST = 60003760;
const A = 60008494;
const B = 60011866;
const SHIP = 648;

function asset(overrides: Partial<ConsolidationAsset> & Pick<ConsolidationAsset, 'itemId'>) {
  return {
    typeId: 34,
    quantity: 1,
    locationId: A,
    locationType: 'station',
    isSingleton: false,
    ...overrides,
  } satisfies ConsolidationAsset;
}

const hull = (typeId: number, capacityM3: number, owned = false, canFly = true): MoveHull => ({
  typeId,
  name: `Hull ${typeId}`,
  hullClass: 'Industrial',
  capacityM3,
  holds: [{ kind: 'cargo', capacityM3 }],
  owned,
  canFly,
});

const HULLS = [hull(1, 5000), hull(2, 1000, true), hull(3, 1000), hull(4, 400)];

const plan = (assets: ConsolidationAsset[], hulls: readonly MoveHull[] = HULLS) =>
  planMove({
    destinationLocationIds: new Set([DEST]),
    characters: [{ characterId: 1, name: 'Alice', assets }],
    unitM3: new Map([
      [34, 0.01],
      [35, 2],
    ]),
    shipTypeIds: new Set([SHIP]),
    hulls,
  });

describe('planMove', () => {
  it('totals and trips for a mixed list, grouped by pickup location', () => {
    const result = plan([
      asset({ itemId: 1, typeId: 35, quantity: 600 }), // 1200 m3 at A
      asset({ itemId: 2, typeId: 34, quantity: 5000, locationId: B }), // 50 m3 at B
      asset({ itemId: 3, typeId: SHIP, isSingleton: true, locationId: B }),
    ]);
    expect(result.totals).toMatchObject({
      stacks: 2,
      totalM3: 1250,
      characters: 1,
      shipsToFly: 1,
      unknownVolumeCount: 0,
      trips: 2, // a haul loads at one pickup only
    });
    expect(result.perCharacter[0].pickups.map((p) => p.locationId)).toEqual([A, B]);
    expect(result.perCharacter[0].pickups[1].ships).toEqual([{ itemId: 3, typeId: SHIP }]);
  });

  it('suggests the fewest trips and lists every hull best first', () => {
    const result = plan([asset({ itemId: 1, typeId: 35, quantity: 600 })]); // 1200 m3
    expect(result.suggested?.hull.typeId).toBe(1);
    expect(result.comparison.map((o) => [o.hull.typeId, o.trips])).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
    ]);
  });

  it('prefers the smaller hull when trips tie', () => {
    const result = plan(
      [asset({ itemId: 1, typeId: 35, quantity: 100 })], // 200 m3
      [hull(1, 5000), hull(4, 400)]
    );
    expect(result.suggested?.hull.typeId).toBe(4);
  });

  it('flags ownership without letting it change the order', () => {
    const result = plan(
      [asset({ itemId: 1, typeId: 35, quantity: 100 })],
      [hull(2, 1000, true), hull(3, 500)]
    );
    expect(result.suggested?.hull.typeId).toBe(3);
    expect(result.comparison.find((o) => o.hull.typeId === 2)?.hull.owned).toBe(true);
  });

  it('excludes ships from hold math', () => {
    const result = plan([asset({ itemId: 1, typeId: SHIP, isSingleton: true })]);
    expect(result.totals).toMatchObject({ totalM3: 0, shipsToFly: 1, trips: null });
    expect(result.suggested).toBeNull();
    expect(result.perCharacter).toHaveLength(1);
  });

  it('excludes items at the destination; nothing to move yields no characters', () => {
    const result = plan([
      asset({ itemId: 1, locationId: DEST, quantity: 5 }),
      asset({ itemId: 2, typeId: SHIP, isSingleton: true, locationId: DEST }),
    ]);
    expect(result.perCharacter).toEqual([]);
    expect(result.totals).toMatchObject({ stacks: 0, characters: 0, shipsToFly: 0 });
  });

  it('lists unknown-volume stacks, counts them and leaves them out of totals', () => {
    const result = plan([
      asset({ itemId: 1, typeId: 35, quantity: 10 }),
      asset({ itemId: 2, typeId: 9999, quantity: 7 }),
    ]);
    expect(result.totals).toMatchObject({ totalM3: 20, stacks: 1, unknownVolumeCount: 1 });
    expect(result.perCharacter[0].pickups[0].unknownVolume).toEqual([
      { typeId: 9999, quantity: 7 },
    ]);
  });

  it('skips assembled non-ship items and anything nested or in space', () => {
    const result = plan([
      asset({ itemId: 1, isSingleton: true }),
      asset({ itemId: 2, locationType: 'item', locationId: 99 }),
      asset({
        itemId: 3,
        typeId: SHIP,
        isSingleton: true,
        locationType: 'solar_system',
        locationId: 30000142,
      }),
    ]);
    expect(result.perCharacter).toEqual([]);
  });

  it('never suggests or compares a hull the pilot cannot fly', () => {
    const hulls = [hull(1, 5000, false, false), hull(4, 400)];
    const result = plan([asset({ itemId: 1, typeId: 35, quantity: 600 })], hulls); // 1200 m3
    expect(result.suggested?.hull.typeId).toBe(4);
    expect(result.comparison.map((o) => o.hull.typeId)).toEqual([4]);
    expect(
      plan([asset({ itemId: 1, typeId: 35, quantity: 600 })], [hull(1, 5000, false, false)])
        .suggested
    ).toBeNull();
  });

  it('hauls a ship packed instead as cargo at its packaged volume', () => {
    const withShip = (packed: number[]) =>
      planMove({
        destinationLocationIds: new Set([DEST]),
        characters: [
          {
            characterId: 1,
            name: 'Alice',
            assets: [asset({ itemId: 9, typeId: SHIP, isSingleton: true })],
          },
        ],
        unitM3: new Map([[SHIP, 500]]),
        shipTypeIds: new Set([SHIP]),
        packedShipIds: new Set(packed),
        hulls: HULLS,
      });
    expect(withShip([]).totals).toMatchObject({ shipsToFly: 1, totalM3: 0 });
    const packed = withShip([9]);
    expect(packed.totals).toMatchObject({ shipsToFly: 0, totalM3: 500, stacks: 1 });
    expect(packed.perCharacter[0].pickups[0].ships).toEqual([]);
    expect(packed.perCharacter[0].pickups[0].lines[0]).toMatchObject({ typeId: SHIP, quantity: 1 });
  });

  describe('haul packing', () => {
    // Mastodon-like: 4,500 cargo + 50,000 fleet hangar.
    const mastodon: MoveHull = {
      typeId: 12747,
      name: 'Mastodon',
      hullClass: 'Deep Space Transport',
      capacityM3: 54_500,
      holds: [
        { kind: 'cargo', capacityM3: 4_500 },
        { kind: 'fleetHangar', capacityM3: 50_000 },
      ],
      owned: true,
      canFly: true,
    };
    const PRAXIS = 47466;
    const praxisPlan = (hulls: readonly MoveHull[], extra: ConsolidationAsset[] = []) =>
      planMove({
        destinationLocationIds: new Set([DEST]),
        characters: [
          {
            characterId: 1,
            name: 'Alice',
            assets: [
              asset({ itemId: 9, typeId: PRAXIS, isSingleton: true }),
              asset({ itemId: 10, typeId: 35, quantity: 2000 }), // 4,000 m3
              ...extra,
            ],
          },
        ],
        unitM3: new Map([
          [PRAXIS, 50_000],
          [35, 2],
        ]),
        shipTypeIds: new Set([PRAXIS]),
        packedShipIds: new Set([9]),
        hulls,
      });

    it('puts the packaged ship in the fleet hangar and loose stock in the cargo hold, one haul', () => {
      const result = praxisPlan([mastodon]);
      expect(result.totals.trips).toBe(1);
      const [pickup] = result.suggested!.pickups;
      expect(pickup.hauls).toHaveLength(1);
      const [cargo, hangar] = [...pickup.hauls[0].holds].sort(
        (a, b) => a.capacityM3 - b.capacityM3
      );
      expect(hangar.lines).toEqual([{ typeId: PRAXIS, quantity: 1, m3: 50_000 }]);
      expect(cargo.lines).toEqual([{ typeId: 35, quantity: 2000, m3: 4_000 }]);
    });

    it('ranks a hull that leaves a unit behind below one that carries everything', () => {
      const small = hull(1, 30_000); // one 30k hold: a 50k packaged ship never fits
      const result = praxisPlan([small, mastodon]);
      expect(result.suggested?.hull.typeId).toBe(12747);
      const bad = result.comparison.find((o) => o.hull.typeId === 1)!;
      expect(bad.tooBigCount).toBe(1);
      expect(bad.pickups[0].tooBigShips).toEqual([{ typeId: PRAXIS, quantity: 1, unitM3: 50_000 }]);
      expect(result.comparison[0].tooBigCount).toBe(0);
    });

    it('lists the ships the user chose to pack on their pickup', () => {
      const result = praxisPlan([mastodon]);
      expect(result.perCharacter[0].pickups[0].packed).toEqual([{ itemId: 9, typeId: PRAXIS }]);
      expect(result.perCharacter[0].pickups[0].ships).toEqual([]);
    });

    it('a packed ship too big for the hauler must be flown: flagged, not left behind', () => {
      const small = hull(1, 30_000); // 50k packaged never fits a 30k hold
      const result = praxisPlan([small]);
      const option = result.suggested!;
      expect(option.tooBigCount).toBe(1);
      expect(option.unfitCount).toBe(0);
      expect(option.pickups[0].tooBigShips).toEqual([
        { typeId: PRAXIS, quantity: 1, unitM3: 50_000 },
      ]);
      expect(option.pickups[0].unfit).toEqual([]);
    });

    it('counts a forced flight as a trip and ranks the hauler that carries it first', () => {
      const small = hull(1, 30_000);
      const result = praxisPlan([small, mastodon]);
      expect(result.suggested?.hull.typeId).toBe(12747);
      expect(result.comparison.map((o) => [o.hull.typeId, o.trips + o.tooBigCount])).toEqual([
        [12747, 1],
        [1, 2], // 1 haul for the loose stock + 1 forced flight
      ]);
    });

    it('does not make a haul out of zero-volume stock', () => {
      const result = planMove({
        destinationLocationIds: new Set([DEST]),
        characters: [
          {
            characterId: 1,
            name: 'Alice',
            assets: [asset({ itemId: 1, typeId: 77, quantity: 5 })],
          },
        ],
        unitM3: new Map([[77, 0]]),
        shipTypeIds: new Set(),
        hulls: [hull(1, 5000)],
      });
      expect(result.totals.trips).toBeNull();
    });

    it('plans hauls per pickup: two stations never share a haul', () => {
      const result = plan([
        asset({ itemId: 1, typeId: 35, quantity: 10, locationId: A }),
        asset({ itemId: 2, typeId: 35, quantity: 10, locationId: B }),
      ]);
      expect(result.totals.trips).toBe(2);
      expect(result.suggested?.pickups.map((p) => [p.locationId, p.hauls.length])).toEqual([
        [A, 1],
        [B, 1],
      ]);
    });
  });
});

describe('planMove hauler override', () => {
  const stock = [asset({ itemId: 1, typeId: 35, quantity: 600 })]; // 1200 m3
  const withOverride = (haulerOverride: Parameters<typeof planMove>[0]['haulerOverride']) =>
    planMove({
      destinationLocationIds: new Set([DEST]),
      characters: [{ characterId: 1, name: 'Alice', assets: stock }],
      unitM3: new Map([[35, 2]]),
      shipTypeIds: new Set([SHIP]),
      hulls: HULLS,
      haulerOverride,
    });

  it('without an override, active is the suggestion', () => {
    const result = withOverride(undefined);
    expect(result.active).toBe(result.suggested);
  });

  it('a picked hull replaces the suggestion in active and in the trip total', () => {
    const result = withOverride({ hullTypeId: 4 });
    expect(result.suggested?.hull.typeId).toBe(1);
    expect(result.active?.hull.typeId).toBe(4);
    expect(result.active?.trips).toBe(3);
    expect(result.totals.trips).toBe(3);
  });

  it('a typed m³ is one general hold', () => {
    const result = withOverride({ customM3: 300 });
    expect(result.active?.hull.holds).toEqual([{ kind: 'cargo', capacityM3: 300 }]);
    expect(result.active?.hull.capacityM3).toBe(300);
    expect(result.active?.trips).toBe(4);
    expect(result.totals.trips).toBe(4);
  });

  it('a typed m³ smaller than one unit leaves that stack behind', () => {
    const result = withOverride({ customM3: 1 });
    expect(result.active?.unfitCount).toBe(1);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'a typed %s is ignored, never unlimited',
    (customM3) => {
      const result = withOverride({ customM3 });
      expect(result.active).toBe(result.suggested);
    }
  );

  it('an unknown hull falls back to the suggestion', () => {
    const result = withOverride({ hullTypeId: 999 });
    expect(result.active).toBe(result.suggested);
  });

  it('a typed m³ still plans when no hull is flyable', () => {
    const result = planMove({
      destinationLocationIds: new Set([DEST]),
      characters: [{ characterId: 1, name: 'Alice', assets: stock }],
      unitM3: new Map([[35, 2]]),
      shipTypeIds: new Set([SHIP]),
      hulls: [],
      haulerOverride: { customM3: 600 },
    });
    expect(result.suggested).toBeNull();
    expect(result.active?.trips).toBe(2);
  });
});
