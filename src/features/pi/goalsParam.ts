import { idSetKey } from '@/lib/idSetKey';
import { TEXT_DEBOUNCE_MS, type UrlParamCodec } from '@/lib/urlState';
import type { Goal } from '@/engine/pi/goalTypes';

export const DEFAULT_GOAL_PER_DAY = 10;

function positiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function parseGoals(raw: string | null): Goal[] {
  if (!raw) return [];
  const merged = new Map<number, number>();
  for (const pair of raw.split(',')) {
    const [typeText, rateText, ...rest] = pair.split(':');
    if (rest.length > 0 || typeText === undefined || rateText === undefined) continue;
    const typeId = positiveInt(typeText.trim());
    const trimmed = rateText.trim();
    const unitsPerDay = trimmed === '' ? Number.NaN : Number(trimmed);
    if (typeId === null || !Number.isFinite(unitsPerDay) || unitsPerDay < 0) continue;
    merged.set(typeId, (merged.get(typeId) ?? 0) + unitsPerDay);
  }
  return [...merged].map(([typeId, unitsPerDay]) => ({ typeId, unitsPerDay }));
}

export function serializeGoals(goals: readonly Goal[]): string | null {
  if (goals.length === 0) return null;
  return goals.map((goal) => `${goal.typeId}:${goal.unitsPerDay}`).join(',');
}

export function goalsParam(): UrlParamCodec<Goal[]> {
  return { parse: parseGoals, serialize: serializeGoals, debounceMs: TEXT_DEBOUNCE_MS };
}

export function plannableGoals(goals: readonly Goal[], plannable: ReadonlySet<number>): Goal[] {
  return goals.filter((goal) => plannable.has(goal.typeId));
}

export function seedGoal(goals: Goal[], typeId: number): Goal[] {
  if (goals.some((goal) => goal.typeId === typeId)) return goals;
  return [...goals, { typeId, unitsPerDay: DEFAULT_GOAL_PER_DAY }];
}

export function idListParam(): UrlParamCodec<number[]> {
  return {
    parse: (raw) => {
      if (!raw) return [];
      const ids = new Set<number>();
      for (const part of raw.split(',')) {
        const id = positiveInt(part.trim());
        if (id !== null) ids.add(id);
      }
      return [...ids].sort((a, b) => a - b);
    },
    serialize: (ids) => (ids.length === 0 ? null : idSetKey(ids)),
  };
}
