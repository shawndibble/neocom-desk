/**
 * The Transactions table's Margin column (issue #1740): wires the wallet's
 * fills and journal into the pure `realizedMargins` engine. A sale's sales
 * tax is its `transaction_tax` journal line, tied to the fill by
 * `journalTransactionLinks`; the journal reaching back further than the
 * capped transactions (or not loading at all) just leaves sales without one,
 * so without a margin.
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

/**
 * ESI's real `transaction_tax` lines carry no context, and a fill's
 * `journal_ref_id` names neither its `market_transaction` line nor its tax
 * line, so the exact keys above rarely hit. What the journal does keep is
 * order: a sale's proceeds line (`market_transaction`, the sale's total, the
 * fill's timestamp) is followed by its tax line. A sale the keys left alone is
 * paired that way — the next unclaimed tax line after an unclaimed proceeds
 * line of the same time and amount. Same-priced sales at one timestamp are
 * interchangeable, so claiming them in order is exact.
 */
function pairByProceeds(
  transactions: readonly WalletTransaction[],
  journal: readonly WalletJournalEntry[],
  salesTax: Map<number, number>,
  claimed: Set<number>
): void {
  const ordered = [...journal].sort((a, b) => a.id - b.id);
  const sales = transactions
    .filter((txn) => !txn.is_buy && !salesTax.has(txn.transaction_id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.transaction_id - b.transaction_id);
  for (const sale of sales) {
    const total = sale.quantity * sale.unit_price;
    const proceeds = ordered.find(
      (entry) =>
        entry.ref_type === 'market_transaction' &&
        !claimed.has(entry.id) &&
        entry.date === sale.date &&
        entry.amount !== undefined &&
        Math.abs(entry.amount - total) < 0.01
    );
    if (!proceeds) continue;
    const tax = ordered.find(
      (entry) =>
        entry.ref_type === 'transaction_tax' &&
        !claimed.has(entry.id) &&
        entry.id > proceeds.id &&
        entry.date === sale.date &&
        entry.amount !== undefined
    );
    if (!tax) continue;
    claimed.add(proceeds.id);
    claimed.add(tax.id);
    salesTax.set(sale.transaction_id, Math.abs(tax.amount!));
  }
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
  pairByProceeds(transactions, journal, salesTax, linked);
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
