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
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import {
  loadMoonMiningTaxSnapshot,
  type MoonMiningTaxRow,
  type TrackedCharacter,
} from '@/features/miningTax/snapshot';
import { resolveRowNames } from '@/features/miningTax/names';
import { loadJitaUnitPrices } from '@/features/miningTax/pricing';
import { loadTypeNames } from '@/features/character/typeNames';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import {
  deleteAssignment,
  dismissEntry,
  markAssignmentsPaid,
  resolveNeedsReview,
} from '@/features/miningTax/assignments';
import { tagAsIgnored, tagAsMoonOre } from '@/features/miningTax/typeOverrides';
import { STATUS_TEXT_CLASS } from '@/features/miningTax/statusTone';
import { BulkPayConfirmDialog } from '@/features/miningTax/BulkPayConfirmDialog';
import { PayeeManagerDialog } from '@/features/miningTax/PayeeManagerDialog';
import { RowDetailModal } from '@/features/miningTax/RowDetailModal';

const ALL_STATUSES: readonly MiningTaxRowStatus[] = [
  'unassigned',
  'needs-review',
  'outstanding',
  'paid',
  'dismissed',
];
// Everything except Paid and Dismissed — both are "handled", opt-in to view (decision doc's Paid precedent).
const DEFAULT_STATUSES = new Set<MiningTaxRowStatus>(['unassigned', 'needs-review', 'outstanding']);

interface Snapshot {
  entries: MoonMiningTaxRow[];
  characters: TrackedCharacter[];
  payeesByCharacter: Map<number, PayeeRecord[]>;
  unclassified: { characterId: number; characterName: string; typeIds: number[] }[];
  reauthCharacters: TrackedCharacter[];
  fetchedAt: Date | null;
  fromCache: boolean;
  systemNames: Map<number, string>;
  systemSecurity: Map<number, number>;
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
      systemSecurity: new Map(),
      typeNames: new Map(),
      unitPrices: new Map(),
    };
  }
  const unclassifiedTypeIds = result.unclassified.flatMap((u) => u.typeIds);
  const [
    { systemNames, systemSecurity, typeNames: rowTypeNames },
    unitPrices,
    unclassifiedTypeNames,
  ] = await Promise.all([
    resolveRowNames(result.rows),
    loadJitaUnitPrices(result.rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId))),
    loadTypeNames(unclassifiedTypeIds),
  ]);
  const typeNames = new Map([...rowTypeNames, ...unclassifiedTypeNames]);
  return { ...result, entries: result.rows, systemNames, systemSecurity, typeNames, unitPrices };
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

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
function statusLabel(t: (key: string) => string, status: MiningTaxRowStatus): string {
  return t(`miningTax.status.${STATUS_LABEL_KEY[status]}`);
}

/** Moon Mining ledger (issue #523): one continuously-filterable list, all tracked characters by default. */
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
  const [payeeManagerCharacterId, setPayeeManagerCharacterId] = useState<number | null>(null);
  const [bulkPaySelection, setBulkPaySelection] = useState<ReadonlySet<string>>(new Set());
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DisplayRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Every tracked character, not just those with a Mining Ledger Entry this
  // refresh (CONTEXT.md: the point of the feature is not missing an alt's
  // obligation) — a character with nothing mined yet still needs to appear
  // in the Characters filter and in Manage Payees.
  const characters = data?.characters ?? [];

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

  // Across every status, deliberately unfiltered by the status chips below:
  // "how much have I mined and what do I owe" shouldn't change just because
  // Paid rows are currently hidden from the table.
  const totals = useMemo(() => {
    let estimatedMined = 0;
    let taxOwed = 0;
    let unpaidCount = 0;
    for (const dr of characterFiltered) {
      estimatedMined += estimatedValueOf(dr);
      if (dr.assignment) taxOwed += dr.assignment.taxOwed;
      if (dr.status === 'outstanding') unpaidCount += 1;
    }
    return { estimatedMined, taxOwed, unpaidCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterFiltered, data]);

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

  async function handleTagAsMoonOre(typeId: number) {
    await tagAsMoonOre(typeId);
    refresh();
  }

  async function handleTagAsIgnored(typeId: number) {
    await tagAsIgnored(typeId);
    refresh();
  }

  /** "I don't pay tax on this entry" — dismisses the whole unassigned residual in one action, no Payee needed. */
  async function handleDismiss(row: MoonMiningTaxRow) {
    const { estimatedValue } = computeAssignmentValue(
      row.unassignedOreLines,
      data?.unitPrices ?? new Map(),
      0
    );
    await dismissEntry({
      characterId: row.characterId,
      date: row.entry.date,
      solarSystemId: row.entry.solarSystemId,
      oreLines: row.unassignedOreLines,
      estimatedValue,
    });
    refresh();
  }

  function payeeName(characterId: number, payeeId: string | undefined): string {
    return (
      data?.payeesByCharacter.get(characterId)?.find((p) => p.id === payeeId)?.name ??
      t('miningTax.unknownPayee')
    );
  }

  /** The detail modal's Payee display: a resolved name, "No tax owed" for a dismissal, or a dash when unassigned. */
  function payeeDisplayName(dr: DisplayRow): string {
    if (!dr.assignment) return '—';
    if (dr.assignment.status === 'dismissed') return t('miningTax.dismissedLabel');
    return payeeName(dr.row.characterId, dr.assignment.payeeId);
  }

  function systemName(dr: DisplayRow): string {
    return data?.systemNames.get(dr.row.entry.solarSystemId) ?? `#${dr.row.entry.solarSystemId}`;
  }

  function systemSecurityOf(dr: DisplayRow): number | undefined {
    return data?.systemSecurity.get(dr.row.entry.solarSystemId);
  }

  /** Both the table's Value column and the sole Assignment-less rows: an unassigned entry has no `estimatedValue` of its own, so it's priced live from its still-unclaimed ore lines instead. */
  function estimatedValueOf(dr: DisplayRow): number {
    return dr.assignment
      ? dr.assignment.estimatedValue
      : computeAssignmentValue(dr.row.unassignedOreLines, data?.unitPrices ?? new Map(), 0)
          .estimatedValue;
  }

  /** The Assign form's create-or-edit submit, from inside RowDetailModal — same refresh-and-close every other row action takes. */
  function handleAssignedFromDetail() {
    setDetailTarget(null);
    refresh();
  }

  async function handleDismissFromDetail() {
    if (!detailTarget) return;
    setBusy(true);
    try {
      await handleDismiss(detailTarget.row);
      setDetailTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkPaidFromDetail() {
    if (!detailTarget?.assignment) return;
    setBusy(true);
    try {
      await markAssignmentsPaid([detailTarget.assignment]);
      setDetailTarget(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveFromDetail() {
    if (!detailTarget?.assignment) return;
    setBusy(true);
    try {
      await resolveNeedsReview(
        detailTarget.assignment,
        detailTarget.row.entry,
        detailTarget.row.assignments.length
      );
      setDetailTarget(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleUndoFromDetail() {
    if (!detailTarget?.assignment) return;
    setBusy(true);
    try {
      await deleteAssignment(detailTarget.assignment);
      setDetailTarget(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const bulkPayRows = useMemo(
    () =>
      visibleRows
        .filter(
          (dr) => dr.status === 'outstanding' && dr.assignment && bulkPaySelection.has(dr.key)
        )
        .map((dr) => ({
          assignment: dr.assignment as MiningTaxAssignmentRecord,
          characterName: dr.row.characterName,
          payeeName: payeeName(dr.row.characterId, dr.assignment?.payeeId),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRows, bulkPaySelection, data]
  );

  // The Character column only earns its place when more than one character
  // is actually in view — with a single tracked character (or a filter
  // narrowed to one) it says the same thing on every row.
  const showCharacterColumn = characters.length > 1;
  // Same reasoning for the bulk-pay select column: with no Outstanding row on
  // screen there's nothing to select, and an always-blank leading column just
  // reads as unexplained whitespace before Date.
  const showSelectColumn = visibleRows.some((dr) => dr.status === 'outstanding' && dr.assignment);

  const columns: DataTableColumn<DisplayRow>[] = [
    ...(showSelectColumn
      ? [
          {
            id: 'select',
            header: '',
            className: 'w-8 px-2',
            render: (dr: DisplayRow) =>
              dr.status === 'outstanding' && dr.assignment ? (
                <input
                  type="checkbox"
                  aria-label={t('miningTax.selectForBulkPay')}
                  checked={bulkPaySelection.has(dr.key)}
                  onClick={(e) => e.stopPropagation()}
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
          } satisfies DataTableColumn<DisplayRow>,
        ]
      : []),
    ...(showCharacterColumn
      ? [
          {
            id: 'character',
            header: t('miningTax.characterColumn'),
            render: (dr: DisplayRow) => dr.row.characterName,
            sortValue: (dr: DisplayRow) => dr.row.characterName,
          } satisfies DataTableColumn<DisplayRow>,
        ]
      : []),
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
      render: (dr) => (
        <span className="flex items-center gap-1.5">
          {systemName(dr)}
          <SecurityValue security={systemSecurityOf(dr)} t={t} />
        </span>
      ),
      sortValue: (dr) => systemName(dr),
    },
    {
      id: 'payee',
      header: t('miningTax.payeeColumn'),
      className: 'whitespace-nowrap',
      render: (dr) => payeeDisplayName(dr),
      sortValue: (dr) => payeeDisplayName(dr),
    },
    {
      id: 'value',
      header: t('miningTax.estimatedValueColumn'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (dr) => `${formatIsk(estimatedValueOf(dr), 2)} ISK`,
      sortValue: (dr) => estimatedValueOf(dr),
    },
    {
      id: 'taxOwed',
      header: t('miningTax.taxOwedColumn'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (dr) => (dr.assignment ? `${formatIsk(dr.assignment.taxOwed, 2)} ISK` : '—'),
      sortValue: (dr) => dr.assignment?.taxOwed,
    },
    {
      id: 'status',
      header: t('miningTax.statusColumn'),
      className: 'font-medium',
      cellClassName: (dr) => STATUS_TEXT_CLASS[dr.status],
      render: (dr) => statusLabel(t, dr.status),
      sortValue: (dr) => statusLabel(t, dr.status),
    },
    {
      id: 'edit',
      header: '',
      className: 'w-6 px-2',
      cardCorner: true,
      // Decorative only — the whole row is the click target (onRowClick
      // below); this just signals that clicking opens something editable,
      // now that the table carries no per-row action buttons of its own.
      render: () => (
        <Icon.Rename aria-hidden="true" size={Icon.ICON_SIZE.sm} className="text-text-faint" />
      ),
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

  const payeeManagerDefaultCharacterId =
    characters.find((c) => c.characterId === activeCharacterId)?.characterId ??
    characters[0]?.characterId ??
    null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('miningTax.title')}
        meta={data?.fetchedAt && <DataAgeBadge date={data.fetchedAt} />}
        actions={
          <>
            {payeeManagerDefaultCharacterId !== null && (
              <Button onClick={() => setPayeeManagerCharacterId(payeeManagerDefaultCharacterId)}>
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
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : (
        <>
          {data && data.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}

          {/* Per-character re-login, never one flag hiding every other
              character's data behind a full-page banner — a lapsed alt must
              stay visible as needing attention, not disappear. */}
          {data && data.reauthCharacters.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
            >
              <p className="font-semibold text-warning uppercase">{t('miningTax.reauthTitle')}</p>
              <ul className="space-y-1">
                {data.reauthCharacters.map((c) => (
                  <li key={c.characterId} className="flex items-center justify-between gap-2">
                    <span>
                      {t('miningTax.reauthCharacterHint', { character: c.characterName })}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void beginEveLogin({ characterId: c.characterId })}
                    >
                      {t('miningTax.reauthAction')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data && data.unclassified.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
            >
              <p className="font-semibold text-warning uppercase">
                {t('miningTax.unclassifiedTitle')}
              </p>
              <p className="text-text-dim">{t('miningTax.unclassifiedHint')}</p>
              <ul className="space-y-1">
                {data.unclassified.flatMap((u) =>
                  u.typeIds.map((typeId) => (
                    <li
                      key={`${u.characterId}:${typeId}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {u.characterName} — {data.typeNames.get(typeId) ?? `#${typeId}`}
                      </span>
                      <div className="flex shrink-0 gap-1.5">
                        <Button size="sm" onClick={() => void handleTagAsMoonOre(typeId)}>
                          {t('miningTax.tagAsMoonOre')}
                        </Button>
                        <Button size="sm" onClick={() => void handleTagAsIgnored(typeId)}>
                          {t('miningTax.ignoreOreAction')}
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Panel>
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.totalMinedLabel')}
              </p>
              <p className="text-lg font-medium tabular-nums">
                {formatIsk(totals.estimatedMined, 2)} ISK
              </p>
            </Panel>
            <Panel>
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.totalTaxOwedLabel')}
              </p>
              <p className="text-lg font-medium tabular-nums">{formatIsk(totals.taxOwed, 2)} ISK</p>
            </Panel>
            <Panel>
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.unpaidCountLabel')}
              </p>
              <p
                className={cx(
                  'text-lg font-medium tabular-nums',
                  totals.unpaidCount > 0 && 'text-danger'
                )}
              >
                {totals.unpaidCount}
              </p>
            </Panel>
          </div>
          <p className="-mt-2 text-[0.6875rem] text-text-dim">{t('miningTax.totalsHint')}</p>

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
                    {statusLabel(t, status)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {ALL_STATUSES.map((status) => (
              <FilterChip
                key={status}
                label={statusLabel(t, status)}
                count={statusCounts.get(status) ?? 0}
                selected={statusFilter.has(status)}
                onToggle={() => toggleStatus(status)}
              />
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
                  onRowClick={(dr) => setDetailTarget(dr)}
                />
              </div>
            </Panel>
          )}
        </>
      )}

      {payeeManagerCharacterId !== null && (
        <PayeeManagerDialog
          open={payeeManagerCharacterId !== null}
          onClose={() => setPayeeManagerCharacterId(null)}
          characters={characters}
          payeesByCharacter={data?.payeesByCharacter ?? new Map()}
          initialCharacterId={payeeManagerCharacterId}
          onChanged={refresh}
        />
      )}

      {detailTarget && data && (
        <RowDetailModal
          open={detailTarget !== null}
          onClose={() => setDetailTarget(null)}
          row={detailTarget.row}
          assignment={detailTarget.assignment}
          status={detailTarget.status}
          systemName={
            data.systemNames.get(detailTarget.row.entry.solarSystemId) ??
            `#${detailTarget.row.entry.solarSystemId}`
          }
          systemSecurity={data.systemSecurity.get(detailTarget.row.entry.solarSystemId)}
          typeNames={data.typeNames}
          payeeDisplayName={payeeDisplayName(detailTarget)}
          payees={data.payeesByCharacter.get(detailTarget.row.characterId) ?? []}
          unitPrices={data.unitPrices}
          busy={busy}
          onAssigned={handleAssignedFromDetail}
          onDismiss={() => void handleDismissFromDetail()}
          onMarkPaid={() => void handleMarkPaidFromDetail()}
          onResolve={() => void handleResolveFromDetail()}
          onUndo={() => void handleUndoFromDetail()}
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
