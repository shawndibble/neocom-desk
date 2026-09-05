import { describe, it, expect } from 'vitest';
import { buildStructureOptions, type LocatablePlace, type SystemSummary } from './buildStructures';

function structure(over: Partial<LocatablePlace> = {}): LocatablePlace {
  return { id: 1, systemId: 30003888, typeId: 35826 /* Azbel */, name: 'K2-18 R&D', ...over };
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
        structure({ id: 1, typeId: 35825, name: 'A Raitaru' }),
        structure({ id: 2, typeId: 35827, name: 'A Sotiyo' }),
        structure({ id: 3, typeId: 35832, name: 'An Astrahus' }), // Citadel
        structure({ id: 4, typeId: 35835, name: 'An Athanor' }), // Refinery
      ],
      SYSTEMS
    );

    expect(options.map((o) => o.facility)).toEqual(['raitaru', 'sotiyo']);
  });

  it("treats an NPC station as a facility, on the caller's say-so", () => {
    // NPC station typeIDs are many and unlisted here; the search knows which
    // ids came back under the `station` category and says so.
    const options = buildStructureOptions(
      [structure({ typeId: 1529, name: 'Jita IV - Moon 4' })],
      SYSTEMS,
      (typeId) => typeId === 1529
    );

    expect(options[0]).toMatchObject({ facility: 'npcStation', name: 'Jita IV - Moon 4' });
  });

  it('bands security the way the game does, not the raw ESI float', () => {
    const options = buildStructureOptions([structure({ systemId: 30002813 })], SYSTEMS);

    expect(options[0]?.security).toBe('lowsec');
  });

  it('drops a structure whose system could not be resolved', () => {
    // Filling facility and system while guessing at security would pick a rig
    // multiplier out of thin air. Better to not offer the row at all.
    expect(buildStructureOptions([structure({ systemId: 30000001 })], SYSTEMS)).toEqual([]);
  });

  it('reports a withheld name as null, leaving the label to the UI', () => {
    // ESI omits `name` for a Character whose role cannot see it. The stand-in
    // label is translated copy, so it is the picker's job, not this module's.
    const options = buildStructureOptions([structure({ name: null })], SYSTEMS);

    expect(options[0]).toMatchObject({ name: null, facility: 'azbel', systemName: 'Badivefi' });
  });

  it('sorts by name, with the unnamed ones last, so the list does not reorder between loads', () => {
    const options = buildStructureOptions(
      [
        structure({ id: 1, name: 'Zulu Works' }),
        structure({ id: 2, name: null }),
        structure({ id: 3, name: 'Alpha Works' }),
        structure({ id: 4, name: 'Mike Works' }),
      ],
      SYSTEMS
    );

    expect(options.map((o) => o.name)).toEqual(['Alpha Works', 'Mike Works', 'Zulu Works', null]);
  });
});
