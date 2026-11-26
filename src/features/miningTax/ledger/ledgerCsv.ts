import type { PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import type { AssignmentTerms, RecordChange } from '@/engine/miningTax/recordChanges';
import { formatIsk } from '@/lib/isk';
import type { CsvColumn } from '@/lib/csv';
import type { Translate } from '@/lib/translate';

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
    case 'recordChange':
      return t(`miningTax.ledger.what.recordChange.${row.change.reason}`);
    case 'opening':
      return t('miningTax.ledger.what.opening', { date: row.date });
  }
}

export function recordChangeSummary(change: RecordChange, t: Translate): string {
  const isk = (value: number) => `${formatIsk(value)} ISK`;
  if (change.reason === 'tolerance')
    return t('miningTax.ledger.summary.tolerance', {
      date: change.date,
      billed: isk(change.closeOut.billed),
      paid: isk(change.closeOut.paid),
      writtenOff: isk(change.closeOut.writtenOff),
      pct: change.closeOut.tolerancePct,
    });
  const terms = (x: AssignmentTerms | null) =>
    x
      ? t('miningTax.ledger.summary.terms', { pct: x.taxPct, tax: isk(x.taxOwed) })
      : t('miningTax.ledger.summary.none');
  return t('miningTax.ledger.summary.assignments', {
    date: change.date,
    changes: change.assignments.map((a) => `${terms(a.before)} → ${terms(a.after)}`).join('; '),
  });
}

export function ledgerCsvColumns(t: Translate, history?: boolean): CsvColumn<PayeeLedgerRow>[] {
  const columns: CsvColumn<PayeeLedgerRow>[] = [
    { header: t('miningTax.ledger.column.date'), value: (r) => r.date },
    {
      header: t('miningTax.ledger.column.what'),
      value: (r) =>
        r.kind === 'recordChange'
          ? `${ledgerWhat(r, t)}: ${recordChangeSummary(r.change, t)}`
          : ledgerWhat(r, t),
    },
    { header: t('miningTax.ledger.column.charged'), value: (r) => r.charged || null },
    { header: t('miningTax.ledger.column.credited'), value: (r) => r.paid || null },
  ];
  if (history) return columns;
  return [...columns, { header: t('miningTax.ledger.column.balance'), value: (r) => r.balance }];
}
