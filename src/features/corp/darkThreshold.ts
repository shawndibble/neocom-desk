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
 * Device-local — one director, one policy — and only surfaced on the Settings
 * page for a Character who can actually see the corp section.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { DARK_AFTER_DAYS } from '@/engine/corp/members';

export const DARK_THRESHOLD_SETTING_KEY = 'corpDarkAfterDays';

/** The spans a corp inactivity policy is actually written in. */
export const DARK_AFTER_DAY_OPTIONS: readonly number[] = [14, 30, 60, 90];

export const useDarkThreshold = createLocalSetting<number>({
  key: DARK_THRESHOLD_SETTING_KEY,
  defaultValue: DARK_AFTER_DAYS,
  // Restricted to the presets: a stored value from a future build with a
  // different option list should fall back to the default rather than filter
  // the roster by a span this build's copy cannot name.
  parse: (raw) => (typeof raw === 'number' && DARK_AFTER_DAY_OPTIONS.includes(raw) ? raw : null),
});
