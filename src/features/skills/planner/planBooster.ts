/**
 * A Skill Plan's **Boosters** (CONTEXT.md): the cerebral accelerators the plan
 * is costed under — an ordered list, each a uniform attribute bonus live from
 * an optional start until an expiry. EVE has one booster slot, so at most one
 * is ever actually live; a second accelerator is something a pilot plans to
 * run *later*, once the first lapses, not at the same time.
 *
 * Persisted on the plan (`SkillPlanRecord.boosters`, with `booster` kept as a
 * one-release legacy mirror of the first entry — see `planSync.ts`) and
 * synced with it, so the shape has to survive a round trip through Firestore
 * and back into a different device's Dexie. Two consequences shape this
 * module:
 *
 * - `startsAt`/`expiresAt` are stored as **instants** (epoch ms), not as the
 *   `datetime-local` strings the controls edit. A bare wall-clock string means
 *   a different moment in every timezone, so `boosterExpiryToInput` /
 *   `boosterExpiryFromInput` convert at the edge instead — for both fields,
 *   despite the "expiry" name, since the round trip is identical for either.
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
 * What a plan with no Boosters at all is costed under. `bonus` is the common
 * accelerator tier, so ticking "add accelerator" lands on a sensible figure
 * rather than on zero, and both instants stay null (already-running-with-no-
 * known-expiry is the state the row opens in) until the user says otherwise.
 */
export const DEFAULT_PLAN_BOOSTER: PlanBooster = {
  enabled: false,
  bonus: 3,
  startsAt: null,
  expiresAt: null,
};

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
 * A usable single `PlanBooster` row from whatever was stored, falling back to
 * `DEFAULT_PLAN_BOOSTER` when the value is not a booster row at all.
 */
export function normalizePlanBoosterRow(raw: unknown): PlanBooster {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PLAN_BOOSTER;
  const record = raw as Record<string, unknown>;
  if (typeof record.enabled !== 'boolean') return DEFAULT_PLAN_BOOSTER;
  return {
    enabled: record.enabled,
    bonus: clampBoosterBonus(record.bonus),
    startsAt: usableInstant(record.startsAt),
    expiresAt: usableInstant(record.expiresAt),
  };
}

/** Ascending by start; `startsAt: null` ("already running") sorts first. */
function sortByStart(boosters: readonly PlanBooster[]): PlanBooster[] {
  return [...boosters].sort((a, b) => (a.startsAt ?? -Infinity) - (b.startsAt ?? -Infinity));
}

/**
 * Clamp overlapping rows so at most one Booster is ever live at once, the way
 * EVE's single booster slot forces it to be. Rows are sorted by start, and
 * each one's start is pulled forward to the previous (enabled, expiring) row's
 * expiry if it would otherwise begin before that row lapses — "one after
 * another" is the model, so a later accelerator simply waits its turn. A row
 * entirely swallowed by an earlier one is left with a start at or past its own
 * expiry, which `toBoosters` then reads as contributing nothing.
 *
 * A disabled row, or one with no expiry yet, is inert: it neither clamps a
 * neighbour nor is clamped against one, since it applies no bonus for
 * `toBoosters` to protect the schedule from.
 */
export function clampBoosterOverlaps(boosters: readonly PlanBooster[]): PlanBooster[] {
  const sorted = sortByStart(boosters);
  // null until the first enabled, expiring row sets it — so that row (even
  // one with startsAt: null, "already running") is never clamped against a
  // frontier that does not exist yet.
  let inForceUntil: number | null = null;
  return sorted.map((row) => {
    if (!row.enabled || row.expiresAt === null) return row;
    const startsAt =
      inForceUntil !== null && (row.startsAt === null || row.startsAt < inForceUntil)
        ? inForceUntil
        : row.startsAt;
    inForceUntil = inForceUntil === null ? row.expiresAt : Math.max(inForceUntil, row.expiresAt);
    return startsAt === row.startsAt ? row : { ...row, startsAt };
  });
}

/**
 * True when two enabled, expiry-bearing rows in `boosters` would overlap —
 * the state the editor blocks a user from saving (`clampBoosterOverlaps`
 * exists for reading a value that reached this shape anyway, e.g. synced from
 * an older build).
 */
export function hasOverlappingBoosters(boosters: readonly PlanBooster[]): boolean {
  const windows = sortByStart(boosters)
    .filter((b) => b.enabled && b.expiresAt !== null)
    .map((b) => ({ start: b.startsAt ?? -Infinity, end: b.expiresAt as number }));
  for (let i = 1; i < windows.length; i++) {
    if (windows[i].start < windows[i - 1].end) return true;
  }
  return false;
}

/**
 * The Boosters list a plan stores, normalized: reads the current `boosters`
 * list when present, otherwise wraps a legacy single `booster` into a
 * one-element list, then clamps whatever the result overlaps.
 *
 * `raw` and `legacy` are the plan's two stored fields as-is (`undefined` when
 * absent) — the presence check belongs to the caller (`resolvePlanBoosters`),
 * since only it knows whether "nothing stored" should prefill.
 */
export function normalizePlanBoosters(raw: unknown, legacy?: unknown): PlanBooster[] {
  if (Array.isArray(raw)) return clampBoosterOverlaps(raw.map(normalizePlanBoosterRow));
  if (legacy !== undefined) return clampBoosterOverlaps([normalizePlanBoosterRow(legacy)]);
  return [];
}

/**
 * The Boosters a plan is costed under: the stored answer, or — while it has
 * none — a cerebral accelerator detected in the character's ESI sheet
 * (`engine/attributeBaseline.ts`), prefilled into a single row the user
 * already knows.
 *
 * The plan storing NOTHING in *either* field is what "the user has not
 * answered" means, and it is the whole gate: an answer that happens to read
 * like a default (including an explicitly empty `boosters: []`) is still an
 * answer. Unticking every row's box — "those accelerators are gone" — must
 * not prefill back over it on the next visit.
 *
 * The prefilled row's expiry is left null on purpose: no ESI endpoint exposes
 * a running booster's life, only the arithmetic that recovers its size, and a
 * blank expiry applies nothing at all (see `toBoosters`).
 */
export function resolvePlanBoosters(
  storedBoosters: unknown | undefined,
  storedLegacyBooster: unknown | undefined,
  detectedAccelerator: number | null
): PlanBooster[] {
  if (storedBoosters !== undefined || storedLegacyBooster !== undefined) {
    return normalizePlanBoosters(storedBoosters, storedLegacyBooster);
  }
  return detectedAccelerator !== null
    ? [
        {
          enabled: true,
          bonus: clampBoosterBonus(detectedAccelerator),
          startsAt: null,
          expiresAt: null,
        },
      ]
    : [];
}

/**
 * The engine-native Boosters this plan schedules with: one per row that is
 * enabled, has an expiry, and (after overlap-clamping) still starts before
 * that expiry — a row fully swallowed by an earlier one contributes nothing.
 *
 * A blank expiry reads as "no window at all", not "already expired": the user
 * has said an accelerator is running but not until when, and inventing one
 * would quote training times nothing supports. (An expiry in the *past* is a
 * different thing and stays a real Booster here — `computeSchedule` already
 * ignores a lapsed one, and the editor shows an "expired" hint instead.)
 */
export function toBoosters(planBoosters: readonly PlanBooster[]): Booster[] {
  const boosters: Booster[] = [];
  for (const row of clampBoosterOverlaps(planBoosters)) {
    if (!row.enabled || row.expiresAt === null) continue;
    if (row.startsAt !== null && row.startsAt >= row.expiresAt) continue;
    const bonus: Partial<Attributes> = {};
    for (const name of ATTRIBUTE_NAMES) bonus[name] = row.bonus;
    const booster: Booster = { bonus, expiresAt: new Date(row.expiresAt) };
    if (row.startsAt !== null) booster.startsAt = new Date(row.startsAt);
    boosters.push(booster);
  }
  return boosters;
}

/** One quick-pick option: an accelerator duration, named in hours. */
export interface BoosterQuickPick {
  readonly hours: number;
}

/**
 * Common cerebral-accelerator durations, ascending. Not sourced from ESI —
 * nothing in the API exposes a duration list — so this is a curated set
 * spanning the tiers players actually run, from the short combat/PI boosts up
 * through the 30-day skill accelerators.
 */
export const BOOSTER_QUICK_PICKS: readonly BoosterQuickPick[] = [
  { hours: 1 },
  { hours: 4 },
  { hours: 12 },
  { hours: 24 },
  { hours: 24 * 3 },
  { hours: 24 * 7 },
  { hours: 24 * 30 },
];

/**
 * The expiry a quick pick sets: `from` plus the picked duration. `from`
 * defaults to now, but a row with its own future `startsAt` passes that
 * instead — a quick pick measured from "now" on a row that has not started
 * yet would set an expiry before its own start.
 *
 * Takes `now`/`from` as a parameter rather than reading the clock itself so
 * the caller's own impurity is the only one on record (see `boosterExpired`
 * in `PlanEditor`, which does the same for the same reason) and so this stays
 * unit-testable without faking `Date`.
 */
export function boosterExpiryFromNow(hours: number, from: number = Date.now()): number {
  return from + hours * 60 * 60 * 1000;
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
