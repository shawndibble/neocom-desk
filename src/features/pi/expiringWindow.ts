/**
 * How long before an extractor program expires the Colonies view starts
 * calling it "expiring soon" (`engine/pi/colonyStatus.ts`).
 *
 * Settable because it decides more than a badge tone: `sortColoniesByAttention`
 * ranks by it, so the window changes which colony a pilot sees first when the
 * page opens. A pilot who can only do a reset run every other evening wants a
 * wider lead than one who logs in nightly.
 *
 * Hours, because that is the unit a reset run is planned in and the one the
 * control can label legibly. Default 24, unchanged from before.
 *
 * **Not the notification cadence.** `engine/notificationDiffs.ts` keeps its own
 * `EXTRACTOR_EXPIRY_WARNING_MS` lead times, and its comment says why: "a
 * notification cadence is not a status colour". This preference governs the
 * Colonies table only.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_EXPIRING_WINDOW_SETTING_KEY = 'piExpiringSoonHours';

/** Lead times a reset run is actually planned around. */
export const EXPIRING_WINDOW_HOUR_OPTIONS: readonly number[] = [12, 24, 48, 72];

export const DEFAULT_EXPIRING_WINDOW_HOURS = 24;

const HOUR_MS = 3_600_000;

export const useExpiringWindowHours = createLocalSetting<number>({
  key: PI_EXPIRING_WINDOW_SETTING_KEY,
  defaultValue: DEFAULT_EXPIRING_WINDOW_HOURS,
  parse: (raw) =>
    typeof raw === 'number' && EXPIRING_WINDOW_HOUR_OPTIONS.includes(raw) ? raw : null,
});

/** The preference in the milliseconds `colonyStatus.ts` measures in. */
export function useExpiringWindowMs(): number {
  return useExpiringWindowHours((state) => state.value) * HOUR_MS;
}
