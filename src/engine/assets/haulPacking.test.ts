import { describe, expect, it } from 'vitest';
import { packHauls, type PackHold } from './haulPacking';

const CARGO = 4_500;
const HANGAR = 50_000;
const MASTODON: PackHold[] = [
  { kind: 'cargo', capacityM3: CARGO },
  { kind: 'fleetHangar', capacityM3: HANGAR },
];

describe('packHauls', () => {
  it('puts a packaged battleship in the fleet hangar and the small stuff in the cargo hold', () => {
    const { hauls, unfit } = packHauls(
      [
        { typeId: 47466, quantity: 1, unitM3: 50_000 },
        { typeId: 34, quantity: 400_000, unitM3: 0.01 }, // 4,000 m3
      ],
      MASTODON
    );
    expect(unfit).toEqual([]);
    expect(hauls).toHaveLength(1);
    const byKind = Object.fromEntries(hauls[0].holds.map((h) => [h.kind, h]));
    expect(byKind.fleetHangar.lines).toEqual([{ typeId: 47466, quantity: 1, m3: 50_000 }]);
    expect(byKind.cargo.lines).toEqual([{ typeId: 34, quantity: 400_000, m3: 4_000 }]);
    expect(byKind.fleetHangar.usedM3).toBe(50_000);
  });

  it('never splits a unit: a ship needs one hold that is big enough on its own', () => {
    const { hauls, unfit } = packHauls(
      [{ typeId: 47466, quantity: 1, unitM3: 50_000 }],
      [
        { kind: 'cargo', capacityM3: 30_000 },
        { kind: 'fleetHangar', capacityM3: 30_000 },
      ]
    );
    expect(hauls).toEqual([]);
    expect(unfit).toEqual([{ typeId: 47466, quantity: 1, unitM3: 50_000 }]);
  });

  it('splits a stack by whole units across holds and hauls', () => {
    const { hauls } = packHauls(
      [{ typeId: 35, quantity: 100, unitM3: 1_000 }], // 100,000 m3
      MASTODON
    );
    // 54 units fit per haul (4 in cargo, 50 in hangar); 100 units -> 2 hauls.
    expect(hauls).toHaveLength(2);
    const units = hauls.map((h) =>
      h.holds.flatMap((x) => x.lines).reduce((s, l) => s + l.quantity, 0)
    );
    expect(units).toEqual([54, 46]);
  });

  it('fills a leftover gap in an earlier haul with a smaller stack', () => {
    const { hauls } = packHauls(
      [
        { typeId: 1, quantity: 2, unitM3: 50_000 },
        { typeId: 2, quantity: 1_000, unitM3: 4 },
      ],
      MASTODON
    );
    // 2 ships = 2 hauls (hangar each). Tritanium-like filler: 4,000 m3 fits the first cargo hold.
    expect(hauls).toHaveLength(2);
    const filler = hauls
      .flatMap((h) => h.holds.flatMap((x) => x.lines))
      .filter((l) => l.typeId === 2);
    expect(filler.reduce((s, l) => s + l.quantity, 0)).toBe(1_000);
  });

  it('a hull with one hold gives one hold per haul', () => {
    const { hauls } = packHauls(
      [{ typeId: 3, quantity: 10, unitM3: 100 }],
      [{ kind: 'cargo', capacityM3: 400 }]
    );
    expect(hauls.map((h) => h.holds.length)).toEqual([1, 1, 1]);
    expect(hauls.map((h) => h.usedM3)).toEqual([400, 400, 200]);
  });

  it('keeps every unit: haul totals add up to the input', () => {
    const lines = [
      { typeId: 1, quantity: 7, unitM3: 12_345 },
      { typeId: 2, quantity: 123_456, unitM3: 0.37 },
      { typeId: 3, quantity: 91, unitM3: 450 },
    ];
    const { hauls, unfit } = packHauls(lines, MASTODON);
    expect(unfit).toEqual([]);
    for (const line of lines) {
      const placed = hauls
        .flatMap((h) => h.holds.flatMap((x) => x.lines))
        .filter((l) => l.typeId === line.typeId)
        .reduce((s, l) => s + l.quantity, 0);
      expect(placed).toBe(line.quantity);
    }
    for (const haul of hauls)
      for (const hold of haul.holds)
        expect(hold.usedM3).toBeLessThanOrEqual(hold.capacityM3 + 1e-6);
  });

  it('returns nothing for no lines or no holds', () => {
    expect(packHauls([], MASTODON)).toEqual({ hauls: [], unfit: [], overLimit: [] });
    expect(packHauls([{ typeId: 1, quantity: 1, unitM3: 1 }], [])).toEqual({
      hauls: [],
      unfit: [{ typeId: 1, quantity: 1, unitM3: 1 }],
      overLimit: [],
    });
  });
});

describe('packHauls with an ISK limit', () => {
  const BIG: PackHold[] = [{ kind: 'cargo', capacityM3: 1_000 }];

  it('is unchanged with no limit, and records each haul value', () => {
    const lines = [{ typeId: 1, quantity: 10, unitM3: 1, unitIsk: 100 }];
    const none = packHauls(lines, BIG);
    expect(none.hauls).toHaveLength(1);
    expect(none.hauls[0].iskValue).toBe(1_000);
    expect(packHauls(lines, BIG, null).hauls).toHaveLength(1);
    expect(packHauls(lines, BIG, 0).hauls).toHaveLength(1);
  });

  it('closes a haul when its value reaches the limit, however much room is left', () => {
    const { hauls, overLimit, unfit } = packHauls(
      [{ typeId: 1, quantity: 10, unitM3: 1, unitIsk: 100 }],
      BIG,
      350
    );
    expect(unfit).toEqual([]);
    expect(overLimit).toEqual([]);
    expect(hauls.map((h) => h.iskValue)).toEqual([300, 300, 300, 100]);
    for (const h of hauls) expect(h.iskValue).toBeLessThanOrEqual(350);
  });

  it('sums value across different stacks in one haul', () => {
    const { hauls } = packHauls(
      [
        { typeId: 1, quantity: 2, unitM3: 2, unitIsk: 200 },
        { typeId: 2, quantity: 2, unitM3: 1, unitIsk: 100 },
      ],
      BIG,
      500
    );
    expect(hauls.map((h) => h.iskValue)).toEqual([500, 100]);
    const total = hauls
      .flatMap((h) => h.holds.flatMap((x) => x.lines))
      .reduce((n, l) => n + l.quantity, 0);
    expect(total).toBe(4);
  });

  it('sends a single unit worth more than the limit to overLimit, never a haul', () => {
    const { hauls, unfit, overLimit } = packHauls(
      [
        { typeId: 1, quantity: 2, unitM3: 1, unitIsk: 600 },
        { typeId: 2, quantity: 1, unitM3: 1, unitIsk: 10 },
      ],
      BIG,
      500
    );
    expect(unfit).toEqual([]);
    expect(overLimit).toEqual([{ typeId: 1, quantity: 2, unitM3: 1, unitIsk: 600 }]);
    expect(hauls).toHaveLength(1);
    expect(hauls[0].iskValue).toBe(10);
  });

  it('counts an unpriced line as 0 ISK', () => {
    const { hauls } = packHauls([{ typeId: 1, quantity: 5, unitM3: 1 }], BIG, 1);
    expect(hauls).toHaveLength(1);
    expect(hauls[0].iskValue).toBe(0);
  });

  it('keeps a unit too big for the hold as unfit, not overLimit', () => {
    const { unfit, overLimit } = packHauls(
      [{ typeId: 1, quantity: 1, unitM3: 5_000, unitIsk: 600 }],
      BIG,
      500
    );
    expect(unfit).toHaveLength(1);
    expect(overLimit).toEqual([]);
  });
});
