/**
 * What the pilot owes each Payee right now — the Tax tab's "You owe" cards and the Overview's
 * Mining tax card read the same figure from here: each Payee's Running account, oldest day first
 * (`PayeeAccounts`). A Corp Tax Book overlays the personal ledger (`buildDisplayRows`): a row the
 * book says it hasn't credited is owed again (#6219), and ore a book bills is owed to the
 * corporation, not to the member's own Payee too (#6204).
 */
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { entryKey } from '@/engine/miningTax/types';
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
import { allMembers, type DisplayRow } from './groupRows';
import { PayeeAccounts, withPaidStatus } from './payeeAccounts';
import type { PayeePaymentLink, StoredPayeeCheckpoint } from '@/engine/miningTax/payeeAccount';
import { loadMadePaymentsWithStatus } from './madePayments';
import { groupPayees, payeeDuplicateAliases } from './payeeGroups';
import type { MoonMiningTaxSnapshot } from './snapshot';

type AssignmentRef = Pick<
  MiningTaxAssignmentRecord,
  'id' | 'characterId' | 'date' | 'solarSystemId'
>;

/** The share (0–1) of an Assignment's tax a Corp Tax Book bills too. */
export function alsoBilledShareOf(
  alsoBilled: PersonalOverlay['alsoBilled'] | undefined
): (a: AssignmentRef) => number {
  return (a) => alsoBilled?.get(entryKey(a.characterId, a.date, a.solarSystemId))?.get(a.id) ?? 0;
}

/**
 * Every personal Payee's account as the tab shows it: from every personal row's Assignments
 * (every Character's: a merged Payee's oldest day may be an alt's), each billing what is left once
 * a Corp Tax Book bills part of it too (#6204), and the links that pay them.
 */
export function payeeAccountsOf(input: {
  rows: readonly DisplayRow[];
  payees: readonly PayeeRecord[];
  links: readonly PayeePaymentLink[];
  alsoBilled: PersonalOverlay['alsoBilled'] | undefined;
  checkpoints?: ReadonlyMap<string, StoredPayeeCheckpoint>;
}): PayeeAccounts {
  const share = alsoBilledShareOf(input.alsoBilled);
  const assignments = input.rows
    .filter((dr) => !dr.corp || dr.corp.kind !== 'row')
    .flatMap((dr) => allMembers(dr).map((m) => m.assignment));
  return PayeeAccounts.build({
    assignments,
    payees: input.payees,
    links: input.links,
    ...(input.checkpoints ? { checkpoints: input.checkpoints } : {}),
    taxOf: (a) => a.taxOwed * (1 - Math.min(1, share(a as MiningTaxAssignmentRecord))),
  });
}

/** Each Corp Tax Book Payee's credit, by its id: what its Miners' accounts hold over what they bill. */
export function bookCreditsOf(corpView: CorpBookView | null | undefined): Map<string, number> {
  return new Map(corpView?.books.map((b) => [b.payee.id, b.summary.credit]) ?? []);
}

/** Per Payee, what is owed now over `rows` (display rows, a book's overlay applied). */
export function owedBalances(
  rows: readonly DisplayRow[],
  ledgerPayees: readonly PayeeRecord[],
  accounts: PayeeAccounts,
  /** Duplicate records of one Payee mapped to the primary (`payeeDuplicateAliases`). */
  aliases?: ReadonlyMap<string, string>,
  /** Each Corp Tax Book Payee's credit, by its id (`BookSummary.credit`). */
  bookCredits?: ReadonlyMap<string, number>
): PayeeBalance[] {
  return computePayeeBalances(rows, ledgerPayees, accounts, aliases, bookCredits);
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
 * `owedBalances` (and the Unassigned count) over every tracked Character, loading the Corp Tax Books the Tax tab overlays:
 * the books, their corporations' names and prices, and (only when a book exists) the wallet's
 * payments the book's in-flight donations read. Without a book it is the personal ledger alone.
 */
export async function loadOwedBalances(
  snapshot: Pick<
    MoonMiningTaxSnapshot,
    'rows' | 'characters' | 'payeesByCharacter' | 'paymentLinks' | 'payeeCheckpoints'
  >,
  now: number = Date.now()
): Promise<OwedNow> {
  const seen = new Map<string, PayeeRecord>();
  for (const list of snapshot.payeesByCharacter.values()) for (const p of list) seen.set(p.id, p);
  const payees = [...seen.values()];
  // Paid read off each Payee's account, as on the Tax tab.
  const entries = withPaidStatus(snapshot.rows, payees, snapshot.paymentLinks);
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
  const accounts = payeeAccountsOf({
    rows,
    payees,
    links: snapshot.paymentLinks,
    alsoBilled: corpView?.overlay.alsoBilled,
    checkpoints: snapshot.payeeCheckpoints,
  });
  return {
    balances: owedBalances(
      rows,
      [...payees, ...(corpView?.payees ?? [])],
      accounts,
      payeeDuplicateAliases(groupPayees(payees)),
      bookCreditsOf(corpView)
    ),
    unassignedCount: unassignedSummary(rows, () => 0).entryCount,
  };
}
