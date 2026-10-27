/* eslint-disable react-refresh/only-export-components -- mockup parts share constants with their stories */
/**
 * Phone (390px) pieces of the SRP officer mockups: dense cards, the sticky
 * selection bar, the full-width result toast. Sample data only.
 */
import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  DataTable,
  IskInput,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';
import { compactIsk, isk } from './srpOfficerParts';
import type { SrpClaim } from './srpOfficerFixtures';

const noop = () => {};

const selectColumn = (selectedIds: string[], canSelect: (c: SrpClaim) => boolean) =>
  ({
    id: 'select',
    header: '',
    stackEdge: 'start',
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
  }) satisfies DataTableColumn<SrpClaim>;

const pilotColumn: DataTableColumn<SrpClaim> = {
  id: 'pilot',
  header: 'Pilot',
  primary: true,
  render: (row) => <span className="font-semibold">{row.pilot}</span>,
};

const metaLine = (row: SrpClaim) => [row.hull, row.system, row.note].filter(Boolean).join(' · ');

/** Two equal 44px buttons side by side. */
function ButtonPair({ children }: { children: ReactNode }) {
  return (
    <span className="grid grid-cols-2 gap-2 [&>button]:w-full [&>button]:whitespace-nowrap [&>button]:px-2">
      {children}
    </span>
  );
}

export function phonePendingColumns(selectedIds: string[]): DataTableColumn<SrpClaim>[] {
  return [
    selectColumn(selectedIds, (row) => row.amount !== null),
    pilotColumn,
    {
      id: 'amount',
      header: 'Amount',
      cardCorner: true,
      render: (row) =>
        row.amount === null ? (
          <IskInput
            value=""
            onChange={noop}
            aria-label={`Amount for ${row.id}`}
            placeholder="Type amount"
            className="w-36"
          />
        ) : (
          <span className="tabular-nums">{isk(row.amount)}</span>
        ),
    },
    { id: 'meta', header: 'Loss', render: (row) => metaLine(row) },
    {
      id: 'actions',
      header: '',
      stackEdge: 'below',
      render: (row) => (
        <span className="block space-y-2">
          <span className="block text-[0.6875rem] text-text-dim">{row.basis}</span>
          <ButtonPair>
            <Button variant="success" aria-disabled={row.amount === null}>
              Approve
            </Button>
            <Button>Reject</Button>
          </ButtonPair>
        </span>
      ),
    },
  ];
}

export function phoneApprovedColumns(
  selectedIds: string[],
  copiedId?: string
): DataTableColumn<SrpClaim>[] {
  return [
    selectColumn(selectedIds, () => true),
    pilotColumn,
    {
      id: 'amount',
      header: 'Amount',
      cardCorner: true,
      render: (row) => <span className="tabular-nums">{isk(row.amount ?? 0)}</span>,
    },
    {
      id: 'meta',
      header: 'Approved',
      render: (row) =>
        `${row.hull} · approved ${row.decidedAt?.slice(0, 6)} by ${row.decidedBy?.split(' ')[0]}${row.overrideReason ? ' · amount changed' : ''}`,
    },
    {
      id: 'actions',
      header: '',
      stackEdge: 'below',
      render: (row) => (
        <ButtonPair>
          <Button aria-label={`Copy ${isk(row.amount ?? 0)} ISK for ${row.pilot}`}>
            {row.id === copiedId ? 'Copied' : 'Copy amount'}
          </Button>
          <Button variant="primary">Mark paid</Button>
        </ButtonPair>
      ),
    },
  ];
}

export const phoneHistoryColumns: DataTableColumn<SrpClaim>[] = [
  {
    id: 'pilot',
    header: 'Pilot',
    primary: true,
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <span className="font-semibold">{row.pilot}</span>
        <Pill tone={row.state === 'Paid' ? 'success' : 'danger'}>{row.state}</Pill>
      </span>
    ),
  },
  {
    id: 'amount',
    header: 'Amount',
    cardCorner: true,
    render: (row) => <span className="tabular-nums">{isk(row.amount ?? 0)}</span>,
  },
  {
    id: 'meta',
    header: 'Decided',
    render: (row) =>
      `${row.hull} · ${(row.paidAt ?? row.decidedAt)?.slice(0, 6)} · ${row.decidedBy}`,
  },
  {
    id: 'reason',
    header: 'Reason',
    stackEdge: 'below',
    render: (row) =>
      row.rejectReason ? (
        <span className="line-clamp-2 text-[0.6875rem] text-text-dim">{row.rejectReason}</span>
      ) : null,
  },
];

export function PhoneTable({
  label,
  columns,
  rows,
  tick,
}: {
  label: string;
  columns: DataTableColumn<SrpClaim>[];
  rows: SrpClaim[];
  tick?: boolean;
}) {
  return (
    <DataTable
      label={label}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={noop}
      stackLayout="dense"
      className={tick ? 'dt-dense-lead' : undefined}
    />
  );
}

/** "Select all" as the one small text button in the list header. */
export function SelectAllAction({ count }: { count: number }) {
  return (
    <button type="button" className={textActionClassName()}>
      Select all ({count})
    </button>
  );
}

/** The sticky bottom bar (pinned to the screen's bottom on a phone; in flow here so the picture hides no card) that appears once a row is ticked; the toast, if any, sits above it. */
export function PhoneSelectionBar({
  count,
  total,
  action,
  variant,
  toast,
}: {
  count: number;
  total: number;
  action: string;
  variant: 'primary' | 'success';
  toast?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      {toast}
      {count > 0 && (
        <NewComponent name="SrpBulkBar">
          <div className="flex items-center gap-3 bg-panel">
            <div className="min-w-0 flex-1 text-sm tabular-nums">
              <span className="block font-semibold">{count} selected</span>
              <span className="block text-xs text-text-dim">{compactIsk(total)} ISK</span>
            </div>
            <button type="button" className={textActionClassName()}>
              Clear
            </button>
            <Button variant={variant}>
              {action} ({count})
            </Button>
          </div>
        </NewComponent>
      )}
    </div>
  );
}

/** Full-width result toast: one or two lines, Undo at the right; the mail outcome is a dim second line. */
export function PhoneResultToast({ title, detail }: { title: string; detail: string }) {
  return (
    <NewComponent name="SrpResultToast">
      <div
        role="status"
        className={cx(
          'flex items-start gap-3 rounded-xs border border-line bg-panel px-3 py-2 text-sm shadow-lg'
        )}
      >
        <div className="min-w-0 flex-1">
          <p>{title}</p>
          <p className="text-xs text-text-dim">{detail}</p>
        </div>
        <button
          type="button"
          className={cx('text-accent text-sm font-semibold underline', focusRingClassName)}
        >
          Undo
        </button>
      </div>
    </NewComponent>
  );
}
