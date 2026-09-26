/**
 * Ship fighters (carriers, supercarriers, and the few other hulls with
 * fighter tubes): each fighter type's class — light, support or heavy, which
 * decides the tubes it may take — and its squadron size. Structure fighters
 * are left out, with structures (`20260924-150509`).
 *
 * Read out of the pinned `@eveshipfit/sde` `sde.dat` (2026-09-25): every
 * published type in the Light (1652), Support (1537) and Heavy (1653)
 * Fighter groups, its `fighterSquadronIsLight/Support/Heavy` and
 * `fighterSquadronMaxSize`. The app's baked `fittingSlots.json` covers
 * modules and drones only, so this is the one place a fighter is told apart.
 * Bump with the SDE if CCP adds a fighter.
 */
import type { FittingFighter } from './types';

export type FighterClass = 'light' | 'support' | 'heavy';

const LIGHT_6 = [
  23055, 23057, 23059, 23061, 40556, 40557, 40558, 40559, 83579, 83582, 83583, 83584,
];
const LIGHT_12 = [
  40358, 40359, 40360, 40361, 40552, 40553, 40554, 40555, 83585, 83586, 83587, 83589,
];
const SUPPORT_3 = [
  37599, 40345, 40346, 40347, 40568, 40569, 40570, 40571, 83591, 83592, 83593, 83594,
];
const HEAVY_6 = [
  2948, 32325, 32340, 32342, 32344, 40362, 40363, 40364, 40365, 40560, 40561, 40562, 40563, 40564,
  40565, 40566, 40567,
];

interface FighterInfo {
  class: FighterClass;
  squadronSize: number;
}

const entries = (ids: readonly number[], info: FighterInfo): [number, FighterInfo][] =>
  ids.map((id) => [id, info]);

const FIGHTERS: ReadonlyMap<number, FighterInfo> = new Map([
  ...entries(LIGHT_6, { class: 'light', squadronSize: 6 }),
  ...entries(LIGHT_12, { class: 'light', squadronSize: 12 }),
  ...entries(SUPPORT_3, { class: 'support', squadronSize: 3 }),
  ...entries(HEAVY_6, { class: 'heavy', squadronSize: 6 }),
]);

export function isFighter(typeId: number): boolean {
  return FIGHTERS.has(typeId);
}

export function fighterClass(typeId: number): FighterClass | null {
  return FIGHTERS.get(typeId)?.class ?? null;
}

/** A full squadron of the type; 1 for anything that isn't a fighter. */
export function squadronSize(typeId: number): number {
  return FIGHTERS.get(typeId)?.squadronSize ?? 1;
}

/** Every ship fighter type id — for a picker to search among. */
export function fighterTypeIds(): number[] {
  return [...FIGHTERS.keys()];
}

/**
 * A stack of fighters as squadrons: a full squadron each, the remainder a
 * short one — how an exported "Templar I x18" comes back as three squadrons
 * of six. Loaded in the bay; launching is the pilot's call.
 */
export function squadronsOf(typeId: number, quantity: number): FittingFighter[] {
  const size = squadronSize(typeId);
  const squadrons: FittingFighter[] = [];
  for (let left = quantity; left > 0; left -= size) {
    squadrons.push({ typeId, quantity: Math.min(size, left), state: 'online' });
  }
  return squadrons;
}
