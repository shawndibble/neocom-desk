import { describe, it, expect } from 'vitest';
import { buildLocationOptions, type LocatablePlace, type SystemSummary } from './buildLocations';

function place(over: Partial<LocatablePlace> = {}): LocatablePlace {
  return {
    id: 1,
    systemId: 30003888,
    typeId: 35826,
    name: 'K2-18 R&D',
    npcStation: false,
    ...over,
  };
}

const SYSTEMS: ReadonlyMap<number, SystemSummary> = new Map([
  [30003888, { name: 'Badivefi', security: 0.6587472558021545 }],
  [30002813, { name: 'Tama', security: 0.2825556993484497 }],
]);

describe('buildLocationOptions', () => {
  it('maps an Engineering Complex to its facility, system and security band', () => {
    expect(buildLocationOptions([place()], SYSTEMS, 'manufacturing')).toEqual([
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
    const options = buildLocationOptions(
      [
        place({ id: 1, typeId: 35825, name: 'A Raitaru' }),
        place({ id: 2, typeId: 35827, name: 'A Sotiyo' }),
        place({ id: 3, typeId: 35832, name: 'An Astrahus' }),
        place({ id: 4, typeId: 35835, name: 'An Athanor' }),
      ],
      SYSTEMS,
      'manufacturing'
    );

    expect(options.map((o) => o.facility)).toEqual(['raitaru', 'sotiyo']);
  });

  it('keeps only structures that can host a reaction job, and never an NPC station (issue #460)', () => {
    const options = buildLocationOptions(
      [
        place({ id: 1, typeId: 35835, name: 'A Athanor' }),
        place({ id: 2, typeId: 35836, name: 'B Tatara' }),
        place({ id: 3, typeId: 35826, name: 'C Azbel' }),
        place({ id: 4, typeId: 1529, name: 'Jita IV - Moon 4', npcStation: true }),
      ],
      SYSTEMS,
      'reaction'
    );

    expect(options.map((o) => o.facility)).toEqual(['athanor', 'tatara']);
  });

  it("treats an NPC station as a facility, on the resolver's say-so", () => {
    const options = buildLocationOptions(
      [place({ typeId: 1529, name: 'Jita IV - Moon 4', npcStation: true })],
      SYSTEMS,
      'manufacturing'
    );

    expect(options[0]).toMatchObject({ facility: 'npcStation', name: 'Jita IV - Moon 4' });
  });

  it('bands security the way the game does, not the raw ESI float', () => {
    const options = buildLocationOptions([place({ systemId: 30002813 })], SYSTEMS, 'manufacturing');

    expect(options[0]?.security).toBe('lowsec');
  });

  it('drops a structure whose system could not be resolved', () => {
    expect(buildLocationOptions([place({ systemId: 30000001 })], SYSTEMS, 'manufacturing')).toEqual(
      []
    );
  });

  it('reports a withheld name as null, leaving the label to the UI', () => {
    const options = buildLocationOptions([place({ name: null })], SYSTEMS, 'manufacturing');

    expect(options[0]).toMatchObject({ name: null, facility: 'azbel', systemName: 'Badivefi' });
  });

  it('sorts by name, with the unnamed ones last, so the list does not reorder between loads', () => {
    const options = buildLocationOptions(
      [
        place({ id: 1, name: 'Zulu Works' }),
        place({ id: 2, name: null }),
        place({ id: 3, name: 'Alpha Works' }),
        place({ id: 4, name: 'Mike Works' }),
      ],
      SYSTEMS,
      'manufacturing'
    );

    expect(options.map((o) => o.name)).toEqual(['Alpha Works', 'Mike Works', 'Zulu Works', null]);
  });
});
