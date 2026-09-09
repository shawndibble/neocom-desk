/**
 * Which Build Plan each Character had open last, so returning to `/industry`
 * reopens it instead of falling back to whichever plan happens to sort first.
 *
 * Device-local, not Editable Data: it says what this screen was showing, not
 * what the pilot built. Syncing it would let a phone left on one plan drag the
 * desktop off the plan being worked on.
 *
 * Keyed by characterId rather than held as one id, because `plans` is scoped
 * to the active Character — a single id would be overwritten by whichever
 * Character was looked at last, and silently lose every other Character's.
 * A stored id whose plan is gone (deleted here, or deleted on another device
 * and synced away) needs no cleanup: `Industry.tsx` only adopts an id that is
 * still in the Character's own plans.
 */
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createLocalSetting } from '@/lib/useLocalSetting';

/** characterId (as an object key) -> Build Plan id. */
export type LastOpenedPlanValue = Record<number, string>;

export const LAST_OPENED_PLAN_KEY = 'industryLastOpenedPlan';

/** Exported for its test — the store below is the only other caller. */
export function parseLastOpenedPlan(raw: unknown): LastOpenedPlanValue | null {
  return parseCharacterKeyedRecord(raw, (planId) => (typeof planId === 'string' ? planId : null));
}

export const useLastOpenedPlan = createLocalSetting<LastOpenedPlanValue>({
  key: LAST_OPENED_PLAN_KEY,
  defaultValue: {},
  parse: parseLastOpenedPlan,
});

/** The remembered plan for one Character, or null if it has none yet. */
export function lastOpenedPlanFor(value: LastOpenedPlanValue, characterId: number): string | null {
  return value[characterId] ?? null;
}

/** The value with one Character's remembered plan replaced — the others untouched. */
export function withLastOpenedPlan(
  value: LastOpenedPlanValue,
  characterId: number,
  planId: string
): LastOpenedPlanValue {
  return { ...value, [characterId]: planId };
}
