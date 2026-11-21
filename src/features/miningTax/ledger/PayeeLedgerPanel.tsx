import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import {
  payeeLedger,
  type PayeeLedger,
  type PayeeLedgerRow,
  type PayeeLedgerSource,
} from '@/engine/miningTax/payeeLedger';
import { formatDateWithYear } from '@/lib/formatDateTick';
import { formatIsk } from '@/lib/isk';
import { LedgerRowDetail } from './LedgerRowDetail';
import {
  activeLedgerFilters,
  DEFAULT_LEDGER_FILTER,
  filterLedgerRows,
  LEDGER_KINDS,
  ledgerCsvColumns,
  ledgerWhat,
  type LedgerFilter,
} from './ledgerRows';

export interface PayeeLedgerPanelProps {
  open: boolean;
  onClose: () => void;
  /** The Payee (or a Corp Tax Book's Miner): the panel's title. */
  payeeName: string;
  /** The Payee's Running account and what made it; null while it loads. */
  source: PayeeLedgerSource | null;
  /** Ore names the caller already holds; an ore without one reads `#id`. */
  typeNames?: ReadonlyMap<number, string>;
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
                : undefined;
          return (
            <>
              {ledgerWhat(r, t)}
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
        id: 'paid',
        header: t('miningTax.ledger.column.paid'),
        align: 'right',
        className: 'tabular-nums',
        render: (r) => amountCell(r.paid),
      },
      {
        id: 'balance',
        header: t('miningTax.ledger.column.balance'),
        align: 'right',
        className: 'tabular-nums font-medium',
        render: (r) => formatIsk(r.balance),
      },
    ],
    [t]
  );

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
          <DataTable
            {...tableExport.tableProps}
            label={t('miningTax.ledger.tableLabel')}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            expandableRow={{
              leadingIcon: true,
              renderDetail: (r) => <LedgerRowDetail row={r} typeNames={typeNames} />,
            }}
          />
        )}
      </Panel>
    </div>
  );
}
