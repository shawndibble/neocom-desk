/**
 * Which Skill Plan the Calendar projects, and the read that costs it.
 *
 * One plan per Character — in game a Character trains one queue, so only one
 * plan is live at a time — and choosing another replaces the last. Device-local
 * rather than synced: it is a view preference for one page, not something a
 * plan's numbers depend on, and a synced key would need an allow-list entry
 * for a value that is cheap to pick again.
 *
 * The three answers the board must keep apart come out of `loadSkillPlanBoard`:
 * no plan chosen (or the chosen one is gone), a plan that costs out (possibly
 * with nothing left to train), and a plan the scheduler could not cost.
 */
import { db } from '@/db';
import type { SkillPlanSchedule } from '@/engine/skillPlanSchedule';
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { loadPlanScheduleInputs, schedulePlan } from '@/features/skills/planner/planSchedule';

export const CALENDAR_SKILL_PLAN_KEY = 'calendarSkillPlanByCharacter';

export type CalendarSkillPlanValue = Record<number, string>;

export function parseCalendarSkillPlans(raw: unknown): CalendarSkillPlanValue | null {
  return parseCharacterKeyedRecord<string>(raw, (value) =>
    typeof value === 'string' && value !== '' ? value : null
  );
}

/** The value with one Character's plan set; null clears it. */
export function withCalendarSkillPlan(
  value: CalendarSkillPlanValue,
  characterId: number,
  planId: string | null
): CalendarSkillPlanValue {
  const next = { ...value };
  if (planId === null) delete next[characterId];
  else next[characterId] = planId;
  return next;
}

export const useCalendarSkillPlans = createLocalSetting<CalendarSkillPlanValue>({
  key: CALENDAR_SKILL_PLAN_KEY,
  defaultValue: {},
  parse: parseCalendarSkillPlans,
});

export interface SkillPlanChoice {
  id: string;
  name: string;
}

export type SkillPlanOutcome =
  /** No plan chosen, or the chosen one no longer exists for this Character. */
  | { status: 'none' }
  /** Costed. `schedule.scheduled` may be empty: nothing left to train. */
  | { status: 'ready'; schedule: SkillPlanSchedule }
  /** The scheduler (or a read it needs) could not produce a schedule. */
  | { status: 'error'; reason: string };

export interface SkillPlanBoard {
  /** Every plan this Character has, for the picker. */
  choices: SkillPlanChoice[];
  /** The plan the outcome is for, or null when none is chosen. */
  chosenId: string | null;
  outcome: SkillPlanOutcome;
}

export async function loadSkillPlanBoard(
  characterId: number,
  nowMs: number
): Promise<SkillPlanBoard> {
  const [plans, setting] = await Promise.all([
    db.skillPlans.where('characterId').equals(characterId).toArray(),
    db.settings.get(CALENDAR_SKILL_PLAN_KEY),
  ]);
  const choices = plans.map((plan) => ({ id: plan.id, name: plan.name }));
  const storedId = parseCalendarSkillPlans(setting?.value)?.[characterId];
  const plan = plans.find((candidate) => candidate.id === storedId);
  if (!plan) return { choices, chosenId: null, outcome: { status: 'none' } };

  try {
    const inputs = await loadPlanScheduleInputs(characterId, nowMs);
    const schedule = schedulePlan(plan, inputs, nowMs);
    if (schedule.error !== null) {
      return { choices, chosenId: plan.id, outcome: { status: 'error', reason: schedule.error } };
    }
    return { choices, chosenId: plan.id, outcome: { status: 'ready', schedule } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { choices, chosenId: plan.id, outcome: { status: 'error', reason } };
  }
}
