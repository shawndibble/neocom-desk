import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { jobFee } from '@/engine/industry/jobCost';
import { buildLocationPatch } from './buildLocationPatch';
import type { BuildStructureOption } from './buildStructures';

function option(over: Partial<BuildStructureOption> = {}): BuildStructureOption {
  return {
    structureId: 1,
    name: 'K2-18 R&D',
    facility: 'azbel',
    systemId: 30003888,
    systemName: 'Badivefi',
    security: 'highsec',
    ...over,
  };
}

describe('buildLocationPatch', () => {
  it('sets facility, system and band from the chosen structure', () => {
    expect(buildLocationPatch(option())).toEqual({
      facility: 'azbel',
      security: 'highsec',
      buildSystemId: 30003888,
      buildSystemName: 'Badivefi',
    });
  });

  it("leaves a structure's rig and tax alone — the pilot owns those", () => {
    const patch = buildLocationPatch(option({ facility: 'sotiyo' }));

    expect(patch).not.toHaveProperty('rigLevel');
    expect(patch).not.toHaveProperty('facilityTaxPct');
  });

  it('clears rig and tax when the pick is an NPC station', () => {
    // A station has no rig slots and no owner to set a tax, so neither is the
    // pilot's to carry over from wherever they built last.
    const patch = buildLocationPatch(option({ facility: 'npcStation', name: 'Jita IV - Moon 4' }));

    expect(patch).toMatchObject({ rigLevel: 'none', facilityTaxPct: undefined });
  });

  it("leaves the station's own 0.25% to the engine rather than writing it onto the plan", () => {
    // Cleared, not set to 0.25: the rate is CCP's, and `jobFee` reads it from
    // the preset. Writing it onto the plan would freeze today's number.
    const patch = buildLocationPatch(option({ facility: 'npcStation' }));
    const fee = jobFee(1_000_000, 0.05, FACILITY_PRESETS.npcStation, patch.facilityTaxPct);

    expect(patch.facilityTaxPct).toBeUndefined();
    expect(fee.facilityTax).toBeCloseTo(2_500, 6);
  });
});
