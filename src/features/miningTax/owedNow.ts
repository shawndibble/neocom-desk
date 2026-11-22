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
  type BookOwedDays,
  type PayeeBalance,
  type UnassignedSummary,
} from './balances';
import { loadBookPrices, loadCorpNames, loadTrackedCorpBooks } from './corpBook/corpBookSources';
import { buildCorpBookView, type CorpBookView } from './corpBook/corpBookView';
import { buildDisplayRows } from './corpBook/corpRows';
import type { DisplayRow } from './groupRows';
import { heldPaymentKeys } from '@/engine/miningTax/payeeRunningAccount';
import { bookOwnedPayeeIds } from '@/engine/miningTax/payeeCorporation';
import { PayeeRunningAccounts, withPaidStatus } from './payeeRunningAccounts';
import { loadMadePaymentsWithStatus } from './madePayments';
import { groupPayees, payeeDuplicateAliases } from './payeeGroups';
import type { MoonMiningTaxSnapshot } from './snapshot';

/**
 * By Assignment id, the share (0–1) of its tax the Payee is not owed because a Corp Tax Book bills
 * it: what a book took whole (`absorbed`: the book's row stands for it), what a book took part of
 * (`trimmed`: the Payee keeps `valueShare`), and what another Payee's book bills too
 * (`alsoBilled`, a share of what stays after that trim). A Conflict day is held back the same way
 * (`conflicted`): the corporation's row is its one bill until the pilot resolves it.
 */
export function billedElsewhereOf(
  overlay:
    | (Pick<PersonalOverlay, 'alsoBilled' | 'trimmed' | 'absorbed'> &
        Partial<Pick<PersonalOverlay, 'conflicted'>>)
    | undefined
): Map<string, number> {
  const kept = new Map<string, number>();
  for (const ids of overlay?.absorbed.values() ?? []) for (const id of ids) kept.set(id, 0);
  for (const byId of overlay?.trimmed.values() ?? [])
    for (const [id, { valueShare }] of byId) kept.set(id, Math.min(1, Math.max(0, valueShare)));
  const also = new Map<string, number>();
  for (const byId of overlay?.alsoBilled.values() ?? [])
    for (const [id, share] of byId) also.set(id, share);
  const waiting = new Map<string, number>();
  for (const byId of overlay?.conflicted?.values() ?? [])
    for (const [id, share] of byId) waiting.set(id, share);
  const out = new Map<string, number>();
  for (const id of new Set([...kept.keys(), ...also.keys(), ...waiting.keys()]))
    out.set(id, 1 - (kept.get(id) ?? 1) * (1 - (also.get(id) ?? 0)) * (1 - (waiting.get(id) ?? 0)));
  return out;
}

/**
 * The Payee records a Corp Tax Book the pilot is in is the authority for, each with that
 * corporation's name: the ones verified as its corporation (`bookOwnedPayeeIds`). Their account
 * counts nowhere (`PayeeRunningAccounts.bookOwned`).
 */
export function bookOwnersOf(
  payees: readonly PayeeRecord[],
  corpView: CorpBookView | null | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of corpView?.books ?? []) {
    if (b.left) continue;
    for (const id of bookOwnedPayeeIds(payees, [
      { corporationId: b.loaded.corporationId, name: b.corpName },
    ]))
      out.set(id, b.corpName);
  }
  return out;
}

/** The ids alone of `bookOwnersOf`. */
export const bookOwnedPayees = (
  payees: readonly PayeeRecord[],
  corpView: CorpBookView | null | undefined
): Set<string> => new Set(bookOwnersOf(payees, corpView).keys());

/** The Characters in view: the Tax tab's selector (`'all'` is no filter). */
export type CharactersInView = ReadonlySet<number> | 'all';

/**
 * The books the selector shows: one with at least one selected Character in it. A book's figures
 * are its whole account for the Miner whatever the selector says, but a book none of the selected
 * Characters is in is not shown, so it counts nowhere.
 */
function booksInView(corpView: CorpBookView | null | undefined, inView: CharactersInView) {
  return (corpView?.books ?? []).filter(
    (b) => inView === 'all' || b.loaded.characterIds.some((id) => inView.has(id))
  );
}

/** Each shown Corp Tax Book Payee's credit, by its id: what its Miners' accounts hold over what they bill. */
export function bookCreditsOf(
  corpView: CorpBookView | null | undefined,
  inView: CharactersInView = 'all'
): Map<string, number> {
  return new Map(booksInView(corpView, inView).map((b) => [b.payee.id, b.summary.credit]));
}

/** Each shown Corp Tax Book Payee's owed, by its id: the book's account total over the whole Miner. */
export function bookOwesOf(
  corpView: CorpBookView | null | undefined,
  inView: CharactersInView = 'all'
): Map<string, number> {
  return new Map(
    booksInView(corpView, inView).map((b) => [b.payee.id, b.summary.account.owes?.amount ?? 0])
  );
}

/** Each shown Corp Tax Book Payee's owed days and oldest unpaid day, by its id, off the book's account. */
export function bookDaysOf(
  corpView: CorpBookView | null | undefined,
  inView: CharactersInView = 'all'
): Map<string, BookOwedDays> {
  return new Map(
    booksInView(corpView, inView).flatMap((b): [string, BookOwedDays][] => {
      const owes = b.summary.account.owes;
      return owes ? [[b.payee.id, { days: owes.days, oldest: owes.oldest }]] : [];
    })
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
  // The books read each Assignment as its Payee's account stands before any book takes ore off it
  // (see `useTaxCorpBooks`).
  const bookEntries = withPaidStatus(
    snapshot.rows,
    PayeeRunningAccounts.build({
      assignments: snapshot.rows.flatMap((row) => row.assignments),
      payees,
      links: snapshot.paymentLinks,
    })
  );
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
              rows: bookEntries,
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

  // Paid read off each Payee's account, the one build the Tax tab reads too: a Payee a book is the
  // authority for counts nowhere.
  const accounts = PayeeRunningAccounts.build({
    assignments: snapshot.rows.flatMap((row) => row.assignments),
    payees,
    links: snapshot.paymentLinks,
    billedElsewhere: snapshot.billedElsewhere,
    bookOwned: bookOwnedPayees(payees, corpView),
  });
  const entries = withPaidStatus(snapshot.rows, accounts);
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
      bookOwesOf(corpView),
      bookDaysOf(corpView)
    ),
    unassignedCount: unassignedSummary(rows, () => 0).entryCount,
  };
}
