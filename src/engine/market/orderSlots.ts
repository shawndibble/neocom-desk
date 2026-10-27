/**
 * How many market orders a character may keep open at once. ESI reports the
 * open orders themselves but never the ceiling, so the ceiling is derived
 * from the four Trade-group skills that raise it.
 *
 * Pure: callers pass the corrected trained-skill map
 * (`features/skills/correctedSkills.ts`), not an ESI payload.
 */
import { clamp } from '../math';
import type { TrainedSkill } from '@/engine/types';

/** Slots every character has before training anything. */
export const BASE_ORDER_SLOTS = 5;

/**
 * Trade-group skills and the slots each level adds, from their SDE
 * descriptions (`public/data/skills.json`): Trade, Retail, Wholesale, Tycoon.
 */
export const ORDER_SLOT_SKILLS: readonly { typeID: number; perLevel: number }[] = [
  { typeID: 3443, perLevel: 4 }, // Trade
  { typeID: 3444, perLevel: 8 }, // Retail
  { typeID: 16596, perLevel: 16 }, // Wholesale
  { typeID: 18580, perLevel: 32 }, // Tycoon
];

const MAX_SKILL_LEVEL = 5;

/**
 * The character's open-order ceiling. A skill absent from `trained` counts as
 * untrained; a level outside 0-5 is clamped rather than trusted, so a
 * malformed payload cannot inflate a number the UI presents as a limit.
 */
export function maxMarketOrders(trained: ReadonlyMap<number, TrainedSkill>): number {
  return ORDER_SLOT_SKILLS.reduce((total, { typeID, perLevel }) => {
    const level = trained.get(typeID)?.level ?? 0;
    const clamped = clamp(level, 0, MAX_SKILL_LEVEL);
    return total + perLevel * clamped;
  }, BASE_ORDER_SLOTS);
}
