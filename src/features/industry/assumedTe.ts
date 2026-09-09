/**
 * TE a new Build Plan quotes a blueprint at when the character owns no copy of
 * it — the time half of what `assumedMe.ts` answers for materials.
 *
 * Settable for the same reason: without it `newBuildPlan` wrote a hard 0, so
 * every unowned blueprint was quoted as completely unresearched for time. That
 * is wrong by a known amount on the commonest case — an invented BPC with no
 * decryptor is ME2/TE4 — and it moves job time, and therefore ISK/hour and the
 * time a Build Group's rollup leads with. Fit Import (issue #626) made it bite:
 * a T2 fit is mostly items needing an invented BPC, and it already seeded the
 * ME half from the preference beside this one.
 *
 * Range 0..20, not ME's 0..10: TE research goes twice as deep, and
 * `engine/industry/time.ts` throws outside it.
 *
 * Default 0, so an existing plan's numbers do not move until the pilot asks
 * them to. Synced for the same reason assumed ME is: which industrialist the
 * pilot is — one who buys and researches the BPO, or one who prices what they
 * can build today — is a standing assumption about their own play, not a fact
 * about the machine they opened.
 *
 * Scope: this seeds a *plan's own* TE. Sub-jobs below it still quote at TE0
 * (`engine/industry/makeOrBuy.ts`), which assumed ME does reach via
 * `recipes.ts`'s `assumedMeForUnowned` — see the decision file for issue #634
 * for why the asymmetry is deliberate rather than half-finished.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const ASSUMED_TE_SETTING_KEY = 'sync.industryAssumedTe';

// No `legacyKey`, unlike assumed ME: the preference is new and never had a
// device-local life to seed from, the same as `sync.marketPricePercent`.

/** The engine range-checks TE and throws outside 0..20 — twice ME's depth. */
export const MIN_ASSUMED_TE = 0;
export const MAX_ASSUMED_TE = 20;
export const DEFAULT_ASSUMED_TE = 0;

export const useAssumedTe = createSyncedSetting<number>({
  key: ASSUMED_TE_SETTING_KEY,
  defaultValue: DEFAULT_ASSUMED_TE,
  // A stored value out of range would reach the engine and throw, so a bad row
  // falls back to the default rather than being clamped into something the
  // pilot never chose. Clamping belongs to the Settings control, which is
  // where a pilot is actually choosing.
  parse: (raw) =>
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= MIN_ASSUMED_TE &&
    raw <= MAX_ASSUMED_TE
      ? raw
      : null,
});
