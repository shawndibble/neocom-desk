import { describe, expect, it } from 'vitest';
import { assumptionsSummary } from './assumptionsSummary';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;

const DEFAULTS = {
  alpha: false,
  whatIf: { kind: 'preset', preset: 'current' } as const,
  boosterCount: 0,
};

describe('assumptionsSummary', () => {
  it('reads Defaults when nothing is set', () => {
    expect(assumptionsSummary(DEFAULTS, t)).toBe('plans.assumptions.defaults');
  });

  it('lists whatever is set, in the order the controls appear', () => {
    expect(
      assumptionsSummary(
        { alpha: true, whatIf: { kind: 'preset', preset: '+5' }, boosterCount: 1 },
        t
      )
    ).toBe(
      'plans.assumptions.alpha · plans.assumptions.implantsPreset:{"preset":"+5"} · plans.assumptions.booster'
    );
  });

  it('names the other implant choices', () => {
    expect(assumptionsSummary({ ...DEFAULTS, whatIf: { kind: 'preset', preset: 'none' } }, t)).toBe(
      'plans.assumptions.noImplants'
    );
    expect(
      assumptionsSummary(
        {
          ...DEFAULTS,
          whatIf: { kind: 'custom', bonuses: { intelligence: 3 } },
        },
        t
      )
    ).toBe('plans.assumptions.customImplants');
    expect(assumptionsSummary({ ...DEFAULTS, matchedJumpClone: true }, t)).toBe(
      'plans.assumptions.jumpCloneImplants'
    );
  });
});
