import { describe, expect, it } from 'vitest';
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
