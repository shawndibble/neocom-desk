import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  StatChip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { loadMoonMiningTaxSnapshot, type MoonMiningTaxRow } from '@/features/miningTax/snapshot';
import { resolveRowNames } from '@/features/miningTax/names';
import { loadJitaUnitPrices } from '@/features/miningTax/pricing';
import { resolveNeedsReview } from '@/features/miningTax/assignments';
import { AssignDialog } from '@/features/miningTax/AssignDialog';
import { BulkPayConfirmDialog } from '@/features/miningTax/BulkPayConfirmDialog';
import { PayeeManagerDialog } from '@/features/miningTax/PayeeManagerDialog';

const ALL_STATUSES: readonly MiningTaxRowStatus[] = [
  'unassigned',
  'needs-review',
  'outstanding',
  'paid',
];
// Everything except Paid — Paid is opt-in (decision doc).
const DEFAULT_STATUSES = new Set<MiningTaxRowStatus>(['unassigned', 'needs-review', 'outstanding']);

interface Snapshot {
  entries: MoonMiningTaxRow[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  unclassified: { characterId: number; characterName: string; typeIds: number[] }[];
  needsReauth: boolean;
  fetchedAt: Date | null;
  fromCache: boolean;
  systemNames: Map<number, string>;
  typeNames: Map<number, string>;
  unitPrices: Map<number, number>;
}

async function loadSnapshot(_characterId: number, signal: RouteSnapshotSignal): Promise<Snapshot> {
  const result = await loadMoonMiningTaxSnapshot();
  if (signal.cancelled) {
    return {
      ...result,
      entries: result.rows,
      systemNames: new Map(),
      typeNames: new Map(),
      unitPrices: new Map(),
    };
  }
  const [{ systemNames, typeNames }, unitPrices] = await Promise.all([
    resolveRowNames(result.rows),
    loadJitaUnitPrices(result.rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId))),
  ]);
  return { ...result, entries: result.rows, systemNames, typeNames, unitPrices };
}

/** One flattened table row: an entry's covering Assignment, or its still-unassigned residual. */
interface DisplayRow {
  key: string;
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord | null;
  status: MiningTaxRowStatus;
}

function flatten(rows: readonly MoonMiningTaxRow[]): DisplayRow[] {
  return rows.flatMap((row) => {
    const out: DisplayRow[] = row.assignments.map((assignment) => ({
      key: assignment.id,
      row,
      assignment,
      status: assignment.status,
    }));
    if (row.unassignedOreLines.length > 0) {
      out.push({
        key: `${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}:unassigned`,
        row,
        assignment: null,
        status: 'unassigned',
      });
    }
    return out;
  });
}

function oreSummary(
  lines: readonly { typeId: number; quantity: number }[],
  typeNames: ReadonlyMap<number, string>
): string {
  return lines
    .map(
      (line) =>
        `${typeNames.get(line.typeId) ?? `#${line.typeId}`} ×${line.quantity.toLocaleString()}`
    )
    .join(', ');
}

/** Moon Mining Tax ledger (issue #523): one continuously-filterable list, all tracked characters by default. */
export function MoonMiningTax() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadSnapshot,
    undefined,
    { cacheKey: 'moonMiningTax' }
  );

  const [characterFilter, setCharacterFilter] = useState<ReadonlySet<number> | 'all'>('all');
  const [statusFilter, setStatusFilter] =
    useState<ReadonlySet<MiningTaxRowStatus>>(DEFAULT_STATUSES);
  const [assignTarget, setAssignTarget] = useState<MoonMiningTaxRow | null>(null);
  const [payeeManagerCharacterId, setPayeeManagerCharacterId] = useState<number | null>(null);
  const [bulkPaySelection, setBulkPaySelection] = useState<ReadonlySet<string>>(new Set());
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const characters = useMemo(
    () =>
      [...new Map(data?.entries.map((r) => [r.characterId, r.characterName]) ?? []).entries()].map(
        ([characterId, characterName]) => ({ characterId, characterName })
      ),
    [data]
  );

  const allDisplayRows = useMemo(() => flatten(data?.entries ?? []), [data]);

  const characterFiltered = useMemo(
    () =>
      allDisplayRows.filter(
        (dr) => characterFilter === 'all' || characterFilter.has(dr.row.characterId)
      ),
    [allDisplayRows, characterFilter]
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<MiningTaxRowStatus, number>();
    for (const dr of characterFiltered) counts.set(dr.status, (counts.get(dr.status) ?? 0) + 1);
    return counts;
  }, [characterFiltered]);

  const visibleRows = useMemo(
    () => characterFiltered.filter((dr) => statusFilter.has(dr.status)),
    [characterFiltered, statusFilter]
  );

  function toggleStatus(status: MiningTaxRowStatus) {
    setStatusFilter((previous) => {
      const next = new Set(previous);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function toggleCharacter(characterId: number) {
    setCharacterFilter((previous) => {
      const base =
        previous === 'all' ? new Set(characters.map((c) => c.characterId)) : new Set(previous);
      if (base.has(characterId)) base.delete(characterId);
      else base.add(characterId);
      return base.size === characters.length ? 'all' : base;
    });
  }

  async function handleResolve(assignment: MiningTaxAssignmentRecord, row: MoonMiningTaxRow) {
    setResolvingId(assignment.id);
    try {
      await resolveNeedsReview(assignment, row.entry);
      refresh();
    } finally {
      setResolvingId(null);
    }
  }

  const outstandingSelectable = visibleRows.filter(
    (dr) => dr.status === 'outstanding' && dr.assignment
  );
  const bulkPayRows = outstandingSelectable
    .filter((dr) => bulkPaySelection.has(dr.key))
    .map((dr) => ({
      assignment: dr.assignment as MiningTaxAssignmentRecord,
      characterName: dr.row.characterName,
      payeeName:
        data?.payeesByCharacter
          .get(dr.row.characterId)
          ?.find((p) => p.id === dr.assignment?.payeeId)?.name ?? t('miningTax.unknownPayee'),
    }));

  const columns: DataTableColumn<DisplayRow>[] = [
    {
      id: 'select',
      header: '',
      className: 'w-8',
      render: (dr) =>
        dr.status === 'outstanding' && dr.assignment ? (
          <input
            type="checkbox"
            aria-label={t('miningTax.selectForBulkPay')}
            checked={bulkPaySelection.has(dr.key)}
            onChange={() =>
              setBulkPaySelection((previous) => {
                const next = new Set(previous);
                if (next.has(dr.key)) next.delete(dr.key);
                else next.add(dr.key);
                return next;
              })
            }
          />
        ) : null,
    },
    {
      id: 'character',
      header: t('miningTax.characterColumn'),
      render: (dr) => dr.row.characterName,
    },
    {
      id: 'date',
      header: t('miningTax.dateColumn'),
      render: (dr) => dr.row.entry.date,
      sortValue: (dr) => dr.row.entry.date,
      primary: true,
    },
    {
      id: 'system',
      header: t('miningTax.systemColumn'),
      render: (dr) =>
        data?.systemNames.get(dr.row.entry.solarSystemId) ?? `#${dr.row.entry.solarSystemId}`,
    },
    {
      id: 'ore',
      header: t('miningTax.oreColumn'),
      render: (dr) =>
        oreSummary(
          dr.assignment ? dr.assignment.oreLines : dr.row.unassignedOreLines,
          data?.typeNames ?? new Map()
        ),
    },
    {
      id: 'payee',
      header: t('miningTax.payeeColumn'),
      render: (dr) => {
        if (!dr.assignment) return '—';
        const payee = data?.payeesByCharacter
          .get(dr.row.characterId)
          ?.find((p) => p.id === dr.assignment?.payeeId);
        return payee?.name ?? t('miningTax.unknownPayee');
      },
    },
    {
      id: 'value',
      header: t('miningTax.estimatedValueColumn'),
      align: 'right',
      render: (dr) => {
        const value = dr.assignment
          ? dr.assignment.estimatedValue
          : computeAssignmentValue(dr.row.unassignedOreLines, data?.unitPrices ?? new Map(), 0)
              .estimatedValue;
        return `${formatIsk(value, 2)} ISK`;
      },
    },
    {
      id: 'taxOwed',
      header: t('miningTax.taxOwedColumn'),
      align: 'right',
      render: (dr) => (dr.assignment ? `${formatIsk(dr.assignment.taxOwed, 2)} ISK` : '—'),
    },
    {
      id: 'status',
      header: t('miningTax.statusColumn'),
      render: (dr) => t(`miningTax.status.${dr.status.replace('-', '')}`),
    },
    {
      id: 'actions',
      header: '',
      render: (dr) => {
        if (dr.status === 'unassigned') {
          return (
            <Button size="sm" onClick={() => setAssignTarget(dr.row)}>
              {t('miningTax.assignAction')}
            </Button>
          );
        }
        if (dr.status === 'needs-review' && dr.assignment) {
          return (
            <Button
              size="sm"
              disabled={resolvingId === dr.assignment.id}
              onClick={() => void handleResolve(dr.assignment as MiningTaxAssignmentRecord, dr.row)}
            >
              {t('miningTax.resolveAction')}
            </Button>
          );
        }
        return null;
      },
    },
  ];

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const needsReauth = data?.needsReauth ?? false;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('miningTax.title')}
        meta={data?.fetchedAt && <DataAgeBadge date={data.fetchedAt} />}
        actions={
          <>
            {characters.length > 0 && (
              <Button
                size="sm"
                onClick={() => setPayeeManagerCharacterId(characters[0].characterId)}
              >
                {t('miningTax.managePayeesAction')}
              </Button>
            )}
            <IconButton
              icon={<Icon.Refresh />}
              label={t('miningTax.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : needsReauth && (data?.entries.length ?? 0) === 0 ? (
        <ReauthBanner
          title={t('miningTax.reauthTitle')}
          hint={t('miningTax.reauthHint')}
          actionLabel={t('miningTax.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : (
        <>
          {data && data.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}

          {data && data.unclassified.length > 0 && (
            <div
              role="alert"
              className="rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
            >
              <p className="font-semibold text-warning uppercase">
                {t('miningTax.unclassifiedTitle')}
              </p>
              <p className="text-text-dim">{t('miningTax.unclassifiedHint')}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  {characterFilter === 'all'
                    ? t('miningTax.allCharacters')
                    : t('miningTax.charactersSelected', { count: characterFilter.size })}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {characters.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.characterId}
                    checked={characterFilter === 'all' || characterFilter.has(c.characterId)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleCharacter(c.characterId)}
                  >
                    {c.characterName}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  {t('miningTax.statusFilterLabel', { count: statusFilter.size })}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {ALL_STATUSES.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter.has(status)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleStatus(status)}
                  >
                    {t(`miningTax.status.${status.replace('-', '')}`)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {ALL_STATUSES.map((status) => (
              <button key={status} type="button" onClick={() => toggleStatus(status)}>
                <StatChip
                  label={t(`miningTax.status.${status.replace('-', '')}`)}
                  value={statusCounts.get(status) ?? 0}
                  tone={
                    status === 'needs-review'
                      ? 'warning'
                      : status === 'paid'
                        ? 'success'
                        : status === 'outstanding'
                          ? 'accent'
                          : 'default'
                  }
                />
              </button>
            ))}

            {bulkPaySelection.size > 0 && (
              <Button size="sm" variant="primary" onClick={() => setBulkPayOpen(true)}>
                {t('miningTax.bulkPayAction', { count: bulkPaySelection.size })}
              </Button>
            )}
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState title={t('miningTax.emptyTitle')} hint={t('miningTax.emptyHint')} />
          ) : (
            <Panel padded={false}>
              <div className="overflow-x-auto">
                <DataTable
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(dr) => dr.key}
                  label={t('miningTax.title')}
                  defaultSort={{ columnId: 'date', direction: 'desc' }}
                />
              </div>
            </Panel>
          )}
        </>
      )}

      {assignTarget && data && (
        <AssignDialog
          open={assignTarget !== null}
          onClose={() => setAssignTarget(null)}
          row={assignTarget}
          payees={data.payeesByCharacter.get(assignTarget.characterId) ?? []}
          systemName={
            data.systemNames.get(assignTarget.entry.solarSystemId) ??
            `#${assignTarget.entry.solarSystemId}`
          }
          typeNames={data.typeNames}
          onAssigned={refresh}
        />
      )}

      {payeeManagerCharacterId !== null && (
        <PayeeManagerDialog
          open={payeeManagerCharacterId !== null}
          onClose={() => setPayeeManagerCharacterId(null)}
          characters={characters}
          initialCharacterId={payeeManagerCharacterId}
          onChanged={refresh}
        />
      )}

      <BulkPayConfirmDialog
        open={bulkPayOpen}
        onClose={() => setBulkPayOpen(false)}
        rows={bulkPayRows}
        onPaid={() => {
          setBulkPaySelection(new Set());
          refresh();
        }}
      />
    </div>
  );
}
