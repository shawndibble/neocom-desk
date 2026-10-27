/**
 * Pieces the three Corp Tax Book layout options (#4056) have in common: the
 * page header with the Corp sub-nav (plus its new Moons entry), status words,
 * the send-queue table, and the tables every option shows somewhere. Each
 * option file composes these differently; nothing here is a layout.
 */
import type { ReactElement, ReactNode } from 'react';
import {
  Button,
  Checkbox,
  DataTable,
  IconButton,
  PageHeader,
  ProgressBar,
  Tabs,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListFlushClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import * as Icon from '@/components/ui/icons';
import { AttentionStrip } from '@/features/miningTax/AttentionStrip';
import {
  focusRingClassName,
  inlineLinkClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';
import {
  BOOK,
  CORP,
  DIFF,
  type ExtractionState,
  type MinerStanding,
  type QueueItem,
} from './corpTaxBookFixtures';
import { isk, queueCounts } from './corpTaxBookFormat';

/** The Corp sub-nav as it stands, plus the Moons entry D21 adds. */
function CorpSubNavWithMoons() {
  const entries = ['Overview', 'Members', 'Wallet', 'Assets', 'Moons'];
  return (
    <div className={tabScrollerClassName}>
      <nav aria-label="Corp" className={tabListFlushClassName}>
        {entries.map((entry) => (
          <a
            key={entry}
            href={entry === 'Overview' ? '/corp' : `/corp/${entry.toLowerCase()}`}
            aria-current={entry === 'Moons' ? 'page' : undefined}
            className={cx(
              tabItemClassName,
              entry === 'Moons' ? tabItemActiveClassName : tabItemIdleClassName
            )}
          >
            {entry}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** D9: who last fed the book, and when. */
function SyncMeta() {
  return (
    <span className="text-xs text-text-dim">
      Synced {BOOK.lastSynced} by {BOOK.lastSyncedBy}
    </span>
  );
}

/** D21: settings open from the page header (the gear opens this page's settings). */
function BookSettingsButton() {
  return <IconButton icon={<Icon.Settings />} label="Corp Tax Book settings" />;
}

function RefreshButton() {
  return <IconButton icon={<Icon.Refresh />} label="Sync now" />;
}

/** D7: the audit log, shown as an activity feed. Opens a side panel over the page. */
function ActivityButton() {
  return (
    <Button size="sm" variant="ghost">
      <Icon.Recent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      Activity
    </Button>
  );
}

/**
 * D9: how fresh the book is and what is missing from it. The strip stays
 * collapsed (one line) until opened, like the personal tab's, but a gap is a
 * warning so it leads and the page never reads as complete when it is not.
 */
export function BookHealthStrip() {
  return (
    <AttentionStrip
      items={[
        {
          id: 'gap',
          tone: 'warning',
          title: 'Gap: 5 Sep, Efa - Brass Anvil — unrecoverable',
          detail: (
            <p>
              No officer synced between 4 Sep 09:00 and 7 Sep 11:00, and ESI no longer returns 5 Sep
              for this refinery. Whatever was mined that day is missing from the book and cannot be
              billed.
            </p>
          ),
        },
        {
          id: 'sync',
          tone: 'info',
          title: `Last synced ${BOOK.lastSynced} by ${BOOK.lastSyncedBy}`,
          detail: (
            <p>
              Billable through {BOOK.billableThrough} (day end + 30 min grace, then a sync). The
              book warns here once nobody has synced for about 3 days.
            </p>
          ),
          action: <Button size="sm">Sync now</Button>,
        },
      ]}
    />
  );
}

export type MoonsTab = 'extractions' | 'miners' | 'statements';

export function MoonsTabs({ value }: { value: MoonsTab }) {
  const tabsId = useTabsId();
  return (
    <Tabs
      tabsId={tabsId}
      label="Corp Tax Book"
      value={value}
      onChange={() => {}}
      tabs={[
        { id: 'extractions', label: 'Extractions' },
        { id: 'miners', label: 'Miners' },
        { id: 'statements', label: 'Statements' },
      ]}
    />
  );
}

/** `/corp/moons` header: the title, sync line, Corp sub-nav and page controls. */
export function MoonsHeader({ lead }: { lead?: ReactNode }) {
  return (
    <PageHeader
      title="Moons"
      meta={<SyncMeta />}
      subNav={<CorpSubNavWithMoons />}
      actions={
        <span className="flex items-center gap-1">
          {lead}
          <ActivityButton />
          <RefreshButton />
          <BookSettingsButton />
        </span>
      }
    />
  );
}

const STATE_TONE: Record<ExtractionState, string> = {
  Extracting: 'text-text-dim',
  Ready: 'text-success',
  Fractured: 'text-warning',
  Expired: 'text-text-faint',
};

/** An Extraction's state as a word (D14): readable without its colour. */
export function StateWord({ state }: { state: ExtractionState }) {
  return (
    <span
      className={cx(
        'text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
        STATE_TONE[state]
      )}
    >
      {state}
    </span>
  );
}

export function StandingWord({ standing }: { standing: MinerStanding }) {
  return (
    <span
      className={cx(
        'text-xs whitespace-nowrap',
        standing === 'Left corp' ? 'text-warning' : 'text-text-dim'
      )}
    >
      {standing}
    </span>
  );
}

export function OverdueWord({ days }: { days: number | null }) {
  if (days === null) return <span className="text-text-dim">—</span>;
  return <span className="font-semibold whitespace-nowrap text-danger">Overdue {days}d</span>;
}

/** Ore make-up of a chunk, or D13's fallback. */
export function OreLine({ ores }: { ores: { ore: string; share: number }[] | null }) {
  if (!ores)
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        Ore unknown — link a survey
      </span>
    );
  return <span>{ores.map((o) => `${o.ore} ${o.share}%`).join(' · ')}</span>;
}

/** D13: mined vs left after fracture. */
export function MinedBar({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-text-dim">—</span>;
  return (
    <span className="block min-w-28">
      <span className="text-xs tabular-nums">
        {pct}% mined · {100 - pct}% left
      </span>
      <ProgressBar label={`${label} mined`} value={pct} max={100} size="xs" className="mt-1" />
    </span>
  );
}

const QUEUE_TONE: Record<QueueItem['status'], string> = {
  Sent: 'text-success',
  Sending: 'text-text',
  Paused: 'text-warning',
  Failed: 'text-danger',
  Waiting: 'text-text-dim',
};

function QueueStatus({ item }: { item: QueueItem }) {
  return (
    <span className="block min-w-0">
      <span
        className={cx(
          'inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap',
          QUEUE_TONE[item.status]
        )}
      >
        {item.status === 'Waiting' && <Icon.Pending size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
        {item.status === 'Paused' && <Icon.Pending size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
        {item.status === 'Failed' && <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
        {item.status}
        {item.status === 'Sent' && <span aria-hidden="true"> ✓</span>}
        {item.at ? <span className="font-normal text-text-dim"> {item.at}</span> : null}
      </span>
      {item.detail && <span className="block text-xs text-text-dim">{item.detail}</span>}
    </span>
  );
}

const queueColumns: DataTableColumn<QueueItem>[] = [
  { id: 'to', header: 'To', primary: true, render: (row) => row.to },
  {
    id: 'amount',
    header: 'Statement',
    align: 'right',
    className: 'tabular-nums',
    phoneHidden: true,
    render: (row) => isk(row.amount),
  },
  { id: 'status', header: 'Status', render: (row) => <QueueStatus item={row} /> },
  {
    id: 'action',
    header: '',
    align: 'right',
    cardCorner: true,
    render: (row) =>
      row.status === 'Failed' ? (
        <span className="flex justify-end gap-1">
          <Button size="sm">Retry</Button>
          <Button size="sm" variant="ghost">
            Open in EVE
          </Button>
        </span>
      ) : null,
  },
];

/** D16: one row per mail in the send queue. Read-only apart from Retry on a failure. */
export function QueueTable({ items }: { items: QueueItem[] }) {
  return (
    <DataTable
      label="Send queue"
      columns={queueColumns}
      rows={items}
      rowKey={(row) => row.id}
      density="compact"
      stackLayout="dense"
      rowClassName={(row) => (row.status === 'Failed' ? 'bg-danger/5' : undefined)}
    />
  );
}

/** The queue's one-line summary: counts as words, and an ETA while it runs. */
export function QueueSummary({ items }: { items: QueueItem[] }) {
  const c = queueCounts(items);
  const done = c.waiting === 0 && c.paused === 0;
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
        <span className="font-semibold">
          {done ? 'Done' : `Sending ${c.sent + c.failed + 1} of ${c.total}`}
        </span>
        <span className="text-success">{c.sent} sent</span>
        {c.paused > 0 && <span className="text-warning">{c.paused} paused</span>}
        {c.waiting > 0 && <span className="text-text-dim">{c.waiting} waiting</span>}
        {c.failed > 0 && <span className="text-danger">{c.failed} failed</span>}
        {!done && <span className="text-text-dim">about 2 minutes left</span>}
      </p>
      <ProgressBar
        label="Statements sent"
        value={c.sent + c.failed}
        max={c.total}
        size="sm"
        tone={done ? (c.failed ? 'warning' : 'success') : 'accent'}
      />
      <p className="text-xs text-text-dim">
        {done
          ? 'Every mail is logged on its Miner. Retry the failure, or open it in EVE to send by hand.'
          : 'Sending from Kestrel Vane, one mail every 12–15s. The queue keeps going in the background, and if the tab closes it picks up where it left off.'}
      </p>
    </div>
  );
}

/**
 * The top-bar progress chip (D16), on every page while a queue runs. `cue`
 * follows §6c for what a click does: a popover (CaretDown in a bordered
 * chip), a side panel (bordered button, trailing CaretRight), or a page
 * (a ghost button that navigates).
 */
export function MailQueueChip({
  items,
  cue,
  renderButton = (button) => button,
}: {
  items: QueueItem[];
  cue: 'popover' | 'panel' | 'link';
  /** Wraps the button, e.g. in a `PopoverTrigger`. */
  renderButton?: (button: ReactElement) => ReactNode;
}) {
  const c = queueCounts(items);
  const done = c.waiting === 0 && c.paused === 0;
  const trailing =
    cue === 'popover' ? (
      <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
    ) : cue === 'panel' ? (
      <Icon.GoTo size={Icon.ICON_SIZE.sm} aria-hidden="true" />
    ) : null;
  return (
    <NewComponent name="MailQueueChip">
      {renderButton(
        <button
          type="button"
          className={cx(
            'inline-flex h-8 items-center gap-2 rounded-xs px-2 text-xs whitespace-nowrap',
            focusRingClassName,
            cue === 'link' ? 'hover:bg-panel-2' : 'border border-line hover:bg-panel-2'
          )}
        >
          <Icon.MailSent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          <span className="tabular-nums">
            <span className="max-sm:hidden">Statements </span>
            {done ? 'sent' : `${c.sent} of ${c.total}`}
          </span>
          {c.failed > 0 && (
            <span className="inline-flex items-center gap-0.5 text-warning">
              <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {c.failed}
            </span>
          )}
          {!done && (
            <ProgressBar
              label="Statements sent"
              value={c.sent + c.failed}
              max={c.total}
              size="xs"
              className="w-12 max-sm:hidden"
            />
          )}
          {trailing}
        </button>
      )}
    </NewComponent>
  );
}

/** D16's notice on Send: EVE's hidden mail limit, worked out for this batch. */
export function MailLimitNotice({ count }: { count: number }) {
  const minutes = Math.ceil(count / 5);
  return (
    <div className="flex gap-2 rounded-xs border border-line bg-panel-2 p-3 text-sm">
      <Icon.Info size={Icon.ICON_SIZE.md} className="mt-0.5 shrink-0 text-text-dim" aria-hidden />
      <div className="space-y-1">
        <p>
          EVE lets a character send about 5 mails a minute, so {count} mails take about {minutes}{' '}
          minutes.
        </p>
        <p className="text-text-dim">
          They go out in the background from Kestrel Vane. Keep using the app; a chip at the top of
          every page shows progress. If you close the tab the queue keeps going in the background
          and picks up where it left off.
        </p>
      </div>
    </div>
  );
}

/** D28: the member's figures beside the book's for one day. */
export function CorpBookDiff() {
  return (
    <NewComponent name="CorpBookDiff">
      <div className="space-y-2">
        <p className="text-xs text-text-dim">
          {DIFF.date} · {DIFF.where}
        </p>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[0.6875rem] tracking-widest text-text-dim uppercase">
              <th className="py-1 font-semibold"> </th>
              <th className="py-1 text-right font-semibold">You</th>
              <th className="py-1 text-right font-semibold">Book</th>
            </tr>
          </thead>
          <tbody>
            {DIFF.rows.map((row) => (
              <tr key={row.what} className="border-t border-line">
                <td className="py-1.5 text-text-dim">{row.what}</td>
                <td className="py-1.5 text-right">{row.mine}</td>
                <td className={cx('py-1.5 text-right', row.differs && 'font-semibold')}>
                  {row.book}
                  {row.differs && <span className="ml-1 text-xs text-warning">differs</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex items-center gap-1 text-sm font-semibold text-warning">
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {DIFF.disputed}
        </p>
        <p className="text-xs text-text-dim">
          {DIFF.rateNote}. Once {DIFF.date} is Billable, the book&apos;s quantity, price and rate
          decide what you owe {CORP.name}. Raise a difference with an officer.
        </p>
      </div>
    </NewComponent>
  );
}

/** D27: the guest's opt-out. The monthly Statement still goes. */
export function StopReminders({ checked }: { checked: boolean }) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-xs border border-line p-3',
        tappableRowClassName
      )}
    >
      <Checkbox checked={checked} onChange={() => {}} className="mt-0.5" />
      <span className="text-sm">
        Stop reminders
        <span className="block text-xs text-text-dim">
          Your monthly Statement still comes. Officers can send you at most one reminder per
          Statement.
        </span>
      </span>
    </label>
  );
}

/** The verify page's own top line: no shell, no login (D27). */
export function VerifyTopBar() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <span className="text-sm font-semibold">Neocom Desk</span>
      <span className="inline-flex items-center gap-1 text-xs text-text-dim">
        <Icon.ReadOnly size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        Read-only · no login needed
      </span>
    </div>
  );
}

/** A labelled way up from a drill-down page (§6c: never a bare CaretLeft). */
export function Crumb({ label }: { label: string }) {
  return (
    <a
      href="/corp/moons"
      className={cx(inlineLinkClassName, 'inline-flex items-center gap-1 text-xs')}
    >
      <Icon.Back size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {label}
    </a>
  );
}
