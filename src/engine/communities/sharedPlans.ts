import type { PlanEntry, PlanPriority } from '@/engine/types';

export const MAX_SHARED_PLAN_ENTRIES = 500;

const PRIORITY_CODE: Record<PlanPriority, number> = { low: 0, normal: 1, high: 2 };
const PRIORITY_FROM_CODE: readonly PlanPriority[] = ['low', 'normal', 'high'];

export interface SharedPlan {
  communityId: string;
  id: string;
  ownerUid: string;
  planId: string;
  name: string;
  entries: PlanEntry[];
  updatedAt: number;
  sourceUpdatedAt: number;
}

export function encodePlanEntries(entries: readonly PlanEntry[]): number[] | null {
  if (entries.length > MAX_SHARED_PLAN_ENTRIES) return null;
  const flat: number[] = [];
  for (const entry of entries) {
    const { skillTypeID, targetLevel } = entry;
    if (!Number.isInteger(skillTypeID) || skillTypeID <= 0) return null;
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 5) return null;
    flat.push(skillTypeID, targetLevel, PRIORITY_CODE[entry.priority ?? 'normal']);
  }
  return flat;
}

export function decodePlanEntries(flat: unknown): PlanEntry[] | null {
  if (!Array.isArray(flat) || flat.length % 3 !== 0) return null;
  if (flat.length / 3 > MAX_SHARED_PLAN_ENTRIES) return null;
  const entries: PlanEntry[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    const [skillTypeID, targetLevel, code] = [flat[i], flat[i + 1], flat[i + 2]];
    if (
      !Number.isInteger(skillTypeID) ||
      !Number.isInteger(targetLevel) ||
      !Number.isInteger(code) ||
      skillTypeID <= 0 ||
      targetLevel < 1 ||
      targetLevel > 5 ||
      code < 0 ||
      code > 2
    ) {
      return null;
    }
    const priority = PRIORITY_FROM_CODE[code];
    entries.push({ skillTypeID, targetLevel, ...(priority === 'normal' ? {} : { priority }) });
  }
  return entries;
}

export function sharedPlanId(ownerUid: string, planId: string): string {
  return `${ownerUid}~${planId}`;
}

export function parseSharedPlanId(id: string): { ownerUid: string; planId: string } | null {
  const parts = id.split('~');
  if (parts.length !== 2 || parts[0] === '') return null;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(parts[1])) return null;
  return { ownerUid: parts[0], planId: parts[1] };
}

export function planSyncActions(
  local: readonly { id: string; updatedAt: number }[],
  shared: ReadonlyMap<string, number>
): { push: string[]; remove: string[] } {
  const byId = new Map(local.map((plan) => [plan.id, plan.updatedAt]));
  const push: string[] = [];
  const remove: string[] = [];
  for (const [planId, sourceUpdatedAt] of shared) {
    const updatedAt = byId.get(planId);
    if (updatedAt === undefined) remove.push(planId);
    else if (updatedAt > sourceUpdatedAt) push.push(planId);
  }
  return { push, remove };
}
