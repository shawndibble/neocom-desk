import { describe, it, expect } from 'vitest';
import { bakeSystemPositions, METRES_PER_LIGHT_YEAR } from './systemPositions.mjs';

describe('bakeSystemPositions', () => {
  it('flattens to id,x,y,z in light years, ordered by id', () => {
    const ly = METRES_PER_LIGHT_YEAR;
    expect(
      bakeSystemPositions([
        { id: 2, x: -ly, y: 0, z: 2.5 * ly },
        { id: 1, x: 0.123456 * ly, y: 0, z: 0 },
      ])
    ).toEqual([1, 0.12, 0, 0, 2, -1, 0, 2.5]);
  });
});
