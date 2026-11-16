/**
 * What the pilot owes each Payee right now — the Tax tab's "You owe" cards and the Overview's
 * Mining tax card read the same figure from here. A Corp Tax Book overlays the personal ledger
 * (`buildDisplayRows`): a row the book says it hasn't credited is owed again (#6219), and ore a
 * book bills is owed to the corporation, not to the member's own Payee too (#6204).
 */
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { entryKey } from '@/engine/miningTax/types';
import type { PersonalOverlay } from '@/engine/corpTaxBook/personal';
import i18n from '@/i18n';
import { computePayeeBalances, type PayeeBalance } from './balances';
import { loadBookPrices, loadCorpNames, loadTrackedCorpBooks } from './corpBook/corpBookSources';
import { buildCorpBookView } from './corpBook/corpBookView';
import { buildDisplayRows } from './corpBook/corpRows';
import type { DisplayRow } from './groupRows';
import { loadMadePaymentsWithStatus } from './madePayments';
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

/** Per Payee, what is owed now over `rows` (display rows, a book's overlay applied). */
export function owedBalances(
  rows: readonly DisplayRow[],
  ledgerPayees: readonly PayeeRecord[],
  alsoBilled: PersonalOverlay['alsoBilled'] | undefined
): PayeeBalance[] {
  const share = alsoBilledShareOf(alsoBilled);
  return computePayeeBalances(rows, ledgerPayees, ({ assignment }) => share(assignment));
}

/**
 * `owedBalances` over every tracked Character, loading the Corp Tax Books the Tax tab overlays:
 * the books, their corporations' names and prices, and (only when a book exists) the wallet's
 * payments the book's in-flight donations read. Without a book it is the personal ledger alone.
 */
export async function loadOwedBalances(
  snapshot: Pick<MoonMiningTaxSnapshot, 'rows' | 'characters' | 'payeesByCharacter'>,
  now: number = Date.now()
): Promise<PayeeBalance[]> {
  const seen = new Map<string, PayeeRecord>();
  for (const list of snapshot.payeesByCharacter.values()) for (const p of list) seen.set(p.id, p);
  const payees = [...seen.values()];
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
              rows: snapshot.rows,
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
    snapshot.rows,
    corpView?.overlay ?? null,
    (id) => characterNames.get(id) ?? `#${id}`
  );
  return owedBalances(rows, [...payees, ...(corpView?.payees ?? [])], corpView?.overlay.alsoBilled);
}
