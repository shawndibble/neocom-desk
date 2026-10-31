/**
 * The officer queue's table columns: Pending, Owed and History, each as the desktop
 * table and the phone's dense card (DESIGN.md §4a, `stackLayout="dense"`). Handlers come in as a
 * context so the columns stay plain data.
 */
import { Button, type DataTableColumn } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import type { SrpClaim } from '../srpClaimTypes';
import { ownClaimReason, type ClaimColumnsContext } from './claimColumnsContext';
import {
  AmountCell,
  ApproveReject,
  ButtonPair,
  ClaimStatePill,
  CopyAmount,
  DecideTip,
  Pilot,
  PendingAmount,
  SelectBox,
  OffDoctrineFlag,
  TypeAmountField,
} from './OfficerClaimCells';
import { claimBasisLine, decidedLine } from './srpClaimText';
import { canBulkApprove } from './srpQueue';

const when = (ctx: ClaimColumnsContext, ms: number) => formatTimestamp(new Date(ms), ctx.zone);

/** Claim lifecycle order, so State sorts as the claim moves, not A to Z. */
const STATE_RANK: Record<SrpClaim['state'], number> = {
  pending: 0,
  approved: 1,
  paid: 2,
  rejected: 3,
};

const hullColumn = (ctx: ClaimColumnsContext): DataTableColumn<SrpClaim> => ({
  id: 'hull',
  header: ctx.t('srp.officer.columns.hull'),
  sortValue: (row) => ctx.names.hull(row.hullTypeId),
  render: (row) => (
    <span className="block min-w-0">
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        {ctx.names.hull(row.hullTypeId)}
        <OffDoctrineFlag claim={row} ctx={ctx} />
      </span>
      <span className="block text-xs text-text-dim">{ctx.names.system(row.solarSystemId)}</span>
    </span>
  ),
});

const pilotColumn = (ctx: ClaimColumnsContext): DataTableColumn<SrpClaim> => ({
  id: 'pilot',
  header: ctx.t('srp.officer.columns.pilot'),
  primary: true,
  sortValue: (row) => row.characterName,
  render: (row) => <Pilot claim={row} ctx={ctx} />,
});

const lostColumn = (ctx: ClaimColumnsContext): DataTableColumn<SrpClaim> => ({
  id: 'lost',
  header: ctx.t('srp.officer.columns.lost'),
  sortValue: (row) => row.killedAt,
  className: 'whitespace-nowrap tabular-nums',
  render: (row) => (
    <span className="block">
      {when(ctx, row.killedAt)}
      <span className="block text-xs text-text-dim">
        {ctx.t('srp.officer.filed', { when: when(ctx, row.filedAt) })}
      </span>
    </span>
  ),
});

const fleetColumn = (ctx: ClaimColumnsContext): DataTableColumn<SrpClaim> => ({
  id: 'fleet',
  header: ctx.t('srp.officer.columns.fleetOrFc'),
  sortValue: (row) => row.fleetOrFc ?? undefined,
  className: 'max-w-48 wrap-anywhere',
  render: (row) =>
    row.fleetOrFc ? (
      <span className="text-text-dim">{row.fleetOrFc}</span>
    ) : (
      <span className="text-text-faint">-</span>
    ),
});

const selectColumn = (
  ctx: ClaimColumnsContext,
  canSelect: (c: SrpClaim) => boolean
): DataTableColumn<SrpClaim> => ({
  id: 'select',
  header: '',
  className: 'w-8',
  cardCorner: 'start',
  render: (row) => <SelectBox claim={row} ctx={ctx} show={canSelect(row)} />,
});

export function pendingColumns(ctx: ClaimColumnsContext): DataTableColumn<SrpClaim>[] {
  return [
    selectColumn(ctx, canBulkApprove),
    pilotColumn(ctx),
    hullColumn(ctx),
    lostColumn(ctx),
    fleetColumn(ctx),
    {
      id: 'amount',
      header: ctx.t('srp.officer.columns.amount'),
      align: 'right',
      sortValue: (row) => row.amount ?? undefined,
      // Capped so a long basis line wraps here, leaving the room to Pilot and Hull.
      className: 'min-w-36 max-w-44 wrap-anywhere',
      render: (row) => <PendingAmount claim={row} ctx={ctx} />,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className="flex flex-nowrap justify-end gap-2">
          <ApproveReject claim={row} ctx={ctx} className="whitespace-nowrap" />
        </span>
      ),
    },
  ];
}

export function owedColumns(ctx: ClaimColumnsContext): DataTableColumn<SrpClaim>[] {
  return [
    selectColumn(ctx, () => true),
    pilotColumn(ctx),
    hullColumn(ctx),
    {
      id: 'approved',
      header: ctx.t('srp.officer.columns.approved'),
      sortValue: (row) => row.decidedAt,
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (
        <span className="block">
          {row.decidedAt !== undefined && when(ctx, row.decidedAt)}
          {row.decidedByName && (
            <span className="block text-xs text-text-dim">
              {ctx.t('srp.officer.by', { name: row.decidedByName })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'amount',
      header: ctx.t('srp.officer.columns.amount'),
      align: 'right',
      sortValue: (row) => row.amount ?? undefined,
      className: 'min-w-44',
      render: (row) => (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <AmountCell claim={row} ctx={ctx} />
          <CopyAmount claim={row} ctx={ctx} />
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <DecideTip reason={ownClaimReason(row, ctx)}>
          <Button
            size="sm"
            variant="success"
            className="whitespace-nowrap"
            aria-disabled={ctx.busy || ownClaimReason(row, ctx) !== undefined || undefined}
            onClick={() => ctx.onMarkPaid(row)}
          >
            {ctx.t('srp.officer.actions.markPaid')}
          </Button>
        </DecideTip>
      ),
    },
  ];
}

export function historyColumns(ctx: ClaimColumnsContext): DataTableColumn<SrpClaim>[] {
  return [
    pilotColumn(ctx),
    hullColumn(ctx),
    {
      id: 'state',
      header: ctx.t('srp.officer.columns.state'),
      sortValue: (row) => STATE_RANK[row.state],
      sortFirst: 'asc',
      render: (row) => <ClaimStatePill claim={row} ctx={ctx} />,
    },
    {
      id: 'decided',
      header: ctx.t('srp.officer.columns.decided'),
      sortValue: (row) => decidedLine(row).at,
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        const { at, by } = decidedLine(row);
        return (
          <span className="block">
            {at !== undefined && when(ctx, at)}
            {by && (
              <span className="block text-xs text-text-dim">
                {ctx.t('srp.officer.by', { name: by })}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'reason',
      header: ctx.t('srp.officer.columns.reason'),
      className: 'max-w-64',
      render: (row) =>
        row.rejectionReason ? (
          <span className="text-text-dim">{row.rejectionReason}</span>
        ) : (
          <span className="text-text-faint">-</span>
        ),
    },
    {
      id: 'amount',
      header: ctx.t('srp.officer.columns.amount'),
      align: 'right',
      sortValue: (row) => row.amount ?? undefined,
      className: 'min-w-44',
      render: (row) => <AmountCell claim={row} ctx={ctx} />,
    },
  ];
}

// ------------------------------------------------------------------ phone

const metaLine = (ctx: ClaimColumnsContext, row: SrpClaim) =>
  [ctx.names.hull(row.hullTypeId), ctx.names.system(row.solarSystemId), row.fleetOrFc]
    .filter(Boolean)
    .join(' · ');

const phoneSelect = (
  ctx: ClaimColumnsContext,
  canSelect: (c: SrpClaim) => boolean
): DataTableColumn<SrpClaim> => ({
  id: 'select',
  header: '',
  stackEdge: 'start',
  render: (row) => <SelectBox claim={row} ctx={ctx} show={canSelect(row)} />,
});

const phonePilot = (ctx: ClaimColumnsContext): DataTableColumn<SrpClaim> => ({
  id: 'pilot',
  header: ctx.t('srp.officer.columns.pilot'),
  primary: true,
  sortValue: (row) => row.characterName,
  render: (row) => (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-semibold">{row.characterName}</span>
      <OffDoctrineFlag claim={row} ctx={ctx} />
    </span>
  ),
});

const phoneAmount = (ctx: ClaimColumnsContext): DataTableColumn<SrpClaim> => ({
  id: 'amount',
  header: ctx.t('srp.officer.columns.amount'),
  cardCorner: true,
  sortValue: (row) => row.amount ?? undefined,
  render: (row) =>
    row.state === 'pending' && row.amount === null ? (
      <TypeAmountField claim={row} ctx={ctx} className="w-36" />
    ) : (
      <span className="tabular-nums">{formatIsk(row.amount ?? 0)}</span>
    ),
});

export function phonePendingColumns(ctx: ClaimColumnsContext): DataTableColumn<SrpClaim>[] {
  return [
    phoneSelect(ctx, canBulkApprove),
    phonePilot(ctx),
    phoneAmount(ctx),
    {
      id: 'meta',
      header: ctx.t('srp.officer.columns.lost'),
      sortValue: (row) => row.killedAt,
      render: (row) => metaLine(ctx, row),
    },
    {
      id: 'actions',
      header: '',
      stackEdge: 'below',
      render: (row) => (
        <span className="block space-y-2">
          <span className="block text-[0.6875rem] text-text-dim">{claimBasisLine(ctx.t, row)}</span>
          <ButtonPair>
            <ApproveReject claim={row} ctx={ctx} />
          </ButtonPair>
        </span>
      ),
    },
  ];
}

export function phoneOwedColumns(ctx: ClaimColumnsContext): DataTableColumn<SrpClaim>[] {
  return [
    phoneSelect(ctx, () => true),
    phonePilot(ctx),
    phoneAmount(ctx),
    {
      id: 'meta',
      header: ctx.t('srp.officer.columns.approved'),
      sortValue: (row) => row.decidedAt,
      render: (row) =>
        [
          ctx.names.hull(row.hullTypeId),
          row.decidedAt !== undefined &&
            ctx.t('srp.officer.approvedAt', { when: when(ctx, row.decidedAt) }),
          row.decidedByName,
        ]
          .filter(Boolean)
          .join(' · '),
    },
    {
      id: 'actions',
      header: '',
      stackEdge: 'below',
      render: (row) => (
        <ButtonPair>
          <CopyAmount claim={row} ctx={ctx} wide />
          <DecideTip reason={ownClaimReason(row, ctx)}>
            <Button
              variant="primary"
              aria-disabled={ctx.busy || ownClaimReason(row, ctx) !== undefined || undefined}
              onClick={() => ctx.onMarkPaid(row)}
            >
              {ctx.t('srp.officer.actions.markPaid')}
            </Button>
          </DecideTip>
        </ButtonPair>
      ),
    },
  ];
}

export function phoneHistoryColumns(ctx: ClaimColumnsContext): DataTableColumn<SrpClaim>[] {
  return [
    {
      id: 'pilot',
      header: ctx.t('srp.officer.columns.pilot'),
      primary: true,
      sortValue: (row) => row.characterName,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-semibold">{row.characterName}</span>
          <ClaimStatePill claim={row} ctx={ctx} />
          <OffDoctrineFlag claim={row} ctx={ctx} />
        </span>
      ),
    },
    phoneAmount(ctx),
    {
      id: 'meta',
      header: ctx.t('srp.officer.columns.decided'),
      sortValue: (row) => decidedLine(row).at,
      render: (row) => {
        const { at, by } = decidedLine(row);
        return [ctx.names.hull(row.hullTypeId), at !== undefined && when(ctx, at), by]
          .filter(Boolean)
          .join(' · ');
      },
    },
    {
      id: 'reason',
      header: ctx.t('srp.officer.columns.reason'),
      stackEdge: 'below',
      render: (row) =>
        row.rejectionReason ? (
          <span className="line-clamp-2 text-[0.6875rem] text-text-dim">{row.rejectionReason}</span>
        ) : null,
    },
  ];
}
