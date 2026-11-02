import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { ReactElement, ReactNode } from 'react';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  RowCaret,
  SearchInput,
  StatChip,
  StatChips,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';
import {
  BOOK,
  CORP,
  EXTRACTIONS,
  AUG_WRITE_OFFS,
  MINERS,
  MINER_TOTALS,
  MOON_CYCLES,
  MOON_MINERS,
  OTHER_MINERS,
  PERIODS,
  QUEUE_DONE,
  QUEUE_RUNNING,
  SEP_RUN,
  TAMSIN,
  TOTAL_MINERS,
  UNMATCHED,
  VARRO,
  VARRO_ACTIVITY,
  VARRO_BEFORE_NOT_TAX,
  VARRO_DAYS,
  VARRO_DISMISSALS,
  VARRO_DISMISS_IDS,
  VARRO_MAIL,
  VARRO_MAIL_STATEMENT,
  VARRO_PAYMENTS,
  type DayLine,
  type Extraction,
  type Miner,
  type MoonCycle,
  type QueueItem,
  type StatementPeriod,
} from './corpTaxBookFixtures';
import {
  AssignDonationDialog,
  DismissDialog,
  MarkNotTaxDialog,
  RecordPaymentDialog,
  RejectDeclarationDialog,
} from './corpTaxBookDialogs';
import { PersonalF, VerifyF } from './corpTaxBookMember';
import {
  BookHealthStrip,
  Crumb,
  MailLimitNotice,
  MailQueueChip,
  MinedBar,
  MoonsHeader,
  MoonsTabs,
  OreLine,
  OverdueWord,
  QueueSummary,
  QueueTable,
  StandingWord,
  StateWord,
} from './corpTaxBookParts';
import { caretColumn, dayColumns, paymentColumns } from './corpTaxBookColumns';
import { MINING_PARAMS, MOONS_PARAMS, PHONE_GLOBALS, isk, queueCounts } from './corpTaxBookFormat';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';

/**
 * Corp Tax Book, the merged option (#4056), built on option A after Shawn's
 * review of A, B and C.
 *
 * One story throughout: today is 18 Oct 2026 14:00 EVE, an officer synced the
 * book at 12:00 (2h ago), so every day through 17 Oct is Billable. The Aug
 * Statements went out on 1 Sep (due 15 Sep); the Sep Statements are about to
 * be sent; Oct is open.
 *
 * `/corp/moons` keeps D21's three tabs. Every drill-down is a page of its own
 * with a labelled crumb back, never an in-place expansion (a moon can have
 * dozens of miners):
 *
 * - **Extractions** leads with the chunk timeline; a timeline row or a table
 *   row opens the moon's page. A collapsed strip under the tabs carries the
 *   sync age and any loud gap in the records (D9).
 * - **Miners** puts the Needs you cards above the sortable Miners table; a row
 *   opens the Miner's page, which also carries the Miner's activity feed.
 * - **Dialogs** (steps 5 to 9): Dismiss, Record payment, Mark not tax on the
 *   Miner page, and Reject declaration and Assign a donation from Needs you.
 * - **Statements** is a Check, Send, Done run that carries EVE's mail-limit
 *   notice; "Preview mail" opens the full per-line mail in a dialog. Write-offs
 *   (tolerance, lines recorded after payment) show under the periods table.
 * - The **progress chip** in the page header opens the queue as a popover; on
 *   a phone it is an icon button with a percent badge (always shown) that
 *   opens the same queue as a sheet. The page header's Activity button opens
 *   the book's audit log.
 * - The member's **personal Tax tab** is today's page (header, Attention
 *   strip, balances, filters, Open table, History by month, row detail) with
 *   the corp-book states added to its Status pills; the book diff opens as a
 *   dialog from the row detail.
 * - The **guest verify page** puts what was mined and payments on the left,
 *   Balance due, Terms and Stop reminders on the right; on a phone Balance due
 *   and Terms come first.
 *
 * New components in this mockup: `ExtractionTimeline`, `NeedsYouQueue`,
 * `StatementRun`, `StatementMailPreview`, `MailQueueChip` (with its phone
 * percent badge), `CorpBookDiff`, `CorpBookSyncNote`. The personal tab's new
 * Status pill values (Pending corp record, Billed, Sent waiting for the corp,
 * Conflict, Unattributed, Dismissed by corp) extend the existing
 * `StatusPill`. Everything else is an existing primitive, the real
 * `OwedBalances`, `PriceBreakdownCard` and `AttentionStrip`, or the officer
 * dialogs built from the form primitives.
 */

const PHONE = PHONE_GLOBALS;

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-page space-y-4 px-4 py-4">{children}</div>;
}

// ---------------------------------------------------------------- Extractions

const extractionColumns: DataTableColumn<Extraction>[] = [
  {
    id: 'moon',
    header: 'Moon',
    primary: true,
    render: (row) => (
      <span className="block min-w-0">
        <span className="text-accent">{row.moon}</span>
        <span className="block text-xs text-text-dim">
          {row.refinery} · {row.refineryType}
        </span>
      </span>
    ),
    sortValue: (row) => row.moon,
  },
  { id: 'state', header: 'State', render: (row) => <StateWord state={row.state} /> },
  {
    id: 'when',
    header: 'When',
    render: (row) => (
      <span className="block">
        {row.whenShort}
        <span className="block text-xs text-text-dim">{row.when}</span>
      </span>
    ),
    sortValue: (row) => row.span.ready,
  },
  { id: 'ore', header: 'Ore', render: (row) => <OreLine ores={row.ores} /> },
  {
    id: 'isk',
    header: 'Est. value',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => (row.estIsk ? isk(row.estIsk) : '—'),
    sortValue: (row) => row.estIsk ?? 0,
  },
  {
    id: 'mined',
    header: 'Mined vs left',
    render: (row) => <MinedBar pct={row.minedPct} label={row.moon} />,
  },
  caretColumn<Extraction>(),
];

const CHUNKS_ISK = EXTRACTIONS.filter((e) => e.state !== 'Expired').reduce(
  (total, e) => total + (e.estIsk ?? 0),
  0
);

function ExtractionsF() {
  return (
    <Page>
      <MoonsHeader />
      <MoonsTabs value="extractions" />
      <BookHealthStrip />
      <StatChips>
        <StatChip label="Ready" value="1" tone="success" />
        <StatChip label="Fractured" value="1" tone="warning" />
        <StatChip label="Extracting" value="1" />
        <StatChip
          label="Est. value in chunks"
          value={isk(CHUNKS_ISK)}
          emphasis
          tooltip="Chunks still there to mine; Expired ones are not counted"
          tooltipGlyph="info"
        />
      </StatChips>
      <Panel
        title="Timeline"
        meta={<span className="text-xs text-text-dim">A row opens the moon&apos;s page</span>}
      >
        <ExtractionTimeline />
      </Panel>
      <Panel title="Extractions" padded={false}>
        <DataTable
          label="Extractions"
          columns={extractionColumns}
          rows={EXTRACTIONS}
          rowKey={(row) => row.id}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          defaultSort={{ columnId: 'when', direction: 'asc' }}
        />
      </Panel>
    </Page>
  );
}

// ---------------------------------------------------------------- Moon detail

const cycleColumns: DataTableColumn<MoonCycle>[] = [
  { id: 'fractured', header: 'Fractured', render: (row) => row.fractured },
  { id: 'state', header: 'State', render: (row) => <StateWord state={row.state} /> },
  {
    id: 'days',
    header: 'Cycle',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => `${row.days} days`,
  },
  {
    id: 'est',
    header: 'Est. value',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => isk(row.estIsk),
  },
  {
    id: 'mined',
    header: 'Mined',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => `${row.minedPct}%`,
  },
  {
    id: 'tax',
    header: 'Tax recorded',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => isk(row.tax),
  },
  { id: 'on', header: 'Where it stands', render: (row) => row.on },
  {
    id: 'miners',
    header: 'Miners',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.miners,
  },
];

type MoonMiner = (typeof MOON_MINERS)[number];
const moonMinerColumns: DataTableColumn<MoonMiner>[] = [
  {
    id: 'miner',
    header: 'Miner',
    primary: true,
    render: (row) => <span className="text-accent">{row.miner}</span>,
  },
  {
    id: 'units',
    header: 'Units',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.units.toLocaleString('en'),
  },
  {
    id: 'value',
    header: 'Value',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => isk(row.value),
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (row) => isk(row.tax),
  },
];

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className={eyebrowClassName}>{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function MoonDetailF() {
  const moon = EXTRACTIONS[1];
  return (
    <Page>
      <Crumb label="Extractions" />
      <PageHeader
        title={moon.moon}
        meta={
          <span className="text-xs text-text-dim">
            {moon.refinery} · {moon.refineryType}
          </span>
        }
      />
      <Panel
        title="This extraction"
        meta={<StateWord state={moon.state} />}
        actions={<Button size="sm">Dismiss tax for this extraction</Button>}
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          <Fact label="Started" value={moon.started} />
          <Fact label="Chunk arrived" value={moon.arrival} />
          <Fact label="Fractured" value={moon.fracture} />
          <Fact label="Field gone" value={`about ${moon.expires}`} />
          <Fact label="Ore" value={<OreLine ores={moon.ores} />} />
          <Fact label="Ore from" value={moon.oreSource} />
          <Fact label="Est. value" value={isk(moon.estIsk ?? 0)} />
          <Fact label="Mined vs left" value={<MinedBar pct={moon.minedPct} label={moon.moon} />} />
        </dl>
      </Panel>
      <Panel
        title="Who mined this chunk"
        meta={<span className="text-xs text-text-dim">Tax so far, to 14:00 · not billed yet</span>}
        padded={false}
      >
        <DataTable
          label="Who mined this chunk"
          columns={[...moonMinerColumns, caretColumn<MoonMiner>()]}
          rows={MOON_MINERS}
          rowKey={(row) => row.miner}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
        />
      </Panel>
      <Panel
        title="Past extractions"
        meta={<span className="text-xs text-text-dim">Earlier cycles, not this one</span>}
        padded={false}
      >
        <DataTable
          label="Past extractions"
          columns={cycleColumns}
          rows={MOON_CYCLES}
          rowKey={(row) => row.id}
          density="compact"
        />
      </Panel>
    </Page>
  );
}

// ---------------------------------------------------------------- Miners

const minerColumns: DataTableColumn<Miner>[] = [
  {
    id: 'miner',
    header: 'Miner',
    primary: true,
    render: (row) => (
      <span className="block min-w-0">
        <span className="text-accent">{row.main}</span>
        <span className="block text-xs text-text-dim">
          {[
            row.characters.length > 1 ? `+${row.characters.length - 1} characters` : '',
            row.standing === 'Member' ? '' : row.corp,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {row.note && <span className="block text-xs text-warning">{row.note}</span>}
      </span>
    ),
    sortValue: (row) => row.main,
  },
  {
    id: 'standing',
    header: 'In corp',
    render: (row) => <StandingWord standing={row.standing} />,
  },
  {
    id: 'owed',
    header: 'Owed',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (row) => (row.owed ? isk(row.owed) : '—'),
    sortValue: (row) => row.owed,
  },
  {
    id: 'overdue',
    header: 'Overdue',
    render: (row) => <OverdueWord days={row.overdueDays} />,
    sortValue: (row) => row.overdueDays ?? -1,
  },
  {
    id: 'unbilled',
    header: 'Next Statement',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => (row.unbilled ? isk(row.unbilled) : '—'),
    sortValue: (row) => row.unbilled,
  },
  {
    id: 'credit',
    header: 'Credit',
    align: 'right',
    className: 'tabular-nums',
    phoneHidden: true,
    render: (row) => (row.credit ? <span className="text-isk-pos">{isk(row.credit)}</span> : '—'),
  },
  { id: 'paid', header: 'Last paid', render: (row) => row.lastPaid },
  caretColumn<Miner>(),
];

type MinersDialog = 'reject' | 'assign';

function MinersF({ chip, dialog }: { chip?: QueueItem[]; dialog?: MinersDialog }) {
  return (
    <Page>
      <MoonsHeader lead={chip ? <ChipF items={chip} /> : undefined} />
      <MoonsTabs value="miners" />
      <StatChips>
        <StatChip label="Owed" value={isk(MINER_TOTALS.owed)} emphasis />
        <StatChip
          label="Overdue"
          value={`${isk(MINER_TOTALS.overdue)} · ${MINER_TOTALS.overdueCount} Miners`}
          tone="danger"
        />
        <StatChip label="Next Statement" value={isk(MINER_TOTALS.unbilled)} />
        <StatChip label="Credit held" value={isk(MINER_TOTALS.credit)} />
      </StatChips>
      <NeedsYouQueue />
      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput
            className="min-w-40 flex-1"
            value=""
            onChange={() => {}}
            placeholder="Search Miners or characters…"
            aria-label="Search Miners"
          />
          <FilterChip label="Members" selected onToggle={() => {}} count={21} />
          <FilterChip label="Non-members" selected={false} onToggle={() => {}} count={5} />
        </div>
        <DataTable
          label="Miners"
          columns={minerColumns}
          rows={MINERS}
          rowKey={(row) => row.id}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          defaultSort={{ columnId: 'overdue', direction: 'desc' }}
          mobileSort
          stackSummary={`${MINERS.length} of ${TOTAL_MINERS} Miners`}
        />
        <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
          Showing {MINERS.length} of {TOTAL_MINERS} Miners. The other {OTHER_MINERS.count} owe
          nothing and have no credit; they are counted in the chips above.
        </p>
      </Panel>
      <RejectDeclarationDialog open={dialog === 'reject'} />
      <AssignDonationDialog open={dialog === 'assign'} />
    </Page>
  );
}

// ---------------------------------------------------------------- Miner detail

type MinerDialog = 'dismiss' | 'record' | 'nottax';

function MinerDetailF({ dialog }: { dialog?: MinerDialog }) {
  const ledger = dialog === 'nottax' ? VARRO_BEFORE_NOT_TAX : VARRO;
  const selectable: DataTableColumn<DayLine> = {
    id: 'select',
    header: '',
    className: 'w-8',
    render: (row) =>
      row.status === 'Next Statement' || row.status === 'Not Billable yet' ? (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox
            aria-label={`Select ${row.date} ${row.ore}`}
            checked={dialog === 'dismiss' && VARRO_DISMISS_IDS.includes(row.id)}
            onChange={() => {}}
          />
        </label>
      ) : null,
  };
  const paymentMenu: DataTableColumn<(typeof VARRO_PAYMENTS)[number]> = {
    id: 'menu',
    header: '',
    align: 'right',
    cardCorner: true,
    render: () => <IconButton icon={<Icon.More />} label="Payment actions" />,
  };
  return (
    <Page>
      <Crumb label="Miners" />
      <PageHeader
        title="Varro Kestane"
        meta={<span className="text-xs text-text-dim">Member · Varro Kestane, Lysa Kestane</span>}
        actions={
          <span className="flex items-center gap-1">
            <Button size="sm">Record payment</Button>
            <Button size="sm" variant="ghost">
              Send reminder…
            </Button>
            <IconButton icon={<Icon.More />} label="More actions" />
          </span>
        }
      />
      <StatChips>
        <StatChip label="Owed" value={isk(ledger.owed)} tone="danger" emphasis />
        <StatChip label="Overdue since" value="15 Sep · 33 days" tone="danger" />
        <StatChip
          label="Next Statement"
          value={isk(VARRO.unbilled)}
          tooltip={`Sep 2026, not sent yet: ${isk(VARRO.sepNew)}. Oct 2026 so far, Billable through 17 Oct: ${isk(VARRO.octNew)}. 18 Oct (${isk(VARRO.pending)}) is not Billable yet.`}
          tooltipGlyph="info"
        />
        <StatChip
          label="Rate"
          value="10%"
          tooltip="Member default, effective 1 Aug 2026"
          tooltipGlyph="info"
        />
        <StatChip
          label="Written off"
          value={`${isk(VARRO.toleranceWriteOff)} + 1 line`}
          tooltip="828 ISK left after a payment within tolerance settled the 14 Aug debt, and 1 line (14 Aug, Zeolites) recorded after that day was paid. Paid days are closed for good; both are logged."
          tooltipGlyph="info"
        />
      </StatChips>
      <Panel
        title="Days"
        meta={
          <span className="text-xs text-text-dim">
            Newest first · Billable through {BOOK.billableThrough}
          </span>
        }
        padded={false}
        actions={
          dialog === 'dismiss' ? (
            <span className="flex gap-1">
              <Button size="sm">Dismiss selected (2)…</Button>
              <Button size="sm" variant="ghost">
                Change rate…
              </Button>
            </span>
          ) : undefined
        }
      >
        <DataTable
          label="Days"
          columns={[selectable, ...dayColumns]}
          rows={VARRO_DAYS}
          rowKey={(row) => row.id}
          density="compact"
          stackLayout="dense"
          className="dt-dense-lead"
        />
      </Panel>
      <Panel
        title="Payments"
        meta={<span className="text-xs text-text-dim">Credited oldest debt first</span>}
        padded={false}
      >
        <DataTable
          label="Payments"
          columns={[...paymentColumns, paymentMenu]}
          rows={ledger.payments}
          rowKey={(row) => row.id}
          density="compact"
        />
        <p className="border-t border-line px-3 py-2 text-xs text-text-dim tabular-nums">
          Aug 2026 Statement {isk(ledger.augBilled)} − credited {isk(ledger.credited)} − written off{' '}
          {isk(ledger.toleranceWriteOff)} ={' '}
          <span className="text-text">{isk(ledger.owed)} owed</span>
        </p>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Dismissals">
          {VARRO_DISMISSALS.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-3 text-sm">
              <p>
                {d.scope}: {isk(d.amount)}
                <span className="block text-xs text-text-dim">
                  {d.by}, {d.date} · “{d.reason}”
                </span>
              </p>
              <button type="button" className={textActionClassName('shrink-0')}>
                Reverse
              </button>
            </div>
          ))}
        </Panel>
        <Panel title="Mail">
          <ul className="space-y-1 text-sm">
            {VARRO_MAIL.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span>{m.what}</span>
                <span className="text-text-dim">
                  {m.status} {m.date}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel
        title="Activity"
        meta={<span className="text-xs text-text-dim">Audit log for this Miner, newest first</span>}
        actions={
          <Button size="sm" variant="ghost">
            Open all activity
          </Button>
        }
      >
        <ul className="divide-y divide-line text-sm">
          {VARRO_ACTIVITY.filter((a) => dialog !== 'nottax' || a.id !== 1).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
              <span className="w-28 shrink-0 text-xs text-text-dim tabular-nums">{a.when}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{a.who}</span> {a.what}
                {a.why && <span className="text-text-dim"> · {a.why}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <DismissDialog open={dialog === 'dismiss'} />
      <RecordPaymentDialog open={dialog === 'record'} />
      <MarkNotTaxDialog open={dialog === 'nottax'} />
    </Page>
  );
}

// ---------------------------------------------------------------- Statements

const periodColumns: DataTableColumn<StatementPeriod>[] = [
  {
    id: 'period',
    header: 'Period',
    primary: true,
    render: (row) => <span className="font-semibold">{row.period}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    render: (row) => (
      <span
        className={
          row.status === 'Ready to send'
            ? 'text-xs font-semibold text-warning uppercase'
            : 'text-xs text-text-dim uppercase'
        }
      >
        {row.status}
      </span>
    ),
  },
  {
    id: 'miners',
    header: 'Miners',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.miners,
  },
  {
    id: 'billed',
    header: 'Billed',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => (row.billed ? isk(row.billed) : '—'),
  },
  {
    id: 'paid',
    header: 'Paid',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => (row.paid ? isk(row.paid) : '—'),
  },
  {
    id: 'outstanding',
    header: 'Outstanding',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (row) => (row.outstanding ? isk(row.outstanding) : '—'),
  },
  { id: 'issued', header: 'Issued', render: (row) => row.issued },
];

// ---------------------------------------------------------------- Queue

// ---------------------------------------------------------------- Timeline

const FROM = -20;
const TO = 27;
const TODAY = 17.6;
const pct = (day: number) => `${((day - FROM) / (TO - FROM)) * 100}%`;
const width = (a: number, b: number) => `${((b - a) / (TO - FROM)) * 100}%`;

function ExtractionTimeline() {
  return (
    <NewComponent name="ExtractionTimeline">
      <div className="space-y-3">
        <div className="relative ml-0 h-4 text-[0.6875rem] text-text-dim sm:ml-48 sm:mr-6">
          {[
            [-19, '12 Sep'],
            [0, '1 Oct'],
            [TODAY, 'Now'],
            [24, '25 Oct'],
          ].map(([day, label]) => (
            <span
              key={label}
              className="absolute -translate-x-1/2"
              style={{ left: pct(Number(day)) }}
            >
              {label}
            </span>
          ))}
        </div>
        {EXTRACTIONS.map((e) => (
          <a
            key={e.id}
            href={`/corp/moons/moon/${e.id}`}
            className="group flex flex-col gap-1 rounded-xs py-0.5 hover:bg-panel-2 sm:flex-row sm:items-center sm:gap-0"
          >
            <span className="w-48 shrink-0 truncate text-xs">
              <span className="text-accent group-hover:underline">{e.moon}</span>{' '}
              <StateWord state={e.state} />
            </span>
            <div className="relative h-4 w-full rounded-xs bg-panel-2 sm:w-auto sm:flex-1">
              <span
                className="absolute inset-y-1 rounded-xs bg-line-bright"
                style={{ left: pct(e.span.start), width: width(e.span.start, e.span.ready) }}
              />
              <span
                className="absolute inset-y-0 rounded-xs bg-success"
                style={{
                  left: pct(e.span.ready),
                  width: width(e.span.ready, Math.max(e.span.fracture, e.span.ready + 0.3)),
                }}
              />
              <span
                className={cx(
                  'absolute inset-y-0 rounded-xs',
                  e.state === 'Expired' ? 'bg-text-faint' : 'bg-warning'
                )}
                style={{ left: pct(e.span.fracture), width: width(e.span.fracture, e.span.end) }}
              />
              <span className="absolute inset-y-[-4px] w-px bg-text" style={{ left: pct(TODAY) }} />
            </div>
            <span className="hidden w-6 justify-end sm:flex">
              <RowCaret />
            </span>
          </a>
        ))}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
          <span>
            <span className="mr-1 inline-block h-2 w-4 rounded-xs bg-line-bright" />
            Extracting
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-4 rounded-xs bg-success" />
            Ready
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-4 rounded-xs bg-warning" />
            Fractured, minable
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-4 rounded-xs bg-text-faint" />
            Expired
          </span>
          <span>Line: now (18 Oct 14:00 EVE)</span>
        </p>
      </div>
    </NewComponent>
  );
}

// ---------------------------------------------------------------- Needs you

function QueueCard({
  tone,
  title,
  body,
  actions,
  children,
}: {
  tone: 'danger' | 'warning' | 'neutral';
  title: string;
  body: string;
  actions: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        'space-y-2 rounded-xs border bg-panel p-3',
        tone === 'danger'
          ? 'border-danger/50'
          : tone === 'warning'
            ? 'border-warning/50'
            : 'border-line'
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-text-dim">{body}</p>
      {children}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

function NeedsYouQueue() {
  return (
    <NewComponent name="NeedsYouQueue">
      <div className="space-y-2">
        <p className={eyebrowClassName}>Needs you · 4</p>
        <div className="grid gap-2 md:grid-cols-2">
          <QueueCard
            tone="warning"
            title={`Tamsin Holloway says they paid · ${isk(TAMSIN.owed)}`}
            body="Declared “paid by contract” on 14 Oct. Overdue is paused until 28 Oct, then resumes on its own."
            actions={
              <>
                <Button size="sm">Confirm paid</Button>
                <Button size="sm" variant="ghost">
                  Reject declaration
                </Button>
              </>
            }
          />
          <QueueCard
            tone="danger"
            title={`Varro Kestane · overdue 33 days · ${isk(VARRO.owed)}`}
            body="Aug 2026 Statement. Reminder sent 15 Oct. 16 Oct donation from Lysa Kestane: 5,000,000, of which 1,000,000 is marked not tax."
            actions={
              <>
                <Button size="sm">Send reminder…</Button>
                <Button size="sm" variant="ghost">
                  Mark not tax
                </Button>
                <Button size="sm" variant="ghost">
                  Dismiss
                </Button>
              </>
            }
          />
          <QueueCard
            tone="neutral"
            title={`Unmatched donation · ${isk(UNMATCHED.amount)} from ${UNMATCHED.from}`}
            body={`${UNMATCHED.date}, reason “${UNMATCHED.reason}”. Not a character any Miner has; the player can claim it, or you can assign it.`}
            actions={
              <>
                <Button size="sm">Assign to a Miner</Button>
                <Button size="sm" variant="ghost">
                  Not tax
                </Button>
              </>
            }
          />
          <QueueCard
            tone="neutral"
            title={`Bram Ostrander left the corp · owes ${isk(MINERS[2].owed)}`}
            body="Left 22 Sep for Vantor Freight. Still mailed each month."
            actions={<Button size="sm">Write off</Button>}
          />
        </div>
      </div>
    </NewComponent>
  );
}

// ---------------------------------------------------------------- Statement run

type RunStep = 'check' | 'send' | 'sending' | 'done';

function StepDot({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: 'done' | 'now' | 'next';
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cx(
          'inline-flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
          state === 'done' && 'border-success text-success',
          state === 'now' && 'border-text text-text',
          state === 'next' && 'border-line text-text-faint'
        )}
      >
        {state === 'done' ? <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" /> : n}
      </span>
      <span className={cx('text-sm', state === 'next' ? 'text-text-faint' : 'text-text')}>
        {label}
        {state === 'done' && <span className="sr-only"> (done)</span>}
      </span>
    </li>
  );
}

function StatementRun({ step, queue }: { step: RunStep; queue: QueueItem[] }) {
  const order: RunStep[] = ['check', 'send', 'sending', 'done'];
  const at = order.indexOf(step);
  const stateOf = (i: number) => (at > i ? 'done' : at === i ? 'now' : 'next');
  return (
    <NewComponent name="StatementRun">
      <Panel
        title="Sep 2026 Statements"
        meta={
          <span className="text-xs text-text-dim">
            Sep is fully Billable · synced {BOOK.lastSynced}
          </span>
        }
      >
        <ol className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
          <StepDot n={1} label="Check" state={stateOf(0)} />
          <StepDot n={2} label="Send" state={at >= 2 ? (at === 3 ? 'done' : 'now') : stateOf(1)} />
          <StepDot n={3} label="Done" state={at === 3 ? 'now' : 'next'} />
        </ol>
        {step === 'check' && (
          <div className="space-y-3 text-sm">
            <StatChips>
              <StatChip label="Statements" value={`${SEP_RUN.statements} to send`} emphasis />
              <StatChip
                label="Balances due"
                value={isk(SEP_RUN.balances)}
                tooltip="Carried from the Aug Statements plus Sep's lines, less credit"
                tooltipGlyph="info"
              />
              <StatChip label="Below 5,000,000" value={`${SEP_RUN.belowMinimum} roll into Oct`} />
              <StatChip label="Credit applied" value={isk(SEP_RUN.credit)} />
            </StatChips>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <Icon.SeverityClear size={Icon.ICON_SIZE.sm} className="text-success" aria-hidden />
                Every day through 30 Sep is Billable and priced ({BOOK.hub} buy, {BOOK.oreForm})
              </li>
              <li className="flex items-center gap-2">
                <Icon.Warn size={Icon.ICON_SIZE.sm} className="text-warning" aria-hidden />1 gap in
                the refinery records: 5 Sep, Efa - Brass Anvil, unrecoverable. Nothing is billed for
                it.
              </li>
              <li className="flex items-center gap-2">
                <Icon.Warn size={Icon.ICON_SIZE.sm} className="text-warning" aria-hidden />1
                Unmatched donation; it is not on anyone&apos;s Statement until assigned
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Continue to send</Button>
              <Button variant="ghost">Preview mail</Button>
            </div>
          </div>
        )}
        {step === 'send' && (
          <div className="space-y-3 text-sm">
            <p>
              {SEP_RUN.statements} mails from Kestrel Vane, one per Miner, each with its lines,
              balance, payment code and verify link.
            </p>
            <MailLimitNotice count={SEP_RUN.statements} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Send {SEP_RUN.statements} Statements</Button>
              <Button variant="ghost">Back</Button>
            </div>
          </div>
        )}
        {(step === 'sending' || step === 'done') && (
          <div className="space-y-3">
            <QueueSummary items={queue} />
            <p className="text-xs text-text-dim">
              Every mail&apos;s status is in the progress chip at the top of the page.
            </p>
          </div>
        )}
      </Panel>
    </NewComponent>
  );
}

// ---------------------------------------------------------------- Mail preview

function StatementMailPreview() {
  const m = VARRO_MAIL_STATEMENT;
  return (
    <NewComponent name="StatementMailPreview">
      <div className="space-y-2 rounded-xs border border-line bg-bg p-3 font-mono text-xs leading-relaxed">
        <p>
          <span className="text-text-dim">To:</span> {m.to}
          <br />
          <span className="text-text-dim">Subject:</span> {m.subject}
        </p>
        <p>
          Hi {m.to}, here is your {CORP.name} moon tax Statement for Sep 2026.
        </p>
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-left text-text-dim">
              <th className="pr-3 font-normal">Date</th>
              <th className="pr-3 font-normal">Refinery</th>
              <th className="pr-3 text-right font-normal">Mined value</th>
              <th className="text-right font-normal">Tax</th>
            </tr>
          </thead>
          <tbody>
            {m.lines.map((r) => (
              <tr key={r.id}>
                <td className="pr-3">{r.date}</td>
                <td className="pr-3">{r.refinery}</td>
                <td className="pr-3 text-right">{isk(r.value)}</td>
                <td className="text-right">{isk(r.tax)}</td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <td colSpan={3} className="pt-1 text-text-dim">
                Total
              </td>
              <td className="pt-1 text-right">{isk(m.newTotal)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>
            Amount due {isk(m.balance)} ISK, by {m.due} (this total plus {isk(m.carried)} still
            owed).
          </strong>
          <br />
          Donate to {CORP.name}; any of your characters counts. Code {m.code} pins it to this
          Statement.
          <br />
          The link has every line&apos;s pricing, terms and payments:{' '}
          <span className="text-accent underline">{m.verify}</span>
        </p>
      </div>
    </NewComponent>
  );
}
// ---------------------------------------------------------------- Statements page

function StatementsF({
  step,
  preview,
  queue = QUEUE_RUNNING,
  queueOpen,
}: {
  step: RunStep;
  preview?: boolean;
  queue?: QueueItem[];
  queueOpen?: boolean;
}) {
  const phone = useIsPhone();
  const running = step === 'sending' || step === 'done';
  return (
    <Page>
      <MoonsHeader lead={running ? <ChipF items={queue} open={queueOpen} /> : undefined} />
      <MoonsTabs value="statements" />
      <BookHealthStrip />
      <StatementRun step={step} queue={queue} />
      <Panel
        title="All periods"
        meta={<span className="text-xs text-text-dim">Monthly · minimum 5,000,000 ISK</span>}
        padded={false}
      >
        <DataTable
          label="Statement periods"
          columns={periodColumns}
          rows={PERIODS}
          rowKey={(row) => row.id}
          density="compact"
        />
        <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
          Aug 2026 written off: {isk(AUG_WRITE_OFFS.toleranceTotal)} left over by{' '}
          {AUG_WRITE_OFFS.toleranceCount} payments within tolerance (logged), and{' '}
          {AUG_WRITE_OFFS.lateLines} lines recorded after payment, never billed. Both are on each
          Miner&apos;s page.
        </p>
      </Panel>
      <Modal
        open={Boolean(preview)}
        onClose={() => {}}
        title="Preview mail · Varro Kestane"
        placement={phone ? 'sheet-full' : 'wide'}
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-dim">
              {VARRO_MAIL_STATEMENT.chars.toLocaleString('en')} of 10,000 characters
            </span>
            <span className="flex gap-2">
              <Button variant="ghost">Previous</Button>
              <Button>Next Miner</Button>
            </span>
          </div>
        }
      >
        <StatementMailPreview />
      </Modal>
    </Page>
  );
}

// ---------------------------------------------------------------- Chip + queue

/**
 * Phone form of the chip: an icon button whose percent badge shows in every
 * state (100% when done). Failures add a second, warning badge with their
 * count, never a check mark in place of the percent.
 */
function PhoneChipButton({ items }: { items: QueueItem[] }) {
  const c = queueCounts(items);
  const percent = Math.round(((c.sent + c.failed) / c.total) * 100);
  const done = c.waiting === 0 && c.paused === 0;
  return (
    <NewComponent name="MailQueueChip (phone)">
      <button
        type="button"
        aria-label={`Statements: ${percent}% sent${done ? ', done' : ''}${c.failed ? `, ${c.failed} failed` : ''}`}
        className="relative inline-flex size-11 items-center justify-center rounded-xs border border-line hover:bg-panel-2"
      >
        <Icon.MailSent size={Icon.ICON_SIZE.md} aria-hidden="true" />
        <span
          aria-hidden="true"
          className={cx(
            'absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-bg px-1 text-[0.625rem] font-semibold tabular-nums',
            done && !c.failed ? 'border-success text-success' : 'border-line-bright text-text'
          )}
        >
          {percent}%
        </span>
        {c.failed > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -bottom-1.5 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-warning bg-bg px-1 text-[0.625rem] font-semibold text-warning tabular-nums"
          >
            <Icon.Warn className="size-3" aria-hidden="true" />
            {c.failed}
          </span>
        )}
      </button>
    </NewComponent>
  );
}

function ChipF({ items, open }: { items: QueueItem[]; open?: boolean }) {
  const phone = useIsPhone();
  const body = (
    <div className="space-y-3">
      <QueueSummary items={items} />
      <QueueTable items={items} />
    </div>
  );
  if (phone) {
    return (
      <>
        <PhoneChipButton items={items} />
        <Modal
          open={Boolean(open)}
          onClose={() => {}}
          title="Sep 2026 Statements"
          placement="sheet-full"
        >
          {body}
        </Modal>
      </>
    );
  }
  return (
    <MailQueueChip
      items={items}
      cue="popover"
      renderButton={(button) => (
        <Popover open={Boolean(open)}>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
          <PopoverContent align="end" className="w-[34rem] max-w-[90vw] space-y-3 p-3">
            <p className="text-sm font-semibold">Sep 2026 Statements</p>
            <QueueSummary items={items} />
            <div className="max-h-[28rem] overflow-y-auto">
              <QueueTable items={items} />
            </div>
          </PopoverContent>
        </Popover>
      )}
    />
  );
}

// ---------------------------------------------------------------- Stories

const meta = {
  title: 'mockups/CorpTaxBookFinal',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
  render: () => <ExtractionsF />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const corp = (render: () => ReactElement, phone = false): Story => ({
  render,
  parameters: MOONS_PARAMS,
  ...(phone ? { globals: PHONE } : {}),
});
const mining = (render: () => ReactElement, phone = false): Story => ({
  render,
  parameters: MINING_PARAMS,
  ...(phone ? { globals: PHONE } : {}),
});
const bare = (render: () => ReactElement, phone = false): Story => ({
  render,
  ...(phone ? { globals: PHONE } : {}),
});

/** @summary 1 · Extractions: the chunk timeline (a row opens the moon's page), then the sortable table. New component: ExtractionTimeline. */
export const Extractions = corp(() => <ExtractionsF />);
/** @summary 1 · Extractions, phone. */
export const ExtractionsPhone = corp(() => <ExtractionsF />, true);

/** @summary 2 · Moon detail page: this extraction, who mined it, past cycles. */
export const MoonDetail = corp(() => <MoonDetailF />);
/** @summary 2 · Moon detail, phone. */
export const MoonDetailPhone = corp(() => <MoonDetailF />, true);

/** @summary 3 · Miners: Needs you cards above the table, overdue first. New component: NeedsYouQueue. */
export const Miners = corp(() => <MinersF />);
/** @summary 3 · Miners, phone. */
export const MinersPhone = corp(() => <MinersF />, true);

/** @summary 4 · Miner detail page: Days, Payments, Dismissals, Mail. */
export const MinerDetail = corp(() => <MinerDetailF />);
/** @summary 4 · Miner detail, phone. */
export const MinerDetailPhone = corp(() => <MinerDetailF />, true);

/** @summary 5 · Dismiss dialog for two ticked days. */
export const DismissDays = corp(() => <MinerDetailF dialog="dismiss" />);
/** @summary 5 · Dismiss dialog, phone: a bottom sheet. */
export const DismissDaysPhone = corp(() => <MinerDetailF dialog="dismiss" />, true);

/** @summary 6 · Record payment dialog (a manual Tax Payment, credited oldest debt first). */
export const RecordPayment = corp(() => <MinerDetailF dialog="record" />);
/** @summary 6 · Record payment, phone. */
export const RecordPaymentPhone = corp(() => <MinerDetailF dialog="record" />, true);

/** @summary 7 · Mark not tax dialog: part of a donation was a buyback, so the debt reopens by that amount. */
export const MarkNotTax = corp(() => <MinerDetailF dialog="nottax" />);
/** @summary 7 · Mark not tax, phone. */
export const MarkNotTaxPhone = corp(() => <MinerDetailF dialog="nottax" />, true);

/** @summary 8 · Reject declaration dialog from Needs you: reason required, a fresh 14 days. */
export const RejectDeclaration = corp(() => <MinersF dialog="reject" />);
/** @summary 8 · Reject declaration, phone. */
export const RejectDeclarationPhone = corp(() => <MinersF dialog="reject" />, true);

/** @summary 9 · Assign a donation dialog from Needs you (an Unmatched donation to a Miner). */
export const AssignDonation = corp(() => <MinersF dialog="assign" />);
/** @summary 9 · Assign a donation, phone. */
export const AssignDonationPhone = corp(() => <MinersF dialog="assign" />, true);

/** @summary 10 · Statements: the Sep 2026 run at Check, periods and write-offs below. New component: StatementRun. */
export const Statements = corp(() => <StatementsF step="check" />);
/** @summary 10 · Statements, phone. */
export const StatementsPhone = corp(() => <StatementsF step="check" />, true);

/** @summary 11 · Preview mail: the short Statement mail (date, refinery, mined value, tax, total, code, verify link), in a dialog. New component: StatementMailPreview. */
export const PreviewMail = corp(() => <StatementsF step="check" preview />);
/** @summary 11 · Preview mail, phone: a full-height sheet. */
export const PreviewMailPhone = corp(() => <StatementsF step="check" preview />, true);

/** @summary 12 · Send: step 2 of the run with EVE's mail limit, "19 mails take about 4 minutes". */
export const SendNotice = corp(() => <StatementsF step="send" />);
/** @summary 12 · Send, phone. */
export const SendNoticePhone = corp(() => <StatementsF step="send" />, true);

/** @summary 13 · Progress chip in the page header while sending, here on the Miners tab. New component: MailQueueChip. */
export const ProgressChip = corp(() => <MinersF chip={QUEUE_RUNNING} />);
/** @summary 13 · Progress chip, phone: an icon button with a percent badge, plus a warning badge for failures. */
export const ProgressChipPhone = corp(() => <MinersF chip={QUEUE_RUNNING} />, true);

/** @summary 14 · Queue: the chip's popover, sent, paused, waiting, failed with Retry / Open in EVE. */
export const Queue = corp(() => <StatementsF step="sending" queueOpen />);
/** @summary 14 · Queue, phone: the same list as a full-height sheet. */
export const QueuePhone = corp(() => <StatementsF step="sending" queueOpen />, true);

/** @summary 15 · Queue done: the run at Done, the one failure still retryable. */
export const QueueDone = corp(() => <StatementsF step="done" queue={QUEUE_DONE} queueOpen />);
/** @summary 15 · Queue done, phone. */
export const QueueDonePhone = corp(
  () => <StatementsF step="done" queue={QUEUE_DONE} queueOpen />,
  true
);

/** @summary 16 · Member's Tax tab as it is today (Open, History by month), plus the corp-book Status pills and Safe to pay note. New component: CorpBookSyncNote. */
export const PersonalTab = mining(() => <PersonalF />);
/** @summary 16 · Personal Tax tab, phone. */
export const PersonalTabPhone = mining(() => <PersonalF />, true);

/** @summary 17 · Row detail (today's modal) for a Billed day: the book's terms, the dispute, Compare with the book. */
export const PersonalRowDetail = mining(() => <PersonalF detail />);
/** @summary 17 · Row detail, phone. */
export const PersonalRowDetailPhone = mining(() => <PersonalF detail />, true);

/** @summary 18 · Compare with the book: the diff dialog over the row detail. New component: CorpBookDiff. */
export const PersonalBookDiff = mining(() => <PersonalF detail diff />);
/** @summary 18 · Book diff, phone. */
export const PersonalBookDiffPhone = mining(() => <PersonalF detail diff />, true);

/** @summary 19 · Guest verify page: lines (with price date, source and rate) and payments left; Balance due, Terms, Stop reminders right. */
export const GuestVerify = bare(() => <VerifyF />);
/** @summary 19 · Guest verify, phone: Balance due and Terms above the lines. */
export const GuestVerifyPhone = bare(() => <VerifyF />, true);
