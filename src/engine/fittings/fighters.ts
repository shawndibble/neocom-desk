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

export function squadronSize(typeId: number): number {
  return FIGHTERS.get(typeId)?.squadronSize ?? 1;
}

export function fighterTypeIds(): number[] {
  return [...FIGHTERS.keys()];
}

export function squadronsOf(typeId: number, quantity: number): FittingFighter[] {
  const size = squadronSize(typeId);
  const squadrons: FittingFighter[] = [];
  for (let left = quantity; left > 0; left -= size) {
    squadrons.push({ typeId, quantity: Math.min(size, left), state: 'online' });
  }
  return squadrons;
}
