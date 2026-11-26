import { clamp } from '../math';
import type { TrainedSkill } from '@/engine/types';

export const BASE_ORDER_SLOTS = 5;

export const ORDER_SLOT_SKILLS: readonly { typeID: number; perLevel: number }[] = [
  { typeID: 3443, perLevel: 4 },
  { typeID: 3444, perLevel: 8 },
  { typeID: 16596, perLevel: 16 },
  { typeID: 18580, perLevel: 32 },
];

const MAX_SKILL_LEVEL = 5;

export interface OrderSlotBreakdown {
  base: number;
  skills: { typeID: number; level: number; slots: number }[];
  total: number;
}

export function orderSlotBreakdown(trained: ReadonlyMap<number, TrainedSkill>): OrderSlotBreakdown {
  const skills = ORDER_SLOT_SKILLS.map(({ typeID, perLevel }) => {
    const level = clamp(trained.get(typeID)?.level ?? 0, 0, MAX_SKILL_LEVEL);
    return { typeID, level, slots: perLevel * level };
  });
  const total = skills.reduce((sum, s) => sum + s.slots, BASE_ORDER_SLOTS);
  return { base: BASE_ORDER_SLOTS, skills, total };
}

export function maxMarketOrders(trained: ReadonlyMap<number, TrainedSkill>): number {
  return orderSlotBreakdown(trained).total;
}

export const ORDER_SLOT_WARN_SHARE = 0.95;

export type OrderSlotTone = 'default' | 'warning' | 'danger';

export function orderSlotTone(used: number, max: number): OrderSlotTone {
  if (used >= max) return 'danger';
  if (used >= max * ORDER_SLOT_WARN_SHARE) return 'warning';
  return 'default';
}
