import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import type { MarginGap, RealizedMargin } from '@/engine/market/realizedMargin';

export function transactionTotal(
  txn: Pick<WalletTransactionCommon, 'unit_price' | 'quantity' | 'is_buy'>
): number {
  return txn.unit_price * txn.quantity * (txn.is_buy ? -1 : 1);
}

export function marginPercentOf(
  txn: Pick<WalletTransactionCommon, 'quantity'>,
  margin: RealizedMargin | undefined
): number | null {
  if (!margin) return null;
  const cost = margin.unitCost * txn.quantity;
  return cost > 0 ? (margin.margin / cost) * 100 : null;
}

export interface WalletTransactionsCsvExtras<T extends WalletTransactionCommon> {
  character?: (txn: T) => string | null;
  location?: (txn: T) => string | null;
  margins?: {
    margins: ReadonlyMap<number, RealizedMargin>;
    gaps: ReadonlyMap<number, MarginGap>;
  };
}

export function walletTransactionsCsvColumns<T extends WalletTransactionCommon>(
  t: CsvTranslate,
  nameFor: (typeId: number) => string,
  extras: WalletTransactionsCsvExtras<T> = {}
): CsvColumn<T>[] {
  const { character, location, margins } = extras;
  const marginOf = (txn: T) => (txn.is_buy ? undefined : margins?.margins.get(txn.transaction_id));
  const columns: CsvColumn<T>[] = [{ header: t('wallet.date'), value: (txn) => txn.date }];
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
      { header: t('wallet.csvSalesTax'), value: (txn) => marginOf(txn)?.salesTax ?? null },
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
