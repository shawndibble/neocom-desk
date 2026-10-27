import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import type {
  WalletJournalEntrySnapshot,
  WalletNotificationFire,
  WalletSnapshot,
} from '@/engine/notificationDiffs';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { currentThresholds } from './shared';

/* Wallet --------------------------------------------------------------------- */

/**
 * Strict about `dateMs` for `isMarketOrderEntrySnapshot`'s reason: a baseline
 * written before the field existed fails validation, so `pollerState.ts`
 * reads it as `null`, `diffWalletBalanceChanged` fires nothing without a
 * baseline, and the upgrade costs one quiet poll rather than replaying the
 * journal. `is.finite` rather than `is.number` because an unparseable ESI
 * date yields `NaN`, which is a number and would sort the row nowhere and
 * never trim.
 */
const isWalletJournalEntrySnapshot = shapeGuard<WalletJournalEntrySnapshot>({
  id: is.number,
  amount: is.nullable(is.number),
  thresholdIsk: is.number,
  dateMs: is.finite,
  refType: is.optional(is.string),
  contextId: is.optional(is.number),
  contextIdType: is.optional(is.string),
});

/**
 * `TRaw` is already the engine snapshot shape here, not the ESI type
 * (`structureFuelDomain`'s precedent): the Character's wallet-change
 * threshold is a preference, only readable in `load()`'s async context, so
 * it's baked into each entry there rather than in the synchronous
 * `toSnapshot`.
 */
export const walletDomain = defineDomain<
  WalletJournalEntrySnapshot,
  WalletSnapshot,
  WalletNotificationFire
>({
  source: SNAPSHOT_SOURCES.wallet,
  stateKey: 'notifications.pollerState.wallet',
  entriesKey: 'entries',
  isEntry: isWalletJournalEntrySnapshot,
  load: async (characterId) => {
    const result = await loadWalletJournalWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // A truncated page set could lower the high-water mark diffWalletBalanceChanged
    // tracks, re-firing for entries already reported once the next complete poll
    // sees them again (same reasoning as the contracts truncation guard above).
    if (result.cached.truncated) return null;
    const thresholds = await currentThresholds(characterId);
    return result.cached.data.map((entry) => {
      // An entry ESI dates unparseably falls back to the poll clock rather
      // than poisoning the feed's ordering with NaN.
      const dateMs = Date.parse(entry.date);
      return {
        id: entry.id,
        amount: entry.amount ?? null,
        thresholdIsk: thresholds.walletBalanceChangedThresholdIsk,
        dateMs: Number.isFinite(dateMs) ? dateMs : Date.now(),
        // Absent stays absent (not `undefined` keys): the stored baseline round-trips as it was.
        ...(entry.ref_type ? { refType: entry.ref_type } : {}),
        ...(entry.context_id !== undefined ? { contextId: entry.context_id } : {}),
        ...(entry.context_id_type ? { contextIdType: entry.context_id_type } : {}),
      };
    });
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});
