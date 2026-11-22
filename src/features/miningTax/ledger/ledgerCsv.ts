import type { PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import type { CsvColumn } from '@/lib/csv';
import type { Translate } from '@/lib/translate';

/** What a row is, in a few words: the table's What column and the export's. */
export function ledgerWhat(row: PayeeLedgerRow, t: Translate): string {
  switch (row.kind) {
    case 'charge':
      if (row.reversal) return t('miningTax.ledger.what.reversal');
      if (row.charge.kind === 'correction')
        return t(
          row.charge.opening
            ? 'miningTax.ledger.what.openingBalance'
            : 'miningTax.ledger.what.correction'
        );
      return row.charge.place
        ? t('miningTax.ledger.what.minedAt', { place: row.charge.place })
        : t('miningTax.ledger.what.mined');
    case 'payment':
      if (row.payment.via)
        return row.payment.from
          ? t(`miningTax.ledger.what.paymentViaFrom.${row.payment.via}`, {
              name: row.payment.from,
            })
          : t(`miningTax.ledger.what.paymentVia.${row.payment.via}`);
      return row.payment.from
        ? t('miningTax.ledger.what.paymentFrom', { name: row.payment.from })
        : t('miningTax.ledger.what.payment');
    case 'writeOff':
      return row.reversal
        ? t('miningTax.ledger.what.reversal')
        : t(`miningTax.ledger.what.${row.cause}`);
    case 'notice':
      return t(`miningTax.ledger.what.${row.notice.kind}`);
    case 'opening':
      return t('miningTax.ledger.what.opening', { date: row.date });
  }
}

/** The export's columns: an old history's rows carry no balance, so its file has none either. */
export function ledgerCsvColumns(t: Translate, history?: boolean): CsvColumn<PayeeLedgerRow>[] {
  const columns: CsvColumn<PayeeLedgerRow>[] = [
    { header: t('miningTax.ledger.column.date'), value: (r) => r.date },
    { header: t('miningTax.ledger.column.what'), value: (r) => ledgerWhat(r, t) },
    { header: t('miningTax.ledger.column.charged'), value: (r) => r.charged || null },
    { header: t('miningTax.ledger.column.credited'), value: (r) => r.paid || null },
  ];
  if (history) return columns;
  return [...columns, { header: t('miningTax.ledger.column.balance'), value: (r) => r.balance }];
}
