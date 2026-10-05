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
import type { FittingSlotAssignment } from '@/sde/types';

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
});
