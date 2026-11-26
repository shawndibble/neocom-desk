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
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import type { Translate } from '@/lib/translate';
import { LedgerRowDetail } from './LedgerRowDetail';
import { ledgerCsvColumns, ledgerWhat, recordChangeSummary } from './ledgerCsv';
import { lockRowBoundary } from './lockBoundary';

const LEDGER_KINDS: readonly PayeeLedgerKind[] = [
  'charge',
  'payment',
  'writeOff',
  'recordChange',
  'notice',
];

interface LedgerFilter {
  startDate: string | null;
  endDate: string | null;
  kinds: readonly PayeeLedgerKind[];
}

const DEFAULT_LEDGER_FILTER: LedgerFilter = {
  startDate: null,
  endDate: null,
  kinds: LEDGER_KINDS,
};

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

export interface PayeeLedgerPanelProps {
  open: boolean;
  onClose: () => void;
  payeeName: string;
  source: PayeeLedgerSource | null;
  typeNames?: ReadonlyMap<number, string>;
  picker?: ReactNode;
  onUnlinkPayment?: (paymentId: string) => void;
  lockDate?: string;
  history?: boolean;
  onLinkWalletPayment?: () => void;
}

export function PayeeLedgerPanel({
  open,
  onClose,
  payeeName,
  source,
  typeNames,
  picker,
  onUnlinkPayment,
  lockDate,
  history,
  onLinkWalletPayment,
}: PayeeLedgerPanelProps) {
  const { t } = useTranslation();
  const ledger = useMemo(() => (source ? payeeLedger(source) : null), [source]);
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={payeeName}
      subtitle={t(history ? 'miningTax.ledger.historySubtitle' : 'miningTax.ledger.subtitle')}
      side="right"
      wide
    >
      {picker && <div className="mb-3">{picker}</div>}
      {ledger ? (
        <LedgerBody
          ledger={ledger}
          typeNames={typeNames}
          onUnlinkPayment={onUnlinkPayment}
          lockDate={lockDate}
          history={history}
          onLinkWalletPayment={onLinkWalletPayment}
        />
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
            value={`−${formatIsk(status.amount)} ISK`}
            tone="danger"
            emphasis
          />
          <StatChip label={t('miningTax.ledger.status.days')} value={status.days} />
          <StatChip label={t('miningTax.ledger.status.oldest')} value={status.oldest} />
        </>
      )}
      {status.kind === 'paid' && (
        <StatChip
          label={t('miningTax.ledger.status.paidThrough')}
          value={status.through}
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
const chargedCell = (value: number) =>
  value === 0 ? '' : value > 0 ? `−${formatIsk(value)}` : formatIsk(-value);
const balanceCell = (balance: number) =>
  balance < -0.005 ? formatIsk(-balance) : balance > 0.005 ? `−${formatIsk(balance)}` : '0';
const balanceTone = (balance: number) =>
  balance < -0.005 ? 'text-isk-pos' : balance > 0.005 ? 'text-isk-neg' : undefined;

function LedgerBody({
  ledger,
  typeNames,
  onUnlinkPayment,
  lockDate,
  history,
  onLinkWalletPayment,
}: {
  onLinkWalletPayment?: (() => void) | undefined;
  ledger: PayeeLedger;
  history?: boolean | undefined;
  typeNames?: ReadonlyMap<number, string>;
  onUnlinkPayment?: ((paymentId: string) => void) | undefined;
  lockDate?: string | undefined;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<LedgerFilter>(DEFAULT_LEDGER_FILTER);
  const rows = useMemo(() => filterLedgerRows(ledger.rows, filter), [ledger.rows, filter]);
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const csvColumns = useMemo(() => ledgerCsvColumns(t, history), [t, history]);
  const tableExport = useTableExport({
    surface: 'mining-tax-payee-ledger',
    rows,
    columns: csvColumns,
    source: 'rows',
  });
  if (ledger.rows.length === 0)
    return (
      <EmptyState title={t('miningTax.ledger.emptyTitle')} hint={t('miningTax.ledger.emptyHint')} />
    );

  return (
    <div className="space-y-4">
      {!history && <LedgerStatus ledger={ledger} />}
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
            rows={newestFirst}
            typeNames={typeNames}
            {...(onUnlinkPayment ? { onUnlinkPayment } : {})}
            {...(lockDate ? { lockDate } : {})}
            {...(history ? { showBalance: false } : {})}
            {...(onLinkWalletPayment ? { onLinkWalletPayment } : {})}
          />
        )}
      </Panel>
    </div>
  );
}

export function PayeeLedgerTable({
  rows,
  label,
  typeNames,
  rowContextMenu,
  onUnlinkPayment,
  lockDate,
  lockDateLabel,
  showBalance = true,
  onLinkWalletPayment,
  ...rest
}: {
  onLinkWalletPayment?: () => void;
  showBalance?: boolean;
  rows: readonly PayeeLedgerRow[];
  label: string;
  typeNames?: ReadonlyMap<number, string>;
  rowContextMenu?: (row: PayeeLedgerRow, tr: ReactElement) => ReactElement;
  onUnlinkPayment?: (paymentId: string) => void;
  lockDate?: string;
  lockDateLabel?: string;
} & Omit<
  DataTableProps<PayeeLedgerRow>,
  'rows' | 'label' | 'columns' | 'rowKey' | 'expandableRow' | 'rowContextMenu'
>) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
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
                  : r.kind === 'recordChange'
                    ? recordChangeSummary(r.change, t)
                    : undefined;
          return (
            <>
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
      ...(isPhone
        ? [
            {
              id: 'amount',
              header: t('miningTax.ledger.column.amount'),
              align: 'right',
              className: 'tabular-nums',
              cardCorner: true,
              render: (r) => (r.charged !== 0 ? chargedCell(r.charged) : amountCell(r.paid)),
            } satisfies DataTableColumn<PayeeLedgerRow>,
          ]
        : []),
      {
        id: 'charged',
        header: t('miningTax.ledger.column.charged'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (r) => (r.kind === 'charge' && r.held ? 'text-text-dim' : undefined),
        render: (r) => chargedCell(r.charged),
      },
      {
        id: 'credited',
        header: t('miningTax.ledger.column.credited'),
        align: 'right',
        className: 'tabular-nums',
        render: (r) => amountCell(r.paid),
      },
      ...(showBalance
        ? [
            {
              id: 'balance',
              header: t('miningTax.ledger.column.balance'),
              align: 'right',
              className: 'tabular-nums font-medium',
              cellClassName: (r) => balanceTone(r.balance),
              stackAffix: { before: `${t('miningTax.ledger.column.balance')} ` },
              render: (r) => (
                <span className={balanceTone(r.balance)}>{balanceCell(r.balance)}</span>
              ),
            } satisfies DataTableColumn<PayeeLedgerRow>,
          ]
        : []),
    ],
    [t, showBalance, isPhone]
  );
  return (
    <DataTable
      {...rest}
      label={label}
      stackLayout="dense"
      columns={isPhone ? columns.filter((c) => c.id !== 'charged' && c.id !== 'credited') : columns}
      rows={[...rows]}
      rowKey={(r) => r.key}
      rowBoundary={lockRowBoundary(
        rows,
        lockDate ? { date: lockDate, label: lockDateLabel ?? lockDate } : undefined,
        (r) => r.date,
        (r) => r.key
      )}
      expandableRow={{
        leadingIcon: true,
        renderDetail: (r) => (
          <LedgerRowDetail
            row={r}
            typeNames={typeNames}
            onUnlinkPayment={onUnlinkPayment}
            onLinkWalletPayment={onLinkWalletPayment}
          />
        ),
      }}
      {...(rowContextMenu ? { rowMoreActions: true, rowContextMenu } : {})}
    />
  );
}
