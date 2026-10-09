import { describe, it, expect } from 'vitest';
import {
  FATIGUE_CAP_MINUTES,
  COOLDOWN_CAP_MINUTES,
  decayFatigue,
  indexSystemPositions,
  jumpFatigue,
  jumpFuel,
  jumpTargets,
  lightYearDistance,
  type JumpSystem,
} from './jumpDrive';

const sys = (id: number, x: number, security = 0.1, regionId = 10000002): JumpSystem => ({
  id,
  x,
  y: 0,
  z: 0,
  security,
  regionId,
});

describe('indexSystemPositions', () => {
  it('reads the flat id,x,y,z array (light years) into a lookup', () => {
    const map = indexSystemPositions([1, 0.5, -2, 3, 2, 1, 1, 1]);
    expect(map.get(1)).toEqual({ x: 0.5, y: -2, z: 3 });
    expect(map.get(2)).toEqual({ x: 1, y: 1, z: 1 });
    expect(map.size).toBe(2);
  });
});

describe('lightYearDistance', () => {
  it('is the euclidean distance', () => {
    expect(lightYearDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBe(13);
  });

  it('matches the baked map for a known pair: Jita to Amarr is ~20.3 ly', () => {
    // Positions from public/data/market/systemPositions.json (Fuzzwork SDE dump).
    const jita = { x: -13.64, y: 6.42, z: 12.42 };
    const amarr = { x: -21.64, y: 4.25, z: -6.09 };
    expect(lightYearDistance(jita, amarr)).toBeCloseTo(20.28, 1);
  });
});

describe('jumpTargets', () => {
  const from = sys(1, 0);

  it('includes a system exactly at range and excludes one just beyond', () => {
    const targets = jumpTargets(from, 6, [from, sys(2, 6), sys(3, 6.01)]);
    expect(targets.map((t) => t.id)).toEqual([2]);
  });

  it('never lists the origin and sorts nearest first', () => {
    const targets = jumpTargets(from, 10, [from, sys(2, 5), sys(3, 2)]);
    expect(targets).toEqual([
      { id: 3, distanceLy: 2 },
      { id: 2, distanceLy: 5 },
    ]);
  });

  it('excludes high security, with 0.45 (shown as 0.5) the edge', () => {
    const targets = jumpTargets(from, 10, [sys(2, 1, 0.45), sys(3, 1, 0.44), sys(4, 1, 0.9)]);
    expect(targets.map((t) => t.id)).toEqual([3]);
  });

  it('excludes systems a drive cannot target: wormhole space, Pochven, Zarzakh', () => {
    const targets = jumpTargets(from, 10, [
      sys(31000005, 1, -0.99, 11000030), // Thera
      sys(30001234, 1, -0.5, 10000070), // Pochven
      sys(30100000, 1, -1, 10000002), // Zarzakh
      sys(5, 1, -0.5),
    ]);
    expect(targets.map((t) => t.id)).toEqual([5]);
  });
});

describe('jumpFuel', () => {
  it('is distance x fuel per ly, rounded up to a whole unit', () => {
    expect(jumpFuel(5, 10000)).toBe(50000);
    expect(jumpFuel(4.01, 1000)).toBe(4010);
    expect(jumpFuel(4.0004, 1000)).toBe(4001);
  });

  it('falls with Jump Fuel Conservation: skill 0 vs 5 (-50%) on a 7 ly jump', () => {
    expect(jumpFuel(7, 10000)).toBe(70000);
    expect(jumpFuel(7, 10000 * (1 - 0.1 * 5))).toBe(35000);
  });
});

describe('jumpFatigue', () => {
  // CCP's Phoebe Travel Change Update (2014-10) worked examples.
  it('first jump takes the minimum fatigue and cooldown (Archon, 5 ly)', () => {
    expect(jumpFatigue({ fatigueMinutes: 0, distanceLy: 5 })).toEqual({
      fatigueMinutes: 60,
      cooldownMinutes: 6,
    });
  });

  it('applies the 1 + LY multiplier and 10% cooldown (Ark, distances treated as 1 ly)', () => {
    const second = jumpFatigue({ fatigueMinutes: 18, distanceLy: 10, distanceFactor: 0.1 });
    expect(second.fatigueMinutes).toBeCloseTo(36);
    expect(second.cooldownMinutes).toBeCloseTo(2); // 1.8 min is under the 1 + 1 minimum
    const third = jumpFatigue({ fatigueMinutes: 34, distanceLy: 10, distanceFactor: 0.1 });
    expect(third.fatigueMinutes).toBeCloseTo(68);
    expect(third.cooldownMinutes).toBeCloseTo(3.4);
  });

  it('caps fatigue at 5 hours and cooldown at 30 minutes (EVE University example)', () => {
    const second = jumpFatigue({ fatigueMinutes: 54, distanceLy: 5 });
    expect(second).toEqual({ fatigueMinutes: FATIGUE_CAP_MINUTES, cooldownMinutes: 6 });
    const third = jumpFatigue({ fatigueMinutes: 294, distanceLy: 5 });
    expect(third.fatigueMinutes).toBe(FATIGUE_CAP_MINUTES);
    expect(third.cooldownMinutes).toBeCloseTo(29.4);
    expect(jumpFatigue({ fatigueMinutes: 300, distanceLy: 5 }).cooldownMinutes).toBe(
      COOLDOWN_CAP_MINUTES
    );
  });
});

describe('decayFatigue', () => {
  it('counts down in real time and stops at zero', () => {
    expect(decayFatigue(60, 6)).toBe(54);
    expect(decayFatigue(5, 6)).toBe(0);
  });
});
