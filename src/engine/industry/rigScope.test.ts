import { describe, expect, it } from 'vitest';
import { PRODUCT_RIG_SCOPES, RIG_TARGETS, parseRigKind, rigKindsApplyingTo } from './rigScope';
import { rigBonusPct } from './types';
import { effectiveMaterials, materialModifier } from './materials';
import { timeModifier } from './time';
import { NO_CHARACTER_MODIFIERS } from './characterModifiers';
import { FACILITY_PRESETS, type FacilityContext, type RigFit } from './types';

const ctx = (rigFit: RigFit): FacilityContext => ({
  facility: FACILITY_PRESETS.sotiyo,
  rigFit,
  security: 'highsec',
});

describe('rig scope data', () => {
  it('every rig target covers only known scopes, and every scope has a rig', () => {
    const covered = new Set<string>(Object.values(RIG_TARGETS).flat());
    expect([...covered].sort()).toEqual([...PRODUCT_RIG_SCOPES].sort());
  });
});

describe('parseRigKind', () => {
  it('reads legacy and scoped kinds, and rejects unknown ones', () => {
    expect(parseRigKind('meT2')).toEqual({ line: 'me', tier: 'T2', target: undefined });
    expect(parseRigKind('teT1:basCapComp')).toEqual({
      line: 'te',
      tier: 'T1',
      target: 'basCapComp',
    });
    expect(parseRigKind('none')).toBeNull();
    expect(parseRigKind('meT1:nonsense')).toBeNull();
    expect(parseRigKind('xxT1')).toBeNull();
  });
});

describe('scoped rig bonus', () => {
  it('a legacy rig applies to every product, even one with no scope', () => {
    expect(rigBonusPct(['meT1', 'none', 'none'], 'me', 'manufacturing', 'highsec')).toBe(2);
    expect(rigBonusPct(['meT1', 'none', 'none'], 'me', 'manufacturing', 'highsec', 'capShip')).toBe(
      2
    );
  });
  it('a scoped rig applies only to products it covers', () => {
    const fit: RigFit = ['meT2:basCapComp', 'none', 'none'];
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', 'basCapComp')).toBeCloseTo(2.4);
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', 'capShip')).toBe(0);
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', undefined)).toBe(0);
  });
  it('rigs of different scopes do not stack against each other', () => {
    const fit: RigFit = ['meT2:basCapComp', 'meT2:capShip', 'none'];
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', 'basCapComp')).toBeCloseTo(2.4);
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', 'capShip')).toBeCloseTo(2.4);
  });
  it('rigs covering the same scope take the stacking penalty', () => {
    const fit: RigFit = ['meT2:basCapComp', 'meT2:xlComponent', 'none'];
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', 'basCapComp')).toBeCloseTo(
      2.4 + 2.4 * 0.869
    );
  });
  it('an XL ship rig covers every ship scope but not components', () => {
    const fit: RigFit = ['meT1:xlShip', 'none', 'none'];
    for (const scope of ['basSmall', 'advLarge', 'capShip'] as const) {
      expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', scope)).toBe(2);
    }
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec', 'advComp')).toBe(0);
  });
  it('scales by the security band like any other rig', () => {
    expect(
      rigBonusPct(['meT1:equipment', 'none', 'none'], 'me', 'manufacturing', 'nullsec', 'equipment')
    ).toBeCloseTo(2 * 2.1);
  });
  it('the ME line and the TE line are scoped separately', () => {
    const fit: RigFit = ['meT1:capShip', 'teT1:basCapComp', 'none'];
    expect(rigBonusPct(fit, 'te', 'manufacturing', 'highsec', 'capShip')).toBe(0);
    expect(rigBonusPct(fit, 'te', 'manufacturing', 'highsec', 'basCapComp')).toBe(20);
  });
});

describe('scope reaches the job maths', () => {
  it('materialModifier uses the product scope', () => {
    const c = ctx(['meT2:basCapComp', 'none', 'none']);
    const base = materialModifier(0, ctx(['none', 'none', 'none']));
    expect(materialModifier(0, c)).toBe(base * (1 - 0));
    expect(materialModifier(0, c, 'basCapComp')).toBeCloseTo(base * (1 - 0.024), 12);
  });
  it('timeModifier uses the product scope', () => {
    const c = ctx(['teT1:advComp', 'none', 'none']);
    const off = timeModifier(0, NO_CHARACTER_MODIFIERS, c);
    expect(timeModifier(0, NO_CHARACTER_MODIFIERS, c, undefined, 'advComp')).toBeCloseTo(
      off * 0.8,
      12
    );
  });
});

describe('rigKindsApplyingTo', () => {
  it('lists the fitted rigs that apply, in slot order', () => {
    const fit: RigFit = ['meT2:capShip', 'meT1:basCapComp', 'teT1'];
    expect(rigKindsApplyingTo(fit, 'basCapComp')).toEqual(['meT1:basCapComp', 'teT1']);
    expect(rigKindsApplyingTo(fit, undefined)).toEqual(['teT1']);
  });
});

describe('a blueprint carries its scope into the job', () => {
  const bp = (rigScope?: 'basCapComp' | 'capShip') => ({
    name: 'x',
    time: 100,
    materials: [{ typeID: 34, quantity: 10000 }],
    products: [{ typeID: 1, quantity: 1 }],
    rigScope,
  });
  it('only the rig that reaches the product trims its materials', () => {
    const c = ctx(['meT2:basCapComp', 'none', 'none']);
    expect(effectiveMaterials(bp('basCapComp'), 1, 0, c)[0].quantity).toBe(
      Math.ceil(10000 * (1 - 0.01) * (1 - 0.024))
    );
    expect(effectiveMaterials(bp('capShip'), 1, 0, c)[0].quantity).toBe(
      Math.ceil(10000 * (1 - 0.01))
    );
  });
});
