/**
 * Quiet time (issue #4566): a device's daily window with no pushes from the
 * closed app. Device-local, never synced — it describes where this phone
 * sleeps. The server enforces it (`functions/src/quietHours.ts`): iOS revokes
 * a push subscription that shows nothing, so the device cannot swallow a push.
 *
 * Pure: no fetch/DOM/Dexie. The window is read in 24h local time; the IANA
 * zone is captured each time the user saves, so the window follows the
 * pilot's clock and DST rather than UTC.
 */
import type { NotificationPreferencesValue } from './preferencesStore';

export interface QuietTimePrefs {
  enabled: boolean;
  /** `HH:MM`, 24h. */
  start: string;
  end: string;
  /** Attack and loss alerts are still pushed inside the window. */
  allowAttacks: boolean;
  /** IANA zone captured when last saved. */
  timeZone: string;
}

/** What the `registerDevice` callable receives; mirrors `functions/src/quietHours.ts`'s `QuietHours`. */
export interface QuietHoursPayload {
  start: string;
  end: string;
  timeZone: string;
  allowAttacks: boolean;
}

export const DEFAULT_QUIET_START = '22:00';
export const DEFAULT_QUIET_END = '07:00';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isQuietTimePrefs(raw: unknown): raw is QuietTimePrefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.enabled === 'boolean' &&
    typeof r.start === 'string' &&
    typeof r.end === 'string' &&
    typeof r.allowAttacks === 'boolean' &&
    typeof r.timeZone === 'string'
  );
}

/** The editable fields, defaulted: off, 22:00 to 07:00, attacks blocked. */
export function quietTimeView(
  value: NotificationPreferencesValue
): Omit<QuietTimePrefs, 'timeZone'> {
  return {
    enabled: value.quietTime?.enabled ?? false,
    start: value.quietTime?.start ?? DEFAULT_QUIET_START,
    end: value.quietTime?.end ?? DEFAULT_QUIET_END,
    allowAttacks: value.quietTime?.allowAttacks ?? false,
  };
}

/** Applies an edit and re-captures the zone, so a saved window always carries the zone it was set in. */
export function withQuietTime(
  value: NotificationPreferencesValue,
  patch: Partial<Omit<QuietTimePrefs, 'timeZone'>>,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): NotificationPreferencesValue {
  return { ...value, quietTime: { ...quietTimeView(value), ...patch, timeZone } };
}

/**
 * The window to upload, or `null` for none: off, a half-typed or equal
 * start and end (a window of no length). `null` is sent, not omitted, so a
 * window turned off here is cleared on the server.
 */
export function quietHoursPayload(value: NotificationPreferencesValue): QuietHoursPayload | null {
  const quiet = value.quietTime;
  if (!quiet?.enabled) return null;
  if (!TIME_PATTERN.test(quiet.start) || !TIME_PATTERN.test(quiet.end)) return null;
  if (quiet.start === quiet.end || quiet.timeZone === '') return null;
  return {
    start: quiet.start,
    end: quiet.end,
    timeZone: quiet.timeZone,
    allowAttacks: quiet.allowAttacks,
  };
}
