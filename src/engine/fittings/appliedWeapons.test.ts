import { describe, expect, it } from 'vitest';
import {
  APPLIED_DPS_ATTRIBUTE as A,
  DEFAULT_DRONE_CONTROL_RANGE,
  extractAppliedDpsInputs,
} from './appliedWeapons';

function attrs(entries: Record<number, number>) {
  return new Map(Object.entries(entries).map(([id, value]) => [Number(id), { value }]));
}

const blaster = attrs({
  [A.dps]: 13.44,
  [A.optimal]: 3600,
  [A.falloff]: 10000,
  [A.tracking]: 0.2,
  [A.optimalSigRadius]: 125,
});
const heavyMissileLauncher = attrs({ [A.dps]: 13.07 });
const scourgeHeavy = attrs({
  [A.maxVelocity]: 4730,
  [A.explosionDelay]: 6500,
  [A.explosionRadius]: 140,
  [A.explosionVelocity]: 85,
  [A.damageReductionFactor]: 0.682,
});
const warrior = attrs({
  [A.dps]: 8.58,
  [A.optimal]: 2100,
  [A.falloff]: 2000,
  [A.tracking]: 5.196,
  [A.optimalSigRadius]: 25,
  [A.maxVelocity]: 5040,
});
const shieldHardener = attrs({ [A.dps]: 0 });

const high = { slot: { type: 'high' }, state: 'active' };

describe('extractAppliedDpsInputs', () => {
  it('reads turrets, launchers with their missile, and launched drone stacks', () => {
    const inputs = extractAppliedDpsInputs(
      [
        high,
        high,
        { slot: { type: 'medium' }, state: 'active' },
        { slot: { type: 'drone_bay' }, state: 'active', quantity: 5 },
      ],
      [
        { attributes: blaster, state: 'active' },
        { attributes: heavyMissileLauncher, state: 'active', charge: { attributes: scourgeHeavy } },
        { attributes: shieldHardener, state: 'active' },
        { attributes: warrior, state: 'active' },
      ],
      attrs({ [A.droneControlRange]: 60000 })
    );
    expect(inputs.droneControlRange).toBe(60000);
    expect(inputs.weapons).toEqual([
      {
        kind: 'turret',
        dps: 13.44,
        optimal: 3600,
        falloff: 10000,
        tracking: 0.2,
        optimalSigRadius: 125,
      },
      {
        kind: 'missile',
        dps: 13.07,
        range: 4730 * 6.5,
        explosionRadius: 140,
        explosionVelocity: 85,
        damageReductionFactor: 0.682,
      },
      {
        kind: 'drone',
        dps: 8.58 * 5,
        speed: 5040,
        optimal: 2100,
        falloff: 2000,
        tracking: 5.196,
        optimalSigRadius: 25,
      },
    ]);
  });

  it('skips modules that are not running and drones still in the bay', () => {
    const inputs = extractAppliedDpsInputs(
      [high, high, { slot: { type: 'drone_bay' }, state: 'online', quantity: 2 }],
      [
        { attributes: blaster, state: 'online' },
        { attributes: blaster, state: 'overload' },
        // the engine reports bay drones as active too — the Fitting's own state decides
        { attributes: warrior, state: 'active' },
      ],
      attrs({})
    );
    expect(inputs.weapons.map((w) => w.kind)).toEqual(['turret']);
  });

  it('falls back to the untrained drone control range when the character map is empty', () => {
    expect(extractAppliedDpsInputs([], [], attrs({})).droneControlRange).toBe(
      DEFAULT_DRONE_CONTROL_RANGE
    );
  });

  it('skips a launcher with no missile loaded and anything else doing no damage', () => {
    const inputs = extractAppliedDpsInputs(
      [high, high],
      [
        { attributes: heavyMissileLauncher, state: 'active' },
        { attributes: attrs({ [A.dps]: 0, [A.tracking]: 1 }), state: 'active' },
      ],
      attrs({})
    );
    expect(inputs.weapons).toEqual([]);
  });
});
