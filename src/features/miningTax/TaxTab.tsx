import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
  DataAgeBadge,
  DataTable,
  DataTableDenseCell,
  DataTableSortPicker,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  Toast,
  Tooltip,
  TypeIcon,
  type DataTableColumn,
  Checkbox,
} from '@/components/ui';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { beginGrant } from '@/app/grantAction';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import { toggleFilterMember } from '@/lib/multiSelectFilter';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { type UrlParamCodec } from '@/lib/urlState';
import type { TradeHub } from '@/market/hubs';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
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
  formatDateRange,
  type DisplayRow,
  type GroupMember,
} from '@/features/miningTax/groupRows';
import { resolveRowNames } from '@/features/miningTax/names';
import {
  hubForPayee,
  loadDatedUnitPricesByHub,
  pricesAtHubOnDate,
  sellFallbackAtHubOnDate,
  type DatedUnitPrices,
} from '@/features/miningTax/pricing';
import { loadTypeNames } from '@/features/character/typeNames';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import {
  AlreadyAssignedError,
  assignmentsSharingPayment,
  deleteAssignment,
  dismissEntry,
  joinAssignments,
  linkPaymentTransaction,
  linkRecordedPayment,
  markAssignmentsPaid,
  resolveNeedsReview,
  uncombineAssignments,
  unlinkPaymentTransaction,
} from '@/features/miningTax/assignments';
import { tagAsIgnored, tagAsMoonOre } from '@/features/miningTax/typeOverrides';
import { TypeOverridesDialog } from '@/features/miningTax/TypeOverridesDialog';
import { computePayeeBalances, summarizeUnassigned } from '@/features/miningTax/balances';
import {
  combineEligibility,
  dismissableRows,
  settleUpMembers,
} from '@/features/miningTax/selection';
import { BulkDismissDialog } from '@/features/miningTax/BulkDismissDialog';
import { SelectionToolbar } from '@/features/miningTax/SelectionToolbar';
import { loadMadePayments } from '@/features/miningTax/madePayments';
import {
  autoMatchRecordedPayments,
  suggestLinks,
  unlinkedPayments,
  unlinkedRecordedPayments,
  type MadePayment,
} from '@/features/miningTax/paymentLinks';
import { LinkPaymentDialog } from '@/features/miningTax/LinkPaymentDialog';
import { GroupSummaryModal } from '@/features/miningTax/GroupSummaryModal';
import { SettleUpDialog, type SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import { JoinAssignDialog } from '@/features/miningTax/JoinAssignDialog';
import { PayeeManagerDialog } from '@/features/miningTax/PayeeManagerDialog';
import { RowDetailModal } from '@/features/miningTax/RowDetailModal';
import { type LinkedTransaction } from '@/features/miningTax/PaymentLinksCard';
import { LinkTransactionDialog } from '@/features/miningTax/LinkTransactionDialog';
import { SplitDialog } from '@/features/miningTax/SplitDialog';
import { findPricingGaps, type PricingGap } from '@/features/miningTax/pricingGaps';
import { linesOwnedBy } from '@/engine/miningTax/ownership';
import { taxCsvColumns } from '@/features/miningTax/taxCsv';
import { StatusPill } from '@/features/miningTax/StatusPill';
import { useIsPhone } from '@/lib/useIsPhone';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { AttentionStrip, type AttentionItem } from '@/features/miningTax/AttentionStrip';
import { OwedBalances } from '@/features/miningTax/OwedBalances';
import { ContinueSessionCard } from '@/features/miningTax/ContinueSessionCard';
import { EntryEditDialog } from '@/features/miningTax/EntryEditDialog';
import { LinkWalletPaymentDialog } from '@/features/miningTax/LinkWalletPaymentDialog';
import {
  useAutoContinueSessions,
  useDismissedContinuations,
} from '@/features/miningTax/continueSessionPref';
import {
  findSessionContinuations,
  type SessionContinuation,
} from '@/features/miningTax/sessionContinuation';
import { splitLedger } from '@/features/miningTax/ledgerSections';
import { suggestPayeeForSystem, systemsByPayee } from '@/features/miningTax/suggestPayee';

/**
 * A `MadePayment`'s own timestamp as a local calendar date, falling back to
 * today — the same rule `LinkPaymentDialog`'s `paidOnFor` uses, so a
 * fallback payment created from a manually-linked transaction reads a
 * `paidOn` the same way a Settle-up-recorded one does.
 */
function paidOnFromMadePaymentDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  return formatLocalDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
}

/** A short display line for a linked ref, from the same `MadePayment[]` the Payments-to-link card already loaded — `null` when it's no longer in the cached wallet journal/contracts. */
function labelForLinkedRef(
  madePayments: readonly MadePayment[],
  t: TFunction,
  kind: 'journal' | 'contract',
  refId: number
): string | null {
  const mp = madePayments.find((p) => p.key === `${kind}:${refId}`);
  if (!mp) return null;
  const amount =
    mp.amount === null ? t('miningTax.linkPaymentInKind') : `${formatIsk(mp.amount)} ISK`;
  const label = mp.label || t('miningTax.linkPaymentUntitledContract');
  return `${amount} · ${mp.date.slice(0, 10)} — ${label}`;
}

/** The dedup'd `LinkedTransaction[]` across `assignments`' payments — the same shape whether it's one row's shared-payment group or a joined group's members. */
function linkedTransactionsFor(
  assignments: readonly MiningTaxAssignmentRecord[],
  madePayments: readonly MadePayment[],
  t: TFunction
): LinkedTransaction[] {
  const seen = new Set<string>();
  const out: LinkedTransaction[] = [];
  for (const a of assignments) {
    if (!a.payment) continue;
    for (const kind of ['journal', 'contract'] as const) {
      for (const l of (kind === 'journal' ? a.payment.journalLinks : a.payment.contractLinks) ??
        []) {
        const key = `${kind}:${l.refId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          kind,
          refId: l.refId,
          source: l.source,
          label: labelForLinkedRef(madePayments, t, kind, l.refId),
        });
      }
    }
  }
  return out;
}

/**
 * Every Assignment a "Link transaction" action on `dr` should apply to:
 * every member of a joined group at once (issue #540 follow-up — a joined
 * group is billed as one obligation, so a linked transaction covers all of
 * it), or the single row's own shared-`paymentId` group otherwise.
 */
function assignmentsForLinkTarget(
  dr: DisplayRow,
  everyAssignment: readonly MiningTaxAssignmentRecord[]
): MiningTaxAssignmentRecord[] {
  if (dr.groupMembers) return allMembers(dr).map((m) => m.assignment);
  return dr.assignment ? assignmentsSharingPayment(dr.assignment, everyAssignment) : [];
}

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
  /** Per-hub, per-date buy prices — the day the ore was mined, not "now" (issue #523 follow-up). Resolved per Payee/date by `pricesFor`. */
  datedPrices: DatedUnitPrices;
  /** Per hub, the ore types that hub quoted no buy price for on any date they appeared — their price entry is 0, which is not the same claim as "worthless". */
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>;
  /** Union of `unpricedByHub` — whether the banner has anything at all to say. */
  unpricedTypeIds: Set<number>;
}

const EMPTY_DATED_PRICES: DatedUnitPrices = {
  byHubAndDate: new Map(),
  unpricedByHub: new Map(),
  sellFallbackByHubAndDate: new Map(),
  unpriced: new Set(),
};

async function loadSnapshot(characterId: number, signal: RouteSnapshotSignal): Promise<Snapshot> {
  const result = await loadMoonMiningTaxSnapshot();
  if (signal.cancelled) {
    return {
      ...result,
      entries: result.rows,
      systemNames: new Map(),
      systemSecurity: new Map(),
      typeNames: new Map(),
      datedPrices: EMPTY_DATED_PRICES,
      unpricedByHub: new Map(),
      unpricedTypeIds: new Set(),
    };
  }
  const unclassifiedTypeIds = result.unclassified.flatMap((u) => u.typeIds);
  // Every hub any Payee bills at, so a dialog can re-price live as the pilot
  // changes which Payee an entry is assigned to. One fetch per *distinct*
  // hub — an all-Jita ledger, the common case, still makes exactly one.
  const payeeHubIds = [...result.payeesByCharacter.values()].flatMap((payees) =>
    payees.map((payee) => payee.hubId)
  );
  const dates = [...new Set(result.rows.map((row) => row.entry.date))];
  const [
    { systemNames, systemSecurity, typeNames: rowTypeNames },
    datedPrices,
    unclassifiedTypeNames,
  ] = await Promise.all([
    resolveRowNames(result.rows),
    loadDatedUnitPricesByHub(
      characterId,
      result.rows.flatMap((row) => row.entry.oreLines.map((line) => line.typeId)),
      payeeHubIds,
      dates
    ),
    loadTypeNames(unclassifiedTypeIds),
  ]);
  const typeNames = new Map([...rowTypeNames, ...unclassifiedTypeNames]);
  return {
    ...result,
    entries: result.rows,
    systemNames,
    systemSecurity,
    typeNames,
    datedPrices,
    unpricedByHub: datedPrices.unpricedByHub,
    unpricedTypeIds: datedPrices.unpriced,
  };
}

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
function statusLabel(t: (key: string) => string, status: MiningTaxRowStatus): string {
  return t(`miningTax.status.${STATUS_LABEL_KEY[status]}`);
}

/** `payeeFilter` as a URL query param: a comma-separated set of Payee ids, absent means "all". */
function payeeFilterParam(): UrlParamCodec<ReadonlySet<string> | 'all'> {
  return {
    parse: (raw) => (raw === null || raw === '' ? 'all' : new Set(raw.split(','))),
    serialize: (value) => (value === 'all' ? null : [...value].sort().join(',')),
  };
}

// Keys scoped `tax.*`: Mining's other tab (`OverviewTab`) has its own
// `character`/sort params on the same route, and `usePageTab` carries the
// query string across a tab switch — unscoped keys would leak Tax's filter
// and sort into Overview and back.
const TAX_URL_PARAMS = {
  'tax.character': characterFilterParam('all'),
  'tax.payee': payeeFilterParam(),
};

const TAX_DEFAULT_SORT = { columnId: 'date', direction: 'desc' as const };

/**
 * Moon Mining ledger (issue #523): one continuously-filterable list, all
 * tracked characters by default. The Tax tab of the Mining page (issue #671)
 * — the route shell (`src/routes/MoonMiningTax.tsx`) gates on the active
 * Character before mounting this, so a hydrated store and a non-null
 * `activeCharacterId` are already guaranteed here.
 */
interface TaxTabProps {
  /** The route's shared tab bar, rendered under this tab's own `PageHeader`. See `MoonMiningTax`. */
  tabBar: ReactNode;
}

export function TaxTab({ tabBar }: TaxTabProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  // The Ore column only where the table has room for it beside a full Payee
  // name: the Payee is what a row is read by, the ore is one click away in
  // the entry itself (and at 1024px it pushed Status off-screen, #2147).
  const showOreColumn = useMediaQuery('(min-width: 87.5rem)');
  // Est. value is out between the phone card and `lg`: there the other
  // columns' fixed widths would leave the Payee column no room at all. The
  // card still shows it, and so does every wider screen (and the export).
  const showValueColumn = useMediaQuery('(min-width: 64rem)') || isPhone;
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadSnapshot,
    undefined,
    { cacheKey: 'moonMiningTax' }
  );

  const [{ 'tax.character': characterFilter, 'tax.payee': payeeFilter }, setTaxUrlParams] =
    useUrlParams(TAX_URL_PARAMS);
  const setCharacterFilter = useCallback(
    (next: CharacterFilterValue) => setTaxUrlParams({ 'tax.character': next }),
    [setTaxUrlParams]
  );
  const setPayeeFilter = useCallback(
    (next: ReadonlySet<string> | 'all') => setTaxUrlParams({ 'tax.payee': next }),
    [setTaxUrlParams]
  );
  const autoContinue = useAutoContinueSessions((state) => state.value);
  const setAutoContinue = useAutoContinueSessions((state) => state.setValue);
  const hydrateAutoContinue = useAutoContinueSessions((state) => state.hydrate);
  const dismissedContinuations = useDismissedContinuations((state) => state.value);
  const setDismissedContinuations = useDismissedContinuations((state) => state.setValue);
  const hydrateDismissedContinuations = useDismissedContinuations((state) => state.hydrate);
  useEffect(() => {
    void hydrateAutoContinue();
    void hydrateDismissedContinuations();
  }, [hydrateAutoContinue, hydrateDismissedContinuations]);

  const [payeeManagerCharacterId, setPayeeManagerCharacterId] = useState<number | null>(null);
  // Unconditional, deliberately. Hiding this behind "the pilot has at least
  // one tag" reads tidier and reintroduces the shape of the bug it exists to
  // fix: the check can only re-run when `data`'s identity changes, and a
  // reload that *fails* after a successful tag leaves `data` on the retained
  // snapshot — so the action would stay hidden while the error branch has
  // already taken the banner away, stranding the pilot exactly as before. The
  // dialog says so itself when there is nothing to show.
  const [oreTagsOpen, setOreTagsOpen] = useState(false);
  // Row keys checked in the Open table's select column. Feeds all three bulk
  // actions (settle up / combine / dismiss), never just bulk-pay.
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [bulkDismissOpen, setBulkDismissOpen] = useState(false);
  const [linkPaymentOpen, setLinkPaymentOpen] = useState(false);
  // What the Settle-up dialog is settling: a balance card's whole balance, or
  // the table's checkbox selection. `null` keeps it closed.
  const [settleUpRows, setSettleUpRows] = useState<SettleUpRow[] | null>(null);
  // Whose owed entries "Link a wallet payment" is choosing a payment for: a
  // Payee's whole balance, or just the entries ticked or settling.
  const [linkWalletTarget, setLinkWalletTarget] = useState<{
    payeeId: string;
    members?: readonly GroupMember[];
  } | null>(null);
  // Offers on screen when automatic mode was switched on — "next time" means
  // they stay offers rather than being continued the moment the box is ticked.
  const [autoSkip, setAutoSkip] = useState<ReadonlySet<string>>(new Set());
  const [detailTarget, setDetailTarget] = useState<DisplayRow | null>(null);
  // The entry whose edit form is open — single or combined, owed or paid (mockup F1).
  const [editTarget, setEditTarget] = useState<DisplayRow | null>(null);
  // Which row's "Link transaction" picker is open — kept separate from
  // `detailTarget` so the manual picker can sit on top of the row detail
  // rather than replacing it (issue #540 follow-up: linking a transaction to
  // an already-Paid row).
  const [linkTransactionTarget, setLinkTransactionTarget] = useState<DisplayRow | null>(null);
  const [joinTarget, setJoinTarget] = useState<DisplayRow | null>(null);
  const [splitTarget, setSplitTarget] = useState<DisplayRow | null>(null);
  // Set only by the selection toolbar's Combine — pins `JoinAssignDialog`'s
  // candidate list to exactly the rows picked via checkbox (and pre-ticks
  // them), instead of the full same-system candidate list `RowDetailModal`'s
  // "Combine with another day" button offers.
  const [joinCandidateOverride, setJoinCandidateOverride] = useState<DisplayRow[] | null>(null);
  // Combined rows the pilot has expanded in place (desktop), to show each day.
  const [expandedCombined, setExpandedCombined] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Every tracked character, not just those with a Mining Ledger Entry this
  // refresh (CONTEXT.md: the point of the feature is not missing an alt's
  // obligation) — a character with nothing mined yet still needs to appear
  // in the Characters filter and in Manage Payees.
  const characters = data?.characters ?? [];

  const allDisplayRows = useMemo(() => flatten(data?.entries ?? []), [data]);

  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);

  const characterFiltered = useMemo(
    () =>
      allDisplayRows.filter(
        (dr) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(dr.row.characterId)
      ),
    [allDisplayRows, resolvedCharacterFilter]
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

  // Which entries the pricing banner is about, so it can link to them — the
  // table only shows an entry's total, never per-ore prices.
  const pricingGaps = useMemo(() => {
    if (!data) return [];
    return findPricingGaps(allDisplayRows, {
      hubIdOf: (assignment) => allPayees.find((p) => p.id === assignment?.payeeId)?.hubId,
      pricesAt: (hubId, date) => pricesAtHubOnDate(data.datedPrices, hubId, date),
      sellFallbackAt: (hubId, date) => sellFallbackAtHubOnDate(data.datedPrices, hubId, date),
    });
  }, [data, allDisplayRows, allPayees]);

  // `payeeFilter` is URL-held, so a stale or hand-edited link can name Payee
  // ids nobody tracked has — the codec can't validate that itself (it has no
  // access to `allPayees`), so unknown ids are dropped here instead, the same
  // "unknown value falls back to the default" rule the codecs otherwise apply
  // themselves. Emptying out entirely (every id unknown) reads as no filter.
  const resolvedPayeeFilter = useMemo(() => {
    if (payeeFilter === 'all') return 'all' as const;
    const known = new Set(allPayees.map((p) => p.id));
    const kept = new Set([...payeeFilter].filter((id) => known.has(id)));
    return kept.size === 0 ? ('all' as const) : kept;
  }, [payeeFilter, allPayees]);

  // Filtering "by Payee" only makes sense for rows that already have one —
  // an unassigned or dismissed row has no Payee to match, so it drops out as
  // soon as a specific Payee is selected.
  const visibleRows = useMemo(
    () =>
      resolvedPayeeFilter === 'all'
        ? characterFiltered
        : characterFiltered.filter(
            (dr) =>
              dr.assignment?.payeeId !== undefined && resolvedPayeeFilter.has(dr.assignment.payeeId)
          ),
    [characterFiltered, resolvedPayeeFilter]
  );

  // The owed cards: per Payee, what is owed *now*. Follows the Character
  // filter (an alt's debts are still debts) but deliberately not the Payee
  // filter — narrowing the ledger to one Payee must not change a balance.
  const balances = useMemo(
    () => computePayeeBalances(characterFiltered, allPayees),
    [characterFiltered, allPayees]
  );
  const unassigned = useMemo(
    () => summarizeUnassigned(characterFiltered, estimatedValueOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterFiltered, data]
  );

  /**
   * Payments already made (issue #540), loaded *after* the ledger rather than
   * as part of its snapshot. Two paginated ESI reads per tracked character —
   * the wallet journal and contracts — must not sit in front of the table
   * rendering: `SettleUpDialog` deferred the very same journal fetch out of
   * its own open path for exactly this reason ("most settle-ups never get
   * here"), and blocking here would invert that. The card appears when this
   * resolves, and re-runs on `refresh()` so a just-linked payment drops off.
   */
  const [madePayments, setMadePayments] = useState<MadePayment[]>([]);
  /**
   * Keyed on the character roster, never on `data`. `useRouteSnapshot`
   * re-runs its loader on `onCacheRevalidated`, which is a *global* signal —
   * an unrelated Jita price row lapsing anywhere in the app hands this route a
   * brand-new `data` object. Keying the effect on that would refetch the
   * journal and contracts for every character each time, to learn nothing.
   *
   * Nothing is lost by not refetching after a link is confirmed either: the
   * just-linked payment disappears because `unlinkedPayments` now sees the
   * Assignment referencing it, not because the payment list was reloaded.
   */
  const trackedCharacterIds = (data?.characters ?? []).map((c) => c.characterId).join(',');
  useEffect(() => {
    if (trackedCharacterIds === '') return;
    let cancelled = false;
    void loadMadePayments(trackedCharacterIds.split(',').map(Number)).then((payments) => {
      if (!cancelled) setMadePayments(payments);
    });
    return () => {
      cancelled = true;
    };
  }, [trackedCharacterIds]);

  const everyAssignment = useMemo(
    () => allDisplayRows.flatMap((dr) => allMembers(dr).map((m) => m.assignment)),
    [allDisplayRows]
  );

  // Settle-up payments already recorded (paid-on/method/amount) but never
  // live-linked, because step 2 stopped trying to search the wallet journal
  // at pay time (it always missed — ESI hadn't posted the transaction yet).
  // An exact amount + recorded-date + paying-character match is unambiguous
  // enough to attach silently, once the real transaction actually shows up —
  // see `autoMatchRecordedPayments`'s own doc comment for why this skips the
  // confirmation dialog `suggestLink` uses.
  const recordedMatches = useMemo(() => {
    const candidates = unlinkedPayments(madePayments, everyAssignment);
    return autoMatchRecordedPayments(candidates, unlinkedRecordedPayments(everyAssignment));
  }, [everyAssignment, madePayments]);

  // Attempted once per `paymentId`, not on every render this effect's deps
  // happen to recompute — the write lands in Dexie but nothing here forces a
  // `refresh()` (that always re-hits ESI); the exclusion below already keeps
  // the card in sync for this render, and the next real reload picks up the
  // persisted link like any other Assignment field.
  const attemptedLinksRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = recordedMatches.filter(
      ({ group }) => !attemptedLinksRef.current.has(group.paymentId)
    );
    if (fresh.length === 0) return;
    for (const { group } of fresh) attemptedLinksRef.current.add(group.paymentId);
    void Promise.all(
      fresh.map(({ group, payment }) =>
        linkRecordedPayment(
          group.assignments,
          payment.kind === 'journal'
            ? { journalRefId: payment.refId }
            : { contractId: payment.refId }
        )
      )
    );
  }, [recordedMatches]);

  // Payments nothing accounts for, each with the Payee and entries it most
  // likely settled. Only payments with a plausible target survive
  // `suggestLinks`, which is what lets the card stay a quiet offer rather than
  // a standing alert. Excludes whatever `recordedMatches` just claimed
  // automatically — those never need the confirmation dialog.
  const linkSuggestions = useMemo(() => {
    const candidates = unlinkedPayments(madePayments, everyAssignment);
    const autoLinked = new Set(recordedMatches.map((m) => m.payment.key));
    return suggestLinks(
      candidates.filter((p) => !autoLinked.has(p.key)),
      balances
    );
  }, [everyAssignment, madePayments, balances, recordedMatches]);

  // Every Payee's systems and owed entries, for the Payee manager's rows.
  const payeeSystems = useMemo(
    () => systemsByPayee(everyAssignment, allPayees),
    [everyAssignment, allPayees]
  );
  const owedByPayee = useMemo(() => {
    const out = new Map<string, { amount: number; assignments: MiningTaxAssignmentRecord[] }>();
    for (const a of everyAssignment) {
      // Owed means Outstanding, as on the balance cards: a needs-review entry
      // was already paid (or dismissed) before it grew.
      if (!a.payeeId || a.status !== 'outstanding') continue;
      const entry = out.get(a.payeeId) ?? { amount: 0, assignments: [] };
      entry.amount += a.taxOwed;
      entry.assignments.push(a);
      out.set(a.payeeId, entry);
    }
    return out;
  }, [everyAssignment]);

  /** Prefill for a new Assignment's Payee: the one last used in that system, by that pilot. */
  function suggestionFor(row: MoonMiningTaxRow) {
    return suggestPayeeForSystem(
      everyAssignment.filter((a) => a.characterId === row.characterId),
      allPayees,
      row.entry.solarSystemId
    );
  }

  const continuations = useMemo(
    () =>
      findSessionContinuations(characterFiltered).filter(
        (c) => !dismissedContinuations.includes(c.next.key)
      ),
    [characterFiltered, dismissedContinuations]
  );

  /**
   * The seam every value-computing dialog reads: prices at whichever hub a
   * Payee bills at, on the date the ore was actually mined (issue #523
   * follow-up decision doc) — not "now". A lookup rather than one map,
   * because the dialogs are where the Payee (and so the hub) is chosen —
   * assigning to a different Payee, or splitting ore over to a second one,
   * re-values the same ore against a different order book, and this is what
   * lets that happen without another fetch.
   */
  function pricesFor(hubId: string | undefined, date: string): ReadonlyMap<number, number> {
    return pricesAtHubOnDate(data?.datedPrices ?? EMPTY_DATED_PRICES, hubId, date);
  }

  /** Continues one session; `false` when there was nothing to write (its Payee is gone). */
  async function continueSession(continuation: SessionContinuation): Promise<boolean> {
    const { next, previous } = continuation;
    const payee = allPayees.find((p) => p.id === continuation.payeeId);
    if (!payee) return false;
    const wasCombined = previous.groupId !== undefined;
    const records = await joinAssignments(
      [
        {
          characterId: previous.characterId,
          date: previous.date,
          solarSystemId: previous.solarSystemId,
          assignment: previous,
        },
        {
          characterId: next.row.characterId,
          date: next.row.entry.date,
          solarSystemId: next.row.entry.solarSystemId,
          assignment: null,
          oreLines: next.row.unassignedOreLines,
          entryOreLines: next.row.entry.oreLines,
        },
      ],
      continuation.payeeId,
      previous.taxPct,
      (date) => pricesFor(payee.hubId, date)
    );
    const created = records.find((r) => r.id !== previous.id);
    const rejoined = records.find((r) => r.id === previous.id);
    setToast({
      message: t('miningTax.continue.done', { date: next.row.entry.date, payee: payee.name }),
      onUndo: created
        ? () => {
            setToast(null);
            void (async () => {
              await deleteAssignment(created);
              if (!wasCombined && rejoined) await uncombineAssignments([rejoined]);
              refresh();
            })();
          }
        : undefined,
    });
    refresh();
    return true;
  }

  async function handleContinue(continuation: SessionContinuation) {
    setBusy(true);
    try {
      await continueSession(continuation);
    } catch (error) {
      // The day was claimed meanwhile (another tab, or the pilot assigning
      // it by hand) — refreshing shows what exists instead of a twin.
      if (error instanceof AlreadyAssignedError) refresh();
      else throw error;
    } finally {
      setBusy(false);
    }
  }

  // Automatic mode: continue each new offer once, without asking. The ref
  // keeps a rerender from re-firing a continuation before the refresh lands.
  const autoContinuedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoContinue || !data) return;
    const fresh = continuations.filter(
      (c) => !autoContinuedRef.current.has(c.next.key) && !autoSkip.has(c.next.key)
    );
    if (fresh.length === 0) return;
    for (const c of fresh) autoContinuedRef.current.add(c.next.key);
    void (async () => {
      for (const c of fresh) {
        let continued = false;
        try {
          continued = await continueSession(c);
        } catch {
          // Claimed meanwhile, or the write failed: the refresh shows what
          // actually exists.
          refresh();
        }
        // Not continued: bring the offer back as a card so the pilot can retry
        // or choose, rather than it vanishing until the next page load.
        if (!continued) setAutoSkip((previous) => new Set(previous).add(c.next.key));
      }
    })();
    // `continueSession` closes over `allPayees`/`pricesFor`/`t`/`refresh`,
    // all derived from `data` (or stable) — re-running on those would retry
    // the same offers for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContinue, autoSkip, continuations, data]);

  function setAutoContinueFromCard(next: boolean) {
    if (next) setAutoSkip(new Set(continuations.map((c) => c.next.key)));
    void setAutoContinue(next);
  }

  /** "Keep separate", remembered — pruned to entries still in the ledger so the list can't grow forever. */
  function keepSeparate(continuation: SessionContinuation) {
    const present = new Set(allDisplayRows.map((dr) => dr.key));
    void setDismissedContinuations([
      ...dismissedContinuations.filter((key) => present.has(key)),
      continuation.next.key,
    ]);
  }

  function togglePayee(payeeId: string) {
    setPayeeFilter(
      toggleFilterMember(
        resolvedPayeeFilter,
        payeeId,
        allPayees.map((p) => p.id)
      )
    );
  }

  const isSolePayeeFilter = (payeeId: string) =>
    resolvedPayeeFilter !== 'all' &&
    resolvedPayeeFilter.size === 1 &&
    resolvedPayeeFilter.has(payeeId);

  /** A balance's Payee name doubles as "show me just this Payee's entries" — the filter its own figure came from. */
  function filterToPayee(payeeId: string) {
    setPayeeFilter(isSolePayeeFilter(payeeId) ? 'all' : new Set([payeeId]));
  }

  function settleUpRowsFor(members: readonly GroupMember[]): SettleUpRow[] {
    return members.map((m) => ({
      assignment: m.assignment,
      characterName: m.row.characterName,
      payeeName: payeeName(m.assignment.payeeId),
    }));
  }

  /** "Pay them in one lump sum": every Outstanding Assignment behind one balance, straight into Settle up. */
  function settleUpBalance(members: readonly GroupMember[]) {
    setSettleUpRows(settleUpRowsFor(members));
  }

  /** Settle up from a row: that row's whole Payee balance, since that's what one transfer pays. */
  function settleUpPayeeOf(dr: DisplayRow) {
    const payeeId = dr.assignment?.payeeId;
    const balance = balances.find((b) => b.payee.id === payeeId);
    setDetailTarget(null);
    if (balance && balance.members.length > 0) settleUpBalance(balance.members);
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
      pricesAtHubOnDate(data?.datedPrices ?? EMPTY_DATED_PRICES, undefined, row.entry.date),
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

  function payeeName(payeeId: string | undefined): string {
    return allPayees.find((p) => p.id === payeeId)?.name ?? t('miningTax.unknownPayee');
  }

  /** The detail modal's Payee display: a resolved name, "No tax owed" for a dismissal, or a dash when unassigned. */
  function payeeDisplayName(dr: DisplayRow): string {
    if (!dr.assignment) return '—';
    if (dr.assignment.status === 'dismissed') return t('miningTax.dismissedLabel');
    return payeeName(dr.assignment.payeeId);
  }

  /** Buttons that open each affected entry, naming the ore at fault — the table itself never shows per-ore prices. */
  function renderGapLinks(gaps: readonly PricingGap[], pick: (gap: PricingGap) => number[]) {
    return (
      <div className="space-y-0.5">
        <p>{t('miningTax.pricingGapEntries')}</p>
        <ul className="space-y-0.5">
          {gaps.map((gap) => (
            <li key={gap.row.key}>
              <button
                type="button"
                className={`text-left ${inlineLinkClassName}`}
                onClick={() => setDetailTarget(gap.row)}
              >
                {t('miningTax.pricingGapEntry', {
                  date: gap.row.row.entry.date,
                  system: systemName(gap.row),
                  types: pick(gap)
                    .map((typeId) => data?.typeNames.get(typeId) ?? `#${typeId}`)
                    .join(', '),
                })}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function systemName(dr: DisplayRow): string {
    return data?.systemNames.get(dr.row.entry.solarSystemId) ?? `#${dr.row.entry.solarSystemId}`;
  }

  function systemSecurityOf(dr: DisplayRow): number | undefined {
    return data?.systemSecurity.get(dr.row.entry.solarSystemId);
  }

  /** Both the table's Value column and the sole Assignment-less rows: an unassigned entry has no `estimatedValue` of its own, so it's priced live from its still-unclaimed ore lines instead. A combined row sums every member's own value — never a blended re-price across dates. */
  function estimatedValueOf(dr: DisplayRow): number {
    return dr.assignment
      ? allMembers(dr).reduce((sum, m) => sum + m.assignment.estimatedValue, 0)
      : computeAssignmentValue(
          dr.row.unassignedOreLines,
          pricesAtHubOnDate(data?.datedPrices ?? EMPTY_DATED_PRICES, undefined, dr.row.entry.date),
          0
        ).estimatedValue;
  }

  function taxOwedOf(dr: DisplayRow): number {
    return allMembers(dr).reduce((sum, m) => sum + m.assignment.taxOwed, 0);
  }

  /** Every date this row covers, earliest first — one entry for an ordinary row, 2+ for a combined one. */
  function dateRangeOf(dr: DisplayRow): string[] {
    const members = allMembers(dr);
    return (members.length > 0 ? members.map((m) => m.row.entry.date) : [dr.row.entry.date]).sort();
  }

  function dateLabel(dr: DisplayRow): string {
    return formatDateRange(dateRangeOf(dr));
  }

  /** The table's own date: a combined range within one year drops the repeated year ("2026-10-03 – 10-04"), the width a long Payee name needs. */
  function shortDateLabel(dr: DisplayRow): string {
    const dates = dateRangeOf(dr);
    const first = dates[0];
    const last = dates.at(-1);
    if (!first || !last || first === last) return first ?? dr.row.entry.date;
    return first.slice(0, 4) === last.slice(0, 4)
      ? `${first} – ${last.slice(5)}`
      : formatDateRange(dates);
  }

  /** The ore types a row covers, for the Ore column's icons. */
  function oreTypeIdsOf(dr: DisplayRow): number[] {
    const lines = dr.assignment
      ? allMembers(dr).flatMap((m) => m.assignment.oreLines)
      : dr.row.unassignedOreLines;
    return [...new Set(lines.map((line) => line.typeId))];
  }

  /**
   * Other rows `joinTarget` may combine with (issue #523's "join entries")
   * when the dialog is opened from a row's detail view: same character, same
   * solar system, not already part of a combined entry, and either Unassigned
   * or Outstanding. Adding to an *existing* combined entry goes through the
   * selection toolbar's Combine instead (issue #539), which checks the same
   * rules plus the at-most-one-`groupId` constraint in `selection.ts`. When
   * `joinTarget` already has an Assignment, a candidate Assignment must share
   * its Payee and tax % (the decision doc's merge rule) — a candidate still
   * unassigned always qualifies, since it simply adopts whichever side is
   * already assigned.
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

  // Every bulk action clears the selection: row keys are an Assignment id or a
  // `character:date:system:unassigned` residual key, and both change the
  // moment the action lands — a surviving selection would point at rows that
  // no longer exist.
  function handleJoined() {
    setJoinTarget(null);
    setJoinCandidateOverride(null);
    setSelection(new Set());
    refresh();
  }

  /** Every row action ends the same way: busy while it writes, then close and reload. */
  async function runAndClose(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setDetailTarget(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleMarkGroupPaidFromDetail() {
    if (!detailTarget) return;
    const outstanding = allMembers(detailTarget)
      .filter((m) => m.assignment.status === 'outstanding')
      .map((m) => m.assignment);
    if (outstanding.length === 0) return;
    void runAndClose(() => markAssignmentsPaid(outstanding));
  }

  /** The Assign form's submit, from inside RowDetailModal — same refresh-and-close every other row action takes. */
  function handleAssignedFromDetail() {
    setDetailTarget(null);
    refresh();
  }

  function handleDismissFromDetail() {
    if (!detailTarget) return;
    const { row } = detailTarget;
    void runAndClose(() => handleDismiss(row));
  }

  const detailLinkedTransactions: LinkedTransaction[] | undefined = useMemo(() => {
    if (!detailTarget?.assignment?.payment) return undefined;
    return linkedTransactionsFor([detailTarget.assignment], madePayments, t);
  }, [detailTarget, madePayments, t]);

  const groupLinkedTransactions: LinkedTransaction[] | undefined = useMemo(() => {
    if (!detailTarget?.groupMembers) return undefined;
    return linkedTransactionsFor(
      allMembers(detailTarget).map((m) => m.assignment),
      madePayments,
      t
    );
  }, [detailTarget, madePayments, t]);

  function handleUnlinkTransactionFromDetail(transaction: LinkedTransaction) {
    if (!detailTarget) return;
    const targets = assignmentsForLinkTarget(detailTarget, everyAssignment);
    void runAndClose(() =>
      unlinkPaymentTransaction(
        targets,
        transaction.kind === 'journal'
          ? { journalRefId: transaction.refId }
          : { contractId: transaction.refId }
      )
    );
  }

  const linkTransactionCandidates = useMemo(() => {
    if (!linkTransactionTarget) return [];
    return unlinkedPayments(
      madePayments.filter((p) => p.characterId === linkTransactionTarget.row.characterId),
      everyAssignment
    );
  }, [linkTransactionTarget, madePayments, everyAssignment]);

  const linkTransactionTargetAmount = useMemo(() => {
    if (!linkTransactionTarget) return 0;
    const targets = assignmentsForLinkTarget(linkTransactionTarget, everyAssignment);
    const existing = targets.map((a) => a.payment?.amount).find((amount) => amount !== undefined);
    return existing ?? targets.reduce((sum, a) => sum + a.taxOwed, 0);
  }, [linkTransactionTarget, everyAssignment]);

  async function handleConfirmLinkTransaction(payment: MadePayment, source: 'auto' | 'manual') {
    if (!linkTransactionTarget) return;
    const targets = assignmentsForLinkTarget(linkTransactionTarget, everyAssignment);
    if (targets.length === 0) return;
    setBusy(true);
    try {
      await linkPaymentTransaction(
        targets,
        payment.kind === 'journal'
          ? { journalRefId: payment.refId }
          : { contractId: payment.refId },
        source,
        {
          paidOn: paidOnFromMadePaymentDate(payment.date),
          method: payment.method,
          amount: payment.amount === null ? 0 : Math.round(payment.amount),
        }
      );
      setLinkTransactionTarget(null);
      setDetailTarget(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleMarkPaidFromDetail() {
    const assignment = detailTarget?.assignment;
    if (!assignment) return;
    void runAndClose(() => markAssignmentsPaid([assignment]));
  }

  function handleResolveFromDetail() {
    const target = detailTarget;
    if (!target?.assignment) return;
    const assignment = target.assignment;
    void runAndClose(() =>
      resolveNeedsReview(assignment, target.row.entry, target.row.assignments)
    );
  }

  function handleUndoFromDetail() {
    const assignment = detailTarget?.assignment;
    if (!assignment) return;
    void runAndClose(() => deleteAssignment(assignment));
  }

  /** Taking one day out of a combined entry keeps its Assignment; only the combination goes. */
  function handleTakeOut(member: GroupMember) {
    void runAndClose(() => uncombineAssignments([member.assignment]));
  }

  /** "Accept new total" on a combined entry: every day that grew since it was paid. */
  function handleResolveGroup() {
    if (!detailTarget) return;
    const grown = allMembers(detailTarget).filter((m) => m.assignment.status === 'needs-review');
    void runAndClose(async () => {
      for (const m of grown) await resolveNeedsReview(m.assignment, m.row.entry, m.row.assignments);
    });
  }

  function handleUnassignGroup() {
    if (!detailTarget) return;
    const members = allMembers(detailTarget).map((m) => m.assignment);
    void runAndClose(async () => {
      for (const a of members) await deleteAssignment(a);
    });
  }

  function handleUncombineAll() {
    if (!detailTarget) return;
    const members = allMembers(detailTarget).map((m) => m.assignment);
    void runAndClose(() => uncombineAssignments(members));
  }

  const { open: openRows, history } = useMemo(
    () => splitLedger(visibleRows, (dr) => dateRangeOf(dr).at(-1) ?? dr.row.entry.date),
    [visibleRows]
  );
  const historyRows = useMemo(() => history.flatMap((month) => month.rows), [history]);

  // Every bulk action reads the selection narrowed to what is *on screen*:
  // selection state survives a filter change, so acting on the full set would
  // let Dismiss reach entries the pilot cannot see.
  const selectedRows = useMemo(
    () => openRows.filter((dr) => selection.has(dr.key)),
    [openRows, selection]
  );

  const selectedSettleUpRows: SettleUpRow[] = useMemo(
    () => settleUpRowsFor(settleUpMembers(selectedRows)),
    // `settleUpRowsFor` reads only `allPayees`, which follows `data`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRows, data]
  );

  const combine = useMemo(() => combineEligibility(selectedRows), [selectedRows]);
  const dismissTargets = useMemo(() => dismissableRows(selectedRows), [selectedRows]);

  function handleCombineSelected() {
    if (!combine.ok) return;
    const [primary, ...rest] = combine.rows;
    setJoinTarget(primary);
    setJoinCandidateOverride(rest);
  }

  function toggleRowSelected(key: string) {
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCombinedExpanded(key: string) {
    setExpandedCombined((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Only when the rows in view actually come from more than one pilot: a
  // single-miner ledger repeating the same name on every line is width the
  // Payee column needs (decision 20261004, "room for long Payee names").
  const showCharacterColumn = new Set(visibleRows.map((dr) => dr.row.characterId)).size > 1;
  // The select column only shows with something selectable on screen
  // (nothing Outstanding to bulk-pay, nothing Unassigned to combine or
  // dismiss) — an always-blank leading column reads as unexplained
  // whitespace before Date. Both actions share one checkbox column.
  const isSelectableRow = (dr: DisplayRow) =>
    (dr.status === 'outstanding' && dr.assignment !== null) || dr.status === 'unassigned';
  const selectableVisible = openRows.filter(isSelectableRow);
  const showSelectColumn = selectableVisible.length > 0;

  /**
   * A cell's figure, with a combined row's per-day lines under it once
   * expanded. Plain text otherwise: the dense phone card prints cells inline
   * on its meta line, where a block would break the line apart.
   */
  function withDayLines(
    dr: DisplayRow,
    main: ReactNode,
    render: (member: GroupMember) => ReactNode
  ) {
    const days = dayLines(dr, render);
    if (!days) return main;
    return (
      <span className="block">
        <span className="block h-5 leading-5">{main}</span>
        {days}
      </span>
    );
  }

  /** A combined row's per-day lines, shown under its total when expanded (desktop only — the phone card keeps its two lines). */
  function dayLines(dr: DisplayRow, render: (member: GroupMember) => ReactNode) {
    if (!dr.groupMembers || !expandedCombined.has(dr.key)) return null;
    return allMembers(dr)
      .sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date))
      .map((member) => (
        <span
          key={member.assignment.id}
          className="hidden text-[0.6875rem] leading-5 text-text-dim sm:block"
        >
          {render(member)}
        </span>
      ));
  }

  const oreColumn: DataTableColumn<DisplayRow> = {
    id: 'ore',
    headerCellClassName: 'sm:w-40',
    header: t('miningTax.oreColumn'),
    render: (dr) =>
      withDayLines(
        dr,
        dr.groupMembers ? (
          <span className="inline-flex rounded-xs border border-accent-dim px-1.5 text-[0.6875rem] font-semibold tracking-wider text-accent uppercase">
            {t('miningTax.combined.days', { count: allMembers(dr).length })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5">
            {oreTypeIdsOf(dr)
              .slice(0, 5)
              .map((typeId) => (
                <Tooltip key={typeId} content={data?.typeNames.get(typeId) ?? `#${typeId}`}>
                  <span tabIndex={0}>
                    <TypeIcon typeId={typeId} size={32} className="h-4 w-4" />
                  </span>
                </Tooltip>
              ))}
          </span>
        ),
        (m) => (
          <span className="block max-w-[12rem] truncate">
            {m.assignment.oreLines
              .map(
                (line) =>
                  `${data?.typeNames.get(line.typeId) ?? `#${line.typeId}`} ${line.quantity.toLocaleString()}`
              )
              .join(' · ')}
          </span>
        )
      ),
  };

  const valueColumn: DataTableColumn<DisplayRow> = {
    id: 'value',
    headerCellClassName: 'sm:w-32',
    header: t('miningTax.estimatedValueColumn'),
    align: 'right',
    className: 'whitespace-nowrap',
    stackAffix: { after: ` ${t('miningTax.valueAffix')}` },
    // Compact on a phone card, where it shares one meta line with the
    // system, the Payee and the status.
    render: (dr) =>
      withDayLines(
        dr,
        isPhone ? formatIskCompact(estimatedValueOf(dr)) : `${formatIsk(estimatedValueOf(dr))} ISK`,
        (m) => `${formatIsk(m.assignment.estimatedValue)} ISK`
      ),
    sortValue: (dr) => estimatedValueOf(dr),
  };

  const baseColumns: DataTableColumn<DisplayRow>[] = [
    ...(showCharacterColumn
      ? [
          {
            id: 'character',
            headerCellClassName: 'sm:w-28',
            header: t('miningTax.characterColumn'),
            render: (dr: DisplayRow) => dr.row.characterName,
            sortValue: (dr: DisplayRow) => dr.row.characterName,
          } satisfies DataTableColumn<DisplayRow>,
        ]
      : []),
    {
      id: 'date',
      headerCellClassName: 'sm:w-36',
      header: t('miningTax.dateColumn'),
      headerTooltip: t('miningTax.dateEveHint'),
      className: 'whitespace-nowrap',
      render: (dr) =>
        withDayLines(
          dr,
          <span className="relative inline-flex items-center">
            {dr.groupMembers && (
              <button
                type="button"
                aria-expanded={expandedCombined.has(dr.key)}
                aria-label={t('miningTax.combined.showDays', { date: dateLabel(dr) })}
                onClick={() => toggleCombinedExpanded(dr.key)}
                // In the gutter left of the date, so a combined row's date
                // keeps the same left edge as every other row's.
                className="absolute top-0 -left-6 hidden size-5 items-center justify-center rounded-xs text-text-dim hover:text-accent focus-visible:outline-2 focus-visible:outline-accent sm:inline-flex"
              >
                <Caret expanded={expandedCombined.has(dr.key)} />
              </button>
            )}
            {shortDateLabel(dr)}
            {isPhone && dr.groupMembers && (
              <span className="ml-1.5 text-[0.6875rem] font-semibold tracking-wider text-accent uppercase">
                {t('miningTax.combined.days', { count: allMembers(dr).length })}
              </span>
            )}
          </span>,
          (m) => <span className="pl-3">{m.row.entry.date}</span>
        ),
      sortValue: (dr) => dateRangeOf(dr)[0],
      primary: true,
    },
    {
      id: 'system',
      headerCellClassName: 'sm:w-24',
      header: t('miningTax.systemColumn'),
      render: (dr) => (
        <DataTableDenseCell>
          {systemName(dr)}
          <SecurityValue security={systemSecurityOf(dr)} t={t} />
        </DataTableDenseCell>
      ),
      sortValue: (dr) => systemName(dr),
    },
    {
      id: 'payee',
      header: t('miningTax.payeeColumn'),
      // The one column without a fixed width (both tables are `table-fixed`),
      // so it takes whatever the others leave — room for "Bureau of Unified
      // Harvesting" — and truncates rather than pushing Status off-screen at
      // 1024px. `sm:`-scoped so the phone card shows the whole name.
      className: 'sm:truncate',
      render: (dr) => {
        const name = payeeDisplayName(dr);
        return (
          <Tooltip content={name}>
            <span
              tabIndex={0}
              className="sm:cursor-help sm:underline sm:decoration-dotted sm:decoration-text-dim/50 sm:underline-offset-2"
            >
              {name}
            </span>
          </Tooltip>
        );
      },
      sortValue: (dr) => payeeDisplayName(dr),
    },
    ...(showOreColumn ? [oreColumn] : []),
    ...(showValueColumn ? [valueColumn] : []),
    {
      id: 'taxOwed',
      headerCellClassName: 'sm:w-28',
      header: t('miningTax.taxOwedColumn'),
      align: 'right',
      className: 'whitespace-nowrap',
      cardCorner: true,
      // Owed is the figure the page is about; settled history recedes.
      cellClassName: (dr) =>
        dr.status === 'outstanding'
          ? 'text-isk-neg'
          : dr.status === 'paid' || dr.status === 'dismissed'
            ? 'text-text-dim font-normal'
            : undefined,
      render: (dr) =>
        dr.assignment
          ? withDayLines(
              dr,
              `${formatIsk(taxOwedOf(dr))} ISK`,
              (m) => `${formatIsk(m.assignment.taxOwed)} ISK`
            )
          : '—',
      sortValue: (dr) => (dr.assignment ? taxOwedOf(dr) : undefined),
    },
    {
      id: 'status',
      headerCellClassName: 'sm:w-32',
      header: t('miningTax.statusColumn'),
      // Closes the phone card's second line at its right edge, so every
      // status sits in one column under the tax figure above it.
      stackEdge: 'end',
      render: (dr) => <StatusPill status={dr.status} label={statusLabel(t, dr.status)} />,
      sortValue: (dr) => statusLabel(t, dr.status),
    },
  ];

  const openColumns: DataTableColumn<DisplayRow>[] = [
    ...(showSelectColumn
      ? [
          {
            id: 'select',
            header: '',
            className: 'w-8 px-2',
            headerCellClassName: 'sm:w-8',
            stackEdge: 'start',
            render: (dr: DisplayRow) =>
              isSelectableRow(dr) ? (
                <Checkbox
                  aria-label={t('miningTax.selectForBulkAction')}
                  checked={selection.has(dr.key)}
                  onChange={() => toggleRowSelected(dr.key)}
                />
              ) : null,
          } satisfies DataTableColumn<DisplayRow>,
        ]
      : []),
    ...baseColumns,
  ];

  // History has no checkboxes, but keeps an empty column the same width so
  // its columns sit exactly under Open's (both tables are fixed-layout). Not
  // on a phone: there it would be one more (empty) value on the card's meta
  // line, opening it with a stray "·".
  const historyColumns: DataTableColumn<DisplayRow>[] = [
    ...(showSelectColumn && !isPhone
      ? [
          {
            id: 'spacer',
            header: '',
            className: 'w-8 px-2',
            headerCellClassName: 'sm:w-8',
            render: () => null,
          } satisfies DataTableColumn<DisplayRow>,
        ]
      : []),
    ...baseColumns,
  ];

  const taxSort = useUrlSort(
    'tax.sort',
    TAX_DEFAULT_SORT,
    openColumns.map((c) => c.id)
  );
  const historySort = useUrlSort(
    'tax.historySort',
    TAX_DEFAULT_SORT,
    baseColumns.map((c) => c.id)
  );

  // The table's own cell helpers, so the export reads each row exactly as it
  // is shown. They close over `data`, `allPayees` and `t` only.
  const csvColumns = useMemo(
    () =>
      taxCsvColumns(t, {
        showCharacter: showCharacterColumn,
        dateLabel,
        systemName,
        payeeName: (dr) => (dr.assignment ? payeeDisplayName(dr) : null),
        estimatedValue: estimatedValueOf,
        taxOwed: (dr) => (dr.assignment ? taxOwedOf(dr) : null),
      }),
    // Every helper above reads only `data`/`allPayees`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, showCharacterColumn, data, allPayees]
  );
  const taxExport = useTableExport({
    surface: 'mining-tax',
    rows: visibleRows,
    columns: csvColumns,
  });

  const payeeManagerDefaultCharacterId =
    characters.find((c) => c.characterId === activeCharacterId)?.characterId ??
    characters[0]?.characterId ??
    null;

  const needsFirstPayee =
    data != null && allPayees.length === 0 && payeeManagerDefaultCharacterId !== null;

  const duplicateRows =
    data?.entries.filter((row) => (row.duplicateAssignmentIds?.length ?? 0) > 0) ?? [];

  const attentionItems: AttentionItem[] = [];
  if (data) {
    // Per-character re-login, never one flag hiding every other character's
    // data behind a full-page banner — a lapsed alt must stay visible as
    // needing attention, not disappear.
    for (const c of data.reauthCharacters) {
      attentionItems.push({
        id: `reauth:${c.characterId}`,
        tone: 'warning',
        title: t('miningTax.reauthCharacterHint', { character: c.characterName }),
        action: (
          <Button size="sm" onClick={() => void beginGrant(c.characterId, ['getCharacterMining'])}>
            {t('miningTax.reauthAction')}
          </Button>
        ),
      });
    }
    // An ore type the hub quoted no buy order for is valued at 0, which
    // renders exactly like a cheap ore and silently understates the bill.
    // Named per hub rather than pooled: "no buy orders" is a fact about one
    // order book, and once two Payees bill at two hubs, blaming both for one
    // thin book would be wrong.
    if (data.unpricedTypeIds.size > 0) {
      attentionItems.push({
        id: 'unpriced',
        tone: 'warning',
        title: t('miningTax.unpricedTitle'),
        detail: (
          <>
            <ul className="space-y-0.5">
              {[...data.unpricedByHub]
                .filter(([, typeIds]) => typeIds.size > 0)
                .map(([hubId, typeIds]) => (
                  <li key={hubId}>
                    {t('miningTax.unpricedAtHub', {
                      hub: hubForPayee(hubId).systemName,
                      types: [...typeIds]
                        .map((typeId) => data.typeNames.get(typeId) ?? `#${typeId}`)
                        .join(', '),
                    })}
                  </li>
                ))}
            </ul>
            <p>{t('miningTax.unpricedHint')}</p>
            {renderGapLinks(
              pricingGaps.filter((g) => g.unpriced.length > 0),
              (g) => g.unpriced
            )}
          </>
        ),
      });
    }
    if (pricingGaps.some((g) => g.sellFallback.length > 0)) {
      attentionItems.push({
        id: 'sell-fallback',
        tone: 'info',
        title: t('miningTax.sellFallbackTitle'),
        detail: (
          <>
            <p>{t('miningTax.sellFallbackHint')}</p>
            {renderGapLinks(
              pricingGaps.filter((g) => g.sellFallback.length > 0),
              (g) => g.sellFallback
            )}
          </>
        ),
      });
    }
    if (duplicateRows.length > 0) {
      attentionItems.push({
        id: 'duplicates',
        tone: 'warning',
        title: t('miningTax.duplicateTitle'),
        detail: (
          <>
            <p>{t('miningTax.duplicateHint')}</p>
            <ul className="space-y-0.5">
              {duplicateRows.map((row) => (
                <li key={`${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}`}>
                  {row.characterName} — {row.entry.date} —{' '}
                  {data.systemNames.get(row.entry.solarSystemId) ?? `#${row.entry.solarSystemId}`}
                </li>
              ))}
            </ul>
          </>
        ),
      });
    }
    for (const u of data.unclassified) {
      for (const typeId of u.typeIds) {
        attentionItems.push({
          id: `unclassified:${u.characterId}:${typeId}`,
          tone: 'warning',
          title: t('miningTax.attention.unclassifiedOre', {
            character: u.characterName,
            ore: data.typeNames.get(typeId) ?? `#${typeId}`,
          }),
          detail: <p>{t('miningTax.unclassifiedHint')}</p>,
          action: (
            <>
              <Button size="sm" onClick={() => void handleTagAsMoonOre(typeId)}>
                {t('miningTax.tagAsMoonOre')}
              </Button>
              <Button size="sm" onClick={() => void handleTagAsIgnored(typeId)}>
                {t('miningTax.ignoreOreAction')}
              </Button>
            </>
          ),
        });
      }
    }
  }

  const linkWalletPayee = allPayees.find((p) => p.id === linkWalletTarget?.payeeId) ?? null;
  const linkWalletOwed = useMemo(
    () =>
      linkWalletTarget?.members ??
      balances.find((b) => b.payee.id === linkWalletTarget?.payeeId)?.members ??
      [],
    [linkWalletTarget, balances]
  );
  // Only payments from a pilot who mined one of the owed entries — the ISK
  // has to have left a wallet that owes this bill.
  const linkWalletCandidates = useMemo(() => {
    const miners = new Set(linkWalletOwed.map((m) => m.row.characterId));
    return unlinkedPayments(
      madePayments.filter((p) => miners.has(p.characterId)),
      everyAssignment
    );
  }, [linkWalletOwed, madePayments, everyAssignment]);

  // The selection bar's "Link payment": one transfer pays one Payee.
  const selectedPayeeIds = [...new Set(selectedSettleUpRows.map((r) => r.assignment.payeeId))];
  const linkSelectedBlocked =
    selectedSettleUpRows.length === 0
      ? t('miningTax.settleUpBlockedHint')
      : selectedPayeeIds.length > 1
        ? t('miningTax.linkPaymentOnePayeeHint')
        : null;

  const rowClassName = (dr: DisplayRow) =>
    cx(
      dr.status === 'paid' && 'text-text-dim',
      expandedCombined.has(dr.key) && 'sm:[&>td]:align-top'
    );

  return (
    <div className="space-y-4">
      {/*
        The tab's controls ride the page title's own line rather than a strip
        of their own below the tab bar: they act on this tab's whole snapshot,
        which is what `PageHeader.actions` is for. Rendering the header here
        rather than in the route shell is what lets the `DataAgeBadge` read
        `fetchedAt` directly — see the note on `MoonMiningTax`.
      */}
      <PageHeader
        title={t('miningTax.title')}
        meta={data?.fetchedAt ? <DataAgeBadge date={data.fetchedAt} /> : undefined}
        actions={
          <>
            {payeeManagerDefaultCharacterId !== null && (
              <Button
                variant={needsFirstPayee ? 'accent' : 'ghost'}
                onClick={() => setPayeeManagerCharacterId(payeeManagerDefaultCharacterId)}
              >
                {t('miningTax.managePayeesAction')}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={<Icon.More />} label={t('miningTax.moreActions')} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setOreTagsOpen(true)}>
                  {t('miningTax.oreTagsAction')}
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem
                  checked={autoContinue}
                  onCheckedChange={(next) => setAutoContinueFromCard(next === true)}
                >
                  {t('miningTax.continue.autoMenuLabel')}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('miningTax.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />
      {tabBar}

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

          <AttentionStrip items={attentionItems} />

          {/* Until a Payee exists there is nothing to assign an entry to, so
              the balances and ledger would all read as blank. Point at the
              Payees button (outlined in accent while this shows) instead. */}
          {needsFirstPayee ? (
            <EmptyState
              title={t('miningTax.firstPayeeTitle')}
              hint={t('miningTax.firstPayeeHint')}
            />
          ) : (
            <>
              <OwedBalances
                balances={balances}
                unassigned={unassigned}
                unlinkedPaymentCount={linkSuggestions.length}
                characterNameOf={
                  characters.length > 1
                    ? (balance) =>
                        characters.find((c) => c.characterId === balance.payee.characterId)
                          ?.characterName
                    : undefined
                }
                isSoleFilter={isSolePayeeFilter}
                onFilterPayee={filterToPayee}
                onSettleUp={(balance) => settleUpBalance(balance.members)}
                onLinkPayment={(balance) => setLinkWalletTarget({ payeeId: balance.payee.id })}
                onAssignNext={assignNext}
                onReviewPayments={() => setLinkPaymentOpen(true)}
              />

              {data && continuations.some((c) => !autoContinue || autoSkip.has(c.next.key)) && (
                <div className="space-y-2">
                  {continuations
                    .filter((c) => !autoContinue || autoSkip.has(c.next.key))
                    .map((c) => (
                      <ContinueSessionCard
                        key={c.next.key}
                        continuation={c}
                        systemName={systemName(c.next)}
                        payeeName={payeeName(c.previous.payeeId)}
                        typeNames={data.typeNames}
                        busy={busy}
                        autoContinue={autoContinue}
                        onContinue={() => void handleContinue(c)}
                        onChooseOther={() => setDetailTarget(c.next)}
                        onKeepSeparate={() => keepSeparate(c)}
                        onAutoContinueChange={setAutoContinueFromCard}
                      />
                    ))}
                </div>
              )}

              {/* The filters sit right on top of the Open list they filter
                  first: no "Open" heading between them, since every row in
                  it already carries its status. */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CharacterFilterControl
                    activeCharacterId={activeCharacterId}
                    value={characterFilter}
                    onChange={setCharacterFilter}
                  />

                  {allPayees.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm">
                          {resolvedPayeeFilter === 'all'
                            ? t('miningTax.allPayees')
                            : t('miningTax.payeesSelected', { count: resolvedPayeeFilter.size })}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {allPayees.map((p) => (
                          <DropdownMenuCheckboxItem
                            key={p.id}
                            checked={resolvedPayeeFilter === 'all' || resolvedPayeeFilter.has(p.id)}
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

                  {/* On a phone the stacked cards have no header row to sort
                    from; the picker lives here rather than above the list. */}
                  {isPhone && openRows.length > 1 && (
                    <DataTableSortPicker
                      columns={openColumns}
                      sort={taxSort.sort}
                      onSortChange={taxSort.onSortChange}
                    />
                  )}

                  {visibleRows.length > 0 && (
                    <span className="ml-auto">
                      <TableActionsMenu name={t('miningTax.title')} tableExport={taxExport} />
                    </span>
                  )}
                </div>

                {/* An empty ledger is EmptyState's to explain below; "nothing
                  open — every entry is paid" would contradict it. */}
                {visibleRows.length > 0 && (
                  <section aria-labelledby="mining-tax-open">
                    <h2 id="mining-tax-open" className="sr-only">
                      {t('miningTax.sections.open', { count: openRows.length })}
                    </h2>
                    {openRows.length === 0 ? (
                      <p className="rounded-xs border border-dashed border-line px-3 py-3 text-xs text-text-dim">
                        {t('miningTax.sections.openEmpty')}
                      </p>
                    ) : (
                      <Panel padded={false}>
                        <div className="overflow-x-auto">
                          <DataTable
                            {...taxExport.tableProps}
                            columns={openColumns}
                            rows={openRows}
                            className="sm:table-fixed"
                            rowKey={(dr) => dr.key}
                            label={t('miningTax.sections.openLabel')}
                            {...taxSort}
                            stackLayout="dense"
                            rowClassName={rowClassName}
                            onRowClick={(dr) => setDetailTarget(dr)}
                          />
                        </div>
                      </Panel>
                    )}
                  </section>
                )}
              </div>

              {historyRows.length > 0 && (
                <section aria-labelledby="mining-tax-history" className="space-y-2">
                  <h2
                    id="mining-tax-history"
                    className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
                  >
                    {t('miningTax.sections.history')}
                  </h2>
                  <Panel padded={false}>
                    <div className="overflow-x-auto">
                      <DataTable
                        columns={historyColumns}
                        rows={historyRows}
                        // Months are sections here, not folded duplicates:
                        // their entries line up with Open's, unindented.
                        className="dt-flat-groups sm:table-fixed"
                        rowKey={(dr) => dr.key}
                        label={t('miningTax.sections.history')}
                        {...historySort}
                        stackLayout="dense"
                        rowClassName={rowClassName}
                        onRowClick={(dr) => setDetailTarget(dr)}
                        groupBy={{
                          key: (dr) => (dateRangeOf(dr).at(-1) ?? dr.row.entry.date).slice(0, 7),
                          allWidths: true,
                          minSize: 1,
                          // The newest month opens; older ones stay folded.
                          defaultExpanded: (rows) =>
                            (dateRangeOf(rows[0]).at(-1) ?? '').slice(0, 7) === history[0]?.month,
                          renderHeader: (rows) => (
                            <HistoryMonthHeader
                              month={(dateRangeOf(rows[0]).at(-1) ?? '').slice(0, 7)}
                              count={rows.length}
                              taxTotal={rows.reduce(
                                (sum, dr) => sum + (dr.assignment ? taxOwedOf(dr) : 0),
                                0
                              )}
                            />
                          ),
                        }}
                      />
                    </div>
                  </Panel>
                </section>
              )}

              {visibleRows.length === 0 && (
                <EmptyState title={t('miningTax.emptyTitle')} hint={t('miningTax.emptyHint')} />
              )}

              {/* Pinned above the phone tab bar (and to the bottom of the
                  viewport on desktop), so the bulk actions stay in reach
                  wherever the ticked row sits in a long ledger. */}
              {selectedRows.length > 0 && (
                <div className="sticky bottom-[var(--bottom-nav-clearance)] z-30 md:bottom-3">
                  <SelectionToolbar
                    selectedCount={selectedRows.length}
                    canSelectAll={selectableVisible.some((dr) => !selection.has(dr.key))}
                    onSelectAll={() => setSelection(new Set(selectableVisible.map((dr) => dr.key)))}
                    onClear={() => setSelection(new Set())}
                    settleUpCount={selectedSettleUpRows.length}
                    onSettleUp={() => setSettleUpRows(selectedSettleUpRows)}
                    combine={combine}
                    onCombine={handleCombineSelected}
                    dismissCount={dismissTargets.length}
                    onDismiss={() => setBulkDismissOpen(true)}
                    linkPaymentBlockedReason={linkSelectedBlocked}
                    onLinkPayment={() => {
                      const payeeId = selectedPayeeIds[0];
                      if (!payeeId) return;
                      setLinkWalletTarget({
                        payeeId,
                        members: settleUpMembers(selectedRows),
                      });
                    }}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {toast && (
        <Toast
          message={toast.message}
          undo={
            toast.onUndo ? { label: t('miningTax.continue.undo'), onUndo: toast.onUndo } : undefined
          }
        />
      )}

      {oreTagsOpen && (
        <TypeOverridesDialog
          open={oreTagsOpen}
          onClose={() => setOreTagsOpen(false)}
          onChanged={refresh}
        />
      )}

      {payeeManagerCharacterId !== null && (
        <PayeeManagerDialog
          open={payeeManagerCharacterId !== null}
          onClose={() => setPayeeManagerCharacterId(null)}
          characters={characters}
          payeesByCharacter={data?.payeesByCharacter ?? new Map()}
          initialCharacterId={payeeManagerCharacterId}
          onChanged={refresh}
          owedByPayee={owedByPayee}
          systemsByPayee={payeeSystems}
          systemNames={data?.systemNames}
        />
      )}

      {detailTarget && data && detailTarget.groupMembers && (
        <GroupSummaryModal
          open={detailTarget !== null}
          onClose={() => setDetailTarget(null)}
          members={allMembers(detailTarget)}
          systemName={systemName(detailTarget)}
          systemSecurity={systemSecurityOf(detailTarget)}
          typeNames={data.typeNames}
          payeeDisplayName={payeeDisplayName(detailTarget)}
          busy={busy}
          onEdit={() => {
            setEditTarget(detailTarget);
            setDetailTarget(null);
          }}
          onSettleUp={
            detailTarget.status === 'outstanding' ? () => settleUpPayeeOf(detailTarget) : undefined
          }
          onMarkAllPaid={handleMarkGroupPaidFromDetail}
          onTakeOut={handleTakeOut}
          onUncombine={handleUncombineAll}
          onResolve={handleResolveGroup}
          onUnassignAll={handleUnassignGroup}
          onLinkWalletPayment={() => {
            const payeeId = detailTarget.assignment?.payeeId;
            if (!payeeId) return;
            setLinkWalletTarget({
              payeeId,
              members: allMembers(detailTarget).filter(
                (m) => m.assignment.status === 'outstanding'
              ),
            });
            setDetailTarget(null);
          }}
          linkedTransactions={groupLinkedTransactions}
          onLinkTransaction={
            allMembers(detailTarget).every((m) => m.assignment.status === 'paid')
              ? () => setLinkTransactionTarget(detailTarget)
              : undefined
          }
          onUnlinkTransaction={handleUnlinkTransactionFromDetail}
        />
      )}

      {editTarget && data && (
        <EntryEditDialog
          open
          onClose={() => setEditTarget(null)}
          members={allMembers(editTarget)}
          systemName={systemName(editTarget)}
          systemSecurity={systemSecurityOf(editTarget)}
          payees={allPayees}
          typeNames={data.typeNames}
          pricesFor={pricesFor}
          onSaved={() => {
            setEditTarget(null);
            refresh();
          }}
        />
      )}

      {detailTarget && data && !detailTarget.groupMembers && (
        <RowDetailModal
          open={detailTarget !== null}
          onClose={() => setDetailTarget(null)}
          row={detailTarget.row}
          assignment={detailTarget.assignment}
          status={detailTarget.status}
          systemName={systemName(detailTarget)}
          systemSecurity={systemSecurityOf(detailTarget)}
          typeNames={data.typeNames}
          payees={allPayees}
          suggestion={detailTarget.assignment ? undefined : suggestionFor(detailTarget.row)}
          pricesFor={pricesFor}
          busy={busy}
          onAssigned={handleAssignedFromDetail}
          onDismiss={handleDismissFromDetail}
          onMarkPaid={handleMarkPaidFromDetail}
          onResolve={handleResolveFromDetail}
          onUndo={handleUndoFromDetail}
          onEdit={() => {
            setEditTarget(detailTarget);
            setDetailTarget(null);
          }}
          onSettleUp={
            detailTarget.status === 'outstanding' ? () => settleUpPayeeOf(detailTarget) : undefined
          }
          onLinkWalletPayment={
            detailTarget.status === 'outstanding' && detailTarget.assignment?.payeeId
              ? () => {
                  const payeeId = detailTarget.assignment?.payeeId;
                  if (payeeId) setLinkWalletTarget({ payeeId });
                  setDetailTarget(null);
                }
              : undefined
          }
          onAddPayee={
            payeeManagerDefaultCharacterId !== null
              ? () => setPayeeManagerCharacterId(payeeManagerDefaultCharacterId)
              : undefined
          }
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
          linkedTransactions={detailLinkedTransactions}
          onLinkTransaction={
            detailTarget.status === 'paid'
              ? () => setLinkTransactionTarget(detailTarget)
              : undefined
          }
          onUnlinkTransaction={handleUnlinkTransactionFromDetail}
        />
      )}

      {linkTransactionTarget &&
        assignmentsForLinkTarget(linkTransactionTarget, everyAssignment).length > 0 && (
          <LinkTransactionDialog
            open
            onClose={() => setLinkTransactionTarget(null)}
            candidates={linkTransactionCandidates}
            targetAmount={linkTransactionTargetAmount}
            busy={busy}
            onConfirm={(payment, source) => void handleConfirmLinkTransaction(payment, source)}
          />
        )}

      {splitTarget && splitTarget.assignment && data && (
        <SplitDialog
          open
          onClose={() => setSplitTarget(null)}
          assignment={
            // A needs-review row splits against what ESI reports now, so the
            // growth (the ore the pilot usually wants to move) is on offer.
            splitTarget.assignment.status === 'needs-review'
              ? {
                  ...splitTarget.assignment,
                  oreLines: linesOwnedBy(
                    splitTarget.row.entry.oreLines,
                    splitTarget.row.assignments,
                    splitTarget.assignment.id
                  ),
                }
              : splitTarget.assignment
          }
          row={splitTarget.row}
          systemName={systemName(splitTarget)}
          payees={allPayees}
          typeNames={data.typeNames}
          pricesFor={pricesFor}
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
              ? joinCandidateOverride.map((dr) => ({ row: dr.row, assignment: dr.assignment }))
              : joinCandidatesFor(joinTarget)
          }
          initialSelection={joinCandidateOverride ? 'all' : 'none'}
          payees={allPayees}
          typeNames={data.typeNames}
          pricesFor={pricesFor}
          busy={busy}
          onJoined={handleJoined}
        />
      )}

      {settleUpRows && data && (
        <SettleUpDialog
          open
          onClose={() => setSettleUpRows(null)}
          rows={settleUpRows}
          systemNames={data.systemNames}
          onPaid={() => {
            setSelection(new Set());
            refresh();
          }}
          onPickFromWallet={(() => {
            const payeeIds = [...new Set(settleUpRows.map((r) => r.assignment.payeeId))];
            const only = payeeIds.length === 1 ? payeeIds[0] : undefined;
            if (!only) return undefined;
            // The entries being settled, not the Payee's whole balance.
            const members = settleUpRows.flatMap((r) =>
              allDisplayRows.flatMap(allMembers).filter((m) => m.assignment.id === r.assignment.id)
            );
            return () => {
              setSettleUpRows(null);
              setLinkWalletTarget({ payeeId: only, members });
            };
          })()}
        />
      )}

      {linkWalletPayee && data && (
        <LinkWalletPaymentDialog
          key={linkWalletPayee.id}
          open
          onClose={() => setLinkWalletTarget(null)}
          payee={linkWalletPayee}
          owed={linkWalletOwed}
          candidates={linkWalletCandidates}
          systemNames={data.systemNames}
          onLinked={() => {
            setSelection(new Set());
            refresh();
          }}
        />
      )}

      {linkPaymentOpen && data && linkSuggestions.length > 0 && (
        <LinkPaymentDialog
          open
          onClose={() => setLinkPaymentOpen(false)}
          suggestions={linkSuggestions}
          systemNames={data.systemNames}
          showCharacter={characters.length > 1}
          onLinked={refresh}
        />
      )}

      {bulkDismissOpen && data && (
        <BulkDismissDialog
          open
          onClose={() => setBulkDismissOpen(false)}
          rows={dismissTargets}
          systemNames={data.systemNames}
          estimatedValueOf={estimatedValueOf}
          showCharacter={showCharacterColumn}
          onDismissed={() => {
            setSelection(new Set());
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** A History month's fold row: which month, how many entries, what was paid in it. */
function HistoryMonthHeader({
  month,
  count,
  taxTotal,
}: {
  month: string;
  count: number;
  taxTotal: number;
}) {
  const { t, i18n } = useTranslation();
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-semibold">{label}</span>
      <span className="text-[0.6875rem] text-text-dim tabular-nums">
        {t('miningTax.sections.monthSummary', { count, amount: formatIsk(taxTotal, 0) })}
      </span>
    </span>
  );
}
