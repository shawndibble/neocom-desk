import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import type { MarginGap, RealizedMargin } from '@/engine/market/realizedMargin';

/** Buys are money out, so the signed total is what carries the ISK tone. */
export function transactionTotal(
  txn: Pick<WalletTransactionCommon, 'unit_price' | 'quantity' | 'is_buy'>
): number {
  return txn.unit_price * txn.quantity * (txn.is_buy ? -1 : 1);
}

/** Margin over what the sold units cost, as a percent; null when the sale has no margin. */
export function marginPercentOf(
  txn: Pick<WalletTransactionCommon, 'quantity'>,
  margin: RealizedMargin | undefined
): number | null {
  if (!margin) return null;
  const cost = margin.unitCost * txn.quantity;
  return cost > 0 ? (margin.margin / cost) * 100 : null;
}

/** What only some wallet tables can say about a fill; each is omitted where the table doesn't have the data. */
export interface WalletTransactionsCsvExtras {
  /** The character a fill belongs to. */
  character?: (txn: WalletTransactionCommon) => string | null;
  /** The resolved station or structure name. */
  location?: (txn: WalletTransactionCommon) => string | null;
  /** Realized margins and why a sale has none (a personal wallet only). */
  margins?: {
    margins: ReadonlyMap<number, RealizedMargin>;
    gaps: ReadonlyMap<number, MarginGap>;
  };
}

/**
 * CSV columns for wallet transactions: date, item, side, quantity, unit
 * price, total, then whatever `extras` supplies, in the table's order:
 * character, margin, margin %, unit cost, margin gap, location. `date`
 * passes through as the raw ISO string; prices and totals are raw numbers,
 * not `formatIsk` strings. Margin, margin % and unit cost are blank on a buy
 * and on a sale without a margin, never 0.
 *
 * Typed on the shared fields, so the corp wallet's Transactions tab exports
 * the same six columns rather than a copy of them (issue #570) — the corp rows
 * simply lack `is_personal`, which no column here reads.
 */
export function walletTransactionsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeId: number) => string,
  extras: WalletTransactionsCsvExtras = {}
): CsvColumn<WalletTransactionCommon>[] {
  const { character, location, margins } = extras;
  const marginOf = (txn: WalletTransactionCommon) =>
    txn.is_buy ? undefined : margins?.margins.get(txn.transaction_id);
  const columns: CsvColumn<WalletTransactionCommon>[] = [
    { header: t('wallet.date'), value: (txn) => txn.date },
  ];
  if (character) columns.push({ header: t('wallet.character'), value: character });
  columns.push(
    { header: t('wallet.item'), value: (txn) => nameFor(txn.type_id) },
    { header: t('wallet.side'), value: (txn) => t(txn.is_buy ? 'wallet.buy' : 'wallet.sell') },
    { header: t('wallet.quantity'), value: (txn) => txn.quantity },
    { header: t('wallet.unitPrice'), value: (txn) => txn.unit_price },
    { header: t('wallet.total'), value: (txn) => transactionTotal(txn) }
  );
  if (margins) {
    columns.push(
      { header: t('wallet.margin'), value: (txn) => marginOf(txn)?.margin ?? null },
      {
        header: t('wallet.marginPercent'),
        value: (txn) => marginPercentOf(txn, marginOf(txn)),
      },
      { header: t('wallet.unitCost'), value: (txn) => marginOf(txn)?.unitCost ?? null },
      {
        header: t('wallet.csvMarginGap'),
        value: (txn) => {
          const gap = txn.is_buy ? undefined : margins.gaps.get(txn.transaction_id);
          return gap && !margins.margins.has(txn.transaction_id)
            ? t(`wallet.marginGap.${gap}`)
            : null;
        },
      }
    );
  }
  if (location) columns.push({ header: t('wallet.location'), value: location });
  return columns;
}
