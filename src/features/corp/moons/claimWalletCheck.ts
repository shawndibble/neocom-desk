/**
 * The officer's own-wallet check of an "I already paid" whose transfer went to one of the
 * officer's Characters, not to the corporation (resolving in the app). The corporation's wallet
 * cannot show it, and the officer's wallet token never leaves the device, so the match is made
 * here, on the journal this device already holds. Pure: the read is `useOwnWalletCheck`.
 */
import type { WalletJournalEntry } from '@/esi/endpoints';
import type { TFunction } from 'i18next';
import type { PillTone } from '@/components/ui/Pill';
import type { ClaimCheck, ClaimedTransfer, Declaration } from '@/engine/corpTaxBook/overdue';
import { CHECK_TONE } from '@/features/miningTax/corpBook/resolve/checkTone';
import { DAY_MS } from '@/lib/age';
import { matchesStatedTransfer } from '../../../../functions/src/corpTaxBookTransferMatch';
import { shortDate, shortDateTime } from './moonsFormat';

type Transfer = NonNullable<Declaration['transfers']>[number];

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
 * Whether an entry of the officer's own journal is this transfer: an incoming donation the
 * member's stated transfer matches (the shared `matchesStatedTransfer`: under 1 ISK apart, within
 * two days). `senderIds` are the member's Characters; with none known, or an entry naming no
 * sender, the amount and time alone decide.
 */
export function entryMatchesTransfer(
  entry: WalletJournalEntry,
  transfer: Pick<Transfer, 'amount' | 'at'>,
  senderIds: readonly number[]
): boolean {
  if (entry.ref_type !== 'player_donation') return false;
  if (entry.amount === undefined || entry.amount <= 0) return false;
  const sender = entry.first_party_id;
  if (senderIds.length > 0 && sender !== undefined && !senderIds.includes(sender)) return false;
  // The sender is settled above, so the shared rule compares only the amount and the time.
  const characterId = sender ?? 0;
  return matchesStatedTransfer(
    { characterId, amount: transfer.amount, at: transfer.at },
    { characterId, amount: entry.amount, at: entry.date }
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

/** What one claimed transfer's check came to, as the card shows it. */
export interface TransferStatus {
  tone: PillTone;
  label: string;
  /** What the check found about it; the transfer's own amount, time and ref go beside it. */
  note?: string;
  division?: number;
  /** Paid to one of this officer's Characters: the own-wallet check decides, and it is found. */
  own?: { found: boolean };
}

/** What a transfer paid to one of the officer's Characters came to in that Character's journal. */
export function ownStatus(
  t: TFunction,
  tr: ClaimedTransfer,
  journal: OwnJournal | undefined,
  memberCharacterIds: readonly number[]
): TransferStatus {
  if (journal === undefined)
    return { tone: 'neutral', label: t('corpTaxBook.moons.needs.paidToYou.reading') };
  if (journal.state !== 'ok')
    return {
      tone: 'neutral',
      label: t('corpTaxBook.moons.needs.paidToYou.noScope'),
      note: t('corpTaxBook.moons.needs.paidToYou.noScopeBody'),
    };
  const entry = findOwnEntry(journal.entries, tr, memberCharacterIds);
  if (entry)
    return {
      tone: 'success',
      label: t('corpTaxBook.moons.needs.paidToYou.found'),
      note: t('corpTaxBook.moons.needs.paidToYou.foundBody', {
        time: shortDateTime(entry.date),
        ref: entry.id,
      }),
      own: { found: true },
    };
  const oldest = oldestEntryDate(journal.entries);
  return {
    tone: 'danger',
    label: t('corpTaxBook.moons.needs.paidToYou.notFound'),
    note:
      oldest === undefined
        ? undefined
        : t('corpTaxBook.moons.needs.paidToYou.notFoundBody', { date: shortDate(oldest) }),
    own: { found: false },
  };
}

/** What one claimed transfer's check, or its own-wallet check, found. */
export function transferStatus(
  t: TFunction,
  tr: ClaimedTransfer,
  check: ClaimCheck | undefined,
  memberCharacterIds: readonly number[],
  ownIds: ReadonlySet<number>,
  journals: ReadonlyMap<number, OwnJournal>,
  minerName: (minerId: string) => string = (id) => id
): TransferStatus | undefined {
  const own = paidToOwn(tr, ownIds);
  if (own !== undefined) return ownStatus(t, tr, journals.get(own), memberCharacterIds);
  if (!check) return undefined;
  return {
    tone: CHECK_TONE[check.result],
    label:
      check.result === 'division'
        ? t('corpTaxBook.moons.needs.check.division', {
            division: check.division ?? t('corpTaxBook.moons.needs.check.divisionUnknown'),
          })
        : t(`corpTaxBook.moons.needs.check.${check.result}`, {
            miner: check.minerId === undefined ? '' : minerName(check.minerId),
          }),
    note: check.result === 'tooOld' ? t('corpTaxBook.moons.needs.check.tooOldBody') : undefined,
    division: check.result === 'division' ? check.division : undefined,
  };
}
