import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import {
  Button,
  DataTable,
  Panel,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import {
  canPayMoonOwner,
  type MoonOwnerRow,
  type MoonOwnerStatus,
  type MoonOwnerTotals,
} from '@/engine/corpTaxBook/moonOwners';
import { formatAge } from '@/lib/age';
import { caretColumn } from './caretColumn';
import { isk, shortDate } from './moonsFormat';

const STATUS_TONE: Record<MoonOwnerStatus, PillTone> = {
  active: 'success',
  'cant-read': 'warning',
  'removal-pending': 'danger',
  'settled-otherwise': 'neutral',
  'no-rate': 'neutral',
  disconnected: 'danger',
  left: 'neutral',
  removed: 'neutral',
};

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

/** A moon owner's status as a word on a tint (readable without the colour). */
export function MoonOwnerStatusPill({ status }: { status: MoonOwnerStatus }) {
  const { t } = useTranslation();
  return <Pill tone={STATUS_TONE[status]}>{t(k(`status.${status}`))}</Pill>;
}

const pct = (value: number | undefined) => (value === undefined ? undefined : `${value}%`);

/**
 * The Moon owners tab (List A): header chips and one sortable table, a row per
 * corporation. A row click opens its page. Phone: labelled cards.
 */
export function MoonOwnersTable({
  rows,
  totals,
  name,
  now,
  onOpen,
  onPay,
}: {
  rows: readonly MoonOwnerRow[];
  totals: MoonOwnerTotals;
  name: (corporationId: number) => string;
  /** Epoch ms the ages are read at. */
  now: number;
  onOpen: (row: MoonOwnerRow) => void;
  /** Pay on a row that is owed. Absent for a viewer who may not record payments. */
  onPay?: (row: MoonOwnerRow) => void;
}) {
  const { t } = useTranslation();
  const columns: DataTableColumn<MoonOwnerRow>[] = [
    {
      id: 'owner',
      header: t(k('cols.owner')),
      primary: true,
      render: (r) => (
        <span className="block min-w-0">
          <span className="inline-flex max-w-full items-center gap-2">
            <span className="truncate text-accent">{name(r.corporationId)}</span>
            {r.sameOwner && <Pill tone="accent">{t(k('yours'))}</Pill>}
          </span>
          <span className="block text-xs text-text-dim">
            {t(k('refineries'), { count: r.refineryCount })}
            {' · '}
            {r.sameOwner
              ? t(k('yoursNote'))
              : r.status === 'cant-read' && r.staleSince !== undefined
                ? t(k('cantReadSince'), { date: shortDate(new Date(r.staleSince).toISOString()) })
                : r.lastReadWellAt !== undefined
                  ? t(k('synced'), { age: formatAge(now - Date.parse(r.lastReadWellAt), t) })
                  : ''}
          </span>
        </span>
      ),
      sortValue: (r) => name(r.corporationId),
    },
    {
      id: 'status',
      header: t(k('cols.status')),
      render: (r) => <MoonOwnerStatusPill status={r.status} />,
      sortValue: (r) => t(k(`status.${r.status}`)),
    },
    {
      id: 'mined',
      header: t(k('cols.mined')),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (
        <span className="block">
          {isk(r.mined)}
          {(r.until ?? r.since) && (
            <span className="block text-xs text-text-dim">
              {r.until
                ? t(k('until'), { date: shortDate(r.until) })
                : t(k('since'), { date: shortDate(r.since!) })}
            </span>
          )}
        </span>
      ),
      sortValue: (r) => r.mined,
    },
    {
      id: 'theirRate',
      header: t(k('cols.theirRate')),
      align: 'right',
      className: 'tabular-nums',
      render: (r) =>
        r.mode === 'settled-otherwise'
          ? '—'
          : (pct(r.theirRatePct) ?? <span className="text-text-dim">{t(k('notSet'))}</span>),
      sortValue: (r) => r.theirRatePct ?? -1,
    },
    {
      id: 'minerRate',
      header: t(k('cols.minerRate')),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => pct(r.minerRatePct) ?? '—',
      sortValue: (r) => r.minerRatePct ?? -1,
    },
    {
      id: 'owed',
      header: t(k('cols.owed')),
      align: 'right',
      className: 'tabular-nums',
      render: (r) =>
        r.mode === 'settled-otherwise' ? (
          '—'
        ) : r.theirRatePct === undefined ? (
          <span className="text-text-dim">{t(k('nothingDue'))}</span>
        ) : (
          isk(r.owed)
        ),
      sortValue: (r) => r.owed,
    },
    ...(onPay
      ? [
          {
            id: 'pay',
            header: '',
            align: 'right' as const,
            stackEdge: 'end' as const,
            cellClassName: () => 'dt-action-row',
            render: (r: MoonOwnerRow) =>
              canPayMoonOwner(r) ? (
                <Button
                  size="sm"
                  aria-label={t(k('payNamed'), { name: name(r.corporationId) })}
                  onClick={() => onPay(r)}
                >
                  {t(k('payAction'))}
                </Button>
              ) : null,
          },
        ]
      : []),
    caretColumn<MoonOwnerRow>(),
  ];
  return (
    <div className="space-y-4">
      <StatChips>
        <StatChip label={t(k('chips.owed'))} value={isk(totals.owed)} emphasis />
        <StatChip label={t(k('chips.paid'))} value={isk(totals.paidThisMonth)} />
        <StatChip label={t(k('chips.count'))} value={String(totals.count)} />
        <StatChip
          label={t(k('chips.needLook'))}
          value={String(totals.needALook)}
          {...(totals.needALook > 0 ? { tone: 'warning' as const } : {})}
        />
      </StatChips>
      <Panel padded={false}>
        <DataTable
          label={t(k('label'))}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={onOpen}
          rowClassName={() => 'group'}
          defaultSort={{ columnId: 'owed', direction: 'desc' }}
          mobileSort
          stackColumns={2}
          stackSummary={t(k('summary'), { shown: rows.length })}
        />
      </Panel>
    </div>
  );
}
