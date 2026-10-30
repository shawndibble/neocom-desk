import { describe, expect, it } from 'vitest';
import { baseFittingStats } from './__fixtures__/fittingStats';
import { NUMERIC_FIELDS, STAT_DIRECTION, changeVerdict, statDirection } from './fittingStatFields';

describe('stat direction', () => {
  it('gives every numeric field a direction, and the capacitor one too', () => {
    for (const field of NUMERIC_FIELDS) {
      expect(['higher', 'lower', 'neutral']).toContain(field.direction);
      expect(STAT_DIRECTION[field.key]).toBe(field.direction);
    }
    expect(STAT_DIRECTION.capacitor).toBe('higher');
  });

  it('sorts the stats the ticket names', () => {
    expect(statDirection('totalDps')).toBe('higher');
    expect(statDirection('shieldEmResonance')).toBe('higher');
    expect(statDirection('signatureRadius')).toBe('lower');
    expect(statDirection('capacitorRechargeTime')).toBe('lower');
    expect(statDirection('cpuUsed')).toBe('lower');
    expect(statDirection('cpuTotal')).toBe('neutral');
  });

  it('reads the role stats where less is better', () => {
    expect(statDirection('burstReload')).toBe('lower');
    expect(statDirection('coreFuel')).toBe('lower');
    expect(statDirection('optimal')).toBe('higher');
  });
});

describe('changeVerdict', () => {
  it('is better when a higher-is-better stat rises', () => {
    expect(changeVerdict({ key: 'totalDps', before: 400, after: 525 })).toBe('better');
    expect(changeVerdict({ key: 'totalDps', before: 525, after: 400 })).toBe('worse');
  });

  it('flips for a lower-is-better stat', () => {
    expect(changeVerdict({ key: 'capacitorRechargeTime', before: 300, after: 328 })).toBe('worse');
    expect(changeVerdict({ key: 'signatureRadius', before: 120, after: 100 })).toBe('better');
  });

  it('is neutral for a neutral stat', () => {
    expect(changeVerdict({ key: 'cpuTotal', before: 100, after: 150 })).toBe('neutral');
  });

  it('ranks the capacitor: stable beats unstable, then % , then longer depletion', () => {
    // unstable is stored as a negated depletion time
    expect(changeVerdict({ key: 'capacitor', before: -90, after: 60 })).toBe('better');
    expect(changeVerdict({ key: 'capacitor', before: 60, after: -90 })).toBe('worse');
    expect(changeVerdict({ key: 'capacitor', before: 60, after: 70 })).toBe('better');
    expect(changeVerdict({ key: 'capacitor', before: -90, after: -120 })).toBe('better');
    expect(changeVerdict({ key: 'capacitor', before: -120, after: -90 })).toBe('worse');
  });
});

describe('swap figures read off the fit', () => {
  const stats_ = (over: object = {}) => ({ ...baseFittingStats(), ...over });
  const field = (key: string) => NUMERIC_FIELDS.find((f) => f.key === key)!;
  const row = (kind: string, optimal: number, falloff: number) => ({
    kind,
    typeId: 1,
    count: 1,
    amount: 1,
    optimal,
    falloff,
    effects: [],
  });

  it('takes the longest reach per EWAR kind, so adding a module never reads as lost reach', () => {
    const base = stats_();
    const one = stats_({
      support: { ...base.support, rows: [row('ecm', 20000, 10000)] },
    } as never);
    const two = stats_({
      support: { ...base.support, rows: [row('ecm', 20000, 10000), row('ecm', 5000, 1000)] },
    } as never);
    expect(field('ecmRange').value(one)).toBe(30);
    expect(field('ecmRange').value(two)).toBe(30);
    expect(field('dampRange').value(two)).toBe(0);
  });

  it('reads the worst missile launcher and skips sentries for drone speed', () => {
    const missile = (explosionVelocity: number, explosionRadius: number) => ({
      kind: 'missile',
      dps: 1,
      range: 1,
      explosionVelocity,
      explosionRadius,
      damageReductionFactor: 0.5,
    });
    const drone = (speed: number, tracking: number) => ({
      kind: 'drone',
      dps: 1,
      speed,
      tracking,
      optimal: 1,
      falloff: 1,
      optimalSigRadius: 1,
    });
    const stats = stats_({
      applied: {
        droneControlRange: 0,
        weapons: [missile(150, 140), missile(100, 200), drone(0, 0.5), drone(3000, 0.04)],
      },
    } as never);
    expect(field('missileExplosionVelocity').value(stats)).toBe(100);
    expect(field('missileExplosionRadius').value(stats)).toBe(200);
    expect(field('droneSpeed').value(stats)).toBe(3000);
    expect(field('droneTracking').value(stats)).toBe(0.04);
  });
});
