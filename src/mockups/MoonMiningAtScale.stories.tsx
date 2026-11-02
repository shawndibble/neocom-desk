import { useState, type ReactElement, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  Checkbox,
  DataTable,
  FilterChip,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  SegmentedControl,
  StatChip,
  StatChips,
  TextInput,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/numberLocale';
import { useIsPhone } from '@/lib/useIsPhone';
import { Effect, Footer, Label, LOGGED } from './corpTaxBookDialogs';
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
 * - **Miner x pop** (step 2): the days of one pop, with its payments.
 * - **Pop** (step 3): who mined it and what each still owes, the moon's other
 *   pops with their outstanding, and the moon's rate going forward.
 * - **Dialogs** (steps 4 to 6): change this pop's tax, dismiss it, change a
 *   moon's rate from a date.
 * - **Miners** (step 7): filter to who gets a Statement, who is overdue, who
 *   is below the minimum.
 *
 * New components in this mockup: none; Panel, DataTable (month `groupBy`),
 * StatChips, FilterChip and Modal as they ship.
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
    phoneHidden: true,
    render: (row) => isk(row.value),
    sortValue: (row) => row.value,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: num,
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
    phoneHidden: true,
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
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-left">
      <span className="font-semibold">{month} 2026</span>
      <span className="text-xs text-text-dim">
        {rows.length} pops · tax {isk(rows.reduce((t, r) => t + r.tax, 0))}
        {owed ? (
          <span className="text-danger"> · {isk(owed)} owed</span>
        ) : month === 'Oct' ? null : (
          <span className="text-success"> · all paid</span>
        )}
      </span>
      <span className="text-xs text-text-dim">{MONTH_STATEMENT[month]}</span>
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
      <span className="block">
        <span className="text-accent">{row.statement}</span> · {row.popIds.length} pops
        <span className="block text-xs text-text-dim">
          {row.covers.split(', ').slice(1).join(', ')}
        </span>
      </span>
    ),
  },
];

function MinerAtScale({
  initial = 'all',
  payment: initialPayment = null,
}: {
  initial?: PopFilter;
  payment?: number | null;
}) {
  const [filter, setFilter] = useState<PopFilter>(initial);
  const [query, setQuery] = useState('');
  const [paymentId, setPaymentId] = useState<number | null>(initialPayment);
  const payment = PAYMENTS.find((p) => p.id === paymentId) ?? null;
  const count = (f: PopFilter) => POP_ROWS.filter(FILTERS.find((x) => x.id === f)!.match).length;
  const rows = POP_ROWS.filter(FILTERS.find((x) => x.id === filter)!.match)
    .filter((r) => !payment || payment.popIds.includes(r.pop.id))
    .filter((r) => !query || r.pop.moon.toLowerCase().includes(query.toLowerCase()));
  const t = VARRO_TOTALS;
  const grossTax = t.tax + t.waived + t.rateCut;
  return (
    <Page>
      <Crumb label="Miners" />
      <PageHeader
        title="Varro Kestane"
        meta={<span className="text-xs text-text-dim">Member · Varro Kestane, Lysa Kestane</span>}
        actions={
          <span className="flex items-center gap-1">
            <Button size="sm">Record payment…</Button>
            <Button size="sm" variant="ghost">
              Send reminder…
            </Button>
            <Button size="sm" variant="ghost">
              Export CSV
            </Button>
            <More label="More actions" />
          </span>
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
        padded={false}
      >
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput
            className="min-w-40 flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search moons…"
            aria-label="Search moons"
          />
          {FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              selected={filter === f.id}
              count={count(f.id)}
              onToggle={() => setFilter(f.id)}
            />
          ))}
          {payment && (
            <FilterChip
              label={`Cleared by ${payment.date} payment`}
              selected
              onToggle={() => setPaymentId(null)}
            />
          )}
        </div>
        <DataTable
          label="Moon pops"
          columns={popColumns}
          rows={rows}
          rowKey={(row) => row.pop.id}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          density="compact"
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
    </Page>
  );
}

// ---------------------------------------------------------------- 2 Miner x pop

function MinerPop({ dialog }: { dialog?: 'adjust' }) {
  const row = FOCUS_ROW;
  const days = [...row.lines].sort(
    (a, b) => b.day - a.day || a.character.localeCompare(b.character)
  );
  const paidBy = PAYMENTS.filter((p) => p.popIds.includes(row.pop.id));
  return (
    <Page>
      <Crumb label="Varro Kestane" />
      <PageHeader
        title={row.pop.moon}
        meta={
          <span className="text-xs text-text-dim">
            Pop of {row.fractured} · {row.pop.refinery} · Varro Kestane
          </span>
        }
        actions={
          <span className="flex items-center gap-1">
            <Button size="sm">Adjust for Varro…</Button>
            <Button size="sm" variant="ghost">
              Everyone on this pop
            </Button>
          </span>
        }
      />
      <StatChips>
        <StatChip
          label="Owed"
          value={dash(row.owed)}
          tone={row.owed ? 'danger' : undefined}
          emphasis
        />
        <StatChip label="Tax" value={isk(row.tax)} />
        <StatChip label="Paid" value={dash(row.paid)} />
        <StatChip label="Mined" value={isk(row.value)} />
        <StatChip label="Status" value={row.status} />
      </StatChips>
      <Panel
        title="Days"
        meta={
          <span className="text-xs text-text-dim">
            {row.pop.ore} · Jita buy, Compressed, priced at each day · {row.pop.rate}% ·{' '}
            {row.lines.length} lines
          </span>
        }
        padded={false}
      >
        <DataTable
          label="Days"
          density="compact"
          columns={[
            { id: 'day', header: 'Day', render: (l) => dateOf(l.day) },
            { id: 'ch', header: 'Character', primary: true, render: (l) => l.character },
            {
              id: 'price',
              header: 'Unit price',
              align: 'right',
              className: num,
              phoneHidden: true,
              render: () => isk2(row.pop.price),
            },
            {
              id: 'units',
              header: 'Units',
              align: 'right',
              className: num,
              render: (l) => formatNumber(l.units),
            },
            {
              id: 'value',
              header: 'Value',
              align: 'right',
              className: num,
              phoneHidden: true,
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
            columns={[
              { id: 'date', header: 'When', render: (r: Payment) => r.date },
              { id: 'from', header: 'From', primary: true, render: (r: Payment) => r.from },
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
              {
                id: 'of',
                header: 'Payment',
                align: 'right',
                className: num,
                phoneHidden: true,
                render: (r: Payment) => (
                  <span className="text-text-dim">
                    {isk(r.amount)} · {r.statement}
                  </span>
                ),
              },
            ]}
            rows={paidBy}
            rowKey={(p) => p.id}
          />
        </Panel>
      )}
      <ChangeTaxDialog open={dialog === 'adjust'} who="one" />
    </Page>
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
    phoneHidden: true,
    render: (m) => isk(m.value),
    sortValue: (m) => m.value,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: num,
    render: (m) => isk(m.tax),
    sortValue: (m) => m.tax,
  },
  {
    id: 'paid',
    header: 'Paid',
    align: 'right',
    className: num,
    phoneHidden: true,
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
    phoneHidden: true,
    render: (p) => p.miners,
  },
  {
    id: 'mined',
    header: 'Mined',
    align: 'right',
    className: num,
    phoneHidden: true,
    render: (p) => isk(p.value),
    sortValue: (p) => p.value,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: num,
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

type MoonDialog = 'change' | 'except' | 'dismiss' | 'rate' | 'rate-all';

function PopPage({ dialog, scheduled }: { dialog?: MoonDialog; scheduled?: boolean }) {
  const row = FOCUS_ROW;
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
        meta={
          <span className="text-xs text-text-dim tabular-nums">
            Tax {isk(FOCUS_TOTALS.tax)} · owed {isk(FOCUS_TOTALS.owed)}
          </span>
        }
        actions={
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost">
              Adjust this pop…
            </Button>
            <Button size="sm" variant="ghost">
              Dismiss tax…
            </Button>
          </span>
        }
        padded={false}
      >
        <DataTable
          label="Who mined this pop"
          columns={minerColumns}
          rows={[...FOCUS_MINERS].sort((a, b) => b.owed - a.owed)}
          rowKey={(m) => m.miner}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          density="compact"
        />
        <Footing>
          Tax {isk(FOCUS_TOTALS.tax)} = paid {isk(FOCUS_TOTALS.paid)} + owed{' '}
          {isk(FOCUS_TOTALS.owed)} · {isk2(FOCUS_ROW.pop.price)} per unit, Jita buy, Compressed
        </Footing>
      </Panel>
      <Panel
        title="All pops of this moon"
        padded={false}
        actions={
          <Button size="sm" variant="ghost">
            Change moon rate…
          </Button>
        }
      >
        <DataTable
          label="Pops of this moon"
          columns={moonPopColumns}
          rows={MOON_POPS}
          rowKey={(p) => p.pop.id}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          density="compact"
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
            columns={[
              { id: 'from', header: 'From', primary: true, render: (r: RateChange) => r.from },
              { id: 'scope', header: 'Applies to', render: (r: RateChange) => r.scope },
              {
                id: 'rates',
                header: 'Member / Guest',
                align: 'right',
                className: num,
                render: (r: RateChange) => r.rates,
              },
              { id: 'by', header: 'By', phoneHidden: true, render: (r: RateChange) => r.by },
              {
                id: 'act',
                header: '',
                align: 'right',
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
        open={dialog === 'rate' || dialog === 'rate-all'}
        all={dialog === 'rate-all'}
      />
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
          ? `Adjust the ${row.fractured} pop for Varro Kestane`
          : `Adjust the ${row.fractured} pop`
      }
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="primary">Set to 5%</Button>} />}
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-dim">
          {row.pop.moon} ·{' '}
          {who === 'one' ? 'this pop only' : `${FOCUS_TOTALS.miners} Miners · this pop only`}
        </p>
        <Label text="Applies to">
          {who === 'one' ? (
            <SegmentedControl
              label="Applies to"
              value="both"
              onChange={() => {}}
              options={[
                { value: 'both', label: 'Both characters' },
                { value: 'varro', label: 'Varro' },
                { value: 'lysa', label: 'Lysa' },
              ]}
              uppercase={false}
            />
          ) : (
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
          )}
        </Label>
        {who === 'except' && (
          <fieldset className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xs border border-line p-2">
            <legend className="px-1 text-xs text-text-dim">Leave out (they stay at 10%)</legend>
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
          </fieldset>
        )}
        <Label text="Tax for this pop">
          <SegmentedControl
            label="Tax for this pop"
            value="rate"
            onChange={() => {}}
            options={[
              { value: 'rate', label: 'Set a rate' },
              { value: 'dismiss', label: 'No tax' },
            ]}
            uppercase={false}
          />
        </Label>
        <Label text="Rate">
          <TextInput value="5%" onChange={() => {}} aria-label="Rate" />
        </Label>
        <Label text="Reason (required, shown to Miners)">
          <TextInput value="Alliance mining op" onChange={() => {}} aria-label="Reason" />
        </Label>
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
        <p className="text-xs text-text-dim">{LOGGED}</p>
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
      title={`Dismiss the ${row.fractured} pop's tax?`}
      placement={phone ? 'sheet' : 'center'}
      footer={
        <Footer confirm={<Button variant="primary">Dismiss {isk(FOCUS_TOTALS.tax)}</Button>} />
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-dim">
          {row.pop.moon} · {FOCUS_TOTALS.miners} Miners. Stays on the record; Reverse undoes it.
        </p>
        <Label text="Reason (required, shown to Miners)">
          <TextInput value="Corp capital build haul" onChange={() => {}} aria-label="Reason" />
        </Label>
        <Effect>
          <span className="block space-y-1">
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
        <p className="text-xs text-text-dim">{LOGGED}</p>
      </div>
    </Modal>
  );
}

function MoonRateDialog({ open, all }: { open: boolean; all: boolean }) {
  const phone = useIsPhone();
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title={all ? 'Change the rate for all moons' : 'Change the rate for Efa V - Moon 3'}
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="primary">Save rate</Button>} />}
    >
      <div className="space-y-3 text-sm">
        <Label text="Applies to">
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
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Member">
            <TextInput value="8%" onChange={() => {}} aria-label="Member rate" />
          </Label>
          <Label text="Guest">
            <TextInput value="12%" onChange={() => {}} aria-label="Guest rate" />
          </Label>
        </div>
        <Label text="From (EVE date, today or later)">
          <TextInput value="19 Oct 2026" onChange={() => {}} aria-label="From date" />
        </Label>
        <Label text="Reason (shown in the Activity log)">
          <TextInput value="Cheaper to keep miners home" onChange={() => {}} aria-label="Reason" />
        </Label>
        <Effect>
          <span className="block space-y-1">
            <Before label="Member" from={`${MEMBER_RATE}%`} to="8%" />
            <Before label="Guest" from="15%" to="12%" />
            <span className="block text-xs text-text-dim">
              {all ? 'All 20 moons' : 'Efa V - Moon 3'} · mining from 19 Oct. Earlier days keep
              their rate.
            </span>
          </span>
        </Effect>
        <p className="text-xs text-text-dim">{LOGGED}</p>
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
    className: num,
    render: (m) => (
      <span className="block">
        {dash(m.nextStatement)}
        {below(m) && <span className="block text-xs text-text-dim">Under the minimum</span>}
      </span>
    ),
    sortValue: (m) => m.nextStatement,
  },
  { id: 'paid', header: 'Last paid', phoneHidden: true, render: (m) => m.lastPaid },
  {
    id: 'reminder',
    header: 'Last reminder',
    phoneHidden: true,
    render: (m) => (m.owed ? m.lastReminder : '—'),
  },
  caretColumn<ListMiner>(),
];

function MinersList({ initial = 'bill', ticked = 0 }: { initial?: MinerFilter; ticked?: number }) {
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
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput
            className="min-w-40 flex-1"
            value=""
            onChange={() => {}}
            placeholder="Search Miners or characters…"
            aria-label="Search Miners"
          />
          <FilterChip
            label="Gets a Statement"
            selected={filter === 'bill'}
            count={LIST_TOTALS.willBill}
            onToggle={() => setFilter('bill')}
          />
          <FilterChip
            label="Overdue"
            selected={filter === 'overdue'}
            count={overdueCount}
            onToggle={() => setFilter('overdue')}
          />
          <FilterChip
            label="Under the minimum"
            selected={filter === 'below'}
            count={LIST_TOTALS.below}
            onToggle={() => setFilter('below')}
          />
          <FilterChip
            label="Everyone"
            selected={filter === 'all'}
            count={LIST_TOTALS.miners}
            onToggle={() => setFilter('all')}
          />
        </div>
        {bulk && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs">
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
            <Button size="sm" variant="ghost" className={selected.length ? '' : 'ml-auto'}>
              Export CSV
            </Button>
            {selected.length > 0 && (
              <Button size="sm" variant="primary" className="ml-auto">
                {filter === 'bill'
                  ? `Send Statements (${selected.length})…`
                  : `Send reminders (${selected.length})…`}
              </Button>
            )}
          </div>
        )}
        <DataTable
          label="Miners"
          columns={bulk ? [selectColumn, ...listColumns] : listColumns}
          rows={rows}
          rowKey={(m) => m.main}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          defaultSort={{ columnId: 'owed', direction: 'desc' }}
          mobileSort
          density="compact"
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
/** @summary 2 · Miner x pop: the days of one pop and the payments that cleared it. */
export const MinerOnPop = corp(() => <MinerPop />);
/** @summary 2 · Miner x pop, phone. */
export const MinerOnPopPhone = corp(() => <MinerPop />, true);
/** @summary 3 · Pop: who mined it and owes what, the moon's other pops with outstanding, the moon's rate. */
export const Pop = corp(() => <PopPage />);
/** @summary 3 · Pop, phone. */
export const PopPhone = corp(() => <PopPage />, true);
/** @summary 3b · Pop with a rate change already scheduled, and Reverse. */
export const PopScheduledRate = corp(() => <PopPage scheduled />);
/** @summary 4b · Adjust a pop for everyone except chosen Miners; the effect counts only who is affected. */
export const ChangePopTaxExcept = corp(() => <PopPage dialog="except" />);
/** @summary 4c · Adjust a pop for one Miner, by character, from the Miner x pop page. */
export const AdjustForOneMiner = corp(() => <MinerPop dialog="adjust" />);
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
