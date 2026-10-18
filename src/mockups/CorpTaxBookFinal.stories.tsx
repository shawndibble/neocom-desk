import type { ReactElement, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  Checkbox,
  DataAgeBadge,
  DataTable,
  DataTableDenseCell,
  FilterChip,
  IconButton,
  InfoTooltip,
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
  Tabs,
  TextArea,
  entityLinkClassName,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { HintText } from '@/components/ui/HintText';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { OreIcon, OreLink } from '@/features/miningTax/OreIcon';
import { OwedBalances } from '@/features/miningTax/OwedBalances';
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
  EXTRACTIONS,
  MINERS,
  MOON_CYCLES,
  MOON_MINERS,
  PERIODS,
  PERSONAL_ROWS,
  QUEUE_DONE,
  QUEUE_RUNNING,
  UNMATCHED,
  VARRO_DAYS,
  VARRO_DISMISSALS,
  VARRO_MAIL,
  VARRO_PAYMENTS,
  VERIFY,
  VERIFY_TAX,
  type DayLine,
  type Extraction,
  type Miner,
  type MoonCycle,
  type PersonalRow,
  type PersonalState,
  type QueueItem,
  type StatementPeriod,
} from './corpTaxBookFixtures';
import {
  CorpBookDiff,
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
  StopReminders,
  VerifyTopBar,
} from './corpTaxBookParts';
import { caretColumn, dayColumns, paymentColumns } from './corpTaxBookColumns';
import {
  MINING_PARAMS,
  MOONS_PARAMS,
  PHONE_GLOBALS,
  isk,
  isk2,
  queueCounts,
} from './corpTaxBookFormat';

/**
 * Corp Tax Book, the merged option (#4056), built on option A after Shawn's
 * review of A, B and C.
 *
 * `/corp/moons` keeps D21's three tabs. Every drill-down is a page of its own
 * with a labelled crumb back, never an in-place expansion (a moon can have
 * dozens of miners):
 *
 * - **Extractions** leads with the chunk timeline; a timeline row or a table
 *   row opens the moon's page.
 * - **Miners** puts the Needs you cards above the sortable Miners table; a row
 *   opens the Miner's page. Mark paid, Not tax and Dismiss are dialogs.
 * - **Statements** is a Check → Send → Done run that carries EVE's mail-limit
 *   notice; "Preview mail" opens the mail as sent in a dialog.
 * - The **progress chip** in the page header opens the queue as a popover; on
 *   a phone it is an icon button with a percent badge that opens the same
 *   queue as a sheet.
 * - The member's **personal Tax tab** is today's page (same header, balances,
 *   filters, table and row detail) with the corp-book states added to its
 *   Status pills; the book diff opens as a dialog from the row detail.
 * - The **guest verify page** puts what was mined and payments on the left,
 *   Balance due, Terms and Stop reminders on the right; on a phone Balance due
 *   and Terms come first.
 *
 * New components in this mockup: `ExtractionTimeline`, `NeedsYouQueue`,
 * `StatementRun`, `StatementMailPreview`, `MailQueueChip` (with its phone
 * percent badge), `CorpBookDiff`, `CorpBookSyncNote`. The personal tab's new
 * Status pill values (Pending corp record, Billed, Sent waiting for the corp,
 * Conflict, Unattributed, Dismissed by corp) extend the existing
 * `StatusPill`. Everything else is an existing primitive, or the real
 * `OwedBalances` card.
 */

const PHONE = PHONE_GLOBALS;

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">{children}</div>;
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

function ExtractionsF() {
  return (
    <Page>
      <MoonsHeader />
      <MoonsTabs value="extractions" />
      <StatChips>
        <StatChip label="Ready" value="1" tone="success" />
        <StatChip label="Fractured" value="1" tone="warning" />
        <StatChip label="Extracting" value="1" />
        <StatChip label="Est. value in chunks" value={isk(2_871_200_000)} emphasis />
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
    header: 'Tax billed',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => (row.taxBilled ? isk(row.taxBilled) : 'Not billed yet'),
  },
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
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
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
        actions={<Button size="sm">Dismiss tax for this extraction…</Button>}
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
        meta={<span className="text-xs text-text-dim">Tax so far, not billed yet</span>}
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
      <Panel title="Past extractions" padded={false}>
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
          {row.characters.length > 1 ? `+${row.characters.length - 1} characters · ` : ''}
          {row.standing === 'Member' ? '' : row.corp}
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
    header: 'Not on a Statement yet',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => isk(row.unbilled),
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

function MinersF({ chip }: { chip?: QueueItem[] }) {
  return (
    <Page>
      <MoonsHeader lead={chip ? <ChipF items={chip} /> : undefined} />
      <MoonsTabs value="miners" />
      <StatChips>
        <StatChip label="Owed" value={isk(89_105_400)} emphasis />
        <StatChip label="Overdue" value={`${isk(57_330_400)} · 2 Miners`} tone="danger" />
        <StatChip label="Not on a Statement yet" value={isk(45_828_700)} />
        <StatChip label="Credit held" value={isk(4_300_000)} />
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
          stackSummary="6 Miners"
        />
      </Panel>
    </Page>
  );
}

// ---------------------------------------------------------------- Miner detail

function MinerDetailF({ dismissing }: { dismissing?: boolean }) {
  const phone = useIsPhone();
  const selectable: DataTableColumn<DayLine> = {
    id: 'select',
    header: '',
    className: 'w-8',
    render: (row) =>
      row.status === 'Not on a Statement yet' || row.status === 'Not Billable yet' ? (
        <Checkbox
          aria-label={`Select ${row.date} ${row.ore}`}
          checked={Boolean(dismissing) && row.status === 'Not on a Statement yet'}
          onChange={() => {}}
        />
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
            <Button size="sm">Record payment…</Button>
            <Button size="sm" variant="ghost">
              Send reminder…
            </Button>
            <IconButton icon={<Icon.More />} label="More actions" />
          </span>
        }
      />
      <StatChips>
        <StatChip label="Owed" value={isk(48_210_400)} tone="danger" emphasis />
        <StatChip label="Overdue since" value="15 Sep · 33 days" tone="danger" />
        <StatChip label="Not on a Statement yet" value={isk(6_412_000)} />
        <StatChip
          label="Rate"
          value="10%"
          tooltip="Member default, effective 1 Aug 2026"
          tooltipGlyph="info"
        />
      </StatChips>
      <Panel
        title="Days"
        meta={<span className="text-xs text-text-dim">Newest first</span>}
        padded={false}
        actions={
          dismissing ? (
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
          rows={VARRO_PAYMENTS}
          rowKey={(row) => row.id}
          density="compact"
        />
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Dismissals">
          {VARRO_DISMISSALS.map((d) => (
            <p key={d.id} className="text-sm">
              {d.scope}: {isk(d.amount)}
              <span className="block text-xs text-text-dim">
                {d.by}, {d.date} · “{d.reason}” ·{' '}
                <button type="button" className="text-accent">
                  Reverse
                </button>
              </span>
            </p>
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
      <Modal
        open={Boolean(dismissing)}
        onClose={() => {}}
        title="Dismiss 2 days of tax?"
        placement={phone ? 'sheet' : 'center'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary">Dismiss {isk(1_514_720)}</Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            17 Oct Sylvite and Zeolites at Efa - Brass Anvil, {isk(1_514_720)} of tax. They stay on
            the record as dismissed and can be reversed.
          </p>
          <label className="block space-y-1">
            <span className="text-xs text-text-dim">Reason (shown to Varro Kestane)</span>
            <TextArea
              value="Ore hauled for the corp's capital build"
              onChange={() => {}}
              rows={2}
            />
          </label>
          <p className="text-xs text-text-dim">
            Logged as Kestrel Vane, now. Your role is checked again when you confirm. The other
            payment actions live in each payment&apos;s ⋮: Mark not tax…, Unlink.
          </p>
        </div>
      </Modal>
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
            <div className="relative h-4 flex-1 rounded-xs bg-panel-2">
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
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          Needs you · 4
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <QueueCard
            tone="warning"
            title={`Tamsin Holloway says they paid · ${isk(31_775_000)}`}
            body="Declared “paid by contract” on 14 Oct. Overdue is paused until 28 Oct, then resumes on its own."
            actions={
              <>
                <Button size="sm">Confirm paid…</Button>
                <Button size="sm" variant="ghost">
                  Reject…
                </Button>
              </>
            }
          />
          <QueueCard
            tone="danger"
            title={`Varro Kestane · overdue 33 days · ${isk(48_210_400)}`}
            body="Aug 2026 Statement. Reminder sent 15 Oct. 16 Oct donation from Lysa Kestane: 12,000,000, of which 2,000,000 is marked not tax."
            actions={
              <>
                <Button size="sm">Send reminder…</Button>
                <Button size="sm" variant="ghost">
                  Not tax…
                </Button>
                <Button size="sm" variant="ghost">
                  Dismiss…
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
                <Button size="sm">Assign to a Miner…</Button>
                <Button size="sm" variant="ghost">
                  Not tax
                </Button>
              </>
            }
          />
          <QueueCard
            tone="neutral"
            title={`Bram Ostrander left the corp · owes ${isk(9_120_000)}`}
            body="Left 22 Sep for Vantor Freight. Still mailed each month."
            actions={<Button size="sm">Write off…</Button>}
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
          <span className="text-xs text-text-dim">Billable through 30 Sep · synced 2h ago</span>
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
              <StatChip label="Statements" value="19 to send" emphasis />
              <StatChip label="Billed" value={isk(412_640_300)} />
              <StatChip label="Below 5,000,000" value="4 roll into Oct" />
              <StatChip label="Credit applied" value={isk(4_300_000)} />
            </StatChips>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <Icon.SeverityClear size={Icon.ICON_SIZE.sm} className="text-success" aria-hidden />
                Every day through 30 Sep is Billable and priced ({BOOK.hub} buy, {BOOK.oreForm})
              </li>
              <li className="flex items-center gap-2">
                <Icon.SeverityClear size={Icon.ICON_SIZE.sm} className="text-success" aria-hidden />
                No gaps in the refinery records
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
              19 mails from Kestrel Vane, one per Miner, each with its lines, balance, payment code
              and verify link.
            </p>
            <MailLimitNotice count={19} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Send 19 Statements</Button>
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
  const rows = VARRO_DAYS.slice(4, 7);
  return (
    <NewComponent name="StatementMailPreview">
      <div className="space-y-2 rounded-xs border border-line bg-bg p-3 font-mono text-xs leading-relaxed">
        <p>
          <span className="text-text-dim">To:</span> Varro Kestane
          <br />
          <span className="text-text-dim">Subject:</span> {CORP.ticker} moon tax · Sep 2026 ·{' '}
          {isk(54_622_400)} ISK
        </p>
        <p>
          Prices: {BOOK.hub} buy, {BOOK.oreForm} ore, on the day mined. Rate 10% (Member default
          since {BOOK.rateFrom}).
        </p>
        <table className="w-full tabular-nums">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="pr-2">{r.date}</td>
                <td className="pr-2">{r.ore}</td>
                <td className="pr-2 text-right">{r.units.toLocaleString('en')}</td>
                <td className="pr-2 text-right">@{isk2(r.unitPrice)}</td>
                <td className="text-right">{isk(r.tax)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="text-text-dim">
                … 6 more lines
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Carried {isk(48_210_400)} · paid {isk(10_000_000)} · this month {isk(16_412_000)}
          <br />
          <strong>Balance {isk(54_622_400)} ISK, due 2 Nov.</strong>
        </p>
        <p>
          Donate to {CORP.name}; any of your characters counts. Code BRML-4H2D pins it to this
          Statement.
          <br />
          Check every line: <span className="text-accent underline">neocomdesk.app/s/7f3k…</span>
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
      </Panel>
      <Modal
        open={Boolean(preview)}
        onClose={() => {}}
        title="Preview mail · Varro Kestane"
        placement={phone ? 'sheet-full' : 'wide'}
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-dim">2,840 of 10,000 characters</span>
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

/** Phone form of the chip: an icon button with a percent badge in its corner. */
function PhoneChipButton({ items }: { items: QueueItem[] }) {
  const c = queueCounts(items);
  const percent = Math.round(((c.sent + c.failed) / c.total) * 100);
  const done = c.waiting === 0 && c.paused === 0;
  return (
    <NewComponent name="MailQueueChip (phone)">
      <button
        type="button"
        aria-label={`Statements: ${done ? 'done' : `${percent}% sent`}${c.failed ? `, ${c.failed} failed` : ''}`}
        className="relative inline-flex size-11 items-center justify-center rounded-xs border border-line hover:bg-panel-2"
      >
        <Icon.MailSent size={Icon.ICON_SIZE.md} aria-hidden="true" />
        <span
          aria-hidden="true"
          className={cx(
            'absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[0.625rem] font-semibold tabular-nums',
            c.failed
              ? 'border-danger bg-bg text-danger'
              : done
                ? 'border-success bg-bg text-success'
                : 'border-line-bright bg-bg text-text'
          )}
        >
          {done ? '✓' : `${percent}%`}
        </span>
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

// ---------------------------------------------------------------- Personal tab (today's page + corp states)

const ME = SAMPLE_ACTIVE_CHARACTER.characterId;
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
const ISO: Record<string, string> = {
  '18 Oct': '2026-10-18',
  '17 Oct': '2026-10-17',
  '16 Oct': '2026-10-16',
  '14 Oct': '2026-10-14',
  '12 Oct': '2026-10-12',
  '11 Oct': '2026-10-11',
  '27 Aug': '2026-08-27',
};

const CORP_PAYEE_RECORD = {
  id: 'corp-book',
  characterId: ME,
  name: CORP_PAYEE,
  defaultTaxPct: 10,
  updatedAt: 0,
};

function member(date: string, typeId: number, quantity: number, taxOwed: number) {
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
    taxPct: 15,
    estimatedValue: taxOwed * 10,
    taxOwed,
    status: 'outstanding' as const,
    updatedAt: 0,
  };
  return {
    row: {
      characterId: ME,
      characterName: SAMPLE_ACTIVE_CHARACTER.name,
      entry,
      assignments: [assignment],
      unassignedOreLines: [],
    },
    assignment,
  };
}

/** The real balances card, fed the book's figures: Billed plus the payment still in flight. */
const CORP_BALANCE: PayeeBalance = {
  payee: CORP_PAYEE_RECORD,
  owed: 957_002 + 895_599,
  members: [
    member('2026-10-17', 45490, 43_050, 957_002),
    member('2026-10-16', 45491, 52_100, 895_599),
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

const owedTone = (row: PersonalRow) =>
  row.state === 'Billed' || row.state === 'Sent, waiting for the corp'
    ? 'text-isk-neg'
    : 'text-text-dim font-normal';

function usePersonalColumns(): DataTableColumn<PersonalRow>[] {
  const phone = useIsPhone();
  return [
    {
      id: 'select',
      header: '',
      className: 'sm:w-9',
      stackEdge: 'start',
      render: (row) =>
        row.state === 'Unattributed' ? (
          <Checkbox aria-label={`Select ${ISO[row.date]}`} onChange={() => {}} />
        ) : null,
    },
    {
      id: 'date',
      header: 'Date',
      headerCellClassName: 'sm:w-36',
      className: 'whitespace-nowrap',
      cellClassName: () => 'text-accent',
      primary: true,
      render: (row) => ISO[row.date],
      sortValue: (row) => ISO[row.date],
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
        ) : row.state === 'Unattributed' ? (
          '—'
        ) : (
          row.payee
        ),
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
      render: (row) =>
        row.tax ? (
          phone ? (
            isk(row.tax * (row.state === 'Billed' ? 100 / 15 : 10))
          ) : (
            `${isk(row.tax * (row.state === 'Billed' ? 100 / 15 : 10))} ISK`
          )
        ) : (
          <span className="text-text-dim" data-dense-omit>
            —
          </span>
        ),
    },
    {
      id: 'taxOwed',
      header: 'Tax owed',
      headerCellClassName: 'sm:w-28',
      align: 'right',
      className: 'whitespace-nowrap',
      cardCorner: true,
      cellClassName: owedTone,
      render: (row) => (row.tax === null ? '—' : `${isk(row.tax)} ISK`),
    },
    {
      id: 'status',
      header: 'Status',
      headerCellClassName: 'sm:w-40',
      stackEdge: 'end',
      render: (row) => <CorpStatusPill row={row} />,
    },
  ];
}

/** D12's "Safe to pay" wording for the corp Payee, under its balance card. */
function CorpBookSyncNote() {
  return (
    <NewComponent name="CorpBookSyncNote">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-success">Safe to pay — 16 Oct is closed.</span>
        <span className="text-text-dim">
          17 Oct: safe to pay once {CORP.name} syncs (last synced 2d ago).
        </span>
        <span className="text-warning">
          {isk(895_599)} sent, waiting for the corp to credit it.
        </span>
      </p>
    </NewComponent>
  );
}

function PersonalF({ detail, diff }: { detail?: boolean; diff?: boolean }) {
  const tabsId = useTabsId();
  const phone = useIsPhone();
  const columns = usePersonalColumns();
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <PageHeader
        title="Mining"
        meta={<DataAgeBadge date={LOADED_AT} />}
        actions={
          <span className="flex items-center gap-1">
            <Button>Payees</Button>
            <IconButton icon={<Icon.More />} label="More actions" />
            <IconButton icon={<Icon.Refresh />} label="Refresh" />
          </span>
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
      <OwedBalances
        balances={[CORP_BALANCE]}
        unassigned={{ entryCount: 0, estimatedValue: 0 }}
        unlinkedPaymentCount={0}
        characterNameOf={() => SAMPLE_ACTIVE_CHARACTER.name}
        isSoleFilter={() => false}
        onFilterPayee={() => {}}
        onSettleUp={() => {}}
        onLinkPayment={() => {}}
        onAssignNext={() => {}}
        onReviewPayments={() => {}}
      />
      <CorpBookSyncNote />
      <div className="flex items-center gap-2">
        <CharacterFilterControl
          activeCharacterId={ME}
          value="all"
          onChange={() => {}}
          characterCount={2}
        />
        <Button size="sm">All payees</Button>
        <span className="flex-1" />
        <IconButton icon={<Icon.Download />} label="Export" />
      </div>
      <DataTable
        label="Mining tax ledger"
        columns={columns}
        rows={PERSONAL_ROWS}
        rowKey={(row) => row.id}
        onRowClick={() => {}}
        selectedRowKey={detail ? 2 : null}
        density="compact"
        stackLayout="dense"
        className="dt-dense-lead"
      />
      <Modal
        open={Boolean(detail)}
        onClose={() => {}}
        placement={phone ? 'sheet' : 'center'}
        title={
          <span className="flex items-center gap-1.5">
            2026-10-17 — Efa
            <SecurityValue security={SECURITY.Efa} />
            <InfoTooltip label="About Date" content="EVE time (UTC)" />
          </span>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-base font-semibold">{CORP_PAYEE}</span>
            <span className="shrink-0 text-xl font-medium text-isk-neg tabular-nums">
              {isk(957_002)} ISK
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-dim">
            <span>
              <span className="text-accent">{SAMPLE_ACTIVE_CHARACTER.name}</span> ·{' '}
              <span className="text-accent">Efa</span> · 15% · Est. value {isk(6_380_010)} ISK on
              the day mined
            </span>
            <CorpStatusPill row={PERSONAL_ROWS[1]} />
          </div>
          <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              Ore
            </p>
            <ul className="divide-y divide-line text-xs">
              <li className="flex items-center gap-1.5 py-1 first:pt-0 last:pb-0">
                <OreIcon typeId={45490} size={32} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  <OreLink typeId={45490}>Zeolites</OreLink>
                </span>
                <span className="text-text-dim tabular-nums">43,050 (book) · 41,200 (you)</span>
              </li>
            </ul>
          </div>
          <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2 text-xs">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              How this was priced
            </p>
            <p className="text-text-dim">
              {CORP.name}&apos;s Corp Tax Book: {BOOK.hub} buy · {BOOK.oreForm} ore · 15% per-moon
              rate from 1 Oct 2026
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-accent">Zeolites</span>
              <span className="tabular-nums">43,050 × 148.20</span>
            </p>
            <p className="text-text-dim">
              The book decides this day: it is Billable and on {CORP.name}&apos;s next Statement.
              Terms are locked to the book.
            </p>
          </div>
          <div className="space-y-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs">
            <p className="font-semibold text-warning uppercase">Disputed: you 10%, book 15%</p>
            <p className="text-text-dim">
              Your own record differs from the book on quantity and rate.
            </p>
            <Button size="sm">Compare with the book…</Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" size="sm">
              Settle up…
            </Button>
            <span className="flex-1" />
            <Button size="sm">Close</Button>
          </div>
        </div>
      </Modal>
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
    render: (r) => isk2(r.unitPrice),
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
function VerifyF() {
  const due = VERIFY.previous - VERIFY.payments[0].amount + VERIFY_TAX;
  return (
    <div className="min-h-screen bg-bg text-text">
      <VerifyTopBar />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <header>
          <p className="text-xs tracking-widest text-text-dim uppercase">
            {CORP.name} · Statement {VERIFY.period}
          </p>
          <h1 className="text-xl font-semibold">{VERIFY.miner}</h1>
        </header>
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
          <div className="order-3 min-w-0 space-y-4 md:order-none md:col-start-1 md:row-span-3 md:row-start-1">
            <Panel title="What you mined" padded={false}>
              <DataTable
                label="Statement lines"
                columns={verifyColumns}
                rows={VERIFY.lines}
                rowKey={(r) => r.id}
                density="compact"
                stackLayout="dense"
              />
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
              <StatChip label="Balance due" value={isk(due)} tone="danger" emphasis />
            </StatChips>
            <p className="mt-2 text-sm">
              Due {VERIFY.due}. Code <span className="font-mono">{VERIFY.code}</span> pins a
              donation to this Statement.
            </p>
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

/** @summary 5 · Dismiss dialog for two ticked days; Record payment… and a payment's ⋮ (Mark not tax…) are the other dialogs. */
export const MarkPaidNotTaxDismiss = corp(() => <MinerDetailF dismissing />);
/** @summary 5 · Dismiss dialog, phone: a bottom sheet. */
export const MarkPaidNotTaxDismissPhone = corp(() => <MinerDetailF dismissing />, true);

/** @summary 6 · Statements: the Sep 2026 run at Check, periods below. New component: StatementRun. */
export const Statements = corp(() => <StatementsF step="check" />);
/** @summary 6 · Statements, phone. */
export const StatementsPhone = corp(() => <StatementsF step="check" />, true);

/** @summary 7 · Preview mail: the Statement exactly as mailed, in a dialog. New component: StatementMailPreview. */
export const PreviewMail = corp(() => <StatementsF step="check" preview />);
/** @summary 7 · Preview mail, phone: a full-height sheet. */
export const PreviewMailPhone = corp(() => <StatementsF step="check" preview />, true);

/** @summary 8 · Send: step 2 of the run with EVE's mail limit, "19 mails take about 4 minutes". */
export const SendNotice = corp(() => <StatementsF step="send" />);
/** @summary 8 · Send, phone. */
export const SendNoticePhone = corp(() => <StatementsF step="send" />, true);

/** @summary 9 · Progress chip in the page header while sending, here on the Miners tab. New component: MailQueueChip. */
export const ProgressChip = corp(() => <MinersF chip={QUEUE_RUNNING} />);
/** @summary 9 · Progress chip, phone: an icon button with a percent badge. */
export const ProgressChipPhone = corp(() => <MinersF chip={QUEUE_RUNNING} />, true);

/** @summary 10 · Queue: the chip's popover, sent, paused, waiting, failed with Retry / Open in EVE. */
export const Queue = corp(() => <StatementsF step="sending" queueOpen />);
/** @summary 10 · Queue, phone: the same list as a full-height sheet. */
export const QueuePhone = corp(() => <StatementsF step="sending" queueOpen />, true);

/** @summary 11 · Queue done: the run at Done, the one failure still retryable. */
export const QueueDone = corp(() => <StatementsF step="done" queue={QUEUE_DONE} queueOpen />);
/** @summary 11 · Queue done, phone. */
export const QueueDonePhone = corp(
  () => <StatementsF step="done" queue={QUEUE_DONE} queueOpen />,
  true
);

/** @summary 12 · Member's Tax tab as it is today, plus the corp-book Status pills and Safe to pay note. New component: CorpBookSyncNote. */
export const PersonalTab = mining(() => <PersonalF />);
/** @summary 12 · Personal Tax tab, phone. */
export const PersonalTabPhone = mining(() => <PersonalF />, true);

/** @summary 13 · Row detail (today's modal) for a Billed day: the book's terms, the dispute, Compare with the book…. */
export const PersonalRowDetail = mining(() => <PersonalF detail />);
/** @summary 13 · Row detail, phone. */
export const PersonalRowDetailPhone = mining(() => <PersonalF detail />, true);

/** @summary 14 · Compare with the book: the diff dialog over the row detail. New component: CorpBookDiff. */
export const PersonalBookDiff = mining(() => <PersonalF detail diff />);
/** @summary 14 · Book diff, phone. */
export const PersonalBookDiffPhone = mining(() => <PersonalF detail diff />, true);

/** @summary 15 · Guest verify page: lines and payments left; Balance due, Terms, Stop reminders right. */
export const GuestVerify = bare(() => <VerifyF />);
/** @summary 15 · Guest verify, phone: Balance due and Terms above the lines. */
export const GuestVerifyPhone = bare(() => <VerifyF />, true);
