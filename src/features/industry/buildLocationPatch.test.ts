import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { jobFee } from '@/engine/industry/jobCost';
import { buildLocationPatch } from './buildLocationPatch';
import type { BuildLocationOption } from './buildLocations';

function option(over: Partial<BuildLocationOption> = {}): BuildLocationOption {
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
      buildLocationId: 1,
      buildLocationName: 'K2-18 R&D',
    });
  });

  it('records which place was picked, so the search box can still say it later', () => {
    const patch = buildLocationPatch(option({ structureId: 1035466617946, name: 'V-3 Citadel' }));

    expect(patch.buildLocationId).toBe(1035466617946);
    expect(patch.buildLocationName).toBe('V-3 Citadel');
  });

  it('keeps the id when ESI withheld the name, and stores no name', () => {
    // The label that stands in for a withheld name is UI copy, so the record
    // holds the id alone and the picker composes the rest.
    const patch = buildLocationPatch(option({ name: null }));

    expect(patch.buildLocationId).toBe(1);
    expect(patch.buildLocationName).toBeUndefined();
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
