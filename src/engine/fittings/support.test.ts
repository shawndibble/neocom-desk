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
