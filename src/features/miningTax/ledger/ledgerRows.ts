/**
 * The Payee ledger panel's filter and the words for each row, shared by its table and its export.
 */
import { activeDateRangeFilters, summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type { PayeeLedgerKind, PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import type { CsvColumn } from '@/lib/csv';
import type { Translate } from '@/lib/translate';

export const LEDGER_KINDS: readonly PayeeLedgerKind[] = ['charge', 'payment', 'writeOff', 'notice'];

export interface LedgerFilter {
  /** Inclusive `YYYY-MM-DD`; null is no bound. */
  startDate: string | null;
  endDate: string | null;
  /** The kinds of row shown; every kind by default. */
  kinds: readonly PayeeLedgerKind[];
}

export const DEFAULT_LEDGER_FILTER: LedgerFilter = {
  startDate: null,
  endDate: null,
  kinds: LEDGER_KINDS,
};

/** The rows the filter keeps. Each keeps the account's running balance: filtering hides rows, it never re-adds them. */
export function filterLedgerRows(
  rows: readonly PayeeLedgerRow[],
  filter: LedgerFilter
): PayeeLedgerRow[] {
  return rows.filter(
    (r) =>
      filter.kinds.includes(r.kind) &&
      (filter.startDate === null || r.date >= filter.startDate) &&
      (filter.endDate === null || r.date <= filter.endDate)
  );
}

export function activeLedgerFilters(
  filter: LedgerFilter,
  t: Translate
): ActiveFilter<LedgerFilter>[] {
  const active = activeDateRangeFilters(filter, t, {
    from: t('miningTax.ledger.filter.from'),
    to: t('miningTax.ledger.filter.to'),
  });
  if (filter.kinds.length < LEDGER_KINDS.length)
    active.unshift({
      label: t('miningTax.ledger.filter.show'),
      value: summarizeFilterValues(
        filter.kinds.map((k) => t(`miningTax.ledger.kind.${k}`)),
        t
      ),
      clear: (value) => ({ ...value, kinds: LEDGER_KINDS }),
    });
  return active;
}

/** What a row is, in a few words: the table's What column and the export's. */
export function ledgerWhat(row: PayeeLedgerRow, t: Translate): string {
  switch (row.kind) {
    case 'charge':
      if (row.charge.kind === 'correction') return t('miningTax.ledger.what.correction');
      return row.charge.place
        ? t('miningTax.ledger.what.minedAt', { place: row.charge.place })
        : t('miningTax.ledger.what.mined');
    case 'payment':
      return row.payment.from
        ? t('miningTax.ledger.what.paymentFrom', { name: row.payment.from })
        : t('miningTax.ledger.what.payment');
    case 'writeOff':
      return t(`miningTax.ledger.what.${row.cause}`);
    case 'notice':
      return t(`miningTax.ledger.what.${row.notice.kind}`);
  }
}

export function ledgerCsvColumns(t: Translate): CsvColumn<PayeeLedgerRow>[] {
  return [
    { header: t('miningTax.ledger.column.date'), value: (r) => r.date },
    { header: t('miningTax.ledger.column.what'), value: (r) => ledgerWhat(r, t) },
    { header: t('miningTax.ledger.column.charged'), value: (r) => r.charged || null },
    { header: t('miningTax.ledger.column.paid'), value: (r) => r.paid || null },
    { header: t('miningTax.ledger.column.balance'), value: (r) => r.balance },
  ];
}
