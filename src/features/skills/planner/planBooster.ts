/**
 * A Skill Plan's **Booster** (CONTEXT.md): the cerebral accelerator the plan
 * is costed under — one uniform attribute bonus, live until an expiry.
 *
 * Persisted on the plan (`SkillPlanRecord.booster`) and synced with it, so
 * the shape has to survive a round trip through Firestore and back into a
 * different device's Dexie. Two consequences shape this module:
 *
 * - The expiry is stored as an **instant** (epoch ms), not as the
 *   `datetime-local` string the control edits. A bare wall-clock string means
 *   a different moment in every timezone, so `boosterExpiryToInput` /
 *   `boosterExpiryFromInput` convert at the edge instead.
 * - Everything read back is normalized rather than trusted, the same way
 *   `markers.ts` normalizes marker positions on every read: a stored value
 *   can come from an older build or a remote doc, and a NaN bonus reaching
 *   `computeSchedule` would report the whole plan as NaN days.
 *
 * Pure and Dexie-free (the `PlanBooster` import is type-only), so it is
 * unit-testable without a database.
 */
import type { PlanBooster } from '@/db';
import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { Attributes, Booster } from '@/engine/types';

/**
 * Accelerator tiers run well past the +9 the editor's input once allowed —
 * the reported case was a +12 — so the cap is generous rather than a claim
 * about what CCP ships.
 */
export const MAX_BOOSTER_BONUS = 30;
export const MIN_BOOSTER_BONUS = 0;

/**
 * What a plan with no stored Booster is costed under: none at all. `bonus`
 * is the common accelerator tier, so ticking the box lands on a sensible
 * figure rather than on zero, and `expiresAt: null` keeps it inert until the
 * user says when it runs out.
 */
export const DEFAULT_PLAN_BOOSTER: PlanBooster = { enabled: false, bonus: 3, expiresAt: null };

/** The shape a `datetime-local` control emits: `YYYY-MM-DDTHH:mm`. */
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function clampBonus(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  if (Number.isNaN(value)) return MIN_BOOSTER_BONUS;
  return Math.min(MAX_BOOSTER_BONUS, Math.max(MIN_BOOSTER_BONUS, Math.round(value)));
}

function usableInstant(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * A usable `PlanBooster` from whatever was stored, falling back to
 * `DEFAULT_PLAN_BOOSTER` when the value is not a booster at all.
 *
 * `undefined` is not an error case but the meaningful one: the plan has never
 * had a Booster configured, which is what lets `PlanEditor` prefill a
 * detected in-game accelerator without ever stomping a user's own answer.
 */
export function normalizePlanBooster(raw: unknown): PlanBooster {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PLAN_BOOSTER;
  const record = raw as Record<string, unknown>;
  if (typeof record.enabled !== 'boolean') return DEFAULT_PLAN_BOOSTER;
  return {
    enabled: record.enabled,
    bonus: clampBonus(record.bonus),
    expiresAt: usableInstant(record.expiresAt),
  };
}

/**
 * The engine-native `Booster` this plan schedules with, or null when it
 * schedules with none.
 *
 * A blank expiry is "null", not "already expired": the user has said an
 * accelerator is running but not until when, and inventing a window would
 * quote training times nothing supports. (An expiry in the *past* is a
 * different thing and stays a real Booster here — `computeSchedule` already
 * ignores a lapsed one, and the editor shows an "expired" hint instead.)
 */
export function toBooster(planBooster: PlanBooster): Booster | null {
  if (!planBooster.enabled || planBooster.expiresAt === null) return null;
  const bonus: Partial<Attributes> = {};
  for (const name of ATTRIBUTE_NAMES) bonus[name] = planBooster.bonus;
  return { bonus, expiresAt: new Date(planBooster.expiresAt) };
}

/** An instant as the local wall-clock string a `datetime-local` input takes. */
export function boosterExpiryToInput(expiresAt: number | null): string {
  if (expiresAt === null) return '';
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The instant a `datetime-local` value names, reading it as local time (which
 * is what the control means by it).
 *
 * Anything that is not exactly that shape reads as "no expiry" — an empty
 * control, but also a half-typed value, which `Date` would otherwise happily
 * parse as something else entirely (`new Date('2026-09')` is a valid UTC
 * instant, and not one the user typed).
 */
export function boosterExpiryFromInput(value: string): number | null {
  if (!DATETIME_LOCAL.test(value)) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}
