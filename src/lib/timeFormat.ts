import { db } from '@/db';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const TIME_FORMAT_SETTING_KEY = 'timeFormat';

export type TimeFormat = 'local' | 'eve';

export const TIME_FORMATS: readonly TimeFormat[] = ['local', 'eve'];

export const DEFAULT_TIME_FORMAT: TimeFormat = 'local';

function isTimeFormat(raw: unknown): raw is TimeFormat {
  return raw === 'local' || raw === 'eve';
}

export const useTimeFormat = createLocalSetting<TimeFormat>({
  key: TIME_FORMAT_SETTING_KEY,
  defaultValue: DEFAULT_TIME_FORMAT,
  parse: (raw) => (isTimeFormat(raw) ? raw : null),
});

export function timeZoneFor(format: TimeFormat): 'UTC' | undefined {
  return format === 'eve' ? 'UTC' : undefined;
}

export async function readTimeZone(): Promise<'UTC' | undefined> {
  try {
    const row = await db.settings.get(TIME_FORMAT_SETTING_KEY);
    return timeZoneFor(isTimeFormat(row?.value) ? row.value : DEFAULT_TIME_FORMAT);
  } catch {
    return undefined;
  }
}

export function useTimeZone(): 'UTC' | undefined {
  return timeZoneFor(useTimeFormat((state) => state.value));
}
