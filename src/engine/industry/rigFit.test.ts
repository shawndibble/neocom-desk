import { describe, it, expect } from 'vitest';
import {
  EMPTY_RIG_FIT,
  normalizeRigFit,
  resolveRigFit,
  rigBonusPct,
  rigFitFromLegacyLevel,
} from '@/engine/industry/types';

describe('normalizeRigFit', () => {
  it('pads a short list with none', () => {
    expect(normalizeRigFit(['meT1'])).toEqual(['meT1', 'none', 'none']);
  });

  it('defaults undefined to all-none', () => {
    expect(normalizeRigFit(undefined)).toEqual(EMPTY_RIG_FIT);
  });

  it('leaves a full 3-slot fit unchanged', () => {
    expect(normalizeRigFit(['meT2', 'teT2', 'meT1'])).toEqual(['meT2', 'teT2', 'meT1']);
  });
});

describe('rigFitFromLegacyLevel', () => {
  it('maps none to an empty fit', () => {
    expect(rigFitFromLegacyLevel('none')).toEqual(EMPTY_RIG_FIT);
  });

  it('maps t1 to one T1 ME rig and one T1 TE rig, same total bonus as the pre-#609 model', () => {
    expect(rigFitFromLegacyLevel('t1')).toEqual(['meT1', 'teT1', 'none']);
  });

  it('maps t2 to one T2 ME rig and one T2 TE rig', () => {
    expect(rigFitFromLegacyLevel('t2')).toEqual(['meT2', 'teT2', 'none']);
  });
});

describe('resolveRigFit', () => {
  it('prefers rigFit when present', () => {
    expect(resolveRigFit({ rigFit: ['meT2', 'none', 'none'], rigLevel: 't1' })).toEqual([
      'meT2',
      'none',
      'none',
    ]);
  });

  it('falls back to the legacy rigLevel when rigFit is absent', () => {
    expect(resolveRigFit({ rigLevel: 't2' })).toEqual(['meT2', 'teT2', 'none']);
  });

  it('is all-none when neither field is present', () => {
    expect(resolveRigFit({})).toEqual(EMPTY_RIG_FIT);
  });
});

describe('rigBonusPct', () => {
  it('is 0 when no slot matches the requested bonus type', () => {
    expect(rigBonusPct(['meT1', 'none', 'none'], 'te', 'manufacturing', 'highsec')).toBe(0);
  });

  it('an ME rig contributes nothing to the TE bonus and vice versa', () => {
    const fit = normalizeRigFit(['meT2', 'teT1']);
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec')).toBeCloseTo(2.4, 10);
    expect(rigBonusPct(fit, 'te', 'manufacturing', 'highsec')).toBeCloseTo(20, 10);
  });

  it('scales by the security-band multiplier', () => {
    expect(rigBonusPct(['meT1', 'none', 'none'], 'me', 'manufacturing', 'nullsec')).toBeCloseTo(
      2 * 2.1,
      10
    );
  });

  it('applies EVE stacking penalty to a second same-type rig rather than adding it in full', () => {
    // Two T1 ME rigs: 2% (full) + 2% * 0.869 (2nd-slot penalty) = 3.738%.
    const fit: readonly ['meT1', 'meT1', 'none'] = ['meT1', 'meT1', 'none'];
    expect(rigBonusPct(fit, 'me', 'manufacturing', 'highsec')).toBeCloseTo(3.738, 10);
  });

  it('ranks stacking penalty by the strongest rig first regardless of slot order', () => {
    const weakFirst: readonly ['meT1', 'meT2', 'none'] = ['meT1', 'meT2', 'none'];
    const strongFirst: readonly ['meT2', 'meT1', 'none'] = ['meT2', 'meT1', 'none'];
    // Both orderings: the T2 (2.4%) rig is always the unpenalized one, the T1
    // (2%) rig always takes the 0.869 second-slot penalty.
    const expected = 2.4 + 2 * 0.869;
    expect(rigBonusPct(weakFirst, 'me', 'manufacturing', 'highsec')).toBeCloseTo(expected, 10);
    expect(rigBonusPct(strongFirst, 'me', 'manufacturing', 'highsec')).toBeCloseTo(expected, 10);
  });

  it('uses the reaction security table for a reaction facility, same as the legacy single-rig model', () => {
    expect(rigBonusPct(['teT2', 'none', 'none'], 'te', 'reaction', 'nullsec')).toBeCloseTo(
      24 * 1.1,
      10
    );
  });
});
