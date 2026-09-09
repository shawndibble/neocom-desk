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

  it('leaves rig fit and facility tax alone when the target is a structure', () => {
    // Mirrors buildLocationPatch: ESI publishes no structure rig fitting, so
    // a plan's own rig/tax survive a facility pick the same way here.
    const patch = retargetPatch(snapshot({ facility: 'raitaru' }));
    expect('rigFit' in patch).toBe(false);
    expect('facilityTaxPct' in patch).toBe(false);
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
});
