/**
 * Which clock timestamps render on: the viewer's own, or EVE's (UTC).
 *
 * The app disagreed with itself and gave the pilot no way to settle it.
 * `timestamp.ts` renders the viewer's local zone across a dozen surfaces,
 * while `eveTime.ts` exists because "a job's end shown in the viewer's own
 * zone would be the one number on the page they cannot read back to the game
 * client" — an argument that is not specific to industry jobs. Every timer in
 * EVE is quoted in UTC by other players, killboards and the client itself.
 *
 * Default `'local'`, which is what every `formatTimestamp` surface already
 * did, so nothing moves until the pilot asks it to.
 *
 * Two deliberate exclusions, recorded as a scope decision
 * (`docs/context/decisions/`):
 *
 * - **The Calendar grids.** `lib/calendarGrid.ts` buckets events into
 *   *local-day* cells. Switching only the rendered string would put a
 *   23:00-local event in today's cell labelled with tomorrow's UTC hour.
 *   Converting those needs the bucketing to move too — a follow-up, not a
 *   silent half-conversion.
 * - **Industry's Active Jobs "Ends" column.** It stays on `formatEveDateTime`
 *   unconditionally. That column's whole purpose is reading back to the game
 *   client, and making it follow a preference defaulting to `'local'` would
 *   change today's behaviour rather than preserve it.
 */
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

/**
 * The IANA zone to hand `Intl`, or `undefined` for the host's own.
 *
 * `undefined` rather than a resolved local zone name on purpose: omitting
 * `timeZone` lets `Intl` re-resolve the host zone per call, which
 * `timestamp.ts` documents as load-bearing for tests that toggle
 * `process.env.TZ` mid-run.
 */
export function timeZoneFor(format: TimeFormat): 'UTC' | undefined {
  return format === 'eve' ? 'UTC' : undefined;
}

/** Subscribes to the preference and yields the zone `timestamp.ts` takes. */
export function useTimeZone(): 'UTC' | undefined {
  return timeZoneFor(useTimeFormat((state) => state.value));
}
