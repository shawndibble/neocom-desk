/**
 * Silently links recorded Settle-up payments to their wallet-journal entries from the journal's
 * side, so a tax payment's link doesn't wait for the pilot to open Moon Mining Tax
 * (`useLinkSuggestions` does the same match there): one to one, to the recorded payment's
 * recipient, or nothing (`autoMatchRecorded`).
 *
 * Gated on the recorded-but-unlinked payments, which are few and live in Dexie: with none, the
 * journal is never scanned.
 */
import { db } from '@/db';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { paymentLinkKey, heldPaymentKeys } from '@/engine/miningTax/payeeAccount';
import { linkPayment } from './ledgerActions';
import { fromJournal } from './madePayments';
import { linkOf } from './payeeAccounts';
import { autoMatchRecorded, linkFor } from './paymentLinks';
import { loadPayeeAccounts, loadPaymentLinks } from './paymentLinkStore';

export interface CharacterJournal {
  characterId: number;
  entries: readonly WalletJournalEntry[];
}

export async function autoLinkRecordedPaymentsFromJournals(
  journals: readonly CharacterJournal[],
  /** The corporations of the member's Corp Tax Books: a donation to one is the book's. */
  bookCorporations: ReadonlySet<number> = new Set()
): Promise<void> {
  if (journals.every((j) => j.entries.length === 0)) return;
  const links = (await loadPaymentLinks()).map(linkOf);
  if (!links.some((l) => l.kind === 'recorded')) return;
  const [payees, accounts] = await Promise.all([db.payees.toArray(), loadPayeeAccounts()]);
  const matches = autoMatchRecorded(
    journals.flatMap((j) => fromJournal(j.entries, j.characterId)),
    links,
    {
      payees: accounts.linkable(payees),
      linked: heldPaymentKeys(links),
      bookCorporations,
    }
  );
  await Promise.all(
    matches.map(({ link, payment }) => {
      linkPayment(
        linkFor(payment, link.payeeId, 'auto'),
        payment.characterId,
        paymentLinkKey(link)
      );
    })
  );
}
