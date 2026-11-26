import type { NotificationPreferencesValue } from './preferencesStore';

export interface QuietTimePrefs {
  enabled: boolean;
  start: string;
  end: string;
  allowAttacks: boolean;
  timeZone: string;
}

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

export function withQuietTime(
  value: NotificationPreferencesValue,
  patch: Partial<Omit<QuietTimePrefs, 'timeZone'>>,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): NotificationPreferencesValue {
  return { ...value, quietTime: { ...quietTimeView(value), ...patch, timeZone } };
}

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
