import { describe, expect, it } from 'vitest';
import {
  appliedDps,
  appliedDpsVsRange,
  appliedDpsVsSpeed,
  bestRange,
  graphMaxRange,
  graphMaxSpeed,
  missileApplication,
  rawDps,
  turretDamageMultiplier,
  turretHitChance,
  type AppliedDpsInputs,
  type AppliedWeapon,
} from './appliedDps';
import { BUILT_IN_TARGET_PROFILES } from './targetProfile';

const turret: Extract<AppliedWeapon, { kind: 'turret' }> = {
  kind: 'turret',
  dps: 100,
  optimal: 3000,
  falloff: 5000,
  tracking: 0.5,
  optimalSigRadius: 40,
};

const missile: Extract<AppliedWeapon, { kind: 'missile' }> = {
  kind: 'missile',
  dps: 100,
  range: 40000,
  explosionRadius: 140,
  explosionVelocity: 85,
  damageReductionFactor: 0.682,
};

const drone: Extract<AppliedWeapon, { kind: 'drone' }> = {
  kind: 'drone',
  dps: 60,
  speed: 4000,
  optimal: 2000,
  falloff: 2000,
  tracking: 5,
  optimalSigRadius: 25,
};

const stationaryBig = { signatureRadius: 400, velocity: 0 };

function inputs(weapons: AppliedWeapon[], droneControlRange = 60000): AppliedDpsInputs {
  return { weapons, droneControlRange };
}

describe('turretHitChance', () => {
  it('always hits a stationary target inside optimal', () => {
    expect(turretHitChance(turret, stationaryBig, 2000)).toBe(1);
  });

  it('halves at optimal + falloff against a stationary target', () => {
    expect(turretHitChance(turret, stationaryBig, 8000)).toBeCloseTo(0.5);
  });

  it('halves when angular speed x sig resolution equals tracking x target sig', () => {
    // angular = 100 / 1000 = 0.1 rad/s; 0.1 * 40 / (0.5 * 8) = 1
    expect(turretHitChance(turret, { signatureRadius: 8, velocity: 100 }, 1000)).toBeCloseTo(0.5);
  });

  it('never hits a moving target with no tracking at all (never NaN)', () => {
    const inert = { ...turret, tracking: 0, optimalSigRadius: 0 };
    expect(turretHitChance(inert, { signatureRadius: 40, velocity: 100 }, 1000)).toBe(0);
    expect(turretHitChance(inert, stationaryBig, 1000)).toBe(1);
  });

  it('is 0 at distance 0 against a moving target and 1 against a still one (never NaN)', () => {
    expect(turretHitChance(turret, { signatureRadius: 40, velocity: 100 }, 0)).toBe(0);
    expect(turretHitChance(turret, stationaryBig, 0)).toBe(1);
  });
});

describe('turretDamageMultiplier', () => {
  it('includes wrecking shots, so a certain hit averages ~1.015x volley', () => {
    expect(turretDamageMultiplier(1)).toBeCloseTo(1.01505, 5);
  });

  it('is 0 when nothing hits and only wrecking below a 1% chance', () => {
    expect(turretDamageMultiplier(0)).toBe(0);
    expect(turretDamageMultiplier(0.005)).toBeCloseTo(0.015);
  });
});

describe('missileApplication', () => {
  it('applies fully to a big, still target', () => {
    expect(missileApplication(missile, stationaryBig)).toBe(1);
  });

  it('scales by signature / explosion radius against a still small target (no NaN from speed 0)', () => {
    expect(missileApplication(missile, { signatureRadius: 70, velocity: 0 })).toBeCloseTo(0.5);
  });

  it('applies the explosion-velocity term against a fast target', () => {
    const target = { signatureRadius: 140, velocity: 170 };
    expect(missileApplication(missile, target)).toBeCloseTo(0.5 ** 0.682, 5);
  });
});

describe('appliedDps', () => {
  it('never changes raw DPS, whatever the target profile', () => {
    const fit = inputs([turret, missile, drone]);
    expect(rawDps(fit)).toBe(260);
    const applied = BUILT_IN_TARGET_PROFILES.map((target) => appliedDps(fit, target, 5000));
    expect(new Set(applied).size).toBe(applied.length);
    expect(rawDps(fit)).toBe(260);
  });

  it('drops missiles beyond their flight range', () => {
    expect(appliedDps(inputs([missile]), stationaryBig, 39000)).toBe(100);
    expect(appliedDps(inputs([missile]), stationaryBig, 41000)).toBe(0);
  });

  it('drops drones beyond drone control range', () => {
    const fit = inputs([drone], 20000);
    expect(appliedDps(fit, stationaryBig, 19000)).toBeGreaterThan(0);
    expect(appliedDps(fit, stationaryBig, 21000)).toBe(0);
  });

  it('treats a drone that catches its target as always hitting', () => {
    const fast = { signatureRadius: 35, velocity: 3000 };
    expect(appliedDps(inputs([drone]), fast, 10000)).toBeCloseTo(60 * 1.01505, 3);
  });

  it('treats a drone slower than its target (or a sentry) like a turret on the ship', () => {
    const faster = { signatureRadius: 35, velocity: 5000 };
    expect(appliedDps(inputs([drone]), faster, 10000)).toBeLessThan(1);
    const sentry = {
      ...drone,
      speed: 0,
      optimal: 30000,
      falloff: 20000,
      tracking: 0.02,
      optimalSigRadius: 400,
    };
    expect(appliedDps(inputs([sentry]), stationaryBig, 10000)).toBeCloseTo(60 * 1.01505, 3);
  });
});

describe('appliedDps against resists', () => {
  const still = { signatureRadius: 400, velocity: 0 };
  const resists = { em: 0, thermal: 0, kinetic: 0.5, explosive: 0.25 };

  it('takes each damage type down by the target’s resist to it', () => {
    const kinetic: AppliedWeapon = {
      ...missile,
      damage: { em: 0, thermal: 0, kinetic: 1, explosive: 0 },
    };
    const mixed: AppliedWeapon = {
      ...missile,
      damage: { em: 0, thermal: 0, kinetic: 0.5, explosive: 0.5 },
    };
    const inputs = (weapon: AppliedWeapon): AppliedDpsInputs => ({
      weapons: [weapon],
      droneControlRange: 0,
    });
    expect(appliedDps(inputs(kinetic), { ...still, resists }, 1000)).toBeCloseTo(50, 6);
    expect(appliedDps(inputs(mixed), { ...still, resists }, 1000)).toBeCloseTo(
      100 * (0.5 * 0.5 + 0.5 * 0.75),
      6
    );
  });

  it('spreads a weapon of unknown damage types evenly over the four', () => {
    expect(
      appliedDps({ weapons: [missile], droneControlRange: 0 }, { ...still, resists }, 1000)
    ).toBeCloseTo(100 * (1 - 0.75 / 4), 6);
  });

  it('leaves a target with no resists at full damage', () => {
    expect(appliedDps({ weapons: [missile], droneControlRange: 0 }, still, 1000)).toBeCloseTo(
      100,
      6
    );
  });
});

describe('graphs', () => {
  const fit = inputs([turret, missile]);

  it('samples applied DPS from 0 to the max range', () => {
    const points = appliedDpsVsRange(fit, stationaryBig, 50000, 10);
    expect(points).toHaveLength(11);
    expect(points[0].x).toBe(0);
    expect(points[10].x).toBe(50000);
    expect(points[10].dps).toBe(appliedDps(fit, stationaryBig, 50000));
  });

  it('samples applied DPS from speed 0 to the max speed at a fixed range', () => {
    const points = appliedDpsVsSpeed(fit, { signatureRadius: 125, velocity: 200 }, 5000, 1000, 4);
    expect(points.map((p) => p.x)).toEqual([0, 250, 500, 750, 1000]);
    expect(points[2].dps).toBe(appliedDps(fit, { signatureRadius: 125, velocity: 500 }, 5000));
  });

  it('reaches past the longest weapon, rounded up to a whole 5 km', () => {
    // turret optimal + 3 x falloff = 18 km; missile 40 km -> x1.1 = 44 -> 45 km
    expect(graphMaxRange([fit])).toBe(45000);
    // drones reach as far as control range: 57 km x1.1 = 62.7 -> 65 km
    expect(graphMaxRange([inputs([drone], 57000)])).toBe(65000);
    expect(graphMaxRange([inputs([])])).toBe(0);
  });

  it('finds the range a fit applies most at, the far end of a plateau, 0 for nothing', () => {
    expect(
      bestRange([
        { x: 0, dps: 0 },
        { x: 1000, dps: 50 },
        { x: 2000, dps: 50 },
        { x: 3000, dps: 10 },
      ])
    ).toBe(2000);
    expect(bestRange([])).toBe(0);
  });

  it('runs the speed axis to at least 1000 m/s, or twice the target speed rounded to 500', () => {
    expect(graphMaxSpeed({ signatureRadius: 125, velocity: 200 })).toBe(1000);
    expect(graphMaxSpeed({ signatureRadius: 35, velocity: 2600 })).toBe(5500);
  });
});
