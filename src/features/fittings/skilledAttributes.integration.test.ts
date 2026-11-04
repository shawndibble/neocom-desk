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

const ARMOR_HP = 265;
const STRUCTURE_HP = 9;
const DURATION = 73;
const CPU = 50;
// As `improveMutated.integration.test.ts`.
const ABYSSAL_DAMAGE_CONTROL = 52227;
const DAMAGE_CONTROL_II = 2048;
const DAMAGE_CONTROL_MUTAPLASMID = 52224;

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
    expect(skilled.get(ARMOR_HP)).toBeCloseTo(2250 * 1.25, 3);
    expect(skilled.get(STRUCTURE_HP)).toBeCloseTo(
      (
        await skilledAttributes({ kind: 'ship', typeId: ZEALOT }, buildPilotProfile(new Map(), []))
      ).get(STRUCTURE_HP)! * 1.25,
      3
    );
    expect(skilled.get(DOGMA_ATTRIBUTE.lowSlots)).toBeGreaterThan(0);
  });

  it('applies the pilot’s skills to a module on its own, with no hull bonus', async () => {
    const untrained = await skilledAttributes(
      { kind: 'module', typeId: MEDIUM_ARMOR_REPAIRER_II, slot: 'low' },
      buildPilotProfile(new Map(), [])
    );
    const trained = await skilledAttributes(
      { kind: 'module', typeId: MEDIUM_ARMOR_REPAIRER_II, slot: 'low' },
      buildPilotProfile(new Map([[REPAIR_SYSTEMS, 5]]), [])
    );
    const base = untrained.get(DURATION)!;
    expect(base).toBeGreaterThan(0);
    expect(trained.get(DURATION)).toBeCloseTo(base * 0.75, 3);
  });

  it('starts a mutated module from its rolled values', async () => {
    const skilled = await skilledAttributes(
      {
        kind: 'module',
        typeId: ABYSSAL_DAMAGE_CONTROL,
        slot: 'low',
        mutation: {
          baseTypeId: DAMAGE_CONTROL_II,
          mutaplasmidTypeId: DAMAGE_CONTROL_MUTAPLASMID,
          attributes: { [CPU]: 20 },
        },
      },
      buildPilotProfile(new Map(), [])
    );
    expect(skilled.get(CPU)).toBeCloseTo(20, 6);
  });

  it('leaves out the engine’s own derived (non-positive) attribute ids', async () => {
    const skilled = await skilledAttributes(
      { kind: 'ship', typeId: ZEALOT },
      buildPilotProfile(new Map(), [])
    );
    expect([...skilled.keys()].every((id) => id > 0)).toBe(true);
  });
});
