/**
 * The Goal Planner's URL state: `?goals=typeId:perDay,...` and the colonies
 * the pilot switched off (`?off=planetId,...`).
 *
 * The codec reads syntax only — positive whole type ids, finite non-negative
 * rates — because it runs before `pi.json` has loaded. Whether a type is one
 * the planner can plan is the panel's question, answered by `plannableGoals`
 * once the payload is in hand: `planGoals` throws on a P0, so a hand-edited
 * link naming one must be filtered before it gets there, never crash the tab.
 *
 * A zero rate is kept. A goal whose box has just been cleared is still on the
 * list; the solver drops zero-rate goals itself.
 */
import { TEXT_DEBOUNCE_MS, type UrlParamCodec } from '@/lib/urlState';
import type { Goal } from '@/engine/pi/goalTypes';

/** What a goal added from search, or seeded by `?type=`, starts at. */
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

/** Only the goals the planner can plan, in their order. */
export function plannableGoals(goals: readonly Goal[], plannable: ReadonlySet<number>): Goal[] {
  return goals.filter((goal) => plannable.has(goal.typeId));
}

/**
 * The goals with `typeId` added at the default rate — the far end of the
 * Industry "PI Plan" context menu, which links `/plan?type=`. An existing goal
 * for that type is left as the pilot set it.
 */
export function seedGoal(goals: Goal[], typeId: number): Goal[] {
  if (goals.some((goal) => goal.typeId === typeId)) return goals;
  return [...goals, { typeId, unitsPerDay: DEFAULT_GOAL_PER_DAY }];
}

/** A sorted, de-duplicated list of positive ids; empty removes the key. */
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
    serialize: (ids) =>
      ids.length === 0 ? null : [...new Set(ids)].sort((a, b) => a - b).join(','),
  };
}
