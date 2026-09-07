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
 * control can label legibly. Default 24, unchanged from before — but note that
 * a pilot running 24-hour programs wants a shorter one, for the reason the
 * option list below spells out.
 *
 * **Not the notification cadence.** `engine/notificationDiffs.ts` keeps its own
 * `EXTRACTOR_EXPIRY_WARNING_MS` lead times, and its comment says why: "a
 * notification cadence is not a status colour". This preference governs the
 * Colonies table only.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_EXPIRING_WINDOW_SETTING_KEY = 'piExpiringSoonHours';

/**
 * Lead times a reset run is actually planned around.
 *
 * **Every option is shorter than a program**, deliberately. A window at or
 * above the program's own length is not merely a wide warning — it breaks two
 * things at once:
 *
 * - `extractorState` flags `expiring-soon` from `expiry - now <= window`, and
 *   at install `expiry - now` *is* the program length. So the badge is lit for
 *   the program's entire life and stops distinguishing anything.
 * - `colonyAttention` tests `expiring-soon` **before** `decayed`, so a
 *   permanently-true window makes `decayed` unreachable — the "you are past
 *   the cadence that would have doubled this planet's throughput" nudge
 *   (`EFFICIENT_WINDOW_FRACTION`) never fires at all.
 *
 * Efficient play runs short programs — `extraction.ts` records that three-day
 * resets yield 2.46x a single 14-day program, and a 14-day program banks 53%
 * of its output in its first three days — so most pilots install well under
 * two days. The 48h and 72h options this list used to carry were at or past
 * that, which is why they are gone rather than merely discouraged.
 *
 * The upper end matches `EXTRACTOR_EXPIRY_WARNING_MS`'s 24h/12h notification
 * lead times: the two are free to diverge, but they are answering the same
 * question about the same programs, and nothing was learned here to justify a
 * different scale.
 */
export const EXPIRING_WINDOW_HOUR_OPTIONS: readonly number[] = [1, 6, 12, 24];

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
