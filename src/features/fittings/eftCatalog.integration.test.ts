/**
 * The EFT loader against the real bundled catalogue (`types.json`,
 * `skills.json`, `fittingSlots.json`), not a fixture map: a type no blueprint
 * or skill references used to be absent from `types.json`, so a pasted fit
 * naming an LP booster or a filament read "unknown item", and a Republic
 * Fleet module or a scout drone had no rack either.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { loadEftFitting } from '@/engine/fittings/eftLoader';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import type { FittingSlotAssignment, MutaplasmidData } from '@/sde/types';
import { mutaplasmidLookup, mutationStatus } from '@/engine/fittings/mutaplasmids';

async function readData<T>(name: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(`../../../public/data/${name}`, import.meta.url), 'utf8')
  ) as T;
}

vi.mock('@/sde/loadSde', () => ({
  loadTypes: () => readData('types.json'),
  loadSkills: () => readData('skills.json'),
}));

const GILA = `[Gila, T4 Exotic - Medium]
Republic Fleet Shield Recharger
C3-A 'Hivaa Saitsuo' Ballistic Control System

Orbweaver SW-300-I x2

Agency 'Hardshell' TB5 Dose II x1
Fierce Exotic Filament x1
`;

describe('EFT load against the bundled catalogue', () => {
  it('resolves boosters, filaments, faction modules and scout drones', async () => {
    const [typeByName, slotByTypeId] = await Promise.all([
      loadItemNameMap(),
      readData<Record<string, FittingSlotAssignment>>('fittingSlots.json'),
    ]);

    const parts = loadEftFitting(GILA, typeByName, slotByTypeId);
    if (parts.hullTypeId === null) throw new Error('Gila did not resolve');

    expect(parts.unresolved).toEqual([]);
    expect(parts.modules.map((m) => [m.slot, m.typeId])).toEqual([
      ['medium', 37805],
      ['low', 47447],
    ]);
    expect(parts.drones).toEqual([{ typeId: 92033, quantity: 2, state: 'online' }]);
    expect(parts.cargo).toEqual([
      { typeId: 46002, quantity: 1 },
      { typeId: 47889, quantity: 1 },
    ]);
  });

  it('resolves a corvette hull', async () => {
    const parts = loadEftFitting('[Ibis, Starter]\n', await loadItemNameMap(), {});

    expect(parts.hullTypeId).toBe(601);
    expect(parts.unresolved).toEqual([]);
  });

  it('resolves a Pyfa mutated module and a bare abyssal line against the bundled data', async () => {
    const [typeByName, slotByTypeId, data] = await Promise.all([
      loadItemNameMap(),
      readData<Record<string, FittingSlotAssignment>>('fittingSlots.json'),
      readData<MutaplasmidData>('mutaplasmids.json'),
    ]);
    const lookup = mutaplasmidLookup(data);
    // Pyfa layout, reconstructed from Pyfa's source (eft.py, muta.py).
    const text = [
      '[Vexor Navy Issue, Abyssal]',
      'Heavy Gremlin Compact Energy Neutralizer [1]',
      'Large Abyssal Remote Armor Repairer',
      '',
      '[1] Heavy Gremlin Compact Energy Neutralizer',
      '  Gravid Heavy Energy Neutralizer Mutaplasmid',
      '  capacitorNeed 419.25, energyNeutralizerAmount 591.36, maxRange 15680, power 1720',
    ].join('\n');

    const parts = loadEftFitting(text, typeByName, slotByTypeId, lookup);
    if (parts.hullTypeId === null) throw new Error('hull did not resolve');

    expect(parts.unresolved).toEqual([]);
    const [neut, rar] = parts.modules;
    expect(neut).toMatchObject({
      slot: 'high',
      typeId: 47832, // Heavy Abyssal Energy Neutralizer
      mutation: {
        baseTypeId: 16475,
        mutaplasmidTypeId: 47831,
        attributes: { 6: 419.25, 30: 1720, 54: 15680, 97: 591.36 },
      },
    });
    expect(mutationStatus(neut!, lookup)).toBe('rolled');
    // A bare abyssal line: the type is known, its base and rolls are not.
    expect(rar).toMatchObject({ slot: 'high', typeId: 97657 });
    expect(mutationStatus(rar!, lookup)).toBe('baseUnknown');
  });
});
