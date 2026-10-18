/**
 * Folds a wallet change into the contract alert that caused it, for one
 * Character's fires in one poll (`engine/walletCause.ts` holds the rule; this
 * is the orchestration around it).
 *
 * Channels are folded independently because a contract event can be on for one
 * and off for the other: a wallet fire is only dropped from a channel that has
 * the contract alert to carry it. The cross-poll case needs proof the contract
 * alert exists, which is its feed row — the journal is cached for an hour and
 * the contract list for five minutes, so the line usually arrives long after
 * the alert, and the row's body is revised to include the ISK. Browser toasts
 * cannot be revised, so they fold only within a poll.
 */
import {
  absorbWalletFires,
  contractCauseOf,
  type ContractCauseEventId,
  type WalletRevision,
} from '@/engine/walletCause';
import { occurrenceKey } from '@/engine/occurrenceKey';
import type { ContractNotificationFire, WalletNotificationFire } from '@/engine/notificationDiffs';
import type { AnyNotificationFire } from './pollDomains';

export type FoldChannel = 'feed' | 'browser';

export interface WalletFoldInput {
  fires: readonly AnyNotificationFire[];
  /** Whether this Character hears about `eventId` on `channel` at all (event pref and channel switch). */
  isEnabled: (channel: FoldChannel, eventId: ContractCauseEventId) => boolean;
  /** Whether the contract alert's feed row for this Occurrence Key exists and is not dismissed. */
  rowExists: (key: string) => Promise<boolean>;
  nowMs: number;
  /** The Character's choice to fold (`walletFoldIntoContract`). Off, wallet fires pass through. */
  foldEnabled: boolean;
  /**
   * Whether a wallet line is an alert in its own right (event on, scope
   * granted). When false the lines were fetched only for a contract alert to
   * count, and any that nothing absorbs are dropped.
   */
  walletStandalone: boolean;
}

export interface WalletFoldResult {
  feedFires: AnyNotificationFire[];
  browserFires: AnyNotificationFire[];
  /** Contract feed rows to rewrite with the ISK their wallet lines moved. */
  revisions: ContractNotificationFire[];
}

function contractKey(
  characterId: number,
  contractId: number,
  eventId: ContractCauseEventId,
  nowMs: number
): string {
  return occurrenceKey({ eventId, characterId, contractId }, nowMs);
}

/** A leftover wallet fire nobody should hear about: under the minimum, or the wallet event is off. */
function isUnheard(fire: AnyNotificationFire, walletStandalone: boolean): boolean {
  return (
    fire.eventId === 'walletBalanceChanged' &&
    (!walletStandalone || (fire as WalletNotificationFire).belowThreshold === true)
  );
}

export async function foldWalletFires(input: WalletFoldInput): Promise<WalletFoldResult> {
  const { fires, nowMs } = input;
  if (!input.foldEnabled) {
    const heard = fires.filter((fire) => !isUnheard(fire, input.walletStandalone));
    return { feedFires: heard, browserFires: heard, revisions: [] };
  }
  // Look each candidate row up once, up front: the fold itself is synchronous.
  const existing = new Set<string>();
  for (const fire of fires) {
    if (fire.eventId !== 'walletBalanceChanged') continue;
    const cause = contractCauseOf(fire as WalletNotificationFire);
    if (cause === null) continue;
    const key = contractKey(fire.characterId, cause.contractId, cause.eventId, nowMs);
    if (!existing.has(key) && (await input.rowExists(key))) existing.add(key);
  }
  const alertExists = (cause: {
    characterId: number;
    contractId: number;
    eventId: ContractCauseEventId;
  }) => existing.has(contractKey(cause.characterId, cause.contractId, cause.eventId, nowMs));

  const feed = absorbWalletFires(fires, (id) => input.isEnabled('feed', id), alertExists);
  // A toast cannot be revised, so the browser only folds within one poll; a line
  // arriving later stays its own toast rather than vanish into a feed row.
  const browser = absorbWalletFires(
    fires,
    (id) => input.isEnabled('browser', id),
    () => false
  );
  return {
    feedFires: feed.fires.filter((fire) => !isUnheard(fire, input.walletStandalone)),
    browserFires: browser.fires.filter((fire) => !isUnheard(fire, input.walletStandalone)),
    revisions: feed.revisions.map((r: WalletRevision): ContractNotificationFire => ({
      eventId: r.eventId,
      characterId: r.characterId,
      contractId: r.contractId,
      walletChangeIsk: r.amountIsk,
    })),
  };
}
