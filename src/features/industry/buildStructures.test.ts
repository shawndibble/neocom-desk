import { describe, it, expect } from 'vitest';
import type { CorporationStructure } from '@/esi/endpoints';
import { buildStructureOptions, type SystemSummary } from './buildStructures';

function structure(over: Partial<CorporationStructure> = {}): CorporationStructure {
  return {
    structure_id: 1,
    corporation_id: 98,
    system_id: 30003888,
    type_id: 35826, // Azbel
    profile_id: 1,
    name: 'K2-18 R&D',
    ...over,
  };
}

const SYSTEMS: ReadonlyMap<number, SystemSummary> = new Map([
  [30003888, { name: 'Badivefi', security: 0.6587472558021545 }],
  [30002813, { name: 'Tama', security: 0.2825556993484497 }],
]);

describe('buildStructureOptions', () => {
  it('maps an Engineering Complex to its facility, system and security band', () => {
    expect(buildStructureOptions([structure()], SYSTEMS)).toEqual([
      {
        structureId: 1,
        name: 'K2-18 R&D',
        facility: 'azbel',
        systemId: 30003888,
        systemName: 'Badivefi',
        security: 'highsec',
      },
    ]);
  });

  it('keeps only structures that can host a manufacturing job', () => {
    const options = buildStructureOptions(
      [
        structure({ structure_id: 1, type_id: 35825, name: 'A Raitaru' }),
        structure({ structure_id: 2, type_id: 35827, name: 'A Sotiyo' }),
        structure({ structure_id: 3, type_id: 35832, name: 'An Astrahus' }), // Citadel
        structure({ structure_id: 4, type_id: 35835, name: 'An Athanor' }), // Refinery
      ],
      SYSTEMS
    );

    expect(options.map((o) => o.facility)).toEqual(['raitaru', 'sotiyo']);
  });

  it('bands security the way the game does, not the raw ESI float', () => {
    const options = buildStructureOptions([structure({ system_id: 30002813 })], SYSTEMS);

    expect(options[0]?.security).toBe('lowsec');
  });

  it('drops a structure whose system could not be resolved', () => {
    // Filling facility and system while guessing at security would pick a rig
    // multiplier out of thin air. Better to not offer the row at all.
    expect(buildStructureOptions([structure({ system_id: 30000001 })], SYSTEMS)).toEqual([]);
  });

  it('names a structure ESI withheld a name for by what and where it is', () => {
    const options = buildStructureOptions([structure({ name: undefined })], SYSTEMS);

    expect(options[0]?.name).toBe('Azbel in Badivefi');
  });

  it('sorts by name, so the list does not reorder between loads', () => {
    const options = buildStructureOptions(
      [
        structure({ structure_id: 1, name: 'Zulu Works' }),
        structure({ structure_id: 2, name: 'Alpha Works' }),
        structure({ structure_id: 3, name: 'Mike Works' }),
      ],
      SYSTEMS
    );

    expect(options.map((o) => o.name)).toEqual(['Alpha Works', 'Mike Works', 'Zulu Works']);
  });
});
