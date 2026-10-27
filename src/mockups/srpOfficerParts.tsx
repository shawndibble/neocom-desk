/* eslint-disable react-refresh/only-export-components -- mockup parts share constants with their stories */
/**
 * Pieces of the SRP officer mockups: page chrome, queue columns, bulk bar,
 * dialogs, claim detail and the activity feed. Sample data only.
 */
import { useState, type ReactNode } from 'react';
import {
  Button,
  Checkbox,
  DataTable,
  Eyebrow,
  IskInput,
  Modal,
  PageHeader,
  CollapsiblePanel,
  Panel,
  SegmentedControl,
  SlideOver,
  Tabs,
  TextArea,
  textActionClassName,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { touchCheckboxLabelClassName, inlineLinkClassName } from '@/components/ui/controlStyles';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListFlushClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatIsk } from '@/lib/isk';
import { NewComponent } from './NewComponent';
import {
  ACTIVITY,
  APPROVED,
  AUDIT_OVERRIDDEN,
  AUDIT_PENDING,
  OFFICER,
  PENDING,
  sum,
  type AuditEntry,
  type SrpClaim,
} from './srpOfficerFixtures';

export const isk = (value: number) => formatIsk(value);
export function compactIsk(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  return `${Math.round(value / 1_000_000)}M`;
}
export const PHONE = { viewport: { value: 'mobile1', isRotated: false } };
export const SRP_PARAMS = { layout: 'fullscreen', shell: { path: '/corp/srp' } };
const noop = () => {};

export type SrpTab = 'pending' | 'approved' | 'history';

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">{children}</div>;
}

function CorpSubNav() {
  const entries = ['Overview', 'Members', 'Wallet', 'Assets', 'Moons', 'SRP'];
  return (
    <div className={tabScrollerClassName}>
      <nav aria-label="Corp" className={tabListFlushClassName}>
        {entries.map((entry) => (
          <a
            key={entry}
            href={entry === 'Overview' ? '/corp' : `/corp/${entry.toLowerCase()}`}
            aria-current={entry === 'SRP' ? 'page' : undefined}
            className={cx(
              tabItemClassName,
              entry === 'SRP' ? tabItemActiveClassName : tabItemIdleClassName
            )}
          >
            {entry}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** Header, summary line and tabs; the tab body is `children`. */
export function SrpPage({
  tab,
  children,
  pending = PENDING.length,
  approved = APPROVED.length,
  owed = sum(APPROVED),
}: {
  tab: SrpTab;
  children: ReactNode;
  pending?: number;
  approved?: number;
  owed?: number;
}) {
  const tabsId = useTabsId();
  const phone = useIsPhone();
  return (
    <Page>
      <PageHeader
        title="SRP"
        meta={<span className="text-xs text-text-dim">Ship replacement for the corporation</span>}
        subNav={<CorpSubNav />}
      />
      <p className="text-sm tabular-nums" aria-live="polite">
        <span className="font-semibold">{pending} pending</span>
        <span className="text-text-dim"> · </span>
        <span className="font-semibold">
          {phone ? `${compactIsk(owed)} ISK` : `${isk(owed)} ISK`}
        </span>
        <span className="text-text-dim"> owed</span>
      </p>
      {phone ? (
        <SegmentedControl
          label="SRP Claims"
          fill
          uppercase={false}
          value={tab}
          onChange={noop}
          options={[
            { value: 'pending', label: `Pending ${pending}` },
            { value: 'approved', label: `Owed ${approved}` },
            { value: 'history', label: 'History' },
          ]}
        />
      ) : (
        <Tabs
          tabsId={tabsId}
          label="SRP Claims"
          value={tab}
          onChange={noop}
          tabs={[
            { id: 'pending', label: 'Pending', count: pending, countTone: 'warning' },
            { id: 'approved', label: 'Approved (owed)', count: approved, countTone: 'warning' },
            { id: 'history', label: 'History' },
          ]}
        />
      )}
      {children}
    </Page>
  );
}

// ------------------------------------------------------------------ bulk bar

/**
 * Select all / Select none and the count-labelled bulk buttons (DESIGN.md
 * Bulk selection): the buttons appear once a row is ticked.
 */
export function BulkBar({
  selected,
  selectable,
  children,
}: {
  selected: number;
  selectable: number;
  children?: ReactNode;
}) {
  return (
    <NewComponent name="SrpBulkBar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className={textActionClassName()}>
          Select all ({selectable})
        </button>
        <button type="button" className={textActionClassName()} aria-disabled={selected === 0}>
          Select none
        </button>
        <span className="text-xs text-text-dim tabular-nums">{selected} selected</span>
        <span className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {selected > 0 && children}
        </span>
      </div>
    </NewComponent>
  );
}

// ------------------------------------------------------------------- columns

function Pilot({ claim }: { claim: SrpClaim }) {
  return (
    <span className="block min-w-0">
      <span className="font-semibold text-accent">{claim.pilot}</span>
      <span className="block text-xs text-text-dim">{claim.id}</span>
    </span>
  );
}

function selectColumn(
  selectedIds: string[],
  canSelect: (row: SrpClaim) => boolean
): DataTableColumn<SrpClaim> {
  return {
    id: 'select',
    header: '',
    className: 'w-8',
    cardCorner: 'start',
    render: (row) =>
      canSelect(row) ? (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox
            aria-label={`Select ${row.id} ${row.pilot}`}
            checked={selectedIds.includes(row.id)}
            onChange={noop}
          />
        </label>
      ) : null,
  };
}

const lossColumns: DataTableColumn<SrpClaim>[] = [
  {
    id: 'hull',
    header: 'Hull',
    render: (row) => (
      <span className="block min-w-0">
        {row.hull}
        <span className="block text-xs text-text-dim">{row.system}</span>
      </span>
    ),
  },
  {
    id: 'lost',
    header: 'Lost',
    className: 'whitespace-nowrap tabular-nums',
    render: (row) => (
      <span className="block">
        {row.lostAt}
        <span className="block text-xs text-text-dim">Filed {row.filedAt}</span>
      </span>
    ),
  },
  {
    id: 'note',
    header: 'Fleet or FC',
    className: 'max-w-48',
    render: (row) =>
      row.note ? (
        <span className="text-text-dim">{row.note}</span>
      ) : (
        <span className="text-text-faint">-</span>
      ),
  },
];

function AmountCell({ claim, type }: { claim: SrpClaim; type?: boolean }) {
  if (claim.amount === null && type) {
    return (
      <span className="block space-y-1">
        <IskInput
          value=""
          onChange={noop}
          aria-label={`Amount for ${claim.id}`}
          placeholder="Type amount"
        />
        <span className="block text-xs text-warning">{claim.basis}</span>
      </span>
    );
  }
  return (
    <span className="block text-right tabular-nums max-sm:text-left">
      <span className="font-semibold">{isk(claim.amount ?? 0)} ISK</span>
      {claim.overrideReason ? (
        <span className="block text-xs text-text-dim">
          <span className="line-through">{isk(claim.computed ?? 0)}</span> changed by{' '}
          {claim.overrideBy}
        </span>
      ) : (
        <span className="block text-xs text-text-dim">{claim.basis}</span>
      )}
    </span>
  );
}

export function pendingColumns(selectedIds: string[]): DataTableColumn<SrpClaim>[] {
  return [
    selectColumn(selectedIds, (row) => row.amount !== null),
    { id: 'pilot', header: 'Pilot', primary: true, render: (row) => <Pilot claim={row} /> },
    ...lossColumns,
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      className: 'min-w-44',
      render: (row) => <AmountCell claim={row} type />,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className="flex flex-wrap justify-end gap-2 max-sm:justify-start">
          <Button
            size="sm"
            variant="success"
            className="whitespace-nowrap"
            aria-disabled={row.amount === null}
          >
            Approve
          </Button>
          <Button size="sm" className="whitespace-nowrap">
            Reject
          </Button>
        </span>
      ),
    },
  ];
}

/** A copy button for the bare amount, so the officer can paste it into the in-game wallet. */
export function CopyAmount({ claim, copied }: { claim: SrpClaim; copied?: boolean }) {
  return (
    <Button
      size="sm"
      aria-label={`Copy ${isk(claim.amount ?? 0)} ISK for ${claim.pilot}`}
      className="shrink-0"
    >
      {copied ? (
        <Icon.Done size={Icon.ICON_SIZE.sm} />
      ) : (
        <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
      )}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export function approvedColumns(
  selectedIds: string[],
  copiedId?: string
): DataTableColumn<SrpClaim>[] {
  return [
    selectColumn(selectedIds, () => true),
    { id: 'pilot', header: 'Pilot', primary: true, render: (row) => <Pilot claim={row} /> },
    lossColumns[0]!,
    {
      id: 'approved',
      header: 'Approved',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (
        <span className="block">
          {row.decidedAt}
          <span className="block text-xs text-text-dim">by {row.decidedBy}</span>
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      className: 'min-w-44',
      render: (row) => (
        <span className="flex flex-wrap items-center justify-end gap-2 max-sm:justify-start">
          <AmountCell claim={row} />
          <CopyAmount claim={row} copied={row.id === copiedId} />
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      render: () => (
        <Button size="sm" variant="success" className="whitespace-nowrap">
          Mark paid
        </Button>
      ),
    },
  ];
}

export const historyColumns: DataTableColumn<SrpClaim>[] = [
  { id: 'pilot', header: 'Pilot', primary: true, render: (row) => <Pilot claim={row} /> },
  lossColumns[0]!,
  {
    id: 'state',
    header: 'State',
    render: (row) => <Pill tone={row.state === 'Paid' ? 'success' : 'danger'}>{row.state}</Pill>,
  },
  {
    id: 'decided',
    header: 'Decided',
    className: 'whitespace-nowrap tabular-nums',
    render: (row) => (
      <span className="block">
        {row.paidAt ?? row.decidedAt}
        <span className="block text-xs text-text-dim">by {row.decidedBy}</span>
      </span>
    ),
  },
  {
    id: 'note',
    header: 'Reason',
    className: 'max-w-64',
    render: (row) =>
      row.rejectReason ? (
        <span className="text-text-dim">{row.rejectReason}</span>
      ) : (
        <span className="text-text-faint">-</span>
      ),
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'right',
    className: 'min-w-44',
    render: (row) => <AmountCell claim={row} />,
  },
];

export function ClaimTable({
  label,
  columns,
  rows,
  selectedKey,
}: {
  label: string;
  columns: DataTableColumn<SrpClaim>[];
  rows: SrpClaim[];
  selectedKey?: string;
}) {
  return (
    <DataTable
      label={label}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={noop}
      selectedRowKey={selectedKey}
    />
  );
}

// ------------------------------------------------------------------- dialogs

function Label({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-text-dim">{text}</span>
      {children}
    </label>
  );
}

function Footer({ confirm }: { confirm: ReactNode }) {
  const phone = useIsPhone();
  if (phone)
    return (
      <div className="flex flex-col-reverse gap-2 [&>button]:w-full">
        <Button variant="ghost">Cancel</Button>
        {confirm}
      </div>
    );
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost">Cancel</Button>
      {confirm}
    </div>
  );
}

function Effect({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xs border border-line bg-panel-2 p-2 text-xs tabular-nums">{children}</p>
  );
}

const LOGGED = `Logged as ${OFFICER.name} (${OFFICER.role}), now, with your reason. Your role is checked again when you confirm.`;

export function RejectDialog({ claim }: { claim: SrpClaim }) {
  const phone = useIsPhone();
  return (
    <Modal
      open
      onClose={noop}
      title={`Reject ${claim.id}?`}
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="danger">Reject claim</Button>} />}
    >
      <div className="space-y-3 text-sm">
        <p>
          {claim.pilot}, {claim.hull} lost at {claim.system}, {isk(claim.amount ?? 0)} ISK. The
          claim moves to History as Rejected.
        </p>
        <Label text="Reason (required, sent to the pilot)">
          <TextArea
            value="Solo roam, not a corp doctrine fleet. SRP covers fleet losses only."
            onChange={noop}
            rows={3}
          />
        </Label>
        <p className="text-xs text-text-dim">
          Mailed to {claim.pilot} from your client. If the mail fails the rejection is still saved.
        </p>
        <p className="text-xs text-text-dim">{LOGGED}</p>
      </div>
    </Modal>
  );
}

const OVERRIDE_TO = 300_000_000;

export function OverrideDialog({ claim }: { claim: SrpClaim }) {
  const phone = useIsPhone();
  return (
    <Modal
      open
      onClose={noop}
      title={`Change amount for ${claim.id}`}
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="primary">Save amount</Button>} />}
    >
      <div className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-text-dim">Computed</dt>
          <dd className="font-semibold tabular-nums">{isk(claim.computed ?? 0)} ISK</dd>
          <dt className="text-text-dim">Basis</dt>
          <dd>{claim.basis}</dd>
        </dl>
        <Label text="New amount">
          <IskInput value={String(OVERRIDE_TO)} onChange={noop} aria-label="New amount" />
        </Label>
        <Label text="Reason (required, kept in the audit trail)">
          <TextArea value="Fit was 2 faction modules short of doctrine" onChange={noop} rows={2} />
        </Label>
        <Effect>
          {isk(claim.computed ?? 0)} → {isk(OVERRIDE_TO)} ISK. The computed amount stays visible on
          the claim.
        </Effect>
        <p className="text-xs text-text-dim">{LOGGED}</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- detail

export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <NewComponent name="SrpAuditTrail">
      <ol className="space-y-2 text-sm">
        {entries.map((entry) => (
          <li
            key={entry.at + entry.text}
            className="grid grid-cols-[6.5rem_1fr] items-baseline gap-2"
          >
            <span className="text-xs text-text-dim tabular-nums">{entry.at}</span>
            <span>
              <span className="font-semibold">{entry.actor}</span>{' '}
              <span className="text-text-dim">{entry.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </NewComponent>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
      <dt className="text-text-dim">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const STATE_TONE = {
  Pending: 'warning',
  Approved: 'warning',
  Paid: 'success',
  Rejected: 'danger',
} as const;

/** One claim's detail in a `SlideOver`: facts, amount with its basis, audit trail and the state's actions. */
export function ClaimDetail({ claim, audit }: { claim: SrpClaim; audit: AuditEntry[] }) {
  const [open] = useState(true);
  const phone = useIsPhone();
  return (
    <SlideOver
      open={open}
      onClose={noop}
      title={`${claim.id} · ${claim.pilot}`}
      subtitle={`${claim.hull} lost at ${claim.system}`}
      flush={phone}
    >
      <div className={cx(phone ? 'flex min-h-full flex-col' : 'space-y-4')}>
        <div className={cx('space-y-4', phone && 'flex-1 p-3')}>
          <NewComponent name="SrpClaimDetail">
            <dl className="space-y-2">
              <Row label="State">
                <Pill tone={STATE_TONE[claim.state]}>{claim.state}</Pill>
              </Row>
              <Row label="Pilot">
                <span className="flex flex-wrap items-center gap-x-3">
                  {claim.pilot}
                  <button type="button" className={textActionClassName()}>
                    Open in EVE
                  </button>
                </span>
              </Row>
              <Row label="Killmail">
                <a
                  href="https://zkillboard.com"
                  className={cx(inlineLinkClassName, 'inline-flex items-center gap-1')}
                >
                  {claim.killmailId} on zKillboard
                  <Icon.External size={Icon.ICON_SIZE.sm} />
                </a>
              </Row>
              <Row label="Lost">{claim.lostAt} EVE</Row>
              <Row label="Filed">{claim.filedAt} EVE</Row>
              <Row label="Fleet or FC">
                {claim.note ?? <span className="text-text-faint">-</span>}
              </Row>
              <Row label="Amount">
                <span className="block tabular-nums">
                  <span className="text-base font-semibold">{isk(claim.amount ?? 0)} ISK</span>
                  <span className="block text-xs text-text-dim">{claim.basis}</span>
                  {claim.overrideReason && (
                    <span className="mt-1 block text-xs text-text-dim">
                      Computed <span className="line-through">{isk(claim.computed ?? 0)}</span> ISK.
                      Changed by {claim.overrideBy}: {claim.overrideReason}
                    </span>
                  )}
                </span>
                {claim.state === 'Pending' && (
                  <button type="button" className={cx(textActionClassName(), 'mt-1')}>
                    Change amount
                  </button>
                )}
              </Row>
            </dl>
          </NewComponent>
          <div className="space-y-2">
            <Eyebrow>Audit trail</Eyebrow>
            <AuditTrail entries={audit} />
          </div>
        </div>
        <div
          className={cx(
            phone
              ? 'sticky bottom-0 grid grid-cols-2 gap-2 border-t border-line bg-panel p-3 [&>button]:w-full'
              : 'flex flex-wrap justify-end gap-2 border-t border-line pt-3'
          )}
        >
          {claim.state === 'Pending' && (
            <>
              <Button>Reject</Button>
              <Button variant="success">Approve</Button>
            </>
          )}
          {claim.state === 'Approved' && (
            <>
              <CopyAmount claim={claim} />
              <Button variant="success">Mark paid</Button>
            </>
          )}
        </div>
      </div>
    </SlideOver>
  );
}

export const DETAIL_PENDING = { claim: PENDING[0]!, audit: AUDIT_PENDING };
export const DETAIL_OVERRIDDEN = { claim: APPROVED[2]!, audit: AUDIT_OVERRIDDEN };

// ------------------------------------------------------------------ activity

export function ActivityFeed() {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  if (phone)
    return (
      <CollapsiblePanel
        title="Activity"
        meta={<span className="text-xs text-text-dim">{ACTIVITY.length} actions</span>}
        expanded={open}
        onToggle={() => setOpen(!open)}
        labels={{ show: 'Show activity', hide: 'Hide activity' }}
      >
        <ActivityList />
      </CollapsiblePanel>
    );
  return (
    <Panel
      title="Activity"
      meta={<span className="text-xs text-text-dim">Every action, newest first</span>}
    >
      <ActivityList />
    </Panel>
  );
}

function ActivityList() {
  return (
    <NewComponent name="SrpActivityFeed">
      <ol className="space-y-2 text-sm">
        {ACTIVITY.map((entry) => (
          <li
            key={entry.at + entry.text}
            className="grid items-baseline gap-x-3 sm:grid-cols-[7.5rem_9rem_1fr]"
          >
            <span className="text-xs text-text-dim tabular-nums">{entry.at}</span>
            <span className="font-semibold">{entry.actor}</span>
            <span className="text-text-dim">{entry.text}</span>
          </li>
        ))}
      </ol>
    </NewComponent>
  );
}
