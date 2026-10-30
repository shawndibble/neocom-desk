/**
 * Issue #5581's real-data check: trimmed EVE Workbench fits of the Drake and
 * the Dominix (name and modules only, from `data.neocomdesk.com`), run through
 * the same checks the Popular fits panel uses and the bundled game data.
 * PvE Drakes mostly carry an afterburner; PvE Dominixes mostly a micro jump drive.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { gameItemLookup } from '@/engine/fittings/fitCurrency';
import {
  commonGroups,
  commonPropulsionKind,
  groupShareOf,
  MICRO_JUMP_DRIVE_GROUP,
  PROPULSION_GROUP,
} from '@/engine/fittings/hullCommonality';
import type { WorkbenchGameData } from '@/engine/fittings/workbenchFitCheck';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import type { FittingSlotAssignment, TypeMap } from '@/sde/types';
import { loadHullCommonality } from './hullCommonalityLoad';
import type { WorkbenchFit } from './workbenchFits';

async function readData<T>(path: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(`../../../public/data/${path}`, import.meta.url), 'utf8')
  ) as T;
}
async function fixture(name: string): Promise<WorkbenchFit[]> {
  const raw = JSON.parse(
    await readFile(new URL(`./__fixtures__/workbench/${name}.json`, import.meta.url), 'utf8')
  ) as { fits: { name: string; eft: string }[] };
  return raw.fits.map((fit, i) => ({
    id: `${name}-${i}`,
    name: fit.name,
    authorId: null,
    authorName: '',
    dateAdded: i,
    eft: fit.eft,
  }));
}

vi.mock('@/sde/loadSde', () => ({
  loadTypes: () => readData('types.json'),
  loadSkills: () => readData('skills.json'),
}));

const DRAKE = 24698;
const DOMINIX = 645;
const BALLISTIC_CONTROL = 367;

async function load(shipTypeId: number, name: string) {
  const [types, typeByName, slotByTypeId, shipTree, typeNames, fits] = await Promise.all([
    readData<TypeMap>('types.json'),
    loadItemNameMap(),
    readData<Record<string, FittingSlotAssignment>>('fittingSlots.json'),
    readData<{
      ships: {
        typeID: number;
        stats: { highSlots: number; medSlots: number; lowSlots: number; rigSlots: number };
      }[];
    }>('shipTree.json'),
    readData<string[]>('typeNames.json'),
    fixture(name),
  ]);
  const slots = new Map(
    shipTree.ships.map((s) => [
      s.typeID,
      {
        high: s.stats.highSlots,
        medium: s.stats.medSlots,
        low: s.stats.lowSlots,
        rig: s.stats.rigSlots,
      },
    ])
  );
  const data: WorkbenchGameData = {
    typeByName,
    slotByTypeId,
    hullSlots: (id) => slots.get(id) ?? null,
    isGameItem: gameItemLookup(typeNames),
  };
  return loadHullCommonality(shipTypeId, types, {
    workbenchFits: async () => ({ ok: true, fits }),
    gameData: async () => data,
  });
}

describe('hull commonality on real Workbench fits', () => {
  it('PvE Drakes mostly carry an afterburner, and nearly all a Ballistic Control', async () => {
    const drake = (await load(DRAKE, 'drake'))?.pve;
    expect(drake).toBeTruthy();
    expect(commonPropulsionKind(drake)).toBe('afterburner');
    // 14 PvE-named fits: 6 afterburner, 5 MWD, 11 either, 13 with a Ballistic Control.
    expect(drake!.fits).toBe(14);
    expect(drake!.propulsion.afterburner).toBeCloseTo(6 / 14);
    expect(drake!.propulsion.mwd).toBeCloseTo(5 / 14);
    expect(drake!.propulsion.mjd).toBe(0);
    expect(groupShareOf(drake, PROPULSION_GROUP)).toBeCloseTo(11 / 14);
    expect(groupShareOf(drake, BALLISTIC_CONTROL)).toBeCloseTo(13 / 14);
    expect(commonGroups(drake)).toContain(BALLISTIC_CONTROL);
  });

  it('PvE Dominixes mostly carry a micro jump drive', async () => {
    const dominix = (await load(DOMINIX, 'dominix'))?.pve;
    expect(dominix).toBeTruthy();
    expect(commonPropulsionKind(dominix)).toBe('mjd');
    // 14 PvE-named fits: 10 micro jump drive, 5 afterburner, 3 MWD.
    expect(dominix!.propulsion.mjd).toBeCloseTo(10 / 14);
    expect(dominix!.propulsion.afterburner).toBeCloseTo(5 / 14);
    expect(dominix!.propulsion.mwd).toBeCloseTo(3 / 14);
    expect(groupShareOf(dominix, MICRO_JUMP_DRIVE_GROUP)).toBe(dominix!.propulsion.mjd);
  });

  it('has too few PvP or Explore fits to say anything', async () => {
    const drake = await load(DRAKE, 'drake');
    expect(drake?.pvp).toBeNull();
    expect(drake?.explore).toBeNull();
  });
});
