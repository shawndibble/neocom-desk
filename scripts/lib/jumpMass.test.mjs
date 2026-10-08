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
  it('keeps published ship hulls as typeId -> [name, groupID, massKg]', () => {
    const types = [
      { typeID: 10, name: 'Megathron', groupID: 27, mass: 98.4e6, published: true },
      { typeID: 11, name: 'Old', groupID: 27, mass: 1, published: false },
      { typeID: 12, name: 'Tritanium', groupID: 18, mass: 0, published: true },
    ];
    expect(bakeShipMass(types, new Set([27]))).toEqual({ 10: ['Megathron', 27, 98.4e6] });
  });
});
