/**
 * The officer's own-wallet check of an "I already paid" whose transfer went to one of the
 * officer's Characters, not to the corporation (resolving in the app). The corporation's wallet
 * cannot show it, and the officer's wallet token never leaves the device, so the match is made
 * here, on the journal this device already holds. Pure: the read is `useOwnWalletCheck`.
 */
import type { WalletJournalEntry } from '@/esi/endpoints';
import type { Declaration } from '@/engine/corpTaxBook/overdue';
import { DAY_MS } from '@/lib/age';

type Transfer = NonNullable<Declaration['transfers']>[number];

/** How far apart the member's journal time and the officer's may be. */
export const MATCH_WINDOW_MS = 2 * DAY_MS;
/** ISK the two journals may differ by. */
export const MATCH_TOLERANCE_ISK = 1;
/** An automatically credited claim stays on the queue's line this long. */
export const AUTO_CREDIT_DAYS = 7;

/** The tracked Character a transfer was paid to, when it was paid to one of `ownIds`. */
export function paidToOwn(transfer: Transfer, ownIds: ReadonlySet<number>): number | undefined {
  return transfer.recipient === 'character' &&
    transfer.recipientId !== undefined &&
    ownIds.has(transfer.recipientId)
    ? transfer.recipientId
    : undefined;
}

/**
 * Whether an entry of the officer's own journal is this transfer: an incoming donation of the
 * same amount (±1 ISK) within 48 hours. `senderIds` are the member's Characters; with none known
 * the amount and time alone decide.
 */
export function entryMatchesTransfer(
  entry: WalletJournalEntry,
  transfer: Pick<Transfer, 'amount' | 'at'>,
  senderIds: readonly number[]
): boolean {
  if (entry.ref_type !== 'player_donation') return false;
  if (entry.amount === undefined || entry.amount <= 0) return false;
  if (Math.abs(entry.amount - transfer.amount) > MATCH_TOLERANCE_ISK) return false;
  if (Math.abs(Date.parse(entry.date) - Date.parse(transfer.at)) > MATCH_WINDOW_MS) return false;
  return (
    senderIds.length === 0 ||
    entry.first_party_id === undefined ||
    senderIds.includes(entry.first_party_id)
  );
}

/** The first journal entry that is this transfer (the closest in time when several are). */
export function findOwnEntry(
  journal: readonly WalletJournalEntry[],
  transfer: Pick<Transfer, 'amount' | 'at'>,
  senderIds: readonly number[]
): WalletJournalEntry | undefined {
  const at = Date.parse(transfer.at);
  return journal
    .filter((e) => entryMatchesTransfer(e, transfer, senderIds))
    .sort((a, b) => Math.abs(Date.parse(a.date) - at) - Math.abs(Date.parse(b.date) - at))[0];
}

/** The oldest entry's date: how far back a "not in your wallet" actually looked. */
export function oldestEntryDate(journal: readonly WalletJournalEntry[]): string | undefined {
  return journal.reduce<string | undefined>(
    (oldest, e) => (oldest === undefined || e.date < oldest ? e.date : oldest),
    undefined
  );
}

/** What a read of one Character's own journal came to. */
export type OwnJournal =
  { state: 'ok'; entries: readonly WalletJournalEntry[] } | { state: 'noScope' | 'failed' };

/** Declarations the book confirmed itself (`by` 0) in the last week, newest first. */
export function autoCredited<T extends Pick<Declaration, 'resolution'>>(
  declarations: readonly T[],
  now: number
): T[] {
  return declarations
    .filter(
      (d) =>
        d.resolution?.kind === 'confirmed' &&
        d.resolution.by === 0 &&
        now - Date.parse(d.resolution.at) <= AUTO_CREDIT_DAYS * DAY_MS
    )
    .sort((a, b) => b.resolution!.at.localeCompare(a.resolution!.at));
}
