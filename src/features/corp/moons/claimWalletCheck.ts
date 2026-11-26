import type { WalletJournalEntry } from '@/esi/endpoints';
import type { TFunction } from 'i18next';
import type { PillTone } from '@/components/ui/Pill';
import type { ClaimCheck, ClaimedTransfer, Declaration } from '@/engine/corpTaxBook/overdue';
import { CHECK_TONE } from '@/features/miningTax/corpBook/resolve/checkTone';
import { DAY_MS } from '@/lib/age';
import { matchesStatedTransfer } from '../../../../functions/src/corpTaxBookTransferMatch';
import { type ClockZone, atDate, shortDateTime } from './moonsFormat';

type Transfer = NonNullable<Declaration['transfers']>[number];

export const AUTO_CREDIT_DAYS = 7;

export function paidToOwn(transfer: Transfer, ownIds: ReadonlySet<number>): number | undefined {
  return transfer.recipient === 'character' &&
    transfer.recipientId !== undefined &&
    ownIds.has(transfer.recipientId)
    ? transfer.recipientId
    : undefined;
}

export function entryMatchesTransfer(
  entry: WalletJournalEntry,
  transfer: Pick<Transfer, 'amount' | 'at'>,
  senderIds: readonly number[]
): boolean {
  if (entry.ref_type !== 'player_donation') return false;
  if (entry.amount === undefined || entry.amount <= 0) return false;
  const sender = entry.first_party_id;
  if (senderIds.length > 0 && sender !== undefined && !senderIds.includes(sender)) return false;
  const characterId = sender ?? 0;
  return matchesStatedTransfer(
    { characterId, amount: transfer.amount, at: transfer.at },
    { characterId, amount: entry.amount, at: entry.date }
  );
}

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

export function oldestEntryDate(journal: readonly WalletJournalEntry[]): string | undefined {
  return journal.reduce<string | undefined>(
    (oldest, e) => (oldest === undefined || e.date < oldest ? e.date : oldest),
    undefined
  );
}

export type OwnJournal =
  { state: 'ok'; entries: readonly WalletJournalEntry[] } | { state: 'noScope' | 'failed' };

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

export interface TransferStatus {
  tone: PillTone;
  label: string;
  note?: string;
  division?: number;
  own?: { found: boolean };
}

export function ownStatus(
  t: TFunction,
  tr: ClaimedTransfer,
  journal: OwnJournal | undefined,
  memberCharacterIds: readonly number[],
  zone: ClockZone
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
        time: shortDateTime(entry.date, zone),
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
        : t('corpTaxBook.moons.needs.paidToYou.notFoundBody', { date: atDate(oldest, zone) }),
    own: { found: false },
  };
}

export function transferStatus(
  t: TFunction,
  tr: ClaimedTransfer,
  check: ClaimCheck | undefined,
  memberCharacterIds: readonly number[],
  ownIds: ReadonlySet<number>,
  journals: ReadonlyMap<number, OwnJournal>,
  zone: ClockZone,
  minerName: (minerId: string) => string = (id) => id
): TransferStatus | undefined {
  const own = paidToOwn(tr, ownIds);
  if (own !== undefined) return ownStatus(t, tr, journals.get(own), memberCharacterIds, zone);
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
