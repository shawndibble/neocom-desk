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
import type { LoadedCorpBook } from './corpBook/corpBookStore';
import { buildCorpBookView, type CorpBookView } from './corpBook/corpBookView';
import { buildDisplayRows } from './corpBook/corpRows';
import type { DisplayRow } from './groupRows';
import { heldPaymentKeys } from '@/engine/miningTax/payeeRunningAccount';
import { bookOwnedPayeeIds } from '@/engine/miningTax/payeeCorporation';
import { PayeeRunningAccounts, withPaidStatus } from './payeeRunningAccounts';
import { loadMadePaymentsWithStatus } from './madePayments';
import { groupPayees, payeeDuplicateAliases } from './payeeGroups';
import type { MoonMiningTaxSnapshot } from './snapshot';

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

export function bookOwnersOf(
  payees: readonly PayeeRecord[],
  books: readonly Pick<LoadedCorpBook, 'corporationId' | 'memberCharacterIds'>[],
  corpNameOf: (corporationId: number) => string
): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of books) {
    if (b.memberCharacterIds.length === 0) continue;
    const name = corpNameOf(b.corporationId);
    for (const id of bookOwnedPayeeIds(payees, [{ corporationId: b.corporationId, name }]))
      out.set(id, name);
  }
  return out;
}

export const bookOwnedPayees = (
  payees: readonly PayeeRecord[],
  books: readonly Pick<LoadedCorpBook, 'corporationId' | 'memberCharacterIds'>[],
  corpNameOf: (corporationId: number) => string
): Set<string> => new Set(bookOwnersOf(payees, books, corpNameOf).keys());

export type CharactersInView = ReadonlySet<number> | 'all';

function booksInView(corpView: CorpBookView | null | undefined, inView: CharactersInView) {
  return (corpView?.books ?? []).filter(
    (b) => inView === 'all' || b.loaded.characterIds.some((id) => inView.has(id))
  );
}

export function bookCreditsOf(
  corpView: CorpBookView | null | undefined,
  inView: CharactersInView = 'all'
): Map<string, number> {
  return new Map(booksInView(corpView, inView).map((b) => [b.payee.id, b.summary.credit]));
}

export function bookOwesOf(
  corpView: CorpBookView | null | undefined,
  inView: CharactersInView = 'all'
): Map<string, number> {
  return new Map(
    booksInView(corpView, inView).map((b) => [
      b.payee.id,
      (b.summary.account.owes?.amount ?? 0) + b.summary.estimate,
    ])
  );
}

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
  unassignedCount: number;
}

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
  let corpNames: ReadonlyMap<number, string> = new Map();
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
        ]).then(([names, pricesByCorp, made]) => {
          corpNames = names;
          return buildCorpBookView(
            {
              rows: bookEntries,
              loaded: books,
              pricesByCorp,
              corpNames: names,
              payees,
              made,
              linked: heldPaymentKeys(snapshot.paymentLinks),
              characterNames,
              now: new Date(now).toISOString(),
            },
            (corp) => i18n.t('miningTax.corpBook.payeeName', { corp })
          );
        });

  const accounts = PayeeRunningAccounts.build({
    assignments: snapshot.rows.flatMap((row) => row.assignments),
    payees,
    links: snapshot.paymentLinks,
    billedElsewhere: snapshot.billedElsewhere,
    bookOwned: bookOwnedPayees(payees, books, (id) => corpNames.get(id) ?? `#${id}`),
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
