import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildPilotProfile } from '@/engine/fittings/pilotProfile';
import { DOGMA_ATTRIBUTE } from '@/engine/fittings/types';
import { skilledAttributes } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';

/**
 * Item Detail's "base → skilled" values (`skilledAttributes`) against the
 * real pinned engine (ADR 0016): a hull alone, and a module alone on a
 * Capsule so no hull bonus leaks into the module's own figures. Type ids
 * looked up by exact name in `public/data/types.json`, 2026-11-03.
 */
const ZEALOT = 12003;
const MEDIUM_ARMOR_REPAIRER_II = 3530;
const MECHANICS = 3392;
const REPAIR_SYSTEMS = 3393;
const HULL_UPGRADES = 3394;
const NOBLE_HULL_UPGRADES_HG_1004 = 3481;

const ARMOR_HP = DOGMA_ATTRIBUTE.armorHp;
const STRUCTURE_HP = DOGMA_ATTRIBUTE.hullHp;
const DURATION = 73;
// Looked up in `public/data/mutaplasmids.json` / `types.json`, 2026-11-03.
const MEDIUM_ABYSSAL_ARMOR_REPAIRER = 47773;
const DECAYED_ARMOR_REPAIRER_MUTAPLASMID = 47770;

beforeAll(async () => {
  await loadRealDogmaEngine();
});
afterAll(() => vi.unstubAllGlobals());

describe('skilledAttributes', () => {
  it('applies the pilot’s skills to a hull on its own', async () => {
    const profile = buildPilotProfile(
      new Map([
        [HULL_UPGRADES, 5],
        [MECHANICS, 5],
      ]),
      []
    );
    const skilled = await skilledAttributes({ kind: 'ship', typeId: ZEALOT }, profile);
    // Zealot: 2,250 armor and 1,670 structure HP; each skill +5% a level.
    expect(skilled.get(ARMOR_HP)?.value).toBeCloseTo(2250 * 1.25, 3);
    expect(skilled.get(STRUCTURE_HP)?.value).toBeCloseTo(1670 * 1.25, 3);
    // Each value says what made it.
    expect(skilled.get(ARMOR_HP)?.sources).toEqual([{ kind: 'skill', typeId: HULL_UPGRADES }]);
    expect(skilled.get(STRUCTURE_HP)?.sources).toEqual([{ kind: 'skill', typeId: MECHANICS }]);
  });

  it('names an implant that changes a value', async () => {
    const skilled = await skilledAttributes(
      { kind: 'ship', typeId: ZEALOT },
      buildPilotProfile(new Map([[HULL_UPGRADES, 5]]), [NOBLE_HULL_UPGRADES_HG_1004])
    );
    expect(skilled.get(ARMOR_HP)?.value).toBeGreaterThan(2250 * 1.25);
    expect(skilled.get(ARMOR_HP)?.sources).toEqual([
      { kind: 'skill', typeId: HULL_UPGRADES },
      { kind: 'implant', typeId: NOBLE_HULL_UPGRADES_HG_1004 },
    ]);
  });

  it('applies the pilot’s skills to a module on its own, with no hull bonus', async () => {
    const skilled = await skilledAttributes(
      { kind: 'module', typeId: MEDIUM_ARMOR_REPAIRER_II, slot: 'low' },
      buildPilotProfile(new Map([[REPAIR_SYSTEMS, 5]]), [])
    );
    // A 12 s cycle, 5% shorter per level of Repair Systems.
    expect(skilled.get(DURATION)?.value).toBeCloseTo(12000 * 0.75, 3);
  });

  it('starts a mutated module from its rolled values', async () => {
    const skilled = await skilledAttributes(
      {
        kind: 'module',
        typeId: MEDIUM_ABYSSAL_ARMOR_REPAIRER,
        slot: 'low',
        mutation: {
          baseTypeId: MEDIUM_ARMOR_REPAIRER_II,
          mutaplasmidTypeId: DECAYED_ARMOR_REPAIRER_MUTAPLASMID,
          attributes: { [DURATION]: 11400 },
        },
      },
      buildPilotProfile(new Map([[REPAIR_SYSTEMS, 5]]), [])
    );
    expect(skilled.get(DURATION)?.value).toBeCloseTo(11400 * 0.75, 3);
  });

  it('reports only what something actually changed, never an engine default', async () => {
    const skilled = await skilledAttributes(
      { kind: 'ship', typeId: ZEALOT },
      buildPilotProfile(new Map(), [])
    );
    // No skills, no implants: nothing on the hull is modified.
    expect(skilled.size).toBe(0);
  });

  it('leaves out the engine’s own derived (non-positive) attribute ids', async () => {
    const skilled = await skilledAttributes(
      { kind: 'ship', typeId: ZEALOT },
      buildPilotProfile(new Map(), [])
    );
    expect([...skilled.keys()].every((id) => id > 0)).toBe(true);
  });
});
