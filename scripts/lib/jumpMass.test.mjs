import { describe, it, expect } from 'vitest';
import { bakeWormholeMass, bakeShipMass } from './jumpMass.mjs';

describe('bakeWormholeMass', () => {
  it('keys per-jump and total mass by wormhole name, once, skipping K162 and massless types', () => {
    const types = [
      { typeID: 1, name: 'Wormhole M267', groupID: 988 },
      { typeID: 2, name: 'Wormhole M267', groupID: 988 },
      { typeID: 3, name: 'Wormhole K162', groupID: 988 },
      { typeID: 4, name: 'Wormhole Odd', groupID: 988 },
      { typeID: 5, name: 'Gila', groupID: 25 },
    ];
    const attrs = new Map([
      [
        1,
        new Map([
          [1385, 375e6],
          [1383, 1000e6],
        ]),
      ],
      [
        2,
        new Map([
          [1385, 375e6],
          [1383, 1000e6],
        ]),
      ],
      [
        3,
        new Map([
          [1385, 0],
          [1383, 0],
        ]),
      ],
      [
        5,
        new Map([
          [1385, 1],
          [1383, 1],
        ]),
      ],
    ]);
    expect(bakeWormholeMass(types, attrs)).toEqual({ M267: [375e6, 1000e6] });
  });
});

describe('bakeShipMass', () => {
  it('adds a hull base jump drive [rangeLy, fuelTypeId, fuelPerLy] when it has one', () => {
    const types = [
      { typeID: 20, name: 'Archon', groupID: 547, mass: 1e9, published: true },
      { typeID: 21, name: 'Rifter', groupID: 25, mass: 1e6, published: true },
    ];
    const attrs = new Map([
      [
        20,
        new Map([
          [867, 5],
          [866, 16273],
          [868, 1000],
        ]),
      ],
      [21, new Map([[867, 0]])],
    ]);
    expect(bakeShipMass(types, new Set([547, 25]), attrs)).toEqual({
      20: ['Archon', 547, 1e9, [5, 16273, 1000]],
      21: ['Rifter', 25, 1e6],
    });
  });

  it('keeps published ship hulls as typeId -> [name, groupID, massKg]', () => {
    const types = [
      { typeID: 10, name: 'Megathron', groupID: 27, mass: 98.4e6, published: true },
      { typeID: 11, name: 'Old', groupID: 27, mass: 1, published: false },
      { typeID: 12, name: 'Tritanium', groupID: 18, mass: 0, published: true },
    ];
    expect(bakeShipMass(types, new Set([27]))).toEqual({ 10: ['Megathron', 27, 98.4e6] });
  });
});
