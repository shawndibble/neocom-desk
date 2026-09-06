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
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import type { PayeeRecord } from '@/db';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import {
  loadMoonMiningTaxSnapshot,
  type MoonMiningTaxRow,
  type TrackedCharacter,
} from '@/features/miningTax/snapshot';
import {
  allMembers,
  flatten,
  type DisplayRow,
  type GroupMember,
} from '@/features/miningTax/groupRows';
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
import { computePayeeBalances, summarizeUnassigned } from '@/features/miningTax/balances';
import { GroupSummaryModal } from '@/features/miningTax/GroupSummaryModal';
import { SettleUpDialog, type SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import { JoinAssignDialog } from '@/features/miningTax/JoinAssignDialog';
import { PayeeManagerDialog } from '@/features/miningTax/PayeeManagerDialog';
import { RowDetailModal } from '@/features/miningTax/RowDetailModal';
import { SplitDialog } from '@/features/miningTax/SplitDialog';

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
  const [payeeFilter, setPayeeFilter] = useState<ReadonlySet<string> | 'all'>('all');
  const [statusFilter, setStatusFilter] =
    useState<ReadonlySet<MiningTaxRowStatus>>(DEFAULT_STATUSES);
  const [payeeManagerCharacterId, setPayeeManagerCharacterId] = useState<number | null>(null);
  const [bulkPaySelection, setBulkPaySelection] = useState<ReadonlySet<string>>(new Set());
  // What the Settle-up dialog is settling: a balance card's whole balance, or
  // the table's checkbox selection. `null` keeps it closed.
  const [settleUpRows, setSettleUpRows] = useState<SettleUpRow[] | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DisplayRow | null>(null);
  const [joinTarget, setJoinTarget] = useState<DisplayRow | null>(null);
  const [splitTarget, setSplitTarget] = useState<DisplayRow | null>(null);
  // Set only by the table's "Join selected" shortcut below — pins
  // `JoinAssignDialog`'s candidate list to exactly the one row picked via
  // checkbox, instead of the full same-system candidate list `RowDetailModal`'s
  // "Join with another entry" button offers.
  const [joinCandidateOverride, setJoinCandidateOverride] = useState<DisplayRow | null>(null);
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

  // Every Payee across every tracked character, so the filter dropdown lists
  // them all regardless of the Character filter above — "who do I owe" is a
  // question about Payees, not about which alt mined it.
  const allPayees = useMemo(() => {
    const seen = new Map<string, PayeeRecord>();
    for (const payees of data?.payeesByCharacter.values() ?? []) {
      for (const payee of payees) seen.set(payee.id, payee);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Filtering "by Payee" only makes sense for rows that already have one —
  // an unassigned or dismissed row has no Payee to match, so it drops out as
  // soon as a specific Payee is selected.
  const payeeFiltered = useMemo(
    () =>
      payeeFilter === 'all'
        ? characterFiltered
        : characterFiltered.filter(
            (dr) => dr.assignment?.payeeId !== undefined && payeeFilter.has(dr.assignment.payeeId)
          ),
    [characterFiltered, payeeFilter]
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<MiningTaxRowStatus, number>();
    for (const dr of payeeFiltered) counts.set(dr.status, (counts.get(dr.status) ?? 0) + 1);
    return counts;
  }, [payeeFiltered]);

  // The Balances strip: per Payee, what is owed *now*. Follows the Character
  // filter (an alt's debts are still debts) but deliberately not the Payee or
  // Status filters — hiding Paid rows from the table must not change a balance.
  const balances = useMemo(
    () => computePayeeBalances(characterFiltered, allPayees),
    [characterFiltered, allPayees]
  );
  const owedBalances = balances.filter((b) => b.owed > 0);
  const visibleBalances = showSettled ? balances : owedBalances;
  const settledCount = balances.length - owedBalances.length;
  const owedTotal = owedBalances.reduce((sum, b) => sum + b.owed, 0);
  const owedPayeeCount = owedBalances.length;
  const unassigned = useMemo(
    () => summarizeUnassigned(characterFiltered, estimatedValueOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterFiltered, data]
  );

  const visibleRows = useMemo(
    () => payeeFiltered.filter((dr) => statusFilter.has(dr.status)),
    [payeeFiltered, statusFilter]
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

  function togglePayee(payeeId: string) {
    setPayeeFilter((previous) => {
      const base = previous === 'all' ? new Set(allPayees.map((p) => p.id)) : new Set(previous);
      if (base.has(payeeId)) base.delete(payeeId);
      else base.add(payeeId);
      // Every Payee, or none: both mean "don't filter". With a single Payee
      // the only possible toggle used to leave an empty set, which showed an
      // empty table and "Owed to 0 payees".
      return base.size === allPayees.length || base.size === 0 ? 'all' : base;
    });
  }

  /** A balance card's name doubles as "show me just this Payee's entries" — the filter the card's own figure came from. */
  function filterToPayee(payeeId: string) {
    setPayeeFilter((previous) =>
      previous !== 'all' && previous.size === 1 && previous.has(payeeId)
        ? 'all'
        : new Set([payeeId])
    );
  }

  /** "Pay them in one lump sum": every Outstanding Assignment behind one balance card, straight into Settle up. */
  function settleUpBalance(members: readonly GroupMember[]) {
    setSettleUpRows(
      members.map((m) => ({
        assignment: m.assignment,
        characterName: m.row.characterName,
        payeeName: payeeName(m.row.characterId, m.assignment.payeeId),
      }))
    );
  }

  /** The "Assign next" shortcut: the newest still-unassigned entry, opened straight into its Assign form. */
  function assignNext() {
    const next = [...characterFiltered]
      .filter((dr) => dr.status === 'unassigned')
      .sort((a, b) => b.row.entry.date.localeCompare(a.row.entry.date))[0];
    if (next) setDetailTarget(next);
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

  /** Both the table's Value column and the sole Assignment-less rows: an unassigned entry has no `estimatedValue` of its own, so it's priced live from its still-unclaimed ore lines instead. A joined row sums every member's own value — never a blended re-price across dates. */
  function estimatedValueOf(dr: DisplayRow): number {
    return dr.assignment
      ? allMembers(dr).reduce((sum, m) => sum + m.assignment.estimatedValue, 0)
      : computeAssignmentValue(dr.row.unassignedOreLines, data?.unitPrices ?? new Map(), 0)
          .estimatedValue;
  }

  function taxOwedOf(dr: DisplayRow): number {
    return allMembers(dr).reduce((sum, m) => sum + m.assignment.taxOwed, 0);
  }

  /** Every date this row covers, earliest first — one entry for an ordinary row, 2+ for a joined one. */
  function dateRangeOf(dr: DisplayRow): string[] {
    const members = allMembers(dr);
    return (members.length > 0 ? members.map((m) => m.row.entry.date) : [dr.row.entry.date]).sort();
  }

  function dateLabel(dr: DisplayRow): string {
    const dates = dateRangeOf(dr);
    return dates.length > 1 ? `${dates[0]} – ${dates[dates.length - 1]}` : dates[0];
  }

  /**
   * Other rows `joinTarget` may fold in (issue #523's "join entries"):
   * same character, same solar system, not already part of a group (v1 is
   * two-member joins only), and either Unassigned or Outstanding. When
   * `joinTarget` already has an Assignment, a candidate Assignment must
   * share its Payee and tax % (the decision doc's merge rule) — a candidate
   * still unassigned always qualifies, since it simply adopts whichever
   * side is already assigned.
   */
  function joinCandidatesFor(primary: DisplayRow) {
    return allDisplayRows
      .filter((dr) => dr.key !== primary.key)
      .filter((dr) => !dr.groupMembers)
      .filter((dr) => dr.status === 'unassigned' || dr.status === 'outstanding')
      .filter((dr) => dr.row.characterId === primary.row.characterId)
      .filter((dr) => dr.row.entry.solarSystemId === primary.row.entry.solarSystemId)
      .filter((dr) => {
        if (!primary.assignment || !dr.assignment) return true;
        return (
          dr.assignment.payeeId === primary.assignment.payeeId &&
          dr.assignment.taxPct === primary.assignment.taxPct
        );
      })
      .map((dr) => ({ row: dr.row, assignment: dr.assignment }));
  }

  function handleJoined() {
    setJoinTarget(null);
    setJoinCandidateOverride(null);
    setBulkPaySelection(new Set());
    refresh();
  }

  async function handleMarkGroupPaidFromDetail() {
    if (!detailTarget) return;
    const outstanding = allMembers(detailTarget)
      .filter((m) => m.assignment.status === 'outstanding')
      .map((m) => m.assignment);
    if (outstanding.length === 0) return;
    setBusy(true);
    try {
      await markAssignmentsPaid(outstanding);
      setDetailTarget(null);
      refresh();
    } finally {
      setBusy(false);
    }
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
        detailTarget.row.assignments
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

  const bulkPayRows: SettleUpRow[] = useMemo(
    () =>
      allDisplayRows
        .filter((dr) => bulkPaySelection.has(dr.key))
        // A selected joined row expands to every *actually*-outstanding
        // member — a mixed-status group's already-paid member must not be
        // billed a second time just because the group itself reads as
        // Outstanding (worst-status-wins).
        .flatMap((dr) =>
          allMembers(dr)
            .filter((m) => m.assignment.status === 'outstanding')
            .map((m) => ({
              assignment: m.assignment,
              characterName: m.row.characterName,
              payeeName: payeeName(m.row.characterId, m.assignment.payeeId),
            }))
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allDisplayRows, bulkPaySelection, data]
  );

  // The same checkbox column doubles as "pick two rows to join" — only the
  // Unassigned/Outstanding, not-already-grouped rows among the selection
  // count (an ordinary bulk-pay selection of 2+ Outstanding rows just isn't
  // a join candidate list), and exactly two of them, same character and
  // system, and (when both already have an Assignment) the same Payee and
  // tax % — the decision doc's merge rule.
  const joinEligibleSelected = useMemo(
    () =>
      allDisplayRows.filter(
        (dr) =>
          bulkPaySelection.has(dr.key) &&
          !dr.groupMembers &&
          (dr.status === 'unassigned' || dr.status === 'outstanding')
      ),
    [allDisplayRows, bulkPaySelection]
  );
  const joinPair = useMemo(() => {
    if (joinEligibleSelected.length !== 2) return null;
    const [a, b] = joinEligibleSelected;
    if (a.row.characterId !== b.row.characterId) return null;
    if (a.row.entry.solarSystemId !== b.row.entry.solarSystemId) return null;
    if (
      a.assignment &&
      b.assignment &&
      (a.assignment.payeeId !== b.assignment.payeeId || a.assignment.taxPct !== b.assignment.taxPct)
    ) {
      return null;
    }
    return [a, b] as const;
  }, [joinEligibleSelected]);

  function handleJoinSelected() {
    if (!joinPair) return;
    setJoinTarget(joinPair[0]);
    setJoinCandidateOverride(joinPair[1]);
  }

  // The Character column only earns its place when more than one character
  // is actually in view — with a single tracked character (or a filter
  // narrowed to one) it says the same thing on every row.
  const showCharacterColumn = characters.length > 1;
  // Same reasoning for the select column: with nothing selectable on screen
  // (nothing Outstanding to bulk-pay, nothing Unassigned to join) an
  // always-blank leading column just reads as unexplained whitespace before
  // Date. A row qualifies if either action could apply to it — bulk-pay
  // (Outstanding, already assigned) or join (Unassigned) — the two share one
  // checkbox column rather than each getting its own.
  const isSelectableRow = (dr: DisplayRow) =>
    (dr.status === 'outstanding' && dr.assignment !== null) || dr.status === 'unassigned';
  const showSelectColumn = visibleRows.some(isSelectableRow);

  const columns: DataTableColumn<DisplayRow>[] = [
    ...(showSelectColumn
      ? [
          {
            id: 'select',
            header: '',
            className: 'w-8 px-2',
            render: (dr: DisplayRow) =>
              isSelectableRow(dr) ? (
                <input
                  type="checkbox"
                  aria-label={t('miningTax.selectForBulkAction')}
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
      headerTooltip: t('miningTax.dateEveHint'),
      render: (dr) => dateLabel(dr),
      sortValue: (dr) => dateRangeOf(dr)[0],
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
      render: (dr) => (dr.assignment ? `${formatIsk(taxOwedOf(dr), 2)} ISK` : '—'),
      sortValue: (dr) => (dr.assignment ? taxOwedOf(dr) : undefined),
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

          {/* Balances strip (decision doc): who is owed what right now, and
              the lump-sum "Settle up" on each card. Settled Payees hide
              behind the toggle; unassigned ore gets its own card so a
              balance is never silently short of it. */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.balancesLabel')} ·{' '}
                {owedPayeeCount > 0
                  ? t('miningTax.balancesAcross', {
                      amount: formatIsk(owedTotal, 2),
                      count: owedPayeeCount,
                    })
                  : t('miningTax.balancesNothing')}
              </p>
              {settledCount > 0 && (
                <label className="flex items-center gap-1.5 text-[0.6875rem] text-text-dim">
                  <input
                    type="checkbox"
                    checked={showSettled}
                    onChange={(e) => setShowSettled(e.target.checked)}
                  />
                  {t('miningTax.showSettledPayees', { count: settledCount })}
                </label>
              )}
            </div>
            {(visibleBalances.length > 0 || unassigned.entryCount > 0) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {visibleBalances.map((balance) => (
                  <Panel key={balance.payee.id}>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => filterToPayee(balance.payee.id)}
                        aria-label={t('miningTax.filterToPayee', { payee: balance.payee.name })}
                        aria-pressed={
                          payeeFilter !== 'all' &&
                          payeeFilter.size === 1 &&
                          payeeFilter.has(balance.payee.id)
                        }
                        className="min-w-0 truncate text-left text-sm font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-accent aria-pressed:text-accent"
                      >
                        {balance.payee.name}
                      </button>
                      <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                        {t('miningTax.balanceEntries', { count: balance.members.length })}
                      </span>
                    </div>
                    {characters.length > 1 && (
                      <p className="truncate text-[0.6875rem] text-text-dim">
                        {characters.find((c) => c.characterId === balance.payee.characterId)
                          ?.characterName ?? ''}
                      </p>
                    )}
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span
                        className={cx(
                          'text-xl font-semibold tabular-nums',
                          balance.owed > 0 ? 'text-isk-neg' : 'text-isk-pos'
                        )}
                      >
                        {formatIsk(balance.owed, 0)}
                      </span>
                      <span className="text-[0.6875rem] text-text-dim">ISK</span>
                    </p>
                    <div className="mt-2">
                      {balance.owed > 0 ? (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => settleUpBalance(balance.members)}
                        >
                          {t('miningTax.settleUpAction')}
                        </Button>
                      ) : (
                        <Button size="sm" className="w-full" disabled>
                          {t('miningTax.nothingToSettle')}
                        </Button>
                      )}
                    </div>
                  </Panel>
                ))}
                {unassigned.entryCount > 0 && (
                  <Panel className="border-dashed">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-warning">
                        {t('miningTax.unassignedCardTitle')}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                        {t('miningTax.balanceEntries', { count: unassigned.entryCount })}
                      </span>
                    </div>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xl font-semibold tabular-nums">
                        {formatIsk(unassigned.estimatedValue, 0)}
                      </span>
                      <span className="text-[0.6875rem] text-text-dim">
                        {t('miningTax.unassignedMined')}
                      </span>
                    </p>
                    <div className="mt-2">
                      <Button size="sm" className="w-full" onClick={assignNext}>
                        {t('miningTax.assignNextAction')}
                      </Button>
                    </div>
                  </Panel>
                )}
              </div>
            )}
          </div>

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

            {allPayees.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    {payeeFilter === 'all'
                      ? t('miningTax.allPayees')
                      : t('miningTax.payeesSelected', { count: payeeFilter.size })}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {allPayees.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p.id}
                      checked={payeeFilter === 'all' || payeeFilter.has(p.id)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => togglePayee(p.id)}
                    >
                      {characters.length > 1
                        ? t('miningTax.payeeOptionWithCharacter', {
                            payee: p.name,
                            character:
                              characters.find((c) => c.characterId === p.characterId)
                                ?.characterName ?? '',
                          })
                        : p.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

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
                    {statusLabel(t, status)} ({statusCounts.get(status) ?? 0})
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {bulkPayRows.length > 0 && (
              <Button size="sm" variant="primary" onClick={() => setSettleUpRows(bulkPayRows)}>
                {t('miningTax.settleUpSelectedAction', { count: bulkPayRows.length })}
              </Button>
            )}

            {joinPair && (
              <Button size="sm" variant="primary" onClick={handleJoinSelected}>
                {t('miningTax.joinSelectedAction')}
              </Button>
            )}
            {joinEligibleSelected.length === 2 && !joinPair && (
              <p className="text-xs text-text-dim">{t('miningTax.joinIncompatibleHint')}</p>
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

      {detailTarget && data && detailTarget.groupMembers && (
        <GroupSummaryModal
          open={detailTarget !== null}
          onClose={() => setDetailTarget(null)}
          members={allMembers(detailTarget)}
          systemName={
            data.systemNames.get(detailTarget.row.entry.solarSystemId) ??
            `#${detailTarget.row.entry.solarSystemId}`
          }
          systemSecurity={data.systemSecurity.get(detailTarget.row.entry.solarSystemId)}
          typeNames={data.typeNames}
          payeeDisplayName={payeeDisplayName(detailTarget)}
          busy={busy}
          onEditMember={(member) =>
            setDetailTarget({
              key: member.assignment.id,
              row: member.row,
              assignment: member.assignment,
              status: member.assignment.status,
            })
          }
          onMarkAllPaid={() => void handleMarkGroupPaidFromDetail()}
        />
      )}

      {detailTarget && data && !detailTarget.groupMembers && (
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
          payees={data.payeesByCharacter.get(detailTarget.row.characterId) ?? []}
          unitPrices={data.unitPrices}
          busy={busy}
          onAssigned={handleAssignedFromDetail}
          onDismiss={() => void handleDismissFromDetail()}
          onMarkPaid={() => void handleMarkPaidFromDetail()}
          onResolve={() => void handleResolveFromDetail()}
          onUndo={() => void handleUndoFromDetail()}
          onJoin={() => {
            setJoinTarget(detailTarget);
            setDetailTarget(null);
          }}
          onSplit={
            detailTarget.assignment && !detailTarget.assignment.groupId
              ? () => {
                  setSplitTarget(detailTarget);
                  setDetailTarget(null);
                }
              : undefined
          }
        />
      )}

      {splitTarget && splitTarget.assignment && data && (
        <SplitDialog
          open={splitTarget !== null}
          onClose={() => setSplitTarget(null)}
          assignment={splitTarget.assignment}
          row={splitTarget.row}
          systemName={systemName(splitTarget)}
          payees={data.payeesByCharacter.get(splitTarget.row.characterId) ?? []}
          typeNames={data.typeNames}
          unitPrices={data.unitPrices}
          busy={busy}
          onSplit={() => {
            setSplitTarget(null);
            refresh();
          }}
        />
      )}

      {joinTarget && data && (
        <JoinAssignDialog
          open={joinTarget !== null}
          onClose={() => {
            setJoinTarget(null);
            setJoinCandidateOverride(null);
          }}
          primary={{ row: joinTarget.row, assignment: joinTarget.assignment }}
          candidates={
            joinCandidateOverride
              ? [{ row: joinCandidateOverride.row, assignment: joinCandidateOverride.assignment }]
              : joinCandidatesFor(joinTarget)
          }
          payees={data.payeesByCharacter.get(joinTarget.row.characterId) ?? []}
          typeNames={data.typeNames}
          unitPrices={data.unitPrices}
          busy={busy}
          onJoined={handleJoined}
        />
      )}

      {settleUpRows && data && (
        <SettleUpDialog
          open={settleUpRows !== null}
          onClose={() => setSettleUpRows(null)}
          rows={settleUpRows}
          systemNames={data.systemNames}
          onPaid={() => {
            setBulkPaySelection(new Set());
            refresh();
          }}
        />
      )}
    </div>
  );
}
