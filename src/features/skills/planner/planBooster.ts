/**
 * Helpers for a Character's **Accelerator** (GLOSSARY.md): its bonus range, the
 * quick-pick durations, the days/hours/minutes the editor shows for an expiry
 * instant, and the engine Booster a running one costs a Skill Plan under.
 *
 * EVE has one booster slot, so a Character has at most one accelerator. It is
 * saved once per Character (`features/accelerator`), not on a plan. A plan's
 * stored `booster` / `boosters` fields from older builds are left alone (so
 * dev and prod can share the Firebase project) but no longer read.
 *
 * Expiry is stored as an **instant** (epoch ms), not as the time left the
 * editor shows: a duration alone would mean a different moment on every
 * device the record syncs to. Pure and Dexie-free, so it is unit-testable
 * without a database.
 */
import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { Attributes, Booster } from '@/engine/types';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';

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

/** The bonus "Add accelerator" opens on: the common tier rather than zero. */
export const DEFAULT_ACCELERATOR_BONUS = 3;

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
 * The engine Booster a Character's running accelerator costs a plan under, or
 * none. `accelerator` is one that is still running (the caller checks the
 * clock, which keeps this pure and its result stable between ticks).
 *
 * A detected accelerator with no typed-in expiry contributes nothing: no ESI
 * endpoint exposes a running accelerator's life, only the arithmetic that
 * recovers its size, and inventing an expiry would quote training times
 * nothing supports.
 */
export function acceleratorBoosters(
  accelerator: CharacterAcceleratorInput | null | undefined
): Booster[] {
  if (!accelerator) return [];
  const bonus: Partial<Attributes> = {};
  for (const name of ATTRIBUTE_NAMES) bonus[name] = clampBoosterBonus(accelerator.bonus);
  return [{ bonus, expiresAt: new Date(accelerator.expiresAt) }];
}

/** What a Character is running: the typed-in accelerator (`features/accelerator`). */
export interface CharacterAcceleratorInput {
  bonus: number;
  expiresAt: number;
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
 * Where a row's duration is measured from: its own start, but never before
 * now. A row with no start is already running, so it counts from now; a
 * queued row counts from when the one before it lapses — unless that moment
 * has passed, in which case it is running now too.
 *
 * Takes `now` rather than reading the clock, so the caller's own impurity is
 * the only one on record and this stays unit-testable without faking `Date`.
 */
export function boosterDurationBase(startsAt: number | null, now: number): number {
  return startsAt === null ? now : Math.max(startsAt, now);
}

/**
 * The expiry a quick pick sets: `hours` past the row's duration base.
 */
export function boosterExpiryFromNow(hours: number, startsAt: number | null, now: number): number {
  return boosterDurationBase(startsAt, now) + hours * HOUR_MS;
}

/** Whole days, hours (0-23) and minutes (0-59) — the units EVE's tooltip uses. */
export interface BoosterDuration {
  days: number;
  hours: number;
  minutes: number;
}

/**
 * What the Expires boxes show: the time from the row's duration base to its
 * expiry, rounded **up** to the minute (so a just-set "1 day" does not read
 * back as 23h 59m a heartbeat later). An expiry already past reads as zero.
 */
export function splitBoosterDuration(
  expiresAt: number,
  startsAt: number | null,
  now: number
): BoosterDuration {
  const remaining = Math.max(0, expiresAt - boosterDurationBase(startsAt, now));
  const total = Math.ceil(remaining / MINUTE_MS);
  return {
    days: Math.floor(total / (24 * 60)),
    hours: Math.floor(total / 60) % 24,
    minutes: total % 60,
  };
}

/** The milliseconds a days/hours/minutes triple names. */
export function joinBoosterDuration({ days, hours, minutes }: BoosterDuration): number {
  return days * DAY_MS + hours * HOUR_MS + minutes * MINUTE_MS;
}
