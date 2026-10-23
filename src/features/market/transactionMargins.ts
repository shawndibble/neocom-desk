/**
 * The Transactions table's Margin column (issue #1740): wires the wallet's
 * fills and journal into the pure `realizedMargins` engine. A sale's sales
 * tax is its `transaction_tax` journal line, tied to the fill by
 * `journalTransactionLinks` where ESI gives the line a context and otherwise
 * by the journal's order (`pairByProceeds`); the journal reaching back further
 * than the capped transactions (or not loading at all) just leaves sales
 * without one, so without a margin.
 */
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { journalTransactionLinks } from '@/features/character/journalTransactionLink';
import {
  realizedMarginReport,
  type MarginGap,
  type RealizedMargin,
  type RealizedMarginReport,
} from '@/engine/market/realizedMargin';
import { toWalletTrade } from './orderCostBasis';

/** Journal amounts are floats; a sale's total matches its proceeds line to within this. */
const AMOUNT_TOLERANCE = 0.01;

/**
 * ESI's real `transaction_tax` lines carry no context, and a fill's
 * `journal_ref_id` names neither its `market_transaction` line nor its tax
 * line, so the exact keys rarely hit. What the journal does keep is order: a
 * sale's proceeds line (`market_transaction`, the sale's total, the fill's
 * timestamp) is followed by its own tax line before the next proceeds line
 * starts. So an unclaimed proceeds line of the same time and amount, and the
 * first unclaimed tax line after it with no other proceeds line in between,
 * are a sale and its tax. A tax line missing from the journal leaves the sale
 * without one rather than taking the next sale's. Same-priced sales at one
 * timestamp are interchangeable, so claiming them in order is exact.
 *
 * `claimed` holds the tax lines the exact keys already used. Returns each
 * paired sale's tax (positive ISK) by transaction id.
 */
function pairByProceeds(
  sales: readonly WalletTransaction[],
  journal: readonly WalletJournalEntry[],
  claimed: ReadonlySet<number>
): Map<number, number> {
  const linesAt = new Map<string, WalletJournalEntry[]>();
  for (const entry of [...journal].sort((a, b) => a.id - b.id)) {
    const lines = linesAt.get(entry.date);
    if (lines) lines.push(entry);
    else linesAt.set(entry.date, [entry]);
  }
  const used = new Set(claimed);
  const paired = new Map<number, number>();
  const ordered = [...sales].sort(
    (a, b) => a.date.localeCompare(b.date) || a.transaction_id - b.transaction_id
  );
  for (const sale of ordered) {
    const lines = linesAt.get(sale.date) ?? [];
    const total = sale.quantity * sale.unit_price;
    const at = lines.findIndex(
      (entry) =>
        entry.ref_type === 'market_transaction' &&
        !used.has(entry.id) &&
        entry.amount !== undefined &&
        Math.abs(entry.amount - total) < AMOUNT_TOLERANCE
    );
    if (at === -1) continue;
    for (const entry of lines.slice(at + 1)) {
      if (entry.ref_type === 'market_transaction') break;
      if (entry.ref_type !== 'transaction_tax' || used.has(entry.id)) continue;
      if (entry.amount === undefined) break;
      used.add(lines[at].id);
      used.add(entry.id);
      paired.set(sale.transaction_id, Math.abs(entry.amount));
      break;
    }
  }
  return paired;
}

/** Each sale's sales tax (positive ISK) from the journal's `transaction_tax` lines, keyed by transaction id. */
function salesTaxByTransaction(
  transactions: readonly WalletTransaction[],
  journal: readonly WalletJournalEntry[]
): Map<number, number> {
  const linkFor = journalTransactionLinks(transactions);
  const salesTax = new Map<number, number>();
  const seen = new Set<number>();
  const linked = new Set<number>();
  for (const entry of journal) {
    if (entry.ref_type !== 'transaction_tax' || entry.amount === undefined) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const txn = linkFor(entry);
    if (!txn || txn.is_buy) continue;
    linked.add(entry.id);
    salesTax.set(
      txn.transaction_id,
      (salesTax.get(txn.transaction_id) ?? 0) + Math.abs(entry.amount)
    );
  }
  const unlinkedSales = transactions.filter(
    (txn) => !txn.is_buy && !salesTax.has(txn.transaction_id)
  );
  for (const [transactionId, tax] of pairByProceeds(unlinkedSales, journal, linked)) {
    salesTax.set(transactionId, tax);
  }
  return salesTax;
}

export function transactionMarginReport(
  transactions: readonly WalletTransaction[],
  journal: readonly WalletJournalEntry[]
): RealizedMarginReport {
  return realizedMarginReport(
    transactions.map(toWalletTrade),
    salesTaxByTransaction(transactions, journal)
  );
}

export function transactionMargins(
  transactions: readonly WalletTransaction[],
  journal: readonly WalletJournalEntry[]
): Map<number, RealizedMargin> {
  return transactionMarginReport(transactions, journal).margins;
}

export interface CharacterFills {
  characterId: number;
  name: string;
  transactions: readonly WalletTransaction[];
  journal: readonly WalletJournalEntry[];
}

/** A fill of the All characters view: its id is unique across the pool. */
export type PooledTransaction = WalletTransaction & {
  characterId: number;
  characterName: string;
};

/**
 * All characters (issue #3995): every Character's fills in one FIFO pool, so a
 * sale by one of an alt's buys gets a margin. Two Characters' wallets can carry
 * the same `transaction_id` (a trade between them is on both), so each fill is
 * renumbered to be unique across the pool; its sales tax is still linked inside
 * its own Character's journal first.
 */
export function pooledTransactionMargins(sources: readonly CharacterFills[]): {
  rows: PooledTransaction[];
  margins: Map<number, RealizedMargin>;
  gaps: Map<number, MarginGap>;
} {
  const rows: PooledTransaction[] = [];
  const salesTax = new Map<number, number>();
  let nextId = 1;
  for (const source of sources) {
    const tax = salesTaxByTransaction(source.transactions, source.journal);
    for (const txn of source.transactions) {
      const id = nextId++;
      const owed = tax.get(txn.transaction_id);
      if (owed !== undefined) salesTax.set(id, owed);
      rows.push({
        ...txn,
        transaction_id: id,
        characterId: source.characterId,
        characterName: source.name,
      });
    }
  }
  const { margins, gaps } = realizedMarginReport(rows.map(toWalletTrade), salesTax);
  return { rows, margins, gaps };
}
