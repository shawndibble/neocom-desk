/**
 * Device-local: how often the pilot comes back to their colonies.
 *
 * ## Two habits, not one
 *
 * Restarting an extractor program and hauling a planet empty are different
 * acts with different consequences, and a pilot does them on different
 * rhythms. Restarting resets CCP's decay curve, so the restart cadence sets
 * how much comes out of the ground at all. Hauling empties the Launchpad, so
 * the haul cadence sets how much storage a colony needs before extraction
 * stalls — a full Launchpad stops the extractors dead, whatever the curve was
 * about to give.
 *
 * They are therefore two fields with no ordering constraint between them. A
 * pilot who logs in daily but only moves freight at the weekend is running a
 * 1-day restart against a 7-day haul, and both halves of that are true at
 * once.
 *
 * ## Why it is asked rather than derived
 *
 * No ESI field answers "how often do you log in", which is exactly why
 * `stopTierModel.ts` used to hardcode `ADVISOR_BUFFER_HOURS = 24` — a
 * reasonable constant standing in for an unanswerable question. The constant
 * was invisible and unchangeable, so a pilot stepping away for a week read a
 * whole tab of figures computed for somebody else's week. This is the same
 * class of value as `planControlsPref`'s hub: a standing fact about the
 * pilot, not about what they happen to be pricing.
 *
 * ## One key, not two
 *
 * Read and written together by one control group, and every figure on the
 * Advisor tab is derived from the pair — so a half-restored record (the
 * pilot's haul window against a default restart) would misprice the page with
 * no visible edit to explain it. One record, rejected as a whole, exactly as
 * `planControlsPref` and `market/locationMode.ts` do.
 *
 * The engine never reads any of this. `engine/pi/stopTier.ts` and
 * `engine/pi/pinBudget.ts` take `bufferHours` as a parameter and must keep
 * doing so; this module is the feature-layer half that answers it.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_CADENCE_KEY = 'piCadence';

/**
 * The cadences offered, in days.
 *
 * Not an arbitrary number box. The in-game extractor program is itself shaped
 * around these spans — its cycle time steps at roughly 1d1h, 2d2h, 4d4h and
 * 8d8h — and the decay curve is shallow enough within a step that a pilot
 * choosing 5 days over 7 is expressing a precision the yield does not reward.
 * A fixed set also keeps the control a row of chips rather than a text field
 * that has to be validated as the pilot types.
 */
export const PI_CADENCE_DAYS = [1, 2, 3, 7, 14] as const;

export type PiCadenceDays = (typeof PI_CADENCE_DAYS)[number];

export interface PiCadence {
  /** How often the pilot reinstalls extractor programs. Sets the yield. */
  restartDays: PiCadenceDays;
  /** How often the pilot empties the planet. Sets the storage it needs. */
  haulDays: PiCadenceDays;
}

/**
 * A day on both axes.
 *
 * This is what `ADVISOR_BUFFER_HOURS` hardcoded, so a pilot who never opens
 * the control sees the figures the tab showed before this preference existed.
 * It is also the conservative direction on the haul axis: a short window
 * never reports a colony as comfortable when a longer one would have shown it
 * filling up, and over-reporting headroom is the one error the Advisor must
 * not make.
 */
export const DEFAULT_PI_CADENCE: PiCadence = { restartDays: 1, haulDays: 1 };

const HOURS_PER_DAY = 24;

export interface CadenceHours {
  restartHours: number;
  haulHours: number;
}

/** The pair in the unit `checkThroughput` and the extraction curve both speak. */
export function cadenceHours(cadence: PiCadence): CadenceHours {
  return {
    restartHours: cadence.restartDays * HOURS_PER_DAY,
    haulHours: cadence.haulDays * HOURS_PER_DAY,
  };
}

function isOfferedDays(value: unknown): value is PiCadenceDays {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (PI_CADENCE_DAYS as readonly number[]).includes(value)
  );
}

export function parsePiCadence(raw: unknown): PiCadence | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { restartDays, haulDays } = raw as Partial<PiCadence>;
  // Both, or neither. See the header: half a cadence misprices the page
  // without showing the pilot anything that would explain it.
  if (!isOfferedDays(restartDays) || !isOfferedDays(haulDays)) return null;
  return { restartDays, haulDays };
}

export const useCadence = createLocalSetting<PiCadence>({
  key: PI_CADENCE_KEY,
  defaultValue: DEFAULT_PI_CADENCE,
  parse: parsePiCadence,
});
