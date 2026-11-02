import { useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  Checkbox,
  DataTable,
  Field,
  FieldError,
  Fields,
  FilterBar,
  FilterChip,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  SegmentedControl,
  SlideOver,
  StatChip,
  StatChips,
  TextInput,
  ValueList,
  ValueRow,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/numberLocale';
import { useIsPhone } from '@/lib/useIsPhone';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CsvColumn } from '@/lib/csv';
import { Effect, Footer as BaseFooter } from './corpTaxBookDialogs';
import { caretColumn } from './corpTaxBookColumns';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { MINING_PARAMS, MOONS_PARAMS, PHONE_GLOBALS, isk, isk2 } from './corpTaxBookFormat';
import { Crumb, MoonsHeader, MoonsTabs, OverdueWord } from './corpTaxBookParts';
import {
  FOCUS_MINERS,
  FOCUS_ROW,
  FOCUS_TOTALS,
  LIST_MINERS,
  LIST_TOTALS,
  MEMBER_RATE,
  dismissedPop,
  rateCutPop,
  MIN_STATEMENT,
  MONTH_STATEMENT,
  MOON_POPS,
  MOON_TOTALS,
  PAYMENTS,
  POP_ROWS,
  VARRO_TOTALS,
  dateOf,
  type ListMiner,
  type MoonPop,
  type Payment,
  type PopMiner,
  type PopRow,
} from './moonScaleFixtures';

/**
 * Moon mining at scale: the officer's pages for a corp whose heaviest miner
 * mined on 68 of 79 days across 20 moons and 57 pops. Built for two
 * reviews, a CEO's day-to-day jobs and a UI/UX pass.
 *
 * One idea carries the whole thing: **the pop is the unit.** Every figure
 * (mined, tax, paid, owed) is the same sum of the same lines, so the Miner
 * page, the Miner x pop page and the pop's own page always agree, and each
 * names the next page as a link instead of repeating it.
 *
 * - **Miner** (step 1): chips for the whole position; one table of pops,
 *   folded by month with each month's Statement and what is owed in its
 *   header; Payments say which pops they cleared.
 * - **Miner x pop** (step 2): a side panel over the Miner or pop page (it is
 *   four lines and two payments, not a page): the days of one pop and its payments.
 * - **Pop** (step 3): who mined it and what each still owes, the moon's other
 *   pops with their outstanding, and the moon's rate going forward.
 * - **Dialogs** (steps 4 to 6): change this pop's tax, dismiss it, change a
 *   moon's rate from a date.
 * - **Miners** (step 7): filter to who gets a Statement, who is overdue, who
 *   is below the minimum.
 *
 * Proposed new component: a percent field (the % sits inside the input's
 * edge, so nobody types it). Everything else ships today: Panel, DataTable
 * (month `groupBy`, dense phone cards), StatChips, FilterBar, SlideOver,
 * Fields, TableActionsMenu and Modal.
 */
const meta = {
  title: 'mockups/Moon mining at scale',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
  render: () => <MinerAtScale />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-page space-y-4 px-4 py-4">{children}</div>;
}

const num = 'tabular-nums';

/** Columns an accountant reads on a desktop and a phone card has no room for. */
const PHONE_DROPPED = new Set(['paid-on', 'reminder', 'overdue']);

/** A phone card is already a tap target, and a trailing caret would print as one more value on its meta line. */
function cardColumns<T>(columns: DataTableColumn<T>[], phone: boolean): DataTableColumn<T>[] {
  if (!phone) return columns;
  return columns
    .filter((c) => c.id !== 'go' && !PHONE_DROPPED.has(c.id))
    .map((c) =>
      // "Paid —" on a card says nothing; leave it out until something was paid.
      c.id === 'paid' ? { ...c, render: (r: T) => (c.render(r) === '—' ? null : c.render(r)) } : c
    );
}
const dash = (n: number) => (n ? isk(n) : '—');

function More({ label }: { label: string }) {
  return <IconButton icon={<Icon.More />} label={label} />;
}

// ---------------------------------------------------------------- shared parts

/** One line that proves the page: what the tax was, where it went. */
function Footing({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-line px-3 py-2 text-xs text-text-dim tabular-nums">{children}</p>
  );
}

interface ActivityLine {
  when: string;
  who: string;
  what: string;
  why?: string;
  reverse?: boolean;
}

/** Who did what and why, newest first; the book's full log is one click away. */
function ActivityPanel({ lines }: { lines: ActivityLine[] }) {
  return (
    <Panel
      title="Activity"
      meta={<span className="text-xs text-text-dim">Newest first</span>}
      actions={
        <Button size="sm" variant="ghost">
          Open all activity
        </Button>
      }
    >
      <ul className="divide-y divide-line text-sm">
        {lines.map((a) => (
          <li
            key={a.when + a.what}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5"
          >
            <span className="w-16 shrink-0 text-xs text-text-dim tabular-nums">{a.when}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{a.who}</span> {a.what}
              {a.why && <span className="text-text-dim"> · “{a.why}”</span>}
            </span>
            {a.reverse && (
              <button type="button" className={textActionClassName('shrink-0')}>
                Reverse
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- 1 Miner

/**
 * What the pop's name line adds beyond the columns: only the exceptions. A
 * pop that is simply owed, paid or waiting says nothing here; its month's
 * header already names the Statement.
 */
function PopTags({ row }: { row: PopRow }) {
  return (
    <span className="block text-xs text-text-dim">
      {row.fractured} · {row.days} {row.days === 1 ? 'day' : 'days'}
      {row.pop.rate !== MEMBER_RATE && (
        <span className="text-warning"> · {row.pop.rate}% rate</span>
      )}
      {row.status === 'Dismissed' && <span className="text-warning"> · Dismissed</span>}
      {row.status === 'Part paid' && <span className="text-warning"> · Part paid</span>}
    </span>
  );
}

/** Phone cards for a pop: the name line, Owed in the corner, the rest as one labelled line. */
const popColumns: DataTableColumn<PopRow>[] = [
  {
    id: 'pop',
    header: 'Moon pop',
    primary: true,
    render: (row) => (
      <span className="block min-w-0">
        <span className="text-accent">{row.pop.moon}</span>
        <PopTags row={row} />
      </span>
    ),
    sortValue: (row) => row.pop.fracture,
  },
  {
    id: 'mined',
    header: 'Mined',
    align: 'right',
    className: num,
    stackAffix: { before: 'Mined ' },
    render: (row) => isk(row.value),
    sortValue: (row) => row.value,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: num,
    stackAffix: { before: 'Tax ' },
    render: (row) =>
      row.status === 'Dismissed' ? (
        <span className="text-text-dim line-through decoration-text-faint">{isk(row.waived)}</span>
      ) : (
        isk(row.tax)
      ),
    sortValue: (row) => row.tax,
  },
  {
    id: 'paid',
    header: 'Paid',
    align: 'right',
    className: num,
    stackAffix: { before: 'Paid ' },
    render: (row) => dash(row.paid),
    sortValue: (row) => row.paid,
  },
  {
    id: 'owed',
    header: 'Owed',
    align: 'right',
    className: num,
    cardCorner: true,
    render: (row) => (row.owed ? <span className="text-danger">{isk(row.owed)}</span> : '—'),
    sortValue: (row) => row.owed,
  },
  caretColumn<PopRow>(),
];

const popCsv: CsvColumn<PopRow>[] = [
  { header: 'Moon', value: (r) => r.pop.moon },
  { header: 'Pop', value: (r) => r.fractured },
  { header: 'Month', value: (r) => r.month },
  { header: 'Mined', value: (r) => r.value },
  { header: 'Tax', value: (r) => r.tax },
  { header: 'Paid', value: (r) => r.paid },
  { header: 'Owed', value: (r) => r.owed },
  { header: 'Status', value: (r) => r.status },
];

type PopFilter = 'all' | 'owed' | 'next' | 'paid' | 'dismissed';

const FILTERS: { id: PopFilter; label: string; match: (r: PopRow) => boolean }[] = [
  { id: 'all', label: 'All pops', match: () => true },
  { id: 'owed', label: 'Owed', match: (r) => r.owed > 0 },
  {
    id: 'next',
    label: 'Not billed yet',
    match: (r) => r.status === 'Next Statement' || r.status === 'Not billable yet',
  },
  { id: 'paid', label: 'Paid', match: (r) => r.status === 'Paid' },
  { id: 'dismissed', label: 'Dismissed', match: (r) => r.status === 'Dismissed' },
];

function monthHeader(rows: readonly PopRow[]) {
  const { month } = rows[0];
  const owed = rows.reduce((t, r) => t + r.owed, 0);
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-left">
      <span className="font-semibold">{month} 2026</span>
      <span className="text-xs text-text-dim">{MONTH_STATEMENT[month]}</span>
      <span className="text-xs text-text-dim tabular-nums">
        {rows.length} pops · tax {isk(rows.reduce((t, r) => t + r.tax, 0))}
        {owed ? (
          <span className="text-danger"> · {isk(owed)} owed</span>
        ) : month === 'Oct' ? null : (
          <span className="text-success"> · all paid</span>
        )}
      </span>
    </span>
  );
}

const paymentColumns: DataTableColumn<Payment>[] = [
  { id: 'date', header: 'When', render: (row) => row.date },
  { id: 'from', header: 'From', primary: true, render: (row) => row.from },
  {
    id: 'amount',
    header: 'Amount',
    align: 'right',
    className: num,
    cardCorner: true,
    render: (row) => <span className="text-isk-pos">+{isk(row.amount)}</span>,
  },
  {
    id: 'covers',
    header: 'Cleared',
    render: (row) => (
      <span>
        <span className="text-accent">{row.statement}</span> · {row.popIds.length} pops
        <span className="block text-xs text-text-dim max-sm:hidden">
          {row.covers.split(', ').slice(1).join(', ')}
        </span>
      </span>
    ),
  },
];

/** The shape of every page's title-bar buttons: one height, matching the bell and ⋮ beside them. */
function HeaderActions({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-2">{children}</span>;
}

function MinerAtScale({
  initial = 'all',
  payment: initialPayment = null,
  slide = false,
  adjust = false,
}: {
  initial?: PopFilter;
  payment?: number | null;
  /** The Miner x pop side panel, open over the page. */
  slide?: boolean;
  adjust?: boolean;
}) {
  const [filter, setFilter] = useState<PopFilter>(initial);
  const [query, setQuery] = useState('');
  const [paymentId, setPaymentId] = useState<number | null>(initialPayment);
  const [slideOpen, setSlideOpen] = useState(slide);
  const payment = PAYMENTS.find((p) => p.id === paymentId) ?? null;
  const count = (f: PopFilter) => POP_ROWS.filter(FILTERS.find((x) => x.id === f)!.match).length;
  const rows = POP_ROWS.filter(FILTERS.find((x) => x.id === filter)!.match)
    .filter((r) => !payment || payment.popIds.includes(r.pop.id))
    .filter((r) => !query || r.pop.moon.toLowerCase().includes(query.toLowerCase()));
  const phone = useIsPhone();
  const tableExport = useTableExport({ surface: 'corp-members', rows, columns: popCsv });
  const t = VARRO_TOTALS;
  const grossTax = t.tax + t.waived + t.rateCut;
  return (
    <Page>
      <Crumb label="Miners" />
      <PageHeader
        title="Varro Kestane"
        meta={<span className="text-xs text-text-dim">Member · Varro Kestane, Lysa Kestane</span>}
        actions={
          <HeaderActions>
            <Button>Record payment…</Button>
            {!phone && <Button variant="ghost">Send reminder…</Button>}
            <More label={phone ? 'More: send reminder, export' : 'More actions'} />
          </HeaderActions>
        }
      />
      <StatChips>
        <StatChip label="Owed" value={isk(t.owed)} tone="danger" emphasis />
        <StatChip
          label="Not billed yet"
          value={isk(t.nextStatement)}
          tooltip={`Goes on the 1 Nov Statement. 18 Oct (${isk(t.notBillable)} so far) is not Billable yet.`}
          tooltipGlyph="info"
        />
        <StatChip
          label="Tax since 1 Aug"
          value={isk(t.tax)}
          tooltip={`${isk(t.value)} mined × ${MEMBER_RATE}% = ${isk(grossTax)}, less ${isk(t.waived)} dismissed and ${isk(t.rateCut)} from one pop at 5%. Paid ${isk(t.paid)}.`}
          tooltipGlyph="info"
        />
        <StatChip
          label="Mined"
          value={isk(t.value)}
          tooltip={`${t.days} days · ${t.moons} moons · ${t.pops} pops · ${formatNumber(t.lines)} lines`}
          tooltipGlyph="info"
        />
        <StatChip label="Rate" value={`${MEMBER_RATE}%`} />
      </StatChips>
      <Panel
        title="Moon pops"
        meta={<span className="text-xs text-text-dim">Billable through 17 Oct</span>}
        actions={<TableActionsMenu name="Moon pops" tableExport={tableExport} />}
        padded={false}
      >
        <div className="space-y-2 p-3">
          <FilterBar
            value={filter}
            onChange={setFilter}
            activeCount={(filter !== 'all' ? 1 : 0) + (payment ? 1 : 0)}
            title="Filter pops"
            search={
              <SearchInput
                className="min-w-40 flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search moons…"
                aria-label="Search moons"
              />
            }
          >
            {(value, onChange) =>
              FILTERS.map((f) => (
                <FilterChip
                  key={f.id}
                  label={f.label}
                  selected={value === f.id}
                  count={count(f.id)}
                  onToggle={() => onChange(f.id)}
                />
              ))
            }
          </FilterBar>
          {payment && (
            <p className="text-xs text-text-dim">
              Showing the {rows.length} pops the {payment.date} payment cleared.{' '}
              <button
                type="button"
                className={textActionClassName()}
                onClick={() => setPaymentId(null)}
              >
                Show all
              </button>
            </p>
          )}
        </div>
        <DataTable
          label="Moon pops"
          columns={cardColumns(popColumns, phone)}
          rows={rows}
          rowKey={(row) => row.pop.id}
          onRowClick={() => setSlideOpen(true)}
          selectedRowKey={slideOpen ? FOCUS_ROW.pop.id : null}
          rowClassName={() => 'group'}
          density="compact"
          stackLayout="dense"
          groupBy={{
            key: (row) => row.month,
            renderHeader: monthHeader,
            defaultExpanded: (r) => payment !== null || r.some((x) => x.owed > 0),
            allWidths: true,
            minSize: 1,
          }}
        />
        <Footing>
          Tax {isk(t.tax)} = paid {isk(t.paid)} + owed {isk(t.owed)} + next Statement{' '}
          {isk(t.nextStatement)} + today’s mining {isk(t.notBillable)}
        </Footing>
      </Panel>
      <Panel
        title="Payments"
        meta={<span className="text-xs text-text-dim">Select one to see the pops it cleared</span>}
        padded={false}
      >
        <DataTable
          label="Payments"
          columns={paymentColumns}
          rows={[...PAYMENTS].reverse()}
          rowKey={(row) => row.id}
          onRowClick={(row) => setPaymentId(row.id === paymentId ? null : row.id)}
          rowClassName={(row) => cx('group', row.id === paymentId && 'bg-panel-2')}
          density="compact"
          stackLayout="dense"
        />
      </Panel>
      <ActivityPanel
        lines={[
          {
            when: '16 Oct',
            who: 'Book',
            what: `credited Lysa Kestane’s ${isk(PAYMENTS[3].amount)} donation to the Sep Statement`,
            why: 'Automatic',
          },
          {
            when: '12 Oct',
            who: 'Kestrel Vane',
            what: `dismissed ${dismissedPop!.moon}, ${dateOf(dismissedPop!.fracture)} pop`,
            why: 'Corp capital build haul',
            reverse: true,
          },
          {
            when: '6 Oct',
            who: 'Kestrel Vane',
            what: `set ${rateCutPop!.moon}, ${dateOf(rateCutPop!.fracture)} pop to 5%`,
            why: 'Alliance mining op',
            reverse: true,
          },
          { when: '1 Oct', who: 'Kestrel Vane', what: 'sent the Sep Statement' },
        ]}
      />
      <MinerPopSlide open={slideOpen} onClose={() => setSlideOpen(false)} adjust={adjust} />
    </Page>
  );
}

// ---------------------------------------------------------------- 2 Miner x pop

/**
 * One Miner's days on one pop. A side panel, not a page: it is four lines and
 * two payments, it is opened from a row on the Miner page or the pop's page,
 * and closing it leaves the reader exactly where they were.
 */
function MinerPopSlide({
  open,
  onClose,
  adjust = false,
}: {
  open: boolean;
  onClose: () => void;
  adjust?: boolean;
}) {
  const row = FOCUS_ROW;
  const days = [...row.lines].sort(
    (a, b) => b.day - a.day || a.character.localeCompare(b.character)
  );
  const paidBy = PAYMENTS.filter((p) => p.popIds.includes(row.pop.id));
  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title={row.pop.moon}
        subtitle={`Pop of ${row.fractured} · ${row.pop.refinery} · Varro Kestane`}
        maxWidthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Adjust tax…</Button>
            <Button size="sm" variant="ghost">
              Open the pop
            </Button>
          </div>
          <ValueList>
            <ValueRow label="Owed" value={dash(row.owed)} tone={row.owed ? 'danger' : 'default'} />
            <ValueRow label="Tax" value={isk(row.tax)} note={`${row.pop.rate}%`} />
            <ValueRow label="Paid" value={dash(row.paid)} />
            <ValueRow label="Mined" value={isk(row.value)} />
            <ValueRow label="Status" value={row.status} />
          </ValueList>
          <Panel
            title="Days"
            meta={
              <span className="text-xs text-text-dim">
                {row.pop.ore} · {isk2(row.pop.price)} per unit, Jita buy, Compressed
              </span>
            }
            padded={false}
          >
            <DataTable
              label="Days"
              density="compact"
              stackLayout="dense"
              columns={[
                {
                  id: 'day',
                  header: 'Day',
                  primary: true,
                  render: (l) => (
                    <span>
                      {dateOf(l.day)} <span className="text-text-dim">· {l.character}</span>
                    </span>
                  ),
                },
                {
                  id: 'units',
                  header: 'Units',
                  align: 'right',
                  className: num,
                  stackAffix: { after: ' units' },
                  render: (l) => formatNumber(l.units),
                },
                {
                  id: 'value',
                  header: 'Value',
                  align: 'right',
                  className: num,
                  stackAffix: { before: 'Value ' },
                  render: (l) => isk(l.value),
                },
                {
                  id: 'tax',
                  header: 'Tax',
                  align: 'right',
                  className: num,
                  cardCorner: true,
                  render: (l) => isk(l.tax),
                },
              ]}
              rows={days}
              rowKey={(l) => l.id}
            />
          </Panel>
          {paidBy.length > 0 && (
            <Panel title="Paid by" padded={false}>
              <DataTable
                label="Payments toward this pop"
                density="compact"
                stackLayout="dense"
                columns={[
                  {
                    id: 'from',
                    header: 'From',
                    primary: true,
                    render: (r: Payment) => (
                      <span>
                        {r.date} <span className="text-text-dim">· {r.from}</span>
                      </span>
                    ),
                  },
                  {
                    id: 'of',
                    header: 'Payment',
                    className: num,
                    stackAffix: { before: 'Of ' },
                    render: (r: Payment) => (
                      <span className="text-text-dim">
                        {isk(r.amount)} · {r.statement}
                      </span>
                    ),
                  },
                  {
                    id: 'applied',
                    header: 'Applied here',
                    align: 'right',
                    className: num,
                    cardCorner: true,
                    render: (r: Payment) => (
                      <span className="text-isk-pos">+{isk(r.applied[row.pop.id])}</span>
                    ),
                  },
                ]}
                rows={paidBy}
                rowKey={(p) => p.id}
              />
            </Panel>
          )}
        </div>
      </SlideOver>
      <ChangeTaxDialog open={adjust} who="one" />
    </>
  );
}

// ---------------------------------------------------------------- 3 Pop (moon) page

const minerColumns: DataTableColumn<PopMiner>[] = [
  {
    id: 'miner',
    header: 'Miner',
    primary: true,
    render: (m) => <span className="text-accent">{m.miner}</span>,
  },
  {
    id: 'mined',
    header: 'Mined',
    align: 'right',
    className: num,
    stackAffix: { before: 'Mined ' },
    render: (m) => isk(m.value),
    sortValue: (m) => m.value,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: num,
    stackAffix: { before: 'Tax ' },
    render: (m) => isk(m.tax),
    sortValue: (m) => m.tax,
  },
  {
    id: 'paid',
    header: 'Paid',
    align: 'right',
    className: num,
    stackAffix: { before: 'Paid ' },
    render: (m) => dash(m.paid),
    sortValue: (m) => m.paid,
  },
  {
    id: 'owed',
    header: 'Owed',
    align: 'right',
    className: num,
    cardCorner: true,
    render: (m) => (m.owed ? <span className="text-danger">{isk(m.owed)}</span> : '—'),
    sortValue: (m) => m.owed,
  },
  caretColumn<PopMiner>(),
];

const moonPopColumns: DataTableColumn<MoonPop>[] = [
  {
    id: 'pop',
    header: 'Pop',
    primary: true,
    render: (p) => (
      <span className="block">
        <span className={p.pop.id === FOCUS_ROW.pop.id ? 'font-semibold' : 'text-accent'}>
          {p.fractured}
        </span>
        {p.pop.id === FOCUS_ROW.pop.id && (
          <span className="block text-xs text-text-dim">This pop</span>
        )}
      </span>
    ),
    sortValue: (p) => p.pop.fracture,
  },
  {
    id: 'miners',
    header: 'Miners',
    align: 'right',
    className: num,
    stackAffix: { after: ' Miners' },
    render: (p) => p.miners,
  },
  {
    id: 'mined',
    header: 'Mined',
    align: 'right',
    className: num,
    stackAffix: { before: 'Mined ' },
    render: (p) => isk(p.value),
    sortValue: (p) => p.value,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: num,
    stackAffix: { before: 'Tax ' },
    render: (p) => isk(p.tax),
    sortValue: (p) => p.tax,
  },
  {
    id: 'owed',
    header: 'Owed',
    align: 'right',
    className: num,
    cardCorner: true,
    render: (p) =>
      p.owed ? (
        <span className="text-danger">{isk(p.owed)}</span>
      ) : p.status === 'Next Statement' || p.status === 'Not billable yet' ? (
        <span className="text-xs text-text-dim">Not billed yet</span>
      ) : (
        '—'
      ),
    sortValue: (p) => p.owed,
  },
  caretColumn<MoonPop>(),
];

interface RateChange {
  from: string;
  scope: string;
  rates: string;
  by: string;
  pending: boolean;
}
const RATE_CHANGES: RateChange[] = [
  {
    from: '19 Oct · not started',
    scope: 'This moon',
    rates: '8% / 12%',
    by: 'Kestrel Vane',
    pending: true,
  },
  { from: '1 Aug', scope: 'All moons', rates: '10% / 15%', by: 'Kestrel Vane', pending: false },
];

type MoonDialog = 'change' | 'except' | 'dismiss' | 'rate' | 'rate-all' | 'rate-backdated';

const minerCsv: CsvColumn<PopMiner>[] = [
  { header: 'Miner', value: (m) => m.miner },
  { header: 'Mined', value: (m) => m.value },
  { header: 'Tax', value: (m) => m.tax },
  { header: 'Paid', value: (m) => m.paid },
  { header: 'Owed', value: (m) => m.owed },
];

function PopPage({
  dialog,
  scheduled,
  slide = false,
}: {
  dialog?: MoonDialog;
  scheduled?: boolean;
  slide?: boolean;
}) {
  const row = FOCUS_ROW;
  const phone = useIsPhone();
  const [slideOpen, setSlideOpen] = useState(slide);
  const sortedMiners = [...FOCUS_MINERS].sort((a, b) => b.owed - a.owed);
  const minerExport = useTableExport({
    surface: 'corp-members',
    rows: sortedMiners,
    columns: minerCsv,
  });
  const minerActions = (
    <span className="flex items-center gap-2">
      <Button size="sm" variant="ghost">
        Adjust…
      </Button>
      <Button size="sm" variant="ghost">
        Dismiss…
      </Button>
      <TableActionsMenu name="Who mined this pop" tableExport={minerExport} />
    </span>
  );

  return (
    <Page>
      <Crumb label="Extractions" />
      <PageHeader
        title={row.pop.moon}
        meta={
          <span className="text-xs text-text-dim">{row.pop.refinery} · 3 pops since 1 Aug</span>
        }
      />
      <StatChips>
        <StatChip label="Owed" value={dash(MOON_TOTALS.owed)} tone="danger" emphasis />
        <StatChip label="Tax" value={isk(MOON_TOTALS.tax)} />
        <StatChip label="Paid" value={isk(MOON_TOTALS.paid)} />
        <StatChip label="Mined" value={isk(MOON_TOTALS.value)} />
        <StatChip
          label="Rate"
          value={scheduled ? `${MEMBER_RATE}% → 8% from 19 Oct` : `${MEMBER_RATE}% · guests 15%`}
        />
      </StatChips>
      <Panel
        title={`Who mined the ${row.fractured} pop`}
        actions={phone ? undefined : minerActions}
        padded={false}
      >
        {phone && <div className="border-b border-line p-3">{minerActions}</div>}
        <DataTable
          label="Who mined this pop"
          columns={cardColumns(minerColumns, phone)}
          rows={sortedMiners}
          rowKey={(m) => m.miner}
          onRowClick={() => setSlideOpen(true)}
          rowClassName={() => 'group'}
          density="compact"
          stackLayout="dense"
        />
        <Footing>
          Tax {isk(FOCUS_TOTALS.tax)} = paid {isk(FOCUS_TOTALS.paid)} + owed{' '}
          {isk(FOCUS_TOTALS.owed)} · {isk2(FOCUS_ROW.pop.price)} per unit, Jita buy, Compressed
        </Footing>
      </Panel>
      <Panel
        title="All pops"
        padded={false}
        actions={
          <Button size="sm" variant="ghost">
            Change moon rate…
          </Button>
        }
      >
        <DataTable
          label="Pops of this moon"
          columns={cardColumns(moonPopColumns, phone)}
          rows={MOON_POPS}
          rowKey={(p) => p.pop.id}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          density="compact"
          stackLayout="dense"
        />
      </Panel>
      {scheduled && (
        <Panel
          title="Rate changes"
          meta={<span className="text-xs text-text-dim">Newest first</span>}
          padded={false}
        >
          <DataTable
            label="Rate changes"
            density="compact"
            stackLayout="dense"
            columns={[
              { id: 'from', header: 'From', primary: true, render: (r: RateChange) => r.from },
              { id: 'scope', header: 'Applies to', render: (r: RateChange) => r.scope },
              {
                id: 'rates',
                header: 'Member / Guest',
                align: 'right',
                className: num,
                cardCorner: true,
                render: (r: RateChange) => r.rates,
              },
              {
                id: 'by',
                header: 'By',
                stackAffix: { before: 'By ' },
                render: (r: RateChange) => r.by,
              },
              {
                id: 'act',
                header: '',
                align: 'right',
                stackEdge: 'end',
                render: (r: RateChange) =>
                  r.pending ? (
                    <button type="button" className={textActionClassName()}>
                      Reverse
                    </button>
                  ) : null,
              },
            ]}
            rows={RATE_CHANGES}
            rowKey={(r: RateChange) => r.from}
          />
        </Panel>
      )}
      <ActivityPanel
        lines={[
          ...(scheduled
            ? [
                {
                  when: '18 Oct',
                  who: 'Kestrel Vane',
                  what: 'scheduled this moon to 8% / 12% from 19 Oct',
                  why: 'Cheaper to keep miners home',
                  reverse: true,
                },
              ]
            : []),
          {
            when: '1 Oct',
            who: 'Kestrel Vane',
            what: 'sent the Sep Statement (9 Miners on this pop)',
          },
          { when: '1 Aug', who: 'Kestrel Vane', what: 'set the book default to 10% / 15%' },
        ]}
      />
      <ChangeTaxDialog
        open={dialog === 'change' || dialog === 'except'}
        who={dialog === 'except' ? 'except' : 'all'}
      />
      <DismissPopDialog open={dialog === 'dismiss'} />
      <MoonRateDialog
        open={dialog === 'rate' || dialog === 'rate-all' || dialog === 'rate-backdated'}
        all={dialog === 'rate-all'}
        backdated={dialog === 'rate-backdated'}
      />
      <MinerPopSlide open={slideOpen} onClose={() => setSlideOpen(false)} />
    </Page>
  );
}

// ---------------------------------------------------------------- Dialogs

function Before({
  label,
  from,
  to,
  note,
}: {
  label: string;
  from: string;
  to: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 tabular-nums">
      <span>
        {label}
        {note && <span className="block text-xs text-text-dim">{note}</span>}
      </span>
      <span>
        <span className="text-text-dim">{from}</span> → <span className="font-semibold">{to}</span>
      </span>
    </div>
  );
}

/** Who an adjustment applies to: everyone, everyone but some Miners, or one Miner (by character). */
type Who = 'all' | 'except' | 'one';
const LEFT_OUT = ['Juno Rask', 'Marek Dols'];

/** What halving the pop's tax does to the Miners it applies to: those who paid the full 10% are overpaid. */
function halved(who: Who) {
  const affected = FOCUS_MINERS.filter((m) =>
    who === 'one'
      ? m.miner === 'Varro Kestane'
      : who === 'except'
        ? !LEFT_OUT.includes(m.miner)
        : true
  );
  const rows = affected.map((m) => {
    const tax = Math.round(m.tax / 2);
    return { m, tax, owed: Math.max(0, tax - m.paid), credit: Math.max(0, m.paid - tax) };
  });
  const sum = (pick: (a: (typeof rows)[number]) => number) => rows.reduce((t, a) => t + pick(a), 0);
  return {
    count: rows.length,
    taxBefore: sum((a) => a.m.tax),
    owedBefore: sum((a) => a.m.owed),
    tax: sum((a) => a.tax),
    owed: sum((a) => a.owed),
    credit: sum((a) => a.credit),
  };
}

/**
 * A percent the officer types: the % rides inside the field's right edge, so
 * the value is just a number and the unit is never typed. Proposed as a
 * shared primitive; there is none yet.
 */
/** The dialogs' footer: on a phone Cancel and the action share the row equally. */
function Footer(props: ComponentProps<typeof BaseFooter>) {
  return (
    <div className="max-sm:[&>div]:grid max-sm:[&>div]:grid-cols-2">
      <BaseFooter {...props} />
    </div>
  );
}

function PercentField({
  value,
  label,
  invalid,
}: {
  value: string;
  label: string;
  invalid?: boolean;
}) {
  return (
    <span className="relative inline-block w-24">
      <TextInput
        value={value}
        onChange={() => {}}
        aria-label={label}
        inputMode="decimal"
        aria-invalid={invalid || undefined}
        className="w-full pr-7 text-right tabular-nums"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-dim"
      >
        %
      </span>
    </span>
  );
}

function ChangeTaxDialog({ open, who = 'all' }: { open: boolean; who?: Who }) {
  const phone = useIsPhone();
  const row = FOCUS_ROW;
  const e = halved(who);
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title={
        who === 'one'
          ? `Adjust ${row.pop.moon}, ${row.fractured} pop, for Varro Kestane`
          : `Adjust ${row.pop.moon}, ${row.fractured} pop`
      }
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="primary">Set to 5%</Button>} />}
    >
      <div className="space-y-4 text-sm">
        <Fields variant="form">
          {who === 'one' ? (
            <Field label="Character">
              <SegmentedControl
                label="Character"
                value="both"
                onChange={() => {}}
                options={[
                  { value: 'both', label: 'Both' },
                  { value: 'varro', label: 'Varro' },
                  { value: 'lysa', label: 'Lysa' },
                ]}
                uppercase={false}
              />
            </Field>
          ) : (
            <Field label="Applies to">
              <SegmentedControl
                label="Applies to"
                value={who}
                onChange={() => {}}
                options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'except', label: 'Everyone except…' },
                ]}
                uppercase={false}
              />
            </Field>
          )}
          {who === 'except' && (
            <Field label="Leave out" note="They stay at 10%.">
              <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2">
                {FOCUS_MINERS.map((m) => (
                  <label key={m.miner} className="flex items-center justify-start gap-2">
                    <Checkbox
                      aria-label={`Leave out ${m.miner}`}
                      checked={LEFT_OUT.includes(m.miner)}
                      onChange={() => {}}
                    />
                    <span className="text-xs">{m.miner}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Field label="Tax">
            <SegmentedControl
              label="Tax"
              value="rate"
              onChange={() => {}}
              options={[
                { value: 'rate', label: 'Set a rate' },
                { value: 'dismiss', label: 'No tax' },
              ]}
              uppercase={false}
            />
          </Field>
          <Field label="Rate" htmlFor="pop-rate">
            <PercentField value="5" label="Rate" />
          </Field>
          <Field label="Reason" htmlFor="pop-reason" note="Shown to Miners.">
            <TextInput
              id="pop-reason"
              value="Alliance mining op"
              onChange={() => {}}
              className="w-full"
            />
          </Field>
        </Fields>
        <Effect>
          <span className="block space-y-1">
            <span className="block text-xs text-text-dim">
              {e.count} {e.count === 1 ? 'Miner' : 'Miners'}
            </span>
            <Before label="Tax" from={isk(e.taxBefore)} to={isk(e.tax)} />
            <Before label="Owed" from={isk(e.owedBefore)} to={isk(e.owed)} />
            <Before
              label="Credit held"
              from={isk(0)}
              to={isk(e.credit)}
              note="Paid at 10% already; used on their next Statement"
            />
          </span>
        </Effect>
        <p className="text-xs text-warning">
          The Sep Statement is already sent. It is not re-mailed.
        </p>
      </div>
    </Modal>
  );
}

function DismissPopDialog({ open }: { open: boolean }) {
  const phone = useIsPhone();
  const row = FOCUS_ROW;
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title={`Dismiss ${row.pop.moon}, ${row.fractured} pop?`}
      placement={phone ? 'sheet' : 'center'}
      footer={
        <Footer confirm={<Button variant="primary">Dismiss {isk(FOCUS_TOTALS.tax)}</Button>} />
      }
    >
      <div className="space-y-4 text-sm">
        <Fields variant="form">
          <Field label="Reason" htmlFor="dismiss-reason" note="Shown to Miners.">
            <TextInput
              id="dismiss-reason"
              value="Corp capital build haul"
              onChange={() => {}}
              className="w-full"
            />
          </Field>
        </Fields>
        <Effect>
          <span className="block space-y-1">
            <span className="block text-xs text-text-dim">{FOCUS_TOTALS.miners} Miners</span>
            <Before label="Tax" from={isk(FOCUS_TOTALS.tax)} to={isk(0)} />
            <Before label="Owed" from={isk(FOCUS_TOTALS.owed)} to={isk(0)} />
            <Before
              label="Credit held"
              from={isk(0)}
              to={isk(FOCUS_TOTALS.paid)}
              note="What Miners already paid, used on their next Statement"
            />
          </span>
        </Effect>
      </div>
    </Modal>
  );
}

function MoonRateDialog({
  open,
  all,
  backdated,
}: {
  open: boolean;
  all: boolean;
  backdated?: boolean;
}) {
  const phone = useIsPhone();
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title={all ? 'Change the rate for all moons' : 'Change the rate for Efa V - Moon 3'}
      placement={phone ? 'sheet' : 'center'}
      footer={
        <Footer
          confirm={
            <Button variant="primary" disabled={backdated}>
              Save rate
            </Button>
          }
        />
      }
    >
      <div className="space-y-4 text-sm">
        <Fields variant="form">
          <Field label="Applies to">
            <SegmentedControl
              label="Applies to"
              value={all ? 'all' : 'moon'}
              onChange={() => {}}
              options={[
                { value: 'moon', label: 'This moon' },
                { value: 'all', label: 'All 20 moons' },
              ]}
              uppercase={false}
            />
          </Field>
          <Field label="Member" htmlFor="rate-member">
            <PercentField value="8" label="Member rate" />
          </Field>
          <Field label="Guest" htmlFor="rate-guest">
            <PercentField value="12" label="Guest rate" />
          </Field>
          <Field label="Starting from" htmlFor="rate-from">
            <span className="flex flex-col gap-1">
              <TextInput
                id="rate-from"
                value={backdated ? '12 Oct 2026' : '18 Oct 2026'}
                onChange={() => {}}
                aria-invalid={backdated || undefined}
                aria-describedby={backdated ? 'rate-from-error' : undefined}
                className="w-full sm:w-40"
              />
              {backdated && (
                <FieldError id="rate-from-error" className="text-xs">
                  Taxes can’t be backdated. Pick today or later.
                </FieldError>
              )}
            </span>
          </Field>
          <Field label="Reason" htmlFor="rate-reason" note="Shown in the Activity log.">
            <TextInput
              id="rate-reason"
              value="Cheaper to keep miners home"
              onChange={() => {}}
              className="w-full"
            />
          </Field>
        </Fields>
        <Effect>
          <span className="block space-y-1">
            <Before label="Member" from={`${MEMBER_RATE}%`} to="8%" />
            <Before label="Guest" from="15%" to="12%" />
            <span className="block text-xs text-text-dim">
              {all ? 'All 20 moons' : 'Efa V - Moon 3'} · mining from 18 Oct. Earlier days keep
              their rate.
            </span>
          </span>
        </Effect>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- 7 Miners

type MinerFilter = 'bill' | 'overdue' | 'below' | 'all';

const willBill = (m: ListMiner) => m.nextStatement >= MIN_STATEMENT;
const below = (m: ListMiner) => m.nextStatement > 0 && m.nextStatement < MIN_STATEMENT;

const listColumns: DataTableColumn<ListMiner>[] = [
  {
    id: 'miner',
    header: 'Miner',
    primary: true,
    render: (m) => (
      <span className="block min-w-0">
        <span className="text-accent">{m.main}</span>
        <span className="block text-xs text-text-dim">
          {m.pops} pops{m.standing === 'Guest' ? ` · Guest, ${m.corp}` : ''}
          {below(m) && <span className="text-warning"> · Under the minimum</span>}
          {m.overdueDays !== null && (
            <span className="font-semibold text-danger sm:hidden"> · Overdue {m.overdueDays}d</span>
          )}
        </span>
      </span>
    ),
    sortValue: (m) => m.main,
  },
  {
    id: 'owed',
    header: 'Owed',
    align: 'right',
    className: num,
    cardCorner: true,
    render: (m) => dash(m.owed),
    sortValue: (m) => m.owed,
  },
  {
    id: 'overdue',
    header: 'Overdue',
    render: (m) => <OverdueWord days={m.overdueDays} />,
    sortValue: (m) => m.overdueDays ?? -1,
  },
  {
    id: 'next',
    header: 'Not billed yet',
    align: 'right',
    className: cx(num, 'whitespace-nowrap'),
    stackAffix: { before: 'Not billed ' },
    render: (m) => dash(m.nextStatement),
    sortValue: (m) => m.nextStatement,
  },
  { id: 'paid-on', header: 'Last paid', render: (m) => m.lastPaid },
  {
    id: 'reminder',
    header: 'Last reminder',
    phoneHidden: true,
    render: (m) => (m.owed ? m.lastReminder : '—'),
  },
  caretColumn<ListMiner>(),
];

const listCsv: CsvColumn<ListMiner>[] = [
  { header: 'Miner', value: (m) => m.main },
  { header: 'Pops', value: (m) => m.pops },
  { header: 'Owed', value: (m) => m.owed },
  { header: 'Overdue days', value: (m) => m.overdueDays ?? '' },
  { header: 'Not billed yet', value: (m) => m.nextStatement },
  { header: 'Last paid', value: (m) => m.lastPaid },
];

function MinersList({ initial = 'bill', ticked = 0 }: { initial?: MinerFilter; ticked?: number }) {
  const phone = useIsPhone();
  const [filter, setFilter] = useState<MinerFilter>(initial);
  const matchers: Record<MinerFilter, (m: ListMiner) => boolean> = {
    bill: willBill,
    overdue: (m) => m.overdueDays !== null,
    below,
    all: () => true,
  };
  const rows = LIST_MINERS.filter(matchers[filter]);
  const [picked, setPicked] = useState<string[]>(() =>
    LIST_MINERS.filter(matchers[initial])
      .slice(0, ticked)
      .map((m) => m.main)
  );
  // A tick belongs to the filter it was made in (§6c Bulk selection).
  const pick = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  const bulk = filter === 'bill' || filter === 'overdue';
  const selected = picked.filter((n) => rows.some((r) => r.main === n));
  const selectColumn: DataTableColumn<ListMiner> = {
    id: 'select',
    header: '',
    className: 'w-8',
    stackEdge: 'start',
    render: (m) => (
      <label className={touchCheckboxLabelClassName}>
        <Checkbox
          aria-label={`Select ${m.main}`}
          checked={picked.includes(m.main)}
          onChange={() => pick(m.main)}
        />
      </label>
    ),
  };
  const overdueCount = LIST_TOTALS.overdue + 6;
  const listCardColumns = cardColumns(bulk ? [selectColumn, ...listColumns] : listColumns, phone);
  const tableExport = useTableExport({ surface: 'corp-members', rows, columns: listCsv });
  return (
    <Page>
      <MoonsHeader />
      <MoonsTabs value="miners" />
      <StatChips>
        <StatChip label="Owed" value={isk(LIST_TOTALS.owed)} emphasis />
        <StatChip
          label="Overdue"
          value={`${overdueCount} Miners`}
          tone="danger"
          tooltip="Days past due, as of 18 Oct 14:00 EVE."
          tooltipGlyph="info"
        />
        <StatChip
          label="Not billed yet"
          value={`${isk(LIST_TOTALS.next)} · ${LIST_TOTALS.willBill} Miners`}
          tooltip={`Goes on the 1 Nov Statement. ${LIST_TOTALS.below} more Miners are under the ${isk(MIN_STATEMENT)} minimum and carry over.`}
          tooltipGlyph="info"
        />
      </StatChips>
      <Panel padded={false}>
        <div className="p-3">
          <FilterBar
            value={filter}
            onChange={setFilter}
            activeCount={filter !== 'bill' ? 1 : 0}
            title="Filter Miners"
            actions={<TableActionsMenu name="Miners" size="md" tableExport={tableExport} />}
            search={
              <SearchInput
                className="min-w-40 flex-1"
                value=""
                onChange={() => {}}
                placeholder="Search Miners…"
                aria-label="Search Miners"
              />
            }
          >
            {(value, onChange) => (
              <>
                <FilterChip
                  label="Gets a Statement"
                  selected={value === 'bill'}
                  count={LIST_TOTALS.willBill}
                  onToggle={() => onChange('bill')}
                />
                <FilterChip
                  label="Overdue"
                  selected={value === 'overdue'}
                  count={overdueCount}
                  onToggle={() => onChange('overdue')}
                />
                <FilterChip
                  label="Under the minimum"
                  selected={value === 'below'}
                  count={LIST_TOTALS.below}
                  onToggle={() => onChange('below')}
                />
                <FilterChip
                  label="Everyone"
                  selected={value === 'all'}
                  count={LIST_TOTALS.miners}
                  onToggle={() => onChange('all')}
                />
              </>
            )}
          </FilterBar>
        </div>
        {bulk && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3 py-2 text-xs">
            <button
              type="button"
              className={textActionClassName()}
              onClick={() => setPicked(rows.map((r) => r.main))}
            >
              Select all
            </button>
            <button type="button" className={textActionClassName()} onClick={() => setPicked([])}>
              Select none
            </button>
            {selected.length > 0 && (
              <Button size="sm" variant="primary" className="ml-auto">
                {phone
                  ? `Send (${selected.length})…`
                  : filter === 'bill'
                    ? `Send Statements (${selected.length})…`
                    : `Send reminders (${selected.length})…`}
              </Button>
            )}
          </div>
        )}
        <DataTable
          label="Miners"
          columns={listCardColumns}
          rows={rows}
          rowKey={(m) => m.main}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          defaultSort={{ columnId: 'owed', direction: 'desc' }}
          mobileSort
          density="compact"
          stackLayout="dense"
        />
        <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
          Showing {rows.length} of {LIST_TOTALS.miners} Miners.
        </p>
      </Panel>
    </Page>
  );
}

// ---------------------------------------------------------------- Stories

const corp = (render: () => ReactElement, phone = false): Story => ({
  render,
  parameters: MOONS_PARAMS,
  ...(phone ? { globals: PHONE_GLOBALS } : {}),
});
void MINING_PARAMS;

/** @summary 1 · Miner: chips for the whole position, one table of pops folded by month (Statement and owed in each header), Payments say what they cleared. */
export const Miner = corp(() => <MinerAtScale />);
/** @summary 1 · Miner, phone. */
export const MinerPhone = corp(() => <MinerAtScale />, true);
/** @summary 1b · Miner filtered to Owed. */
export const MinerOwed = corp(() => <MinerAtScale initial="owed" />);
/** @summary 1c · Miner with a payment selected: the pop table shows only the pops it cleared. */
export const MinerPaymentSelected = corp(() => <MinerAtScale payment={4} />);
/** @summary 2 · Miner x pop: a side panel over the Miner page, with the days of one pop and the payments that cleared it. */
export const MinerOnPop = corp(() => <MinerAtScale slide />);
/** @summary 2 · Miner x pop, phone. */
export const MinerOnPopPhone = corp(() => <MinerAtScale slide />, true);
/** @summary 3 · Pop: who mined it and owes what, the moon's other pops with outstanding, the moon's rate. */
export const Pop = corp(() => <PopPage />);
/** @summary 3 · Pop, phone. */
export const PopPhone = corp(() => <PopPage />, true);
/** @summary 3b · Pop with a rate change already scheduled, and Reverse. */
export const PopScheduledRate = corp(() => <PopPage scheduled />);
/** @summary 4b · Adjust a pop for everyone except chosen Miners; the effect counts only who is affected. */
export const ChangePopTaxExcept = corp(() => <PopPage dialog="except" />);
/** @summary 4c · Adjust a pop for one Miner, by character, from the Miner x pop page. */
export const AdjustForOneMiner = corp(() => <MinerAtScale slide adjust />);
/** @summary 4 · Change this pop's tax: a rate or none, with the effect on owed. */
export const ChangePopTax = corp(() => <PopPage dialog="change" />);
/** @summary 4 · Change this pop's tax, phone. */
export const ChangePopTaxPhone = corp(() => <PopPage dialog="change" />, true);
/** @summary 5 · Dismiss a whole pop's tax. */
export const DismissPop = corp(() => <PopPage dialog="dismiss" />);
/** @summary 6 · Change a moon's rate going forward, from a date. */
export const ChangeMoonRate = corp(() => <PopPage dialog="rate" />);
/** @summary 6b · Change the rate for all moons. */
export const ChangeAllMoonsRate = corp(() => <PopPage dialog="rate-all" />);
/** @summary 6c · A start date in the past is refused: taxes cannot be backdated. */
export const ChangeMoonRateBackdated = corp(() => <PopPage dialog="rate-backdated" />);
/** @summary 6 · Change a moon's rate going forward, phone. */
export const ChangeMoonRatePhone = corp(() => <PopPage dialog="rate" />, true);
/** @summary 7 · Miners: filtered to who gets the next Statement. */
export const MinersNeedStatements = corp(() => <MinersList />);
/** @summary 7b · Miners with three ticked: the count-labelled Send Statements button appears. */
export const MinersBulkSelected = corp(() => <MinersList ticked={3} />);
/** @summary 7c · Overdue filter with Send reminders. */
export const MinersOverdueReminders = corp(() => <MinersList initial="overdue" ticked={4} />);
/** @summary 7 · Miners, phone. */
export const MinersNeedStatementsPhone = corp(() => <MinersList />, true);
