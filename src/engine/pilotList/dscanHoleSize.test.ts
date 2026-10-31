import { describe, expect, it } from 'vitest';
import { buildHoleSizes } from './dscanHoleSize';

// Real SDE groups and baked hull masses (public/data/shipMass.json).
const GILA = 17715;
const ISHTAR = 12005;
const RATTLESNAKE = 17918;
const REVELATION = 19720;
const ORCA = 28606;
const UNKNOWN = 999;

const GROUP: Record<number, number> = {
  [GILA]: 26,
  [ISHTAR]: 358,
  [RATTLESNAKE]: 27,
  [REVELATION]: 485,
  [ORCA]: 941,
};
const MASS_KG: Record<number, number> = {
  [GILA]: 9_600_000,
  [ISHTAR]: 10_600_000,
  [RATTLESNAKE]: 99_300_000,
  [REVELATION]: 1_290_000_000,
  [ORCA]: 150_000_000,
};
const groupOf = (typeId: number) => GROUP[typeId];
const massKgOf = (typeId: number) => MASS_KG[typeId];

describe('buildHoleSizes', () => {
  it('counts 2 Gilas and 1 Ishtar as medium and sums their hull mass', () => {
    const read = buildHoleSizes(
      [
        { typeId: GILA, count: 2 },
        { typeId: ISHTAR, count: 1 },
      ],
      groupOf,
      massKgOf
    );
    expect(read).toEqual({
      sizes: [{ size: 'medium', count: 3 }],
      unsized: 0,
      massKg: 29_800_000,
      shipsWithoutMass: 0,
    });
  });

  it('files a battleship under large and a dreadnought under capital, smallest first', () => {
    const read = buildHoleSizes(
      [
        { typeId: REVELATION, count: 1 },
        { typeId: RATTLESNAKE, count: 2 },
        { typeId: GILA, count: 1 },
      ],
      groupOf,
      massKgOf
    );
    expect(read?.sizes).toEqual([
      { size: 'medium', count: 1 },
      { size: 'large', count: 2 },
      { size: 'capital', count: 1 },
    ]);
  });

  it('leaves an Orca unsized but still adds its hull mass', () => {
    const read = buildHoleSizes([{ typeId: ORCA, count: 1 }], groupOf, massKgOf);
    expect(read).toEqual({ sizes: [], unsized: 1, massKg: 150_000_000, shipsWithoutMass: 0 });
  });

  it('counts a hull with no group or mass as unsized and left out of the total', () => {
    const read = buildHoleSizes(
      [
        { typeId: UNKNOWN, count: 3 },
        { typeId: GILA, count: 1 },
      ],
      groupOf,
      massKgOf
    );
    expect(read).toEqual({
      sizes: [{ size: 'medium', count: 1 }],
      unsized: 3,
      massKg: 9_600_000,
      shipsWithoutMass: 3,
    });
  });

  it('reads nothing from a scan with no ships', () => {
    expect(buildHoleSizes([], groupOf, massKgOf)).toBeNull();
  });
});
