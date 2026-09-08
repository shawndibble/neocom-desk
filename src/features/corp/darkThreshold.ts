/**
 * How long a corp member goes without logging in before the roster calls them
 * dark (`engine/corp/members.ts`'s `memberStanding`).
 *
 * Settable because every corp writes its own inactivity policy — 14, 30, 60
 * and 90 days are all real — and the app asserted its own. That mattered more
 * than a colour: the threshold drives a one-click filter chip with the dark
 * count on it, so a 60-day director's chip filtered to the wrong set and its
 * count was wrong, leaving them to sort and scan by hand on every visit.
 *
 * Presets rather than a free number input: the UI copy reads "Dark (30d)" and
 * a preset keeps that legible. Default 30, unchanged from before.
 *
 * One director, one policy — so it follows them across their devices rather
 * than being re-set on each. Only surfaced on the Settings page for a
 * Character who can actually see the corp section; a pilot with no corp access
 * syncs the key and never sees a control for it, which costs nothing and means
 * the policy is already there the day they are given the role.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { DARK_AFTER_DAYS } from '@/engine/corp/members';

export const DARK_THRESHOLD_SETTING_KEY = 'sync.corpDarkAfterDays';

/** What it was stored under before it synced; its value is adopted once. */
export const LEGACY_DARK_THRESHOLD_SETTING_KEY = 'corpDarkAfterDays';

/** The spans a corp inactivity policy is actually written in. */
export const DARK_AFTER_DAY_OPTIONS: readonly number[] = [14, 30, 60, 90];

/**
 * The most inclusive policy the setting can hold.
 *
 * `/corp`'s loader selects the members it resolves names for at this span
 * rather than at the one in force, because the preference hydrates
 * asynchronously and a name it never asked for prints as `#id` (see
 * `Corp.tsx`). Derived from the option list so a new, looser preset cannot
 * leave that selection behind.
 */
export const LOOSEST_DARK_AFTER_DAYS = Math.min(...DARK_AFTER_DAY_OPTIONS);

export const useDarkThreshold = createSyncedSetting<number>({
  key: DARK_THRESHOLD_SETTING_KEY,
  legacyKey: LEGACY_DARK_THRESHOLD_SETTING_KEY,
  defaultValue: DARK_AFTER_DAYS,
  // Restricted to the presets: a stored value from a future build with a
  // different option list should fall back to the default rather than filter
  // the roster by a span this build's copy cannot name.
  parse: (raw) => (typeof raw === 'number' && DARK_AFTER_DAY_OPTIONS.includes(raw) ? raw : null),
});
