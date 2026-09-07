/**
 * ME a Build Plan quotes a sub-build at when the character owns no copy of its
 * blueprint (`recipes.ts`'s `assumedMeForUnowned`).
 *
 * Settable because the alternative was a hard 0 with no way to say otherwise:
 * a plan's own ME is an editable field, but every recursive sub-build below it
 * was quoted unresearched and nothing on screen said so, which understates
 * profitability at every level. Reasonable industrialists differ here — some
 * assume they will buy the BPO and research it to 10, others price what they
 * can build today.
 *
 * Default 0, so an existing plan's numbers do not move until the pilot asks
 * them to. Device-local: a planning assumption, not Editable Data.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const ASSUMED_ME_SETTING_KEY = 'industryAssumedMe';

/** The engine range-checks ME and throws outside 0..10. */
export const MIN_ASSUMED_ME = 0;
export const MAX_ASSUMED_ME = 10;
export const DEFAULT_ASSUMED_ME = 0;

export const useAssumedMe = createLocalSetting<number>({
  key: ASSUMED_ME_SETTING_KEY,
  defaultValue: DEFAULT_ASSUMED_ME,
  // A stored value out of range would reach the engine and throw, so a bad row
  // falls back to the default rather than being clamped into something the
  // pilot never chose.
  parse: (raw) =>
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= MIN_ASSUMED_ME &&
    raw <= MAX_ASSUMED_ME
      ? raw
      : null,
});
