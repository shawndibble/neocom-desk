/**
 * What the pilot owes each Payee right now — the Tax tab's "You owe" cards and the Overview's
 * Mining tax card read the same figure from here: each Payee's Running account, oldest day first
 * (`PayeeRunningAccounts`). A Corp Tax Book overlays the personal ledger (`buildDisplayRows`): a row the
 * book says it hasn't credited is owed again (#6219), and ore a book bills is owed to the
 * corporation, not to the member's own Payee too (#6204).
 */
import type { PayeeRecord } from '@/db';
import type { PersonalOverlay } from '@/engine/corpTaxBook/personal';
import i18n from '@/i18n';
import {
  computePayeeBalances,
  summarizeUnassigned,
  type PayeeBalance,
  type UnassignedSummary,
} from './balances';
import { loadBookPrices, loadCorpNames, loadTrackedCorpBooks } from './corpBook/corpBookSources';
import { buildCorpBookView, type CorpBookView } from './corpBook/corpBookView';
import { buildDisplayRows } from './corpBook/corpRows';
import type { DisplayRow } from './groupRows';
import { heldPaymentKeys } from '@/engine/miningTax/payeeRunningAccount';
import { PayeeRunningAccounts, withPaidStatus } from './payeeRunningAccounts';
import { loadMadePaymentsWithStatus } from './madePayments';
import { groupPayees, payeeDuplicateAliases } from './payeeGroups';
import type { MoonMiningTaxSnapshot } from './snapshot';

/** By Assignment id, the share (0–1) of its tax the books' overlay says a Corp Tax Book bills too. */
export function billedElsewhereOf(
  alsoBilled: PersonalOverlay['alsoBilled'] | undefined
): Map<string, number> {
  const out = new Map<string, number>();
  for (const byId of alsoBilled?.values() ?? []) for (const [id, share] of byId) out.set(id, share);
  return out;
}

/** Each Corp Tax Book Payee's credit, by its id: what its Miners' accounts hold over what they bill. */
export function bookCreditsOf(corpView: CorpBookView | null | undefined): Map<string, number> {
  return new Map(corpView?.books.map((b) => [b.payee.id, b.summary.credit]) ?? []);
}

/** Each Corp Tax Book Payee's owed, by its id: the book's account total over the whole Miner. */
export function bookOwesOf(corpView: CorpBookView | null | undefined): Map<string, number> {
  return new Map(
    corpView?.books.map((b) => [b.payee.id, b.summary.account.owes?.amount ?? 0]) ?? []
  );
}

/**
 * Entries still needing a Payee. A row a Corp Tax Book has labelled (Pending corp record,
 * Unattributed) is not waiting on the member, so it stays out.
 */
export function unassignedSummary(
  rows: readonly DisplayRow[],
  estimatedValueOf: (dr: DisplayRow) => number
): UnassignedSummary {
  return summarizeUnassigned(
    rows.filter((dr) => !dr.corp),
    estimatedValueOf
  );
}

export interface OwedNow {
  balances: PayeeBalance[];
  /** `unassignedSummary`'s entry count. */
  unassignedCount: number;
}

/**
 * `computePayeeBalances` (and the Unassigned count) over every tracked Character, loading the Corp Tax Books the Tax tab overlays:
 * the books, their corporations' names and prices, and (only when a book exists) the wallet's
 * payments the book's in-flight donations read. Without a book it is the personal ledger alone.
 */
export async function loadOwedBalances(
  snapshot: Pick<
    MoonMiningTaxSnapshot,
    'rows' | 'characters' | 'payeesByCharacter' | 'paymentLinks' | 'billedElsewhere'
  >,
  now: number = Date.now()
): Promise<OwedNow> {
  const seen = new Map<string, PayeeRecord>();
  for (const list of snapshot.payeesByCharacter.values()) for (const p of list) seen.set(p.id, p);
  const payees = [...seen.values()];
  // Paid read off each Payee's account, the one build the Tax tab reads too.
  const accounts = PayeeRunningAccounts.build({
    assignments: snapshot.rows.flatMap((row) => row.assignments),
    payees,
    links: snapshot.paymentLinks,
    billedElsewhere: snapshot.billedElsewhere,
  });
  const entries = withPaidStatus(snapshot.rows, accounts);
  const characterNames = new Map(snapshot.characters.map((c) => [c.characterId, c.characterName]));

  const books = await loadTrackedCorpBooks();
  const corpView =
    books.length === 0
      ? null
      : await Promise.all([
          loadCorpNames(books),
          loadBookPrices(books),
          loadMadePaymentsWithStatus(snapshot.characters.map((c) => c.characterId)).then(
            (r) => r.payments,
            () => []
          ),
        ]).then(([corpNames, pricesByCorp, made]) =>
          buildCorpBookView(
            {
              rows: entries,
              loaded: books,
              pricesByCorp,
              corpNames,
              payees,
              made,
              linked: heldPaymentKeys(snapshot.paymentLinks),
              characterNames,
              now: new Date(now).toISOString(),
            },
            (corp) => i18n.t('miningTax.corpBook.payeeName', { corp })
          )
        );

  const rows = buildDisplayRows(
    entries,
    corpView?.overlay ?? null,
    (id) => characterNames.get(id) ?? `#${id}`
  );
  return {
    balances: computePayeeBalances(
      rows,
      [...payees, ...(corpView?.payees ?? [])],
      accounts,
      payeeDuplicateAliases(groupPayees(payees)),
      bookCreditsOf(corpView),
      bookOwesOf(corpView)
    ),
    unassignedCount: unassignedSummary(rows, () => 0).entryCount,
  };
}
