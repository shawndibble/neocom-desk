/**
 * The two preferences behind SP Extraction monitoring (grilling session,
 * 2026-09-09): whether it's on at all, and the threshold that decides
 * "ready" (`engine/spExtraction.ts`'s `isSpExtractionReady`).
 *
 * Opt-in and off by default: nobody who hasn't turned this on should get an
 * alert or a column for it, and the poller must not fetch skills data for
 * this reason alone when it's off (`pollDomains.ts`'s `spExtractionDomain`
 * checks the enabled flag inside its own `load`).
 *
 * Both synced, not device-local: "alert me at 500k spare SP" and "yes, do
 * that" are facts about the pilot's own judgement call, not about whichever
 * screen happens to be open when the threshold is crossed — a pilot who sets
 * this on a laptop and never sees the alert because their phone still has it
 * off would reasonably call that a bug. Same "set to another value, never
 * unset" shape the five Defaults-panel preferences already carry
 * (`sync/syncedSettings.ts`), so the tombstone-expiry edge documented there
 * doesn't bite either key. No `legacyKey` for either: both are new, with no
 * device-local life to seed from.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { SP_EXTRACTION_CHUNK_SP } from '@/engine/spExtraction';

export const SP_EXTRACTION_ENABLED_KEY = 'sync.spExtractionMonitoringEnabled';
export const SP_EXTRACTION_THRESHOLD_KEY = 'sync.spExtractionThresholdSp';

export const DEFAULT_SP_EXTRACTION_THRESHOLD_SP = SP_EXTRACTION_CHUNK_SP;

export const useSpExtractionMonitoringEnabled = createSyncedSetting<boolean>({
  key: SP_EXTRACTION_ENABLED_KEY,
  defaultValue: false,
});

export const useSpExtractionThresholdSp = createSyncedSetting<number>({
  key: SP_EXTRACTION_THRESHOLD_KEY,
  defaultValue: DEFAULT_SP_EXTRACTION_THRESHOLD_SP,
  // A non-finite or non-positive stored value can't have come from the
  // control in Settings.tsx (a plain positive-number input) — treat it as damaged
  // rather than let a poisoned row (bad sync payload, manual Dexie edit)
  // reach isSpExtractionReady as a threshold of 0 or NaN.
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null),
});
