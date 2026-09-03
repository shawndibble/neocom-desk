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
/**
 * Not the input's floor — that is 1, because a +0 accelerator is not a thing
 * anyone means to enter. This is the floor a *stored or cleared* value lands
 * on, which is why it is private: an emptied field reports `0`, and so can a
 * row written by an older build.
 */
const MIN_BOOSTER_BONUS = 0;

/**
 * What a plan with no stored Booster is costed under: none at all. `bonus`
 * is the common accelerator tier, so ticking the box lands on a sensible
 * figure rather than on zero, and `expiresAt: null` keeps it inert until the
 * user says when it runs out.
 */
export const DEFAULT_PLAN_BOOSTER: PlanBooster = { enabled: false, bonus: 3, expiresAt: null };

/** The shape a `datetime-local` control emits: `YYYY-MM-DDTHH:mm`. */
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * A whole bonus inside the accelerator range.
 *
 * Exported because the input writes through it too: clamping only on the read
 * side would store a `45` the plan is not actually costed under — and would
 * resurrect it the day the cap moves. Same rule as the Remaps Available field
 * beside it, and as the industry panel's runs/ME/TE.
 */
export function clampBoosterBonus(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  if (Number.isNaN(value)) return MIN_BOOSTER_BONUS;
  return Math.min(MAX_BOOSTER_BONUS, Math.max(MIN_BOOSTER_BONUS, Math.round(value)));
}

/**
 * An epoch-ms instant a `Date` can actually name.
 *
 * `Number.isFinite` is not enough: JS instants stop at +/-8.64e15, and a
 * larger number — which a doc from another device can carry — makes an
 * Invalid Date that the scheduler ignores while the header chip still claims
 * a live Booster. Rejecting it here keeps every reader agreeing.
 */
function usableInstant(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Number.isNaN(new Date(raw).getTime()) ? null : raw;
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
    bonus: clampBoosterBonus(record.bonus),
    expiresAt: usableInstant(record.expiresAt),
  };
}

/**
 * The Booster a plan is costed under: the stored answer, or — while it has
 * none — a cerebral accelerator detected in the character's ESI sheet
 * (`engine/attributeBaseline.ts`), prefilled into the control the user
 * already knows.
 *
 * The plan storing NOTHING is what "the user has not answered" means, and it
 * is the whole gate: an answer that happens to read like a default is still
 * an answer. Unticking the box — "that accelerator is gone" — stores
 * `enabled: false`, and this must not prefill over it on the next visit.
 *
 * The expiry is left null on the prefill on purpose: no ESI endpoint exposes
 * a running booster's life, only the arithmetic that recovers its size, and
 * a blank expiry applies nothing at all (see `toBooster`).
 */
export function resolvePlanBooster(
  stored: unknown | undefined,
  detectedAccelerator: number | null
): PlanBooster {
  if (stored !== undefined) return normalizePlanBooster(stored);
  return detectedAccelerator !== null
    ? { enabled: true, bonus: clampBoosterBonus(detectedAccelerator), expiresAt: null }
    : DEFAULT_PLAN_BOOSTER;
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
