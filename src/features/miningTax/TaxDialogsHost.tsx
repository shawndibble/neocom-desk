import { soloCharacterId } from '../../../functions/src/corpTaxBookDonationMatch';
import { lockDateFor } from '../../../functions/src/corpTaxBookCheckpoint';
import { utcDay } from '@/engine/localDay';
import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react';
import { writeToClipboard } from '@/lib/clipboard';
import { guarded } from '@/app/routeChunks';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { TaxPriceSource } from '@/engine/miningTax/priceBasis';
import type { TradeHub } from '@/market/hubs';
import { linesOwnedBy } from '@/engine/miningTax/ownership';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import type { PayeeBalance } from '@/features/miningTax/balances';
import { BulkDismissDialog } from '@/features/miningTax/BulkDismissDialog';
import { CorpOverlapNotice } from '@/features/miningTax/corpBook/CorpOverlapNotice';
import {
  ClosedDayConflictNotice,
  type ConflictNames,
} from '@/features/miningTax/corpBook/ClosedDayConflict';
import { CorpDisputeAction } from '@/features/miningTax/corpBook/CorpDisputeAction';
import { closedConflictFor } from '@/features/miningTax/corpBook/closedConflicts';
import { conflictTarget } from '@/features/miningTax/corpBook/resolve/targets';
import { resolvesOn } from '@/features/miningTax/corpBook/useCorpStateText';
import type { ClosedDayPlan } from '@/engine/corpTaxBook/closedDayFix';
import { conflictSiblings } from '@/features/miningTax/corpBook/conflictSummary';
import type { ResolveTarget } from '@/features/miningTax/corpBook/resolve/targets';
import { CorpRowDetailModal } from '@/features/miningTax/corpBook/CorpRowDetailModal';
import { isBookRow } from '@/features/miningTax/corpBook/corpRows';
import type { useCorpStateHint } from '@/features/miningTax/corpBook/useCorpStateText';
import { isCorpPayeeId, ownEntryRowOf } from '@/features/miningTax/corpBook/corpRows';
import type { CorpBookView } from '@/features/miningTax/corpBook/corpBookView';
import { minerPayCodes } from '@/features/miningTax/corpBook/minerPayCodes';
import { allMembers, type DisplayRow, type GroupMember } from '@/features/miningTax/groupRows';
import { GroupSummaryModal } from '@/features/miningTax/GroupSummaryModal';
import {
  acceptNewTotal,
  dismiss,
  dismissOwed,
  linkPayment,
  unassign,
  uncombine,
  unlinkPayments,
  type LedgerActionResult,
} from '@/features/miningTax/ledgerActions';
import { buildPriceBreakdown } from '@/features/miningTax/usePriceBreakdown';
import { useMiningTaxCompressedOre } from '@/features/miningTax/oreForm';
import type { RowMenuAction } from '@/features/miningTax/rowMenu';
import {
  linkablePayments,
  unlinkedSentFor,
  type MadePayment,
} from '@/features/miningTax/paymentLinks';
import {
  paymentLinkKey,
  linkAt,
  PayeeRunningAccount,
  type PayeePaymentLink,
  heldPaymentKeys,
  isBareMark,
} from '@/engine/miningTax/payeeRunningAccount';
import { formatIsk } from '@/lib/isk';
import type { LedgerCharge, LedgerPayment } from '@/engine/miningTax/payeeLedger';
import type { PayeeRunningAccounts } from '@/features/miningTax/payeeRunningAccounts';
import { buildSettleUpReason } from '@/features/miningTax/groupRows';
import { systemLabel } from '@/features/miningTax/names';
import { madePaymentHref } from '@/features/miningTax/madePaymentHref';
import { minerLedgerSource, openDayCharges } from '@/engine/corpTaxBook/minerLedgerSource';
import {
  recordChangesForBook,
  recordChangesForPayee,
  type RecordChange,
} from '@/engine/miningTax/recordChanges';
import { minerIdFor } from '@/engine/corpTaxBook/charges';
import { pricesAtHubOnDate, type DatedUnitPrices } from '@/features/miningTax/pricing';
import { RowDetailModal } from '@/features/miningTax/RowDetailModal';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import type { MadePaymentSources } from '@/features/miningTax/madePayments';
import type { useLinkSuggestions } from '@/features/miningTax/useMadePayments';
import { suggestPayeeForSystem } from '@/features/miningTax/suggestPayee';
import type { MoonMiningTaxRow } from '@/features/miningTax/snapshot';
import { useLedgerAction } from '@/features/miningTax/useLedgerAction';
import { useSettleUpRecheck } from '@/features/miningTax/useSettleUpRecheck';
import {
  useTaxDialogState,
  type TaxDialogActions,
  type TaxDialogStore,
} from '@/features/miningTax/useTaxDialogs';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/ui';

const LinkPaymentDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/LinkPaymentDialog')).then((m) => ({
    default: m.LinkPaymentDialog,
  }))
);
const SettleUpDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/SettleUpDialog')).then((m) => ({
    default: m.SettleUpDialog,
  }))
);
const CorpPayDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/corpBook/CorpPayDialog')).then((m) => ({
    default: m.CorpPayDialog,
  }))
);
const JoinAssignDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/JoinAssignDialog')).then((m) => ({
    default: m.JoinAssignDialog,
  }))
);
const SplitDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/SplitDialog')).then((m) => ({
    default: m.SplitDialog,
  }))
);
const EntryEditDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/EntryEditDialog')).then((m) => ({
    default: m.EntryEditDialog,
  }))
);
const PayeeLedgerPanel = lazy(() =>
  guarded(() => import('@/features/miningTax/ledger/PayeeLedgerPanel')).then((m) => ({
    default: m.PayeeLedgerPanel,
  }))
);

export interface TaxDialogsHostProps {
  store: TaxDialogStore;
  actions: TaxDialogActions;
  hasData: boolean;
  typeNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
  datedPrices: DatedUnitPrices;
  unreachableHubs: ReadonlySet<TradeHub['id']> | undefined;
  refresh: () => void;
  loading: boolean;
  continuing: boolean;
  allDisplayRows: readonly DisplayRow[];
  entries: readonly MoonMiningTaxRow[];
  characterFiltered: readonly DisplayRow[];
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  accounts: PayeeRunningAccounts;
  links: readonly PayeePaymentLink[];
  bookCorporations: ReadonlySet<number>;
  activeCharacterId: number | null;
  allPayees: PayeeRecord[];
  duplicateAliases: ReadonlyMap<string, string>;
  payeeById: ReadonlyMap<string, PayeeRecord>;
  balances: readonly PayeeBalance[];
  madePayments: readonly MadePayment[];
  paymentSources: readonly MadePaymentSources[];
  linkSuggestions: ReturnType<typeof useLinkSuggestions>;
  corpView: CorpBookView | null;
  recordChanges: readonly RecordChange[];
  closedConflicts: readonly ClosedDayPlan[];
  conflictNames: ConflictNames;
  onFixRecords: (plan: ClosedDayPlan) => Promise<void>;
  reloadCorpBooks: () => void;
  onResolve: (target: ResolveTarget) => void;
  corpStateHint: ReturnType<typeof useCorpStateHint>;
  dismissTargets: DisplayRow[];
  showCharacterColumn: boolean;
  estimatedValueOf: (dr: DisplayRow) => number;
  systemName: (dr: DisplayRow) => string;
  systemSecurityOf: (dr: DisplayRow) => number | undefined;
  payeeDisplayName: (dr: DisplayRow) => string;
  settleUpRowsFor: (members: readonly GroupMember[]) => SettleUpRow[];
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  priceSourcesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, TaxPriceSource>;
  onClearSelection: () => void;
  onAddPayee: (() => void) | undefined;
  onToast: (message: string, onUndo?: () => void) => void;
}

export const TaxDialogsHost = memo(function TaxDialogsHost(props: TaxDialogsHostProps) {
  const {
    store,
    actions,
    hasData,
    typeNames,
    systemNames,
    datedPrices,
    unreachableHubs,
    refresh,
    loading,
    continuing,
    allDisplayRows,
    entries,
    characterFiltered,
    everyAssignment,
    accounts,
    links,
    bookCorporations,
    activeCharacterId,
    allPayees,
    duplicateAliases,
    payeeById,
    balances,
    madePayments,
    paymentSources,
    linkSuggestions,
    corpView,
    recordChanges,
    closedConflicts,
    conflictNames,
    onFixRecords,
    reloadCorpBooks,
    onResolve,
    corpStateHint,
    dismissTargets,
    showCharacterColumn,
    estimatedValueOf,
    systemName,
    systemSecurityOf,
    payeeDisplayName,
    settleUpRowsFor,
    pricesFor,
    priceSourcesFor,
    onClearSelection,
    onAddPayee,
    onToast,
  } = props;
  const { t } = useTranslation();
  const {
    detailTarget,
    detailConfirmUnassign,
    editTarget,
    joinTarget,
    splitTarget,
    joinCandidateOverride,
    settleUpRows,
    settleUpStart,
    linkPaymentTarget,
    corpPayTarget,
    corpPayFocus,
    ledgerTarget,
    bulkDismissOpen,
  } = useTaxDialogState(store);

  const {
    pending: acting,
    error: actionError,
    setError: setActionError,
    run: runRowAction,
  } = useLedgerAction();
  useEffect(() => {
    actions.setActing(acting);
  }, [actions, acting]);
  const busy = continuing || acting;

  const [errorTarget, setErrorTarget] = useState(detailTarget);
  const [failedMenuRow, setFailedMenuRow] = useState<DisplayRow | null>(null);
  if (errorTarget !== detailTarget) {
    setErrorTarget(detailTarget);
    if (detailTarget !== failedMenuRow) {
      setActionError(null);
      setFailedMenuRow(null);
    }
  }

  const liveSettleUpRows = useMemo(() => {
    if (!settleUpRows) return null;
    const current = new Map(
      allDisplayRows.flatMap(allMembers).map((m) => [m.assignment.id, m.assignment])
    );
    return settleUpRows.map((r) => ({
      ...r,
      assignment: current.get(r.assignment.id) ?? r.assignment,
    }));
  }, [settleUpRows, allDisplayRows]);

  const settleUpRecheck = useSettleUpRecheck({
    dates: settleUpRows?.map((r) => r.assignment.date) ?? null,
    refresh,
    loading,
  });

  const pickablePayees = useMemo(
    () => accounts.assignable(allPayees).filter((p) => !duplicateAliases.has(p.id)),
    [allPayees, duplicateAliases, accounts]
  );

  function payeesWithRecordsOf(payeeIds: readonly (string | undefined)[]): PayeeRecord[] {
    const extra = payeeIds.flatMap((id) =>
      id !== undefined &&
      (duplicateAliases.has(id) || accounts.isArchived(id) || accounts.isBookOwned(id))
        ? (payeeById.get(id) ?? [])
        : []
    );
    return extra.length > 0 ? [...pickablePayees, ...new Set(extra)] : pickablePayees;
  }

  function suggestionFor(row: MoonMiningTaxRow) {
    return suggestPayeeForSystem(
      everyAssignment.filter((a) => a.characterId === row.characterId),
      accounts.assignable(allPayees),
      row.entry.solarSystemId,
      row.characterId,
      duplicateAliases
    );
  }

  function settleUpPayeeOf(dr: DisplayRow) {
    const payeeId = dr.assignment?.payeeId;
    if (!payeeId) return;
    const primary = accounts.primaryIdOf(payeeId);
    const balance = balances.find((b) => b.payee.id === primary);
    actions.openDetail(null);
    if (balance && balance.members.length > 0)
      actions.openSettleUp(settleUpRowsFor(balance.members), { payerId: dr.row.characterId });
  }

  function dismissRow(row: MoonMiningTaxRow) {
    const { estimatedValue } = computeAssignmentValue(
      row.unassignedOreLines,
      pricesAtHubOnDate(datedPrices, undefined, row.entry.date),
      0
    );
    return dismiss([
      {
        characterId: row.characterId,
        date: row.entry.date,
        solarSystemId: row.entry.solarSystemId,
        oreLines: row.unassignedOreLines,
        estimatedValue,
      },
    ]);
  }

  function joinCandidatesFor(primary: DisplayRow) {
    return allDisplayRows
      .filter((dr) => dr.key !== primary.key)
      .filter((dr) => !dr.groupMembers)
      .filter((dr) => !isBookRow(dr))
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
    actions.closeJoin();
    onClearSelection();
    refresh();
  }

  async function runAndClose(
    action: () => Promise<LedgerActionResult<unknown>>,
    menuRow?: DisplayRow
  ) {
    const result = await runRowAction(action, () => {
      if (!menuRow) actions.openDetail(null);
      refresh();
    });
    if (menuRow && !result.ok) {
      if (result.reason === 'already-assigned') return onToast(t('miningTax.saveFailed'));
      setFailedMenuRow(menuRow);
      actions.openDetail(menuRow);
    }
  }

  function handleAssignedFromDetail() {
    actions.openDetail(null);
    refresh();
  }

  function dismissEntry(dr: DisplayRow, fromMenu = false) {
    void runAndClose(() => dismissRow(dr.row), fromMenu ? dr : undefined);
  }

  function openPayeeLedger() {
    const payeeId = detailTarget?.assignment?.payeeId;
    if (!payeeId) return;
    actions.openDetail(null);
    actions.openLedger({ kind: 'personal', payeeId });
  }

  function unlinkPayment(key: string) {
    const was = links.find((l) => paymentLinkKey(l) === key);
    void runAndClose(async () => {
      const result = await unlinkPayments([key]);
      if (result.ok && was) {
        const { characterId } = was;
        onToast(
          t('miningTax.ledger.unlinkedToast', { amount: formatIsk(was.amount, 0) }),
          characterId === undefined
            ? undefined
            : () => {
                void linkPayment(was, characterId).then(() => refresh());
              }
        );
      }
      return result;
    });
  }

  function resolveEntry(dr: DisplayRow, fromMenu = false) {
    const assignment = dr.assignment;
    if (!assignment) return;
    void runAndClose(
      () => acceptNewTotal([{ assignment, row: dr.row }]),
      fromMenu ? dr : undefined
    );
  }

  function unassignEntry(dr: DisplayRow, fromMenu = false) {
    const assignment = dr.assignment;
    if (!assignment) return;
    void runAndClose(() => unassign([assignment]), fromMenu ? dr : undefined);
  }

  function takeOut(member: GroupMember, menuRow?: DisplayRow) {
    void runAndClose(() => uncombine([member.assignment]), menuRow);
  }

  function resolveGroup(dr: DisplayRow, fromMenu = false) {
    const grown = allMembers(dr).filter((m) => m.assignment.status === 'needs-review');
    void runAndClose(() => acceptNewTotal(grown), fromMenu ? dr : undefined);
  }

  function unassignGroup(dr: DisplayRow, fromMenu = false) {
    const members = allMembers(dr).map((m) => m.assignment);
    void runAndClose(() => unassign(members), fromMenu ? dr : undefined);
  }

  function uncombineAll(dr: DisplayRow, fromMenu = false) {
    const members = allMembers(dr).map((m) => m.assignment);
    void runAndClose(() => uncombine(members), fromMenu ? dr : undefined);
  }

  function linkWalletFor(dr: DisplayRow) {
    const payeeId = dr.assignment?.payeeId;
    if (!payeeId) return;
    actions.linkPaymentFromDetail({ payeeId: accounts.primaryIdOf(payeeId) });
  }

  function copyBreakdown(dr: DisplayRow) {
    const assignment = dr.assignment;
    if (!assignment) return;
    const { text } = buildPriceBreakdown(
      {
        assignment,
        payee: payeeById.get(assignment.payeeId ?? ''),
        systemName: systemName(dr),
        typeNames,
        pricesFor,
        priceSourcesFor,
      },
      t,
      useMiningTaxCompressedOre.getState().value
    );
    writeToClipboard(text).then(
      () => onToast(t('miningTax.detail.breakdown.copied')),
      () => onToast(t('miningTax.detail.breakdown.copyFailed'))
    );
  }

  function estimateOwnRow(dr: DisplayRow | null): DisplayRow | undefined {
    if (dr?.corp?.kind !== 'row' || dr.corp.view.state !== 'estimate' || !corpView)
      return undefined;
    return ownEntryRowOf(entries, corpView.overlay, dr.corp.view);
  }

  function runMenuAction(action: RowMenuAction, row: DisplayRow) {
    const editing = action.id === 'edit' || action.id === 'split';
    const own = editing ? estimateOwnRow(row) : undefined;
    if (editing && row.corp?.kind === 'row' && !own) return;
    if (action.id === 'split' && own?.assignment?.groupId) return;
    const dr = own ?? row;
    const grouped = dr.groupMembers !== undefined;
    switch (action.id) {
      case 'view':
        return actions.openDetail(dr);
      case 'edit':
        return actions.editFromDetail(dr);
      case 'settleUp':
        return settleUpPayeeOf(dr);
      case 'resolve':
        return grouped ? resolveGroup(dr, true) : resolveEntry(dr, true);
      case 'reviewSplit':
      case 'split':
        return actions.splitFromDetail(dr);
      case 'linkWallet':
        return linkWalletFor(dr);
      case 'join':
        return actions.joinFromDetail(dr);
      case 'copyBreakdown':
        return copyBreakdown(dr);
      case 'dismiss':
        return dismissEntry(dr, true);
      case 'undismiss':
        return unassignEntry(dr, true);
      case 'takeOut':
        return takeOut(action.member, dr);
      case 'uncombine':
        return uncombineAll(dr, true);
      case 'unassign':
        return actions.confirmUnassignFor(dr);
      case 'corpPay':
        if (dr.corp?.kind === 'row')
          actions.corpPayFromDetail(dr.corp.view.corporationId, {
            rowId: dr.corp.view.id,
            characterId: dr.corp.view.characterId,
          });
        return;
    }
  }
  useEffect(() => actions.registerRowMenuRunner(runMenuAction));

  const linkablePayees = useMemo(
    () => accounts.linkable(allPayees).filter((p) => !isCorpPayeeId(p.id)),
    [accounts, allPayees]
  );
  const linkCandidates = useMemo(
    () =>
      linkablePayments(madePayments, {
        linked: heldPaymentKeys(links),
        bookCorporations,
      }),
    [madePayments, links, bookCorporations]
  );
  const trackedCharacters = useMemo(
    () => [
      ...new Map(
        allDisplayRows.map((dr) => [
          dr.row.characterId,
          { characterId: dr.row.characterId, characterName: dr.row.characterName },
        ])
      ).values(),
    ],
    [allDisplayRows]
  );
  const characterNameOf = (id: number) =>
    trackedCharacters.find((c) => c.characterId === id)?.characterName;

  const settleUpPayeeId = settleUpRows?.[0]?.assignment.payeeId;
  const settleUpAccount = settleUpPayeeId ? accounts.of(settleUpPayeeId) : undefined;
  const settleUpPayee = settleUpPayeeId
    ? payeeById.get(accounts.primaryIdOf(settleUpPayeeId))
    : undefined;

  const ledgerBook =
    ledgerTarget?.kind === 'book'
      ? corpView?.books.find((b) => b.loaded.corporationId === ledgerTarget.corporationId)
      : undefined;
  const ledgerMiners = ledgerBook?.summary.miners ?? [];
  const ledgerMinerId = (() => {
    if (!ledgerBook || ledgerTarget?.kind !== 'book') return undefined;
    const own =
      activeCharacterId === null
        ? undefined
        : minerIdFor(activeCharacterId, ledgerBook.loaded.miners);
    const ids = ledgerMiners.map((m) => m.minerId);
    return [ledgerTarget.minerId, own].find((id) => id !== undefined && ids.includes(id)) ?? ids[0];
  })();
  const minerName = (minerId: string) => {
    const main = ledgerBook?.loaded.miners.find((m) => m.id === minerId)?.mainCharacterId;
    const id = main ?? soloCharacterId(minerId);
    return (id === undefined ? undefined : characterNameOf(id)) ?? minerId;
  };
  const ledgerPicker =
    ledgerBook && ledgerMiners.length > 1 && ledgerMinerId !== undefined ? (
      <SegmentedControl
        label={t('miningTax.ledger.minerPicker')}
        options={ledgerMiners.map((m) => ({ value: m.minerId, label: minerName(m.minerId) }))}
        value={ledgerMinerId}
        onChange={(minerId) =>
          actions.openLedger({
            kind: 'book',
            corporationId: ledgerBook.loaded.corporationId,
            minerId,
          })
        }
        uppercase={false}
      />
    ) : null;
  const ledgerSource = useMemo(() => {
    if (!ledgerTarget) return null;
    if (ledgerTarget.kind === 'personal') {
      const account =
        (accounts.isBookOwned(ledgerTarget.payeeId)
          ? accounts.historyOf(ledgerTarget.payeeId)
          : accounts.of(ledgerTarget.payeeId)) ??
        PayeeRunningAccount.build({ payeeId: ledgerTarget.payeeId, charges: [], links: [] });
      const byId = new Map(everyAssignment.map((a) => [a.id, a]));
      const primary = accounts.primaryIdOf(ledgerTarget.payeeId);
      return {
        account: account.account,
        recordChanges: recordChangesForPayee(
          recordChanges,
          (id) => accounts.primaryIdOf(id) === primary
        ),
        charges: account.charges.map((c): LedgerCharge => {
          const a = byId.get(c.id);
          const place = a ? systemLabel(systemNames, a.solarSystemId) : undefined;
          return {
            id: c.id,
            date: c.date,
            kind: 'mined',
            tax: c.tax,
            ...(place ? { place } : {}),
            ...(a ? { ore: a.oreLines } : {}),
          };
        }),
        marked: account.marked.flatMap((m) => {
          const l = account.links.find((x) => paymentLinkKey(x) === m.id);
          return l ? [{ id: m.id, at: linkAt(l), date: m.date, amount: m.amount }] : [];
        }),
        payments: account.links
          .filter((l) => !isBareMark(l))
          .map((l): LedgerPayment => {
            const payer =
              l.kind === 'recorded' || l.kind === 'legacy'
                ? undefined
                : characterNameOf(
                    madePayments.find((m) => m.key === paymentLinkKey(l))?.characterId ?? 0
                  );
            const href = madePaymentHref(l.refs?.[0] ?? l);
            return {
              id: paymentLinkKey(l),
              at: linkAt(l),
              via: l.kind,
              amount: l.amount,
              to: payeeById.get(accounts.primaryIdOf(ledgerTarget.payeeId))?.name ?? '',
              ...(payer ? { from: payer } : {}),
              ...(href ? { href } : {}),
            };
          }),
      };
    }
    const book = ledgerBook;
    if (!book) return null;
    const miner = book.summary.miners.find((m) => m.minerId === ledgerMinerId);
    if (!miner) return null;
    const source = minerLedgerSource(miner, book.loaded, {
      character: characterNameOf,
      place: (l) =>
        l.structureId === undefined ? undefined : book.loaded.structureNames?.[l.structureId],
    });
    const open = openDayCharges(
      allDisplayRows.flatMap((dr) => (dr.corp?.kind === 'row' ? [dr.corp.view] : [])),
      book.loaded.corporationId,
      miner.minerId,
      (id) => systemLabel(systemNames, id)
    );
    return {
      ...source,
      charges: [...source.charges, ...open],
      recordChanges: recordChangesForBook(recordChanges, book.loaded.corporationId, miner.minerId),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- characterNameOf reads trackedCharacters
  }, [
    ledgerTarget,
    accounts,
    everyAssignment,
    systemNames,
    madePayments,
    ledgerBook,
    ledgerMinerId,
    trackedCharacters,
    allDisplayRows,
    recordChanges,
  ]);
  const ledgerTitle =
    ledgerTarget?.kind === 'personal'
      ? (payeeById.get(ledgerTarget.payeeId)?.name ?? '')
      : ledgerTarget?.kind === 'book'
        ? (ledgerBook?.payee.name ?? '')
        : '';

  const corpDetail = detailTarget?.corp?.kind === 'row' ? detailTarget.corp : null;
  const closedConflict = corpDetail
    ? closedConflictFor(closedConflicts, corpDetail.view)
    : undefined;
  const closedPayees = (closedConflict?.fixes ?? [])
    .filter((f) => f.corporationId === undefined)
    .map((f) => conflictNames.payee(f.payeeId))
    .join(', ');
  const detailMail = (detail: NonNullable<typeof corpDetail>, target: DisplayRow) => ({
    characterId: detail.view.characterId,
    memberName: target.row.characterName,
    corporationId: detail.view.corporationId,
    corpName: detail.corpName,
    contact: corpView?.books.find((b) => b.loaded.corporationId === detail.view.corporationId)
      ?.loaded.taxContact,
  });
  const estimateOwn = estimateOwnRow(detailTarget);
  const ownEntry = corpDetail
    ? allDisplayRows.find(
        (dr) =>
          dr.corp?.kind !== 'row' &&
          dr.row.characterId === corpDetail.view.characterId &&
          dr.row.entry.date === corpDetail.view.date &&
          dr.row.entry.solarSystemId === corpDetail.view.solarSystemId
      )
    : undefined;

  return (
    <>
      {detailTarget && hasData && detailTarget.groupMembers && (
        <GroupSummaryModal
          open={detailTarget !== null}
          onClose={() => actions.openDetail(null)}
          members={allMembers(detailTarget)}
          systemName={systemName(detailTarget)}
          systemSecurity={systemSecurityOf(detailTarget)}
          typeNames={typeNames}
          payeeDisplayName={payeeDisplayName(detailTarget)}
          busy={busy}
          saveError={actionError}
          onEdit={() => actions.editFromDetail(detailTarget)}
          onSettleUp={
            detailTarget.status === 'outstanding' ? () => settleUpPayeeOf(detailTarget) : undefined
          }
          startWithUnassignConfirm={detailConfirmUnassign}
          onTakeOut={(member) => takeOut(member)}
          onUncombine={() => uncombineAll(detailTarget)}
          onResolve={() => resolveGroup(detailTarget)}
          onUnassignAll={() => unassignGroup(detailTarget)}
          onLinkWalletPayment={() => linkWalletFor(detailTarget)}
          onOpenLedger={openPayeeLedger}
        />
      )}

      {editTarget && hasData && (
        <Suspense fallback={null}>
          <EntryEditDialog
            open
            onClose={() => actions.openEdit(null)}
            members={allMembers(editTarget)}
            systemName={systemName(editTarget)}
            systemSecurity={systemSecurityOf(editTarget)}
            payees={payeesWithRecordsOf(allMembers(editTarget).map((m) => m.assignment.payeeId))}
            assignments={everyAssignment}
            typeNames={typeNames}
            pricesFor={pricesFor}
            onSaved={() => {
              actions.openEdit(null);
              refresh();
            }}
          />
        </Suspense>
      )}

      {detailTarget && hasData && corpDetail && (
        <CorpRowDetailModal
          open
          onClose={() => actions.openDetail(null)}
          dr={detailTarget}
          corp={corpDetail}
          book={corpView?.books.find(
            (b) => b.loaded.corporationId === corpDetail.view.corporationId
          )}
          systemName={systemName(detailTarget)}
          systemSecurity={systemSecurityOf(detailTarget)}
          typeNames={typeNames}
          onPay={() =>
            actions.corpPayFromDetail(corpDetail.view.corporationId, {
              rowId: corpDetail.view.id,
              characterId: corpDetail.view.characterId,
            })
          }
          onResolve={(target) => {
            actions.openDetail(null);
            onResolve(target);
          }}
          {...(ownEntry ? { onFixRecords: () => actions.openDetail(ownEntry) } : {})}
          {...(estimateOwn
            ? {
                onEdit: () => actions.editFromDetail(estimateOwn),
                ...(estimateOwn.assignment && !estimateOwn.assignment.groupId
                  ? { onSplit: () => actions.splitFromDetail(estimateOwn) }
                  : {}),
              }
            : {})}
          onOpenLedger={() => {
            actions.openDetail(null);
            actions.openLedger({
              kind: 'book',
              corporationId: corpDetail.view.corporationId,
              ...(corpDetail.view.minerId ? { minerId: corpDetail.view.minerId } : {}),
            });
          }}
          {...(closedConflict ? { closedConflict } : {})}
          notice={
            closedConflict ? (
              <ClosedDayConflictNotice
                plan={closedConflict}
                names={conflictNames}
                {...(corpDetail.view.state === 'conflict' && corpDetail.view.resolvesAt
                  ? {
                      countsFrom: t('miningTax.corpBook.conflict.countsFrom', {
                        corp: corpDetail.corpName,
                        date: resolvesOn(corpDetail.view.resolvesAt),
                      }),
                    }
                  : {})}
                onFix={() => {
                  actions.openDetail(null);
                  void onFixRecords(closedConflict);
                }}
                onResolve={() => {
                  actions.openDetail(null);
                  onResolve(conflictTarget(corpDetail.view, closedPayees, closedConflict));
                }}
                {...(corpDetail.view.state === 'conflict' && {
                  tell: (
                    <CorpDisputeAction
                      view={corpDetail.view}
                      payeeName={closedPayees}
                      onSent={reloadCorpBooks}
                      mail={detailMail(corpDetail, detailTarget)}
                    />
                  ),
                })}
              />
            ) : (
              (corpDetail.view.overlap || corpDetail.view.state === 'conflict') && (
                <CorpOverlapNotice
                  view={corpDetail.view}
                  corpName={corpDetail.corpName}
                  recordedAt={corpDetail.view.refineryLabel ?? systemName(detailTarget)}
                  siblings={
                    corpView ? conflictSiblings(corpView.overlay.rows, corpDetail.view) : undefined
                  }
                  everyAssignment={everyAssignment}
                  payeeById={payeeById}
                  onBookChanged={reloadCorpBooks}
                  mail={detailMail(corpDetail, detailTarget)}
                  onResolve={(target) => {
                    actions.openDetail(null);
                    onResolve(target);
                  }}
                />
              )
            )
          }
        />
      )}

      {corpPayTarget !== null &&
        (() => {
          const book = corpView?.books.find((b) => b.loaded.corporationId === corpPayTarget);
          if (!book) return null;
          const owedRows = characterFiltered.filter(
            (dr) =>
              dr.corp?.kind === 'row' &&
              dr.corp.view.corporationId === corpPayTarget &&
              dr.status === 'outstanding'
          );
          const codes = minerPayCodes(book, characterNameOf);
          return (
            <Suspense fallback={null}>
              <CorpPayDialog
                onClose={() => actions.openCorpPay(null)}
                onPaid={refresh}
                book={book}
                rows={owedRows}
                codes={codes}
                focus={corpPayFocus ?? undefined}
              />
            </Suspense>
          );
        })()}

      {detailTarget &&
        hasData &&
        !detailTarget.groupMembers &&
        detailTarget.corp?.kind !== 'row' && (
          <RowDetailModal
            open={detailTarget !== null}
            onClose={() => actions.openDetail(null)}
            row={detailTarget.row}
            assignment={detailTarget.assignment}
            status={detailTarget.status}
            systemName={systemName(detailTarget)}
            systemSecurity={systemSecurityOf(detailTarget)}
            priceSourcesFor={priceSourcesFor}
            typeNames={typeNames}
            payees={payeesWithRecordsOf([detailTarget.assignment?.payeeId])}
            suggestion={detailTarget.assignment ? undefined : suggestionFor(detailTarget.row)}
            pricesFor={pricesFor}
            unreachableHubs={unreachableHubs}
            busy={busy}
            saveError={actionError}
            startWithUnassignConfirm={detailConfirmUnassign}
            onAssigned={handleAssignedFromDetail}
            onDismiss={() => dismissEntry(detailTarget)}
            onResolve={() => resolveEntry(detailTarget)}
            onUndo={() => unassignEntry(detailTarget)}
            onEdit={() => actions.editFromDetail(detailTarget)}
            onSettleUp={
              detailTarget.status === 'outstanding'
                ? () => settleUpPayeeOf(detailTarget)
                : undefined
            }
            onLinkWalletPayment={
              detailTarget.assignment?.payeeId ? () => linkWalletFor(detailTarget) : undefined
            }
            onAddPayee={onAddPayee}
            onJoin={() => actions.joinFromDetail(detailTarget)}
            onSplit={
              detailTarget.assignment && !detailTarget.assignment.groupId
                ? () => actions.splitFromDetail(detailTarget)
                : undefined
            }
            onOpenLedger={openPayeeLedger}
            corpNote={
              detailTarget.corp?.kind === 'label' ? corpStateHint(detailTarget.corp) : undefined
            }
          />
        )}

      {splitTarget && splitTarget.assignment && hasData && (
        <Suspense fallback={null}>
          <SplitDialog
            open
            onClose={() => actions.openSplit(null)}
            assignment={
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
            payees={payeesWithRecordsOf([splitTarget.assignment.payeeId])}
            assignments={everyAssignment}
            typeNames={typeNames}
            pricesFor={pricesFor}
            busy={busy}
            onSplit={() => {
              actions.openSplit(null);
              refresh();
            }}
          />
        </Suspense>
      )}

      {joinTarget && hasData && (
        <Suspense fallback={null}>
          <JoinAssignDialog
            open={joinTarget !== null}
            onClose={actions.closeJoin}
            primary={{ row: joinTarget.row, assignment: joinTarget.assignment }}
            candidates={
              joinCandidateOverride
                ? joinCandidateOverride.map((dr) => ({ row: dr.row, assignment: dr.assignment }))
                : joinCandidatesFor(joinTarget)
            }
            initialSelection={joinCandidateOverride ? 'all' : 'none'}
            payees={payeesWithRecordsOf([
              joinTarget.assignment?.payeeId,
              ...(joinCandidateOverride ?? joinCandidatesFor(joinTarget)).map(
                (c) => c.assignment?.payeeId
              ),
            ])}
            typeNames={typeNames}
            pricesFor={pricesFor}
            busy={busy}
            onJoined={handleJoined}
          />
        </Suspense>
      )}

      {settleUpRows && hasData && settleUpAccount && settleUpPayee && (
        <Suspense fallback={null}>
          <SettleUpDialog
            open
            onClose={() => actions.openSettleUp(null)}
            rows={liveSettleUpRows ?? settleUpRows}
            {...(settleUpStart.payerId !== undefined ? { payerId: settleUpStart.payerId } : {})}
            arrivalCheck={settleUpRecheck}
            unlinked={unlinkedSentFor(linkSuggestions, settleUpPayee.id)}
            owedFor={() => settleUpAccount.owes?.amount ?? 0}
            preview={(amount, paidOn) => settleUpAccount.preview(amount, paidOn)}
            reason={buildSettleUpReason(
              t('miningTax.settleUpReasonPrefix'),
              [
                ...new Set(
                  settleUpRows.map((r) => systemLabel(systemNames, r.assignment.solarSystemId))
                ),
              ],
              settleUpRows.map((r) => r.assignment.date).sort()
            )}
            record={(payment) =>
              linkPayment(
                {
                  payeeId: settleUpPayee.id,
                  ...(payment.contractId !== undefined
                    ? { kind: 'contract' as const, refId: payment.contractId }
                    : { kind: 'recorded' as const, refId: crypto.randomUUID() }),
                  amount: payment.amount,
                  paidOn: payment.paidOn,
                  source: 'manual',
                },
                payment.payerId ?? settleUpPayee.characterId
              )
            }
            onDismissBalance={() =>
              dismissOwed((liveSettleUpRows ?? settleUpRows).map((r) => r.assignment))
            }
            onPaid={() => {
              onClearSelection();
              refresh();
            }}
            onPickFromWallet={() => {
              actions.openSettleUp(null);
              actions.openLinkPayment({ payeeId: settleUpPayee.id });
            }}
          />
        </Suspense>
      )}

      {linkPaymentTarget && hasData && (
        <Suspense fallback={null}>
          <LinkPaymentDialog
            key={linkPaymentTarget.payeeId ?? 'all'}
            open
            onClose={() => actions.openLinkPayment(null)}
            {...(linkPaymentTarget.payeeId !== undefined
              ? { scopeId: accounts.primaryIdOf(linkPaymentTarget.payeeId) }
              : {})}
            payees={linkablePayees}
            suggestions={linkSuggestions}
            candidates={linkCandidates}
            accountOf={(id) => accounts.of(id)}
            characters={trackedCharacters}
            paymentSources={paymentSources}
            onLinked={() => {
              onClearSelection();
              refresh();
            }}
          />
        </Suspense>
      )}

      {ledgerTarget && (
        <Suspense fallback={null}>
          <PayeeLedgerPanel
            open
            onClose={() => actions.openLedger(null)}
            payeeName={ledgerTitle}
            source={ledgerSource}
            typeNames={typeNames}
            {...(ledgerPicker ? { picker: ledgerPicker } : {})}
            {...(ledgerTarget.kind === 'book'
              ? { lockDate: lockDateFor(utcDay()) }
              : accounts.isBookOwned(ledgerTarget.payeeId)
                ? { history: true }
                : {
                    onUnlinkPayment: unlinkPayment,
                    ...(accounts.isArchived(ledgerTarget.payeeId)
                      ? {}
                      : {
                          onLinkWalletPayment: () => {
                            const payeeId = ledgerTarget.payeeId;
                            actions.openLedger(null);
                            actions.openLinkPayment({ payeeId });
                          },
                        }),
                  })}
          />
        </Suspense>
      )}

      {bulkDismissOpen && hasData && (
        <BulkDismissDialog
          open
          onClose={() => actions.openBulkDismiss(false)}
          rows={dismissTargets}
          systemNames={systemNames}
          estimatedValueOf={estimatedValueOf}
          showCharacter={showCharacterColumn}
          onDismissed={() => {
            onClearSelection();
            refresh();
          }}
        />
      )}
    </>
  );
});
