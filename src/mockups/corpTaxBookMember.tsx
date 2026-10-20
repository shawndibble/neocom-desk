/**
 * The member's side of the Corp Tax Book mockups (#4056): today's Moon Mining
 * Tax tab (same header, balances card, filter row, Open table, History grouped
 * by month, row detail) with only the corp-book additions, and the guest's
 * read-only verify page.
 *
 * The tab mirrors `src/features/miningTax/TaxTab.tsx`: Character column when
 * several characters are tracked, Open then History (newest month open, Paid
 * and Dismissed muted, no checkboxes), a ghost Payees button, export through
 * `TableActionsMenu`, the phone sort picker, and `AttentionStrip`. The row
 * detail mirrors `RowDetailModal` for an owed row.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  DataAgeBadge,
  DataTable,
  DataTableDenseCell,
  DataTableSortPicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  InfoTooltip,
  Modal,
  PageHeader,
  Panel,
  StatChip,
  StatChips,
  Tabs,
  entityLinkClassName,
  useTabsId,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { HintText } from '@/components/ui/HintText';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { SecurityValue } from '@/features/assets/assetBrowserRows';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { AttentionStrip } from '@/features/miningTax/AttentionStrip';
import { OreIcon, OreLink } from '@/features/miningTax/OreIcon';
import { OwedBalances } from '@/features/miningTax/OwedBalances';
import { PriceBreakdownCard } from '@/features/miningTax/PriceBreakdownCard';
import { StatusPill } from '@/features/miningTax/StatusPill';
import type { PayeeBalance } from '@/features/miningTax/balances';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';
import {
  BOOK,
  CORP,
  CORP_PAYEE,
  DIFF,
  PERSONAL_ROWS,
  VERIFY,
  type DayLine,
  type PersonalRow,
  type PersonalState,
} from './corpTaxBookFixtures';
import { CorpBookDiff, StopReminders, VerifyTopBar } from './corpTaxBookParts';
import { isk, isk2 } from './corpTaxBookFormat';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';

const ME = SAMPLE_ACTIVE_CHARACTER.characterId;
const ME_NAME = SAMPLE_ACTIVE_CHARACTER.name;
/** The page just read, as today's header says ("just now"). */
const LOADED_AT = new Date();
const ORE_TYPE: Record<string, number> = {
  Zeolites: 45490,
  Sylvite: 45491,
  Bitumens: 45492,
  Cobaltite: 45494,
  Euxenite: 45495,
};
const SECURITY: Record<string, number> = { Efa: -0.1, Kamela: 0.2, Ouelletta: 0.4 };

const CORP_PAYEE_RECORD = {
  id: 'corp-book',
  characterId: ME,
  name: CORP_PAYEE,
  defaultTaxPct: 10,
  updatedAt: 0,
};

function member(
  date: string,
  typeId: number,
  quantity: number,
  taxPct: number,
  estimatedValue: number,
  taxOwed: number
) {
  const entry = {
    characterId: ME,
    date,
    solarSystemId: 30003838,
    oreLines: [{ typeId, quantity }],
  };
  const assignment = {
    id: `m-${date}`,
    characterId: ME,
    date,
    solarSystemId: 30003838,
    payeeId: CORP_PAYEE_RECORD.id,
    oreLines: entry.oreLines,
    taxPct,
    estimatedValue,
    taxOwed,
    status: 'outstanding' as const,
    updatedAt: 0,
  };
  return {
    row: {
      characterId: ME,
      characterName: ME_NAME,
      entry,
      assignments: [assignment],
      unassignedOreLines: [],
    },
    assignment,
  };
}

const BILLED = PERSONAL_ROWS.find((r) => r.state === 'Billed') as PersonalRow;
const WAITING = PERSONAL_ROWS.find((r) => r.state === 'Sent, waiting for the corp') as PersonalRow;
const BILLED_ROW = member(
  BILLED.date,
  ORE_TYPE[BILLED.ore],
  BILLED.units,
  15,
  BILLED.value,
  BILLED.tax ?? 0
);

/** The real balances card, fed the book's figures: Billed plus the payment still in flight. */
const CORP_BALANCE: PayeeBalance = {
  payee: CORP_PAYEE_RECORD,
  owed: (BILLED.tax ?? 0) + (WAITING.tax ?? 0),
  members: [
    BILLED_ROW,
    member(WAITING.date, ORE_TYPE[WAITING.ore], WAITING.units, 10, WAITING.value, WAITING.tax ?? 0),
  ],
};

const CORP_PILL: Record<Exclude<PersonalState, 'Paid'>, string> = {
  'Pending corp record': 'text-text-dim',
  Billed: 'text-danger bg-danger/10',
  'Sent, waiting for the corp': 'text-warning bg-warning/10',
  Conflict: 'text-warning bg-warning/10',
  Unattributed: 'text-text-dim',
  'Dismissed by corp': 'text-text-dim',
};

/** Today's `StatusPill` look, with the corp-book values added. */
function CorpStatusPill({ row }: { row: PersonalRow }) {
  if (row.state === 'Paid') return <StatusPill status="paid" label="Paid" hint={row.note} />;
  return (
    <HintText content={row.note}>
      <span
        className={cx(
          'inline-flex rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
          CORP_PILL[row.state]
        )}
      >
        {row.state === 'Sent, waiting for the corp' ? 'Sent, waiting' : row.state}
      </span>
    </HintText>
  );
}

const characterOf = (row: PersonalRow) => (row.character === 'SELF' ? ME_NAME : row.character);
const settled = (row: PersonalRow) => row.state === 'Paid' || row.state === 'Dismissed by corp';
const owesNow = (row: PersonalRow) =>
  row.state === 'Billed' || row.state === 'Sent, waiting for the corp';
const selectable = (row: PersonalRow) =>
  row.state === 'Billed' || row.state === 'Sent, waiting for the corp';

function usePersonalColumns(withSelect: boolean): DataTableColumn<PersonalRow>[] {
  const phone = useIsPhone();
  return [
    ...(withSelect
      ? [
          {
            id: 'select',
            header: '',
            className: 'w-9 pl-2 pr-0',
            headerCellClassName: 'sm:w-9',
            stackEdge: 'start',
            render: (row: PersonalRow) =>
              selectable(row) ? (
                <label className={touchCheckboxLabelClassName}>
                  <Checkbox aria-label={`Select ${row.date}, ${row.system}`} onChange={() => {}} />
                </label>
              ) : null,
          } satisfies DataTableColumn<PersonalRow>,
        ]
      : []),
    {
      id: 'character',
      header: 'Character',
      headerCellClassName: 'sm:w-28',
      render: (row) => <span className={entityLinkClassName()}>{characterOf(row)}</span>,
      sortValue: (row) => characterOf(row),
    },
    {
      id: 'date',
      header: 'Date',
      headerCellClassName: 'sm:w-36',
      headerTooltip: 'EVE time (UTC)',
      className: 'whitespace-nowrap',
      cellClassName: () => 'text-accent',
      primary: true,
      render: (row) => row.date,
      sortValue: (row) => row.date,
    },
    {
      id: 'system',
      header: 'System',
      headerCellClassName: 'sm:w-24',
      render: (row) => (
        <DataTableDenseCell>
          <span className={entityLinkClassName()}>{row.system}</span>
          <SecurityValue security={SECURITY[row.system]} />
        </DataTableDenseCell>
      ),
      sortValue: (row) => row.system,
    },
    {
      id: 'payee',
      header: 'Payee',
      className: 'sm:truncate',
      render: (row) =>
        row.state === 'Conflict' ? (
          <span>
            Ashfall Prospecting
            <span className="text-text-dim"> · book: {CORP.name}</span>
          </span>
        ) : (
          row.payee
        ),
      sortValue: (row) => row.payee,
    },
    {
      id: 'ore',
      header: 'Ore',
      headerCellClassName: 'sm:w-20',
      render: (row) => (
        <span className="inline-flex">
          <OreIcon typeId={ORE_TYPE[row.ore]} size={32} className="h-4 w-4" />
        </span>
      ),
    },
    {
      id: 'value',
      header: 'Est. value',
      headerCellClassName: 'sm:w-32',
      align: 'right',
      className: 'whitespace-nowrap',
      stackAffix: { after: ' value' },
      render: (row) => (phone ? isk(row.value) : `${isk(row.value)} ISK`),
      sortValue: (row) => row.value,
    },
    {
      id: 'taxOwed',
      header: 'Tax owed',
      headerCellClassName: 'sm:w-28',
      align: 'right',
      className: 'whitespace-nowrap',
      cardCorner: true,
      cellClassName: (row) =>
        owesNow(row)
          ? 'text-isk-neg'
          : settled(row)
            ? 'text-text-dim font-normal'
            : 'text-text-dim',
      render: (row) => (row.tax === null ? '—' : `${isk(row.tax)} ISK`),
      sortValue: (row) => row.tax ?? undefined,
    },
    {
      id: 'status',
      header: 'Status',
      headerCellClassName: 'sm:w-40',
      stackEdge: 'end',
      render: (row) => <CorpStatusPill row={row} />,
      sortValue: (row) => row.state,
    },
  ];
}

/** D12's "Safe to pay" wording for the corp Payee, under its balance card. */
export function CorpBookSyncNote() {
  return (
    <NewComponent name="CorpBookSyncNote">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-success">
          Safe to pay — 17 Oct is closed ({CORP.name} synced {BOOK.lastSynced}).
        </span>
        <span className="text-text-dim">
          18 Oct: safe to pay once it is closed, after 06:00 on 19 Oct and the corp&apos;s next
          sync.
        </span>
        <span className="text-warning">
          {isk(WAITING.tax ?? 0)} sent at 13:10, waiting for the corp to credit it.
        </span>
      </p>
    </NewComponent>
  );
}

/** A History month's fold row, as the Tax tab prints it. */
function HistoryMonthHeader({
  month,
  count,
  taxTotal,
}: {
  month: string;
  count: number;
  taxTotal: number;
}) {
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-semibold">{label}</span>
      <span className="text-[0.6875rem] text-text-dim tabular-nums">
        {count} {count === 1 ? 'entry' : 'entries'} · {isk(taxTotal)} ISK tax
      </span>
    </span>
  );
}

const DEFAULT_SORT: DataTableSort = { columnId: 'date', direction: 'desc' };
const OPEN_ROWS = PERSONAL_ROWS.filter((r) => !settled(r)).sort((a, b) =>
  b.date.localeCompare(a.date)
);
const HISTORY_ROWS = PERSONAL_ROWS.filter(settled);
const HISTORY_NEWEST = HISTORY_ROWS.map((r) => r.date.slice(0, 7))
  .sort()
  .at(-1);

export function PersonalF({ detail, diff }: { detail?: boolean; diff?: boolean }) {
  const tabsId = useTabsId();
  const phone = useIsPhone();
  const [sort, setSort] = useState<DataTableSort>(DEFAULT_SORT);
  const [historySort, setHistorySort] = useState<DataTableSort>(DEFAULT_SORT);
  const openColumns = usePersonalColumns(true);
  const historyColumns = usePersonalColumns(false);
  // History has no checkboxes but keeps a same-width spacer on desktop, so its columns sit under Open's.
  const historyWithSpacer: DataTableColumn<PersonalRow>[] = phone
    ? historyColumns
    : [
        {
          id: 'spacer',
          header: '',
          className: 'w-9 pl-2 pr-0',
          headerCellClassName: 'sm:w-9',
          render: () => null,
        },
        ...historyColumns,
      ];
  const taxExport = useTableExport({
    surface: 'mining-tax',
    rows: PERSONAL_ROWS,
    columns: [
      { header: 'Character', value: (row: PersonalRow) => characterOf(row) },
      { header: 'Date', value: (row: PersonalRow) => row.date },
      { header: 'System', value: (row: PersonalRow) => row.system },
      { header: 'Payee', value: (row: PersonalRow) => row.payee },
      { header: 'Est. value', value: (row: PersonalRow) => row.value },
      { header: 'Tax owed', value: (row: PersonalRow) => row.tax },
      { header: 'Status', value: (row: PersonalRow) => row.state },
    ],
    source: 'sorted-rows',
  });
  const rowClassName = (row: PersonalRow) => cx(settled(row) && 'text-text-dim');
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <PageHeader
        title="Mining"
        meta={<DataAgeBadge date={LOADED_AT} />}
        actions={
          <>
            <Button variant="ghost">Payees</Button>
            <IconButton icon={<Icon.More />} label="More actions" />
            <IconButton icon={<Icon.Refresh />} label="Refresh" />
          </>
        }
      />
      <Tabs
        tabsId={tabsId}
        label="Mining"
        value="tax"
        onChange={() => {}}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'tax', label: 'Tax' },
          { id: 'survey', label: 'Survey' },
        ]}
      />
      <AttentionStrip
        items={[
          {
            id: 'sell-fallback',
            tone: 'info',
            title: "Some ore priced at today's sell",
            detail: (
              <p>
                Nobody is bidding on these, so they are valued at the lowest sell order today —
                likely more than a buyer would pay. Open the entry to override the value.
              </p>
            ),
          },
        ]}
      />
      <OwedBalances
        balances={[CORP_BALANCE]}
        unassigned={{ entryCount: 0, estimatedValue: 0 }}
        unlinkedPaymentCount={0}
        characterNameOf={() => ME_NAME}
        isSoleFilter={() => false}
        onFilterPayee={() => {}}
        onSettleUp={() => {}}
        onLinkPayment={() => {}}
        onAssignNext={() => {}}
        onReviewPayments={() => {}}
      />
      <CorpBookSyncNote />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CharacterFilterControl
            activeCharacterId={ME}
            value="all"
            onChange={() => {}}
            characterCount={2}
          />
          <Button size="sm">All payees</Button>
          {phone && (
            <DataTableSortPicker
              columns={openColumns}
              sort={sort}
              onSortChange={(next) => next && setSort(next)}
              size="sm"
            />
          )}
          <span className="ml-auto">
            <TableActionsMenu name="Mining" tableExport={taxExport} />
          </span>
        </div>
        <section aria-labelledby="mining-tax-open">
          <h2 id="mining-tax-open" className="sr-only">
            Open · {OPEN_ROWS.length}
          </h2>
          <Panel padded={false}>
            <div className="overflow-x-auto">
              <DataTable
                {...taxExport.tableProps}
                columns={openColumns}
                rows={OPEN_ROWS}
                className="dt-dense-lead sm:table-fixed"
                rowKey={(row) => row.id}
                label="Open mining tax entries"
                sort={sort}
                onSortChange={(next) => next && setSort(next)}
                stackLayout="dense"
                rowClassName={rowClassName}
                onRowClick={() => {}}
                selectedRowKey={detail ? BILLED.id : null}
              />
            </div>
          </Panel>
        </section>
      </div>
      <section aria-labelledby="mining-tax-history" className="space-y-2">
        <h2 id="mining-tax-history" className={eyebrowClassName}>
          History
        </h2>
        <Panel padded={false}>
          <div className="overflow-x-auto">
            <DataTable
              columns={historyWithSpacer}
              rows={HISTORY_ROWS}
              className="dt-flat-groups sm:table-fixed"
              rowKey={(row) => row.id}
              label="History"
              sort={historySort}
              onSortChange={(next) => next && setHistorySort(next)}
              stackLayout="dense"
              rowClassName={rowClassName}
              onRowClick={() => {}}
              groupBy={{
                key: (row) => row.date.slice(0, 7),
                allWidths: true,
                minSize: 1,
                // The newest month opens; older ones stay folded.
                defaultExpanded: (rows) => rows[0].date.slice(0, 7) === HISTORY_NEWEST,
                renderHeader: (rows) => (
                  <HistoryMonthHeader
                    month={rows[0].date.slice(0, 7)}
                    count={rows.length}
                    taxTotal={rows.reduce((total, row) => total + (row.tax ?? 0), 0)}
                  />
                ),
              }}
            />
          </div>
        </Panel>
      </section>
      <RowDetail open={Boolean(detail)} />
      <Modal
        open={Boolean(diff)}
        onClose={() => {}}
        placement={phone ? 'sheet' : 'center'}
        title="17 Oct · you and the book"
      >
        <CorpBookDiff />
      </Modal>
    </div>
  );
}

/** Today's row detail for an owed row, with the corp's status, terms and dispute added. */
function RowDetail({ open }: { open: boolean }) {
  const phone = useIsPhone();
  const { assignment } = BILLED_ROW;
  return (
    <Modal
      open={open}
      onClose={() => {}}
      placement={phone ? 'sheet' : 'center'}
      title={
        <span className="flex items-center gap-1.5">
          {BILLED.date} — {BILLED.system}
          <SecurityValue security={SECURITY[BILLED.system]} />
          <InfoTooltip label="About Date" content="EVE time (UTC)" />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-base font-semibold">{CORP_PAYEE}</span>
          <span className="shrink-0 text-xl font-medium text-isk-neg tabular-nums">
            {isk(assignment.taxOwed)} ISK
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-dim">
          <span>
            <span className="text-accent">{ME_NAME}</span> ·{' '}
            <span className="text-accent">{BILLED.system}</span> · 15% · Est. value{' '}
            {isk(assignment.estimatedValue)} ISK on the day mined
          </span>
          <CorpStatusPill row={BILLED} />
        </div>
        <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
          <p className={eyebrowClassName}>Ore</p>
          <ul className="divide-y divide-line text-xs">
            <li className="flex items-center gap-1.5 py-1 first:pt-0 last:pb-0">
              <OreIcon typeId={45490} size={32} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                <OreLink typeId={45490}>Zeolites</OreLink>
              </span>
              <span className="text-text-dim tabular-nums">
                {BILLED.units.toLocaleString('en')} (book) · 41,200 (you)
              </span>
            </li>
          </ul>
        </div>
        <PriceBreakdownCard
          assignment={assignment}
          payee={CORP_PAYEE_RECORD}
          systemName={BILLED.system}
          typeNames={new Map([[45490, 'Zeolites']])}
          pricesFor={() => new Map([[45490, 148.2]])}
          priceSourcesFor={() => new Map([[45490, 'saved' as const]])}
        />
        <p className="rounded-xs border border-line p-2 text-xs text-text-dim">
          The book decides this day: it is Billable (the corp synced {BOOK.lastSynced}, after its
          grace period) and goes on {CORP.name}&apos;s Oct Statement. Terms are locked to the book:{' '}
          {BOOK.hub} buy, {BOOK.oreForm} ore, 15% per-moon rate from 1 Oct 2026.
        </p>
        <div className="space-y-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs">
          <p className="font-semibold text-warning uppercase">{DIFF.disputed}</p>
          <p className="text-text-dim">
            Your own record differs from the book on quantity and rate.
          </p>
          <Button size="sm">Compare with the book…</Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary">Settle up…</Button>
          <div className="flex">
            <Button className="rounded-r-none">Edit…</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={<Icon.Expanded />}
                  label="More actions for this entry"
                  className="-ml-px rounded-l-none"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Link a wallet payment…</DropdownMenuItem>
                <DropdownMenuItem>Link a transaction…</DropdownMenuItem>
                <DropdownMenuItem>Mark as paid</DropdownMenuItem>
                <DropdownMenuItem>Combine with another day…</DropdownMenuItem>
                <DropdownMenuItem>Split between Payees…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Copy pricing as text</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger">Unassign…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button className="ml-auto">Close</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Guest verify

const verifyColumns: DataTableColumn<DayLine>[] = [
  { id: 'date', header: 'Day', render: (r) => r.date },
  {
    id: 'ore',
    header: 'Ore',
    primary: true,
    render: (r) => (
      <span>
        {r.ore} × {r.units.toLocaleString('en')}
        <span className="block text-xs text-text-dim">{r.refinery}</span>
      </span>
    ),
  },
  {
    id: 'price',
    header: 'Unit price',
    align: 'right',
    className: 'tabular-nums',
    render: (r) => (
      <span>
        {isk2(r.unitPrice)}
        <span className="block text-xs text-text-dim">
          {r.priceDate} · {r.priceSource}
        </span>
      </span>
    ),
  },
  {
    id: 'rate',
    header: 'Rate',
    align: 'right',
    className: 'tabular-nums',
    render: (r) => `${r.rate}%`,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (r) => isk(r.tax),
  },
];

/** B's layout; on a phone the order is Balance due, Terms, lines, payments, Stop reminders. */
export function VerifyF() {
  const paid = VERIFY.payments.reduce((total, p) => total + p.amount, 0);
  return (
    <div className="min-h-screen bg-bg text-text">
      <VerifyTopBar />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <header>
          <p className="text-xs tracking-widest text-text-dim uppercase">
            {CORP.name} · Statement {VERIFY.period} · issued {VERIFY.issued}
          </p>
          <h1 className="text-xl font-semibold">{VERIFY.miner}</h1>
        </header>
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
          <div className="order-3 min-w-0 space-y-4 md:order-none md:col-start-1 md:row-span-3 md:row-start-1">
            <Panel
              title="What you mined"
              meta={
                <span className="text-xs text-text-dim">
                  {BOOK.hub} buy, {BOOK.oreForm} ore, priced on the day mined
                </span>
              }
              padded={false}
            >
              <DataTable
                label="Statement lines"
                columns={verifyColumns}
                rows={VERIFY.lines}
                rowKey={(r) => r.id}
                density="compact"
                stackLayout="dense"
              />
              <p className="border-t border-line px-3 py-2 text-right text-sm tabular-nums">
                Billed <span className="font-semibold">{isk(VERIFY.billed)}</span>
              </p>
            </Panel>
            <Panel title="Payments credited">
              {VERIFY.payments.map((p) => (
                <p key={p.id} className="flex justify-between gap-3 text-sm tabular-nums">
                  <span>
                    {p.date} · {p.from}
                    <span className="block text-xs text-text-dim">to the {p.to} Statement</span>
                  </span>
                  <span className="text-isk-pos">+{isk(p.amount)}</span>
                </p>
              ))}
            </Panel>
          </div>
          <Panel className="order-1 md:order-none md:col-start-2 md:row-start-1">
            <StatChips>
              <StatChip label="Balance due" value={isk(VERIFY.due_amount)} tone="danger" emphasis />
            </StatChips>
            <p className="mt-2 text-sm tabular-nums">
              Billed {isk(VERIFY.billed)} − paid {isk(paid)}. Due {VERIFY.due}. Code{' '}
              <span className="font-mono">{VERIFY.code}</span> pins a donation to this Statement.
            </p>
            <p className="mt-2 text-xs text-text-dim">{VERIFY.declaration}</p>
          </Panel>
          <Panel title="Terms" className="order-2 md:order-none md:col-start-2 md:row-start-2">
            <dl className="space-y-2 text-sm">
              {VERIFY.terms.map((t) => (
                <div key={t.term}>
                  <dt className="text-xs text-text-dim">{t.term}</dt>
                  <dd>{t.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <div className="order-4 md:order-none md:col-start-2 md:row-start-3">
            <StopReminders checked={false} />
          </div>
        </div>
      </main>
    </div>
  );
}
