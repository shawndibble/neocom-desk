import { describe, expect, it } from 'vitest';
import { SUPPORT_ATTRIBUTE as A, extractSupport } from './support';

function attrs(entries: Record<number, number>) {
  return new Map(Object.entries(entries).map(([id, value]) => [Number(id), { value }]));
}

function module(typeId: number, entries: Record<number, number>, state = 'active') {
  return {
    item: { type_id: typeId, slot: { type: 'medium' } },
    result: { attributes: attrs(entries), state },
  };
}

function extract(modules: ReturnType<typeof module>[]) {
  return extractSupport(
    modules.map((m) => m.item),
    modules.map((m) => m.result)
  );
}

describe('extractSupport', () => {
  it('sums remote repair per layer and groups identical modules into one row', () => {
    const rar = () =>
      module(26913, { [A.armorRepairRate]: 42.5, [A.optimal]: 10500, [A.falloff]: 3000 });
    const support = extract([
      rar(),
      rar(),
      module(3598, { [A.shieldBoostRate]: 40, [A.optimal]: 6000 }),
      module(4296, { [A.hullRepairRate]: 30, [A.optimal]: 10500 }),
    ]);

    expect(support.remoteRepair).toEqual({ shield: 40, armor: 85, hull: 30 });
    expect(support.rows[0]).toEqual({
      kind: 'remoteArmor',
      typeId: 26913,
      count: 2,
      amount: 85,
      optimal: 10500,
      falloff: 3000,
      effects: [],
    });
  });

  it('tells a neutralizer, a nosferatu and a cap transmitter apart', () => {
    const support = extract([
      module(12267, {
        [A.capacitorTransferRate]: 15,
        [A.energyNeutralizerAmount]: 180,
        [A.capacitorPeakLoad]: 9.4,
        [A.optimal]: 10000,
      }),
      module(12259, {
        [A.capacitorTransferRate]: 7.2,
        [A.capacitorPeakLoad]: -7.2,
        [A.optimal]: 10000,
      }),
      module(12221, {
        [A.capacitorTransferRate]: 23.4,
        [A.capacitorPeakLoad]: 18.3,
        [A.optimal]: 6500,
      }),
    ]);
    expect(support.rows.map((row) => [row.kind, row.amount])).toEqual([
      ['neutralizer', 15],
      ['nosferatu', 7.2],
      ['capTransfer', 23.4],
    ]);
    expect(support.neutralizer).toBe(15);
    expect(support.nosferatu).toBe(7.2);
    expect(support.capTransfer).toBe(23.4);
  });

  it('reads electronic warfare as the strength of one module', () => {
    const support = extract([
      module(527, { [A.speedFactor]: -60, [A.optimal]: 10000 }),
      module(527, { [A.speedFactor]: -60, [A.optimal]: 10000 }),
      module(448, { [A.warpScrambleStrength]: 2, [A.optimal]: 9000 }),
      module(2567, {
        [A.ecmGravimetric]: 3.25,
        [A.ecmLadar]: 3.25,
        [A.ecmMagnetometric]: 3.25,
        [A.ecmRadar]: 3.25,
        [A.optimal]: 23040,
      }),
      module(19806, { [A.signatureRadiusBonus]: 30, [A.optimal]: 36000 }),
      module(2109, { [A.trackingSpeedBonus]: -17.19, [A.optimal]: 48000 }),
      module(1969, { [A.maxTargetRangeBonus]: -15.3, [A.optimal]: 30000 }),
      module(37546, { [A.aoeVelocityBonus]: -12, [A.optimal]: 48000 }),
    ]);
    expect(support.rows.map((row) => [row.kind, row.count, row.amount])).toEqual([
      ['web', 2, 60],
      ['warpDisruption', 1, 2],
      ['ecm', 1, 3.25],
      ['targetPainter', 1, 30],
      ['trackingDisruptor', 1, 17.19],
      ['sensorDampener', 1, 15.3],
      ['guidanceDisruptor', 1, 12],
    ]);
  });

  it('lists every effect an unscripted disruptor or dampener carries', () => {
    const support = extract([
      module(2109, {
        [A.maxRangeBonus]: -17.19,
        [A.falloffBonus]: -17.19,
        [A.trackingSpeedBonus]: -17.19,
        [A.optimal]: 48000,
      }),
      module(1969, {
        [A.maxTargetRangeBonus]: -15.3,
        [A.scanResolutionBonus]: -15.3,
        [A.optimal]: 30000,
      }),
      module(37546, {
        [A.missileVelocityBonus]: -9,
        [A.explosionDelayBonus]: -9,
        [A.aoeVelocityBonus]: -12,
        [A.aoeCloudSizeBonus]: 12,
        [A.optimal]: 48000,
      }),
    ]);
    expect(support.rows.map((row) => [row.kind, row.effects])).toEqual([
      [
        'trackingDisruptor',
        [
          { effect: 'optimalRange', amount: -17.19 },
          { effect: 'falloff', amount: -17.19 },
          { effect: 'trackingSpeed', amount: -17.19 },
        ],
      ],
      [
        'sensorDampener',
        [
          { effect: 'lockRange', amount: -15.3 },
          { effect: 'scanResolution', amount: -15.3 },
        ],
      ],
      [
        'guidanceDisruptor',
        [
          { effect: 'missileVelocity', amount: -9 },
          { effect: 'missileFlightTime', amount: -9 },
          { effect: 'explosionVelocity', amount: -12 },
          { effect: 'explosionRadius', amount: 12 },
        ],
      ],
    ]);
  });

  it('keeps a scripted module whose script zeroes one of its effects', () => {
    const support = extract([
      // Optimal Range Disruption Script: no tracking left, range and falloff doubled.
      module(2109, {
        [A.maxRangeBonus]: -34.38,
        [A.falloffBonus]: -34.38,
        [A.trackingSpeedBonus]: 0,
        [A.optimal]: 48000,
      }),
      // Scan Resolution Dampening Script: no lock range left.
      module(1969, {
        [A.maxTargetRangeBonus]: 0,
        [A.scanResolutionBonus]: -30.6,
        [A.optimal]: 30000,
      }),
      // Missile Range Disruption Script: no explosion velocity or radius left.
      module(37546, {
        [A.missileVelocityBonus]: -18,
        [A.explosionDelayBonus]: -18,
        [A.aoeVelocityBonus]: 0,
        [A.aoeCloudSizeBonus]: 0,
        [A.optimal]: 48000,
      }),
    ]);
    expect(support.rows.map((row) => [row.kind, row.effects.map((e) => e.effect)])).toEqual([
      ['trackingDisruptor', ['optimalRange', 'falloff']],
      ['sensorDampener', ['scanResolution']],
      ['guidanceDisruptor', ['missileVelocity', 'missileFlightTime']],
    ]);
  });

  it('keeps a scripted and an unscripted module of one type on separate rows', () => {
    const scripted = () => module(1969, { [A.maxTargetRangeBonus]: -30.6, [A.optimal]: 30000 });
    const support = extract([
      scripted(),
      scripted(),
      module(1969, {
        [A.maxTargetRangeBonus]: -15.3,
        [A.scanResolutionBonus]: -15.3,
        [A.optimal]: 30000,
      }),
    ]);
    expect(support.rows.map((row) => [row.count, row.effects.length])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it('names each sensor strength of a racial jammer, one strength of a multispectral one', () => {
    const support = extract([
      module(1957, {
        [A.ecmGravimetric]: 1.3,
        [A.ecmLadar]: 4,
        [A.ecmMagnetometric]: 1.3,
        [A.ecmRadar]: 1.3,
        [A.optimal]: 23040,
      }),
    ]);
    expect(support.rows[0]).toEqual(
      expect.objectContaining({
        kind: 'ecm',
        amount: 4,
        effects: [
          { effect: 'jamGravimetric', amount: 1.3 },
          { effect: 'jamLadar', amount: 4 },
          { effect: 'jamMagnetometric', amount: 1.3 },
          { effect: 'jamRadar', amount: 1.3 },
        ],
      })
    );
  });

  it('leaves a friendly remote tracking computer or sensor booster out', () => {
    const support = extract([
      module(3608, {
        [A.maxRangeBonus]: 15,
        [A.falloffBonus]: 30,
        [A.trackingSpeedBonus]: 30,
        [A.optimal]: 24000,
      }),
      module(1964, {
        [A.maxTargetRangeBonus]: 30,
        [A.scanResolutionBonus]: 30,
        [A.optimal]: 24000,
      }),
    ]);
    expect(support.rows).toEqual([]);
  });

  it('adds up warp disruption points across modules', () => {
    const support = extract([
      module(448, { [A.warpScrambleStrength]: 2, [A.optimal]: 9000 }),
      module(448, { [A.warpScrambleStrength]: 2, [A.optimal]: 9000 }),
    ]);
    expect(support.rows).toEqual([
      expect.objectContaining({ kind: 'warpDisruption', count: 2, amount: 4 }),
    ]);
  });

  it('ignores modules that are not running, and anything without a range (a local rep, a propulsion module)', () => {
    const support = extract([
      module(26913, { [A.armorRepairRate]: 42.5, [A.optimal]: 10500 }, 'online'),
      module(3530, { [A.armorRepairRate]: 60 }),
      module(12076, { [A.speedFactor]: 500 }),
    ]);
    expect(support.rows).toEqual([]);
    expect(support.remoteRepair).toEqual({ shield: 0, armor: 0, hull: 0 });
  });
});
