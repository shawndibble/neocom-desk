import { describe, expect, it } from 'vitest';
import type { BuildGroupSnapshot } from './buildGroups';
import { planMatchesSnapshot, retargetPatch } from './retargetPatch';

function snapshot(overrides: Partial<BuildGroupSnapshot> = {}): BuildGroupSnapshot {
  return {
    hubId: 'jita',
    facility: 'npcStation',
    security: 'highsec',
    appliedAt: 1000,
    ...overrides,
  };
}

describe('retargetPatch', () => {
  it('carries hub, facility and security straight from the snapshot', () => {
    const patch = retargetPatch(snapshot({ hubId: 'amarr', security: 'lowsec' }));
    expect(patch.hubId).toBe('amarr');
    expect(patch.facility).toBe('npcStation');
    expect(patch.security).toBe('lowsec');
  });

  it('carries the build system pair when the snapshot has one', () => {
    const patch = retargetPatch(snapshot({ buildSystemId: 30000142, buildSystemName: 'Jita' }));
    expect(patch.buildSystemId).toBe(30000142);
    expect(patch.buildSystemName).toBe('Jita');
  });

  it('clears the build system when the snapshot has none, rather than leaving the plan’s old one', () => {
    // The four fields move together as one bundle — a Retarget that dropped
    // a system for one that hadn't picked one would otherwise leave a stray
    // system charging the job fee at a place the group no longer targets.
    const patch = retargetPatch(snapshot());
    expect(patch.buildSystemId).toBeUndefined();
    expect(patch.buildSystemName).toBeUndefined();
  });

  it('clears rig fit and facility tax when the target is not a structure', () => {
    const patch = retargetPatch(snapshot({ facility: 'npcStation' }));
    expect(patch.rigFit).toEqual(['none', 'none', 'none']);
    expect(patch.facilityTaxPct).toBeUndefined();
  });

  it('leaves rig fit and facility tax alone when a structure target carries neither', () => {
    // ESI publishes no structure rig fitting, so a pick alone has nothing
    // truer to write than what the plan already had.
    const patch = retargetPatch(snapshot({ facility: 'raitaru' }));
    expect('rigFit' in patch).toBe(false);
    expect('facilityTaxPct' in patch).toBe(false);
  });

  it('writes the rig fit and tax a structure target carries', () => {
    const patch = retargetPatch(
      snapshot({ facility: 'raitaru', rigFit: ['meT2', 'none', 'none'], facilityTaxPct: 2 })
    );
    expect(patch.rigFit).toEqual(['meT2', 'none', 'none']);
    expect(patch.facilityTaxPct).toBe(2);
  });

  it('writes the picked location pair, and clears it when the snapshot has none', () => {
    const picked = retargetPatch(snapshot({ buildLocationId: 1035, buildLocationName: 'K2-18' }));
    expect(picked.buildLocationId).toBe(1035);
    expect(picked.buildLocationName).toBe('K2-18');
    const none = retargetPatch(snapshot());
    expect('buildLocationId' in none).toBe(true);
    expect(none.buildLocationId).toBeUndefined();
    expect(none.buildLocationName).toBeUndefined();
  });
});

describe('planMatchesSnapshot', () => {
  const plan = {
    hubId: 'jita' as const,
    facility: 'npcStation' as const,
    security: 'highsec' as const,
    buildSystemId: undefined,
    buildSystemName: undefined,
  };

  it('is true when every field already equals the snapshot', () => {
    expect(planMatchesSnapshot(plan, snapshot())).toBe(true);
  });

  it('is false when any one field differs', () => {
    expect(planMatchesSnapshot(plan, snapshot({ hubId: 'amarr' }))).toBe(false);
    expect(planMatchesSnapshot(plan, snapshot({ facility: 'raitaru' }))).toBe(false);
    expect(planMatchesSnapshot(plan, snapshot({ security: 'lowsec' }))).toBe(false);
  });

  it('is false when the snapshot names a build system the plan lacks, and vice versa', () => {
    expect(
      planMatchesSnapshot(plan, snapshot({ buildSystemId: 30000142, buildSystemName: 'Jita' }))
    ).toBe(false);
    expect(
      planMatchesSnapshot({ ...plan, buildSystemId: 30000142, buildSystemName: 'Jita' }, snapshot())
    ).toBe(false);
  });

  it('is false when only the picked location, rig fit or tax differs', () => {
    expect(planMatchesSnapshot(plan, snapshot({ buildLocationId: 7 }))).toBe(false);
    expect(
      planMatchesSnapshot(
        { ...plan, facility: 'raitaru', rigFit: ['none', 'none', 'none'] },
        snapshot({ facility: 'raitaru', rigFit: ['meT2', 'none', 'none'] })
      )
    ).toBe(false);
    expect(
      planMatchesSnapshot(
        { ...plan, facility: 'raitaru', facilityTaxPct: 1 },
        snapshot({ facility: 'raitaru', facilityTaxPct: 2 })
      )
    ).toBe(false);
  });

  it('ignores rig fit and tax when the snapshot carries none', () => {
    expect(
      planMatchesSnapshot(
        { ...plan, facility: 'raitaru', rigFit: ['meT2', 'none', 'none'], facilityTaxPct: 3 },
        snapshot({ facility: 'raitaru' })
      )
    ).toBe(true);
  });
});
