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

export interface OrderSlotBreakdown {
  base: number;
  /** One row per Trade-group skill, in `ORDER_SLOT_SKILLS` order, untrained ones at level 0. */
  skills: { typeID: number; level: number; slots: number }[];
  total: number;
}

/**
 * Where the ceiling comes from. A skill absent from `trained` counts as
 * untrained; a level outside 0-5 is clamped rather than trusted, so a
 * malformed payload cannot inflate a number the UI presents as a limit.
 */
export function orderSlotBreakdown(trained: ReadonlyMap<number, TrainedSkill>): OrderSlotBreakdown {
  const skills = ORDER_SLOT_SKILLS.map(({ typeID, perLevel }) => {
    const level = clamp(trained.get(typeID)?.level ?? 0, 0, MAX_SKILL_LEVEL);
    return { typeID, level, slots: perLevel * level };
  });
  const total = skills.reduce((sum, s) => sum + s.slots, BASE_ORDER_SLOTS);
  return { base: BASE_ORDER_SLOTS, skills, total };
}

/** The character's open-order ceiling. */
export function maxMarketOrders(trained: ReadonlyMap<number, TrainedSkill>): number {
  return orderSlotBreakdown(trained).total;
}

/** Share of the ceiling in use at which the figure warns. */
export const ORDER_SLOT_WARN_SHARE = 0.95;

export type OrderSlotTone = 'default' | 'warning' | 'danger';

/** Amber from 95% of the ceiling, red at it (a full book blocks new and repost orders). */
export function orderSlotTone(used: number, max: number): OrderSlotTone {
  if (used >= max) return 'danger';
  if (used >= max * ORDER_SLOT_WARN_SHARE) return 'warning';
  return 'default';
}
