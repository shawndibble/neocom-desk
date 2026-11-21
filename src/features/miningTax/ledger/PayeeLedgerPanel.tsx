import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  activeDateRangeFilters,
  summarizeFilterValues,
  type ActiveFilter,
  Button,
  DataTable,
  DateRangeFields,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  Panel,
  SlideOver,
  Spinner,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import type { DataTableProps } from '@/components/ui/dataTableTypes';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import {
  payeeLedger,
  type PayeeLedger,
  type PayeeLedgerKind,
  type PayeeLedgerRow,
  type PayeeLedgerSource,
} from '@/engine/miningTax/payeeLedger';
import { formatDateWithYear } from '@/lib/formatDateTick';
import type { CsvColumn } from '@/lib/csv';
import { formatIsk } from '@/lib/isk';
import type { Translate } from '@/lib/translate';
import { LedgerRowDetail } from './LedgerRowDetail';

/** The panel's filter and the words for each row, shared by its table and its export. */
const LEDGER_KINDS: readonly PayeeLedgerKind[] = ['charge', 'payment', 'writeOff', 'notice'];

interface LedgerFilter {
  /** Inclusive `YYYY-MM-DD`; null is no bound. */
  startDate: string | null;
  endDate: string | null;
  /** The kinds of row shown; every kind by default. */
  kinds: readonly PayeeLedgerKind[];
}

const DEFAULT_LEDGER_FILTER: LedgerFilter = {
  startDate: null,
  endDate: null,
  kinds: LEDGER_KINDS,
};

/**
 * The rows the filter keeps. Each keeps the account's running balance: filtering hides rows, it
 * never re-adds them. The opening balance is what every later balance starts from: always kept.
 */
function filterLedgerRows(rows: readonly PayeeLedgerRow[], filter: LedgerFilter): PayeeLedgerRow[] {
  return rows.filter(
    (r) =>
      r.kind === 'opening' ||
      (filter.kinds.includes(r.kind) &&
        (filter.startDate === null || r.date >= filter.startDate) &&
        (filter.endDate === null || r.date <= filter.endDate))
  );
}

function activeLedgerFilters(filter: LedgerFilter, t: Translate): ActiveFilter<LedgerFilter>[] {
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
function ledgerWhat(row: PayeeLedgerRow, t: Translate): string {
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

function ledgerCsvColumns(t: Translate): CsvColumn<PayeeLedgerRow>[] {
  return [
    { header: t('miningTax.ledger.column.date'), value: (r) => r.date },
    { header: t('miningTax.ledger.column.what'), value: (r) => ledgerWhat(r, t) },
    { header: t('miningTax.ledger.column.charged'), value: (r) => r.charged || null },
    { header: t('miningTax.ledger.column.credited'), value: (r) => r.paid || null },
    { header: t('miningTax.ledger.column.balance'), value: (r) => r.balance },
  ];
}

export interface PayeeLedgerPanelProps {
  open: boolean;
  onClose: () => void;
  /** The Payee (or a Corp Tax Book's Miner): the panel's title. */
  payeeName: string;
  /** The Payee's Running account and what made it; null while it loads. */
  source: PayeeLedgerSource | null;
  /** Ore names the caller already holds; an ore without one reads `#id`. */
  typeNames?: ReadonlyMap<number, string>;
  /** Above the ledger: a pick between accounts, when the Payee has several (a book's Miners). */
  picker?: ReactNode;
}

/**
 * A Payee ledger (decision 20261120-235011): every charge, payment, write-off and late notice
 * of one Payee's Running account, oldest first with a running balance, under its "Owes" or
 * "Paid through" status. One panel for a Corp Tax Book's Payee and a personal one: the caller
 * fills `source`. A row opens in place to say what it was.
 */
export function PayeeLedgerPanel({
  open,
  onClose,
  payeeName,
  source,
  typeNames,
  picker,
}: PayeeLedgerPanelProps) {
  const { t } = useTranslation();
  const ledger = useMemo(() => (source ? payeeLedger(source) : null), [source]);
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={payeeName}
      subtitle={t('miningTax.ledger.subtitle')}
      side="right"
      wide
    >
      {picker && <div className="mb-3">{picker}</div>}
      {ledger ? (
        <LedgerBody ledger={ledger} typeNames={typeNames} />
      ) : (
        <Spinner block="panel" label={t('miningTax.ledger.loading')} />
      )}
    </SlideOver>
  );
}

function LedgerStatus({ ledger }: { ledger: PayeeLedger }) {
  const { t } = useTranslation();
  const { status, credit } = ledger;
  return (
    <StatChips>
      {status.kind === 'owes' && (
        <>
          <StatChip
            label={t('miningTax.ledger.status.owes')}
            value={`${formatIsk(status.amount)} ISK`}
            tone="danger"
            emphasis
          />
          <StatChip label={t('miningTax.ledger.status.days')} value={status.days} />
          <StatChip
            label={t('miningTax.ledger.status.oldest')}
            value={formatDateWithYear(status.oldest)}
          />
        </>
      )}
      {status.kind === 'paid' && (
        <StatChip
          label={t('miningTax.ledger.status.paidThrough')}
          value={formatDateWithYear(status.through)}
          tone="success"
          emphasis
        />
      )}
      {credit > 0 && (
        <StatChip
          label={t('miningTax.ledger.status.credit')}
          value={`${formatIsk(credit)} ISK`}
          tone="success"
        />
      )}
    </StatChips>
  );
}

const amountCell = (value: number) => (value === 0 ? '' : formatIsk(value));

function LedgerBody({
  ledger,
  typeNames,
}: {
  ledger: PayeeLedger;
  typeNames?: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<LedgerFilter>(DEFAULT_LEDGER_FILTER);
  const rows = useMemo(() => filterLedgerRows(ledger.rows, filter), [ledger.rows, filter]);
  const csvColumns = useMemo(() => ledgerCsvColumns(t), [t]);
  const tableExport = useTableExport({
    surface: 'mining-tax-payee-ledger',
    rows,
    columns: csvColumns,
  });
  if (ledger.rows.length === 0)
    return (
      <EmptyState title={t('miningTax.ledger.emptyTitle')} hint={t('miningTax.ledger.emptyHint')} />
    );

  return (
    <div className="space-y-4">
      <LedgerStatus ledger={ledger} />
      <FilterBar
        value={filter}
        onChange={setFilter}
        active={activeLedgerFilters(filter, t)}
        resultCount={rows.length}
      >
        {(draft, setDraft) => (
          <>
            <FilterField label={t('miningTax.ledger.filter.show')}>
              <div className="flex flex-wrap gap-1.5">
                {LEDGER_KINDS.map((kind) => {
                  const on = draft.kinds.includes(kind);
                  return (
                    <FilterChip
                      key={kind}
                      label={t(`miningTax.ledger.kind.${kind}`)}
                      selected={on}
                      onToggle={() =>
                        setDraft({
                          ...draft,
                          kinds: on
                            ? draft.kinds.filter((k) => k !== kind)
                            : LEDGER_KINDS.filter((k) => k === kind || draft.kinds.includes(k)),
                        })
                      }
                    />
                  );
                })}
              </div>
            </FilterField>
            <DateRangeFields
              from={draft.startDate}
              to={draft.endDate}
              onFromChange={(startDate) => setDraft({ ...draft, startDate })}
              onToChange={(endDate) => setDraft({ ...draft, endDate })}
              fromLabel={t('miningTax.ledger.filter.from')}
              toLabel={t('miningTax.ledger.filter.to')}
            />
          </>
        )}
      </FilterBar>
      <Panel
        title={t('miningTax.ledger.tableLabel')}
        actions={
          <TableActionsMenu name={t('miningTax.ledger.tableLabel')} tableExport={tableExport} />
        }
        padded={rows.length === 0}
      >
        {rows.length === 0 ? (
          <EmptyState
            title={t('miningTax.ledger.filteredTitle')}
            action={
              <Button size="sm" onClick={() => setFilter(DEFAULT_LEDGER_FILTER)}>
                {t('common.resetFilters')}
              </Button>
            }
          />
        ) : (
          <PayeeLedgerTable
            {...tableExport.tableProps}
            label={t('miningTax.ledger.tableLabel')}
            rows={rows}
            typeNames={typeNames}
          />
        )}
      </Panel>
    </div>
  );
}

/**
 * The ledger's table, for a page that holds its own frame: the Payee panel's, and an officer's
 * Miner page, which adds a row menu. `rows` in the order to show them.
 */
export function PayeeLedgerTable({
  rows,
  label,
  typeNames,
  rowContextMenu,
  ...rest
}: {
  rows: readonly PayeeLedgerRow[];
  label: string;
  typeNames?: ReadonlyMap<number, string>;
  /** A row's menu (right-click, touch-and-hold, ⋮); without it the rows have none. */
  rowContextMenu?: (row: PayeeLedgerRow, tr: ReactElement) => ReactElement;
} & Omit<
  DataTableProps<PayeeLedgerRow>,
  'rows' | 'label' | 'columns' | 'rowKey' | 'expandableRow' | 'rowContextMenu'
>) {
  const { t } = useTranslation();
  const columns = useMemo<DataTableColumn<PayeeLedgerRow>[]>(
    () => [
      {
        id: 'date',
        header: t('miningTax.ledger.column.date'),
        headerTooltip: t('miningTax.ledger.column.dateTooltip'),
        className: 'whitespace-nowrap tabular-nums',
        render: (r) => r.date,
      },
      {
        id: 'what',
        header: t('miningTax.ledger.column.what'),
        primary: true,
        render: (r) => {
          const note =
            r.kind === 'charge'
              ? r.held
                ? t('miningTax.ledger.held')
                : r.charge.reason
              : r.kind === 'writeOff'
                ? r.reason
                : r.kind === 'payment'
                  ? r.payment.note
                  : undefined;
          return (
            <>
              {/* A record an officer undid stays, struck through; its reversal follows. */}
              {r.reversed ? (
                <span>
                  <span className="text-text-dim line-through decoration-text-faint">
                    {ledgerWhat(r, t)}
                  </span>{' '}
                  <span className="text-xs text-text-dim">{t('miningTax.ledger.reversedTag')}</span>
                </span>
              ) : (
                ledgerWhat(r, t)
              )}
              {note && <span className="block text-xs text-text-dim">{note}</span>}
            </>
          );
        },
      },
      {
        id: 'charged',
        header: t('miningTax.ledger.column.charged'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (r) => (r.kind === 'charge' && r.held ? 'text-text-dim' : undefined),
        render: (r) => amountCell(r.charged),
      },
      {
        id: 'credited',
        header: t('miningTax.ledger.column.credited'),
        align: 'right',
        className: 'tabular-nums',
        render: (r) => amountCell(r.paid),
      },
      {
        id: 'balance',
        header: t('miningTax.ledger.column.balance'),
        align: 'right',
        className: 'tabular-nums font-medium',
        // Owed reads positive; money ahead reads as credit, never as a negative balance.
        cellClassName: (r) => (r.balance < -0.005 ? 'text-isk-pos' : undefined),
        render: (r) =>
          r.balance < -0.005
            ? t('miningTax.ledger.balanceCredit', { amount: formatIsk(-r.balance) })
            : formatIsk(Math.max(0, r.balance)),
      },
    ],
    [t]
  );
  return (
    <DataTable
      {...rest}
      label={label}
      columns={columns}
      rows={[...rows]}
      rowKey={(r) => r.key}
      expandableRow={{
        leadingIcon: true,
        renderDetail: (r) => <LedgerRowDetail row={r} typeNames={typeNames} />,
      }}
      {...(rowContextMenu ? { rowMoreActions: true, rowContextMenu } : {})}
    />
  );
}
