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
import { CorpPayDialog } from '@/features/miningTax/corpBook/CorpPayDialog';
import { CorpRowDetailModal } from '@/features/miningTax/corpBook/CorpRowDetailModal';
import { isBookRow } from '@/features/miningTax/corpBook/corpRows';
import type { useCorpStateHint } from '@/features/miningTax/corpBook/useCorpStateText';
import type { CorpBookView } from '@/features/miningTax/corpBook/corpBookView';
import { allMembers, type DisplayRow, type GroupMember } from '@/features/miningTax/groupRows';
import { GroupSummaryModal } from '@/features/miningTax/GroupSummaryModal';
import {
  acceptNewTotal,
  dismiss,
  linkTransaction,
  settle,
  unassign,
  uncombine,
  unlinkTransaction,
  unsettle,
  type LedgerActionResult,
} from '@/features/miningTax/ledgerActions';
import { buildPriceBreakdown } from '@/features/miningTax/usePriceBreakdown';
import { useMiningTaxCompressedOre } from '@/features/miningTax/oreForm';
import type { RowMenuAction } from '@/features/miningTax/rowMenu';
import { LinkTransactionDialog } from '@/features/miningTax/LinkTransactionDialog';
import { paidOnFromIso } from '@/features/miningTax/madePayments';
import type { LinkedTransaction } from '@/features/miningTax/PaymentLinksCard';
import {
  assignmentsForLinkTarget,
  linkedTransactionsFor,
  unlinkedPayments,
  type MadePayment,
} from '@/features/miningTax/paymentLinks';
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
const LinkWalletPaymentDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/LinkWalletPaymentDialog')).then((m) => ({
    default: m.LinkWalletPaymentDialog,
  }))
);

export interface TaxDialogsHostProps {
  store: TaxDialogStore;
  actions: TaxDialogActions;
  /** The snapshot has loaded; every dialog but the corp pay one waits for it. */
  hasData: boolean;
  typeNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
  datedPrices: DatedUnitPrices;
  unreachableHubs: ReadonlySet<TradeHub['id']> | undefined;
  refresh: () => void;
  loading: boolean;
  /** A `useContinuations` write is running; with a dialog's own action it makes the dialogs `busy`. */
  continuing: boolean;
  characterCount: number;
  allDisplayRows: readonly DisplayRow[];
  characterFiltered: readonly DisplayRow[];
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  allPayees: PayeeRecord[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  balances: readonly PayeeBalance[];
  madePayments: readonly MadePayment[];
  paymentSources: readonly MadePaymentSources[];
  linkSuggestions: ReturnType<typeof useLinkSuggestions>;
  corpView: CorpBookView | null;
  corpStateHint: ReturnType<typeof useCorpStateHint>;
  corpOwedNow: (corporationId: number) => number;
  dismissTargets: DisplayRow[];
  showCharacterColumn: boolean;
  estimatedValueOf: (dr: DisplayRow) => number;
  systemName: (dr: DisplayRow) => string;
  systemSecurityOf: (dr: DisplayRow) => number | undefined;
  payeeDisplayName: (dr: DisplayRow) => string;
  settleUpRowsFor: (members: readonly GroupMember[]) => SettleUpRow[];
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  priceSourcesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, TaxPriceSource>;
  /** A bulk action or payment landed: row keys changed, so the table selection goes. */
  onClearSelection: () => void;
  /** The Add-payee shortcut in the row detail; absent when there is no character to add one for. */
  onAddPayee: (() => void) | undefined;
  /** A short confirmation for a row-menu action that has no dialog to show it in ("Copied"). */
  onToast: (message: string) => void;
}

/**
 * Every Tax tab dialog, mounted at the bottom of the tab. It owns the dialog
 * state (via `useTaxDialogState`), so opening one re-renders this and not the
 * tables beside it; `TaxTab` opens them through the stable `actions`.
 */
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
    characterCount,
    allDisplayRows,
    characterFiltered,
    everyAssignment,
    allPayees,
    payeeById,
    balances,
    madePayments,
    paymentSources,
    linkSuggestions,
    corpView,
    corpStateHint,
    corpOwedNow,
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
    linkTransactionTarget,
    joinTarget,
    splitTarget,
    joinCandidateOverride,
    settleUpRows,
    settleUpStart,
    linkWalletTarget,
    corpPayTarget,
    bulkDismissOpen,
    linkPaymentOpen,
  } = useTaxDialogState(store);

  // Every row action and the Link-transaction confirm run through this, so a
  // failure reads the same as in every dialog: the modal stays open saying
  // nothing was changed (each action is one transaction, so that is true).
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

  // Reset whenever the target changes, not keyed on it: after a failure
  // nothing reloads, so reopening the same row hands back the very same object.
  const [errorTargets, setErrorTargets] = useState({ detailTarget, linkTransactionTarget });
  // A row-menu action that failed opens its row's detail to say so; that open
  // is a target change too, and must not wipe the message it opened for.
  const [failedMenuRow, setFailedMenuRow] = useState<DisplayRow | null>(null);
  if (
    errorTargets.detailTarget !== detailTarget ||
    errorTargets.linkTransactionTarget !== linkTransactionTarget
  ) {
    setErrorTargets({ detailTarget, linkTransactionTarget });
    if (detailTarget !== failedMenuRow) setActionError(null);
  }

  // Settle up's rows, re-read from every load by Assignment id: a recheck
  // while it is open can absorb fresh growth into an Assignment, and paying the
  // copy taken at open would record the old amount over it.
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

  /** Prefill for a new Assignment's Payee: the one last used in that system, by that pilot. */
  function suggestionFor(row: MoonMiningTaxRow) {
    return suggestPayeeForSystem(
      everyAssignment.filter((a) => a.characterId === row.characterId),
      allPayees,
      row.entry.solarSystemId
    );
  }

  /**
   * Settle up from a row: that entry, paid by the Character who mined it. The
   * rest of its Payee balance comes along unticked, to add in if wanted.
   */
  function settleUpPayeeOf(dr: DisplayRow) {
    const payeeId = dr.assignment?.payeeId;
    const balance = balances.find((b) => b.payee.id === payeeId);
    actions.openDetail(null);
    if (balance && balance.members.length > 0)
      actions.openSettleUp(settleUpRowsFor(balance.members), {
        payerId: dr.row.characterId,
        focusIds: new Set(allMembers(dr).map((m) => m.assignment.id)),
      });
  }

  /** "I don't pay tax on this entry" — dismisses the whole unassigned residual in one action, no Payee needed. */
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

  // Every bulk action clears the selection: row keys are an Assignment id or a
  // `character:date:system:unassigned` residual key, and both change the
  // moment the action lands — a surviving selection would point at rows that
  // no longer exist.
  function handleJoined() {
    actions.closeJoin();
    onClearSelection();
    refresh();
  }

  /**
   * Every row action ends the same way: busy while it writes, then close and
   * reload — or, when it wrote nothing, stay open and say so. Run from the row
   * menu (`menuRow`) no detail is open to close or to say so in, so a failure
   * opens that row's detail to carry the message.
   */
  async function runAndClose(
    action: () => Promise<LedgerActionResult<unknown>>,
    menuRow?: DisplayRow
  ) {
    const result = await runRowAction(action, () => {
      if (!menuRow) actions.openDetail(null);
      refresh();
    });
    if (menuRow && !result.ok && result.reason !== 'already-assigned') {
      setFailedMenuRow(menuRow);
      actions.openDetail(menuRow);
    }
  }

  // Each takes the row and whether the row menu (not the detail) is asking.
  function markGroupPaid(dr: DisplayRow, fromMenu = false) {
    const outstanding = allMembers(dr)
      .filter((m) => m.assignment.status === 'outstanding')
      .map((m) => m.assignment);
    if (outstanding.length === 0) return;
    void runAndClose(() => settle(outstanding), fromMenu ? dr : undefined);
  }

  /** The Assign form's submit, from inside RowDetailModal — same refresh-and-close every other row action takes. */
  function handleAssignedFromDetail() {
    actions.openDetail(null);
    refresh();
  }

  function dismissEntry(dr: DisplayRow, fromMenu = false) {
    void runAndClose(() => dismissRow(dr.row), fromMenu ? dr : undefined);
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
      unlinkTransaction(
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
    await runRowAction(
      () =>
        linkTransaction(
          targets,
          payment.kind === 'journal'
            ? { journalRefId: payment.refId }
            : { contractId: payment.refId },
          source,
          {
            paidOn: paidOnFromIso(payment.date),
            method: payment.method,
            amount: payment.amount === null ? 0 : Math.round(payment.amount),
          }
        ),
      () => {
        actions.openLinkTransaction(null);
        actions.openDetail(null);
        refresh();
      }
    );
  }

  function markPaid(dr: DisplayRow, fromMenu = false) {
    const assignment = dr.assignment;
    if (!assignment) return;
    void runAndClose(() => settle([assignment]), fromMenu ? dr : undefined);
  }

  function unmarkPaid(dr: DisplayRow, fromMenu = false) {
    const assignment = dr.assignment;
    if (!assignment) return;
    void runAndClose(() => unsettle([assignment]), fromMenu ? dr : undefined);
  }

  function resolveEntry(dr: DisplayRow, fromMenu = false) {
    const assignment = dr.assignment;
    if (!assignment) return;
    void runAndClose(
      () => acceptNewTotal([{ assignment, row: dr.row }]),
      fromMenu ? dr : undefined
    );
  }

  /** "Undo" on a Dismissed row, "Unassign" on any other assigned one. */
  function unassignEntry(dr: DisplayRow, fromMenu = false) {
    const assignment = dr.assignment;
    if (!assignment) return;
    void runAndClose(() => unassign([assignment]), fromMenu ? dr : undefined);
  }

  /** Taking one day out of a combined entry keeps its Assignment; only the combination goes. */
  function takeOut(member: GroupMember, menuRow?: DisplayRow) {
    void runAndClose(() => uncombine([member.assignment]), menuRow);
  }

  /** "Accept new total" on a combined entry: every day that grew since it was paid. */
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

  /** "Link a wallet payment" for a row: a combined entry's owed days, or its Payee's balance. */
  function linkWalletFor(dr: DisplayRow) {
    const payeeId = dr.assignment?.payeeId;
    if (!payeeId) return;
    actions.linkWalletFromDetail(
      dr.groupMembers
        ? {
            payeeId,
            members: allMembers(dr).filter((m) => m.assignment.status === 'outstanding'),
          }
        : { payeeId }
    );
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
    void writeToClipboard(text);
    onToast(t('miningTax.detail.breakdown.copied'));
  }

  /** The row menu's actions: View details opens the modal, the rest do what its buttons do. */
  function runMenuAction(action: RowMenuAction, dr: DisplayRow) {
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
      case 'markPaid':
        return markPaid(dr, true);
      case 'markGroupPaid':
        return markGroupPaid(dr, true);
      case 'unmarkPaid':
        return unmarkPaid(dr, true);
      case 'linkWallet':
        return linkWalletFor(dr);
      case 'linkTransaction':
        return actions.openLinkTransaction(dr);
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
        if (dr.corp?.kind === 'row') actions.corpPayFromDetail(dr.corp.view.corporationId);
        return;
    }
  }
  useEffect(() => actions.registerRowMenuRunner(runMenuAction));

  const linkWalletPayee = payeeById.get(linkWalletTarget?.payeeId ?? '') ?? null;
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

  const corpDetail = detailTarget?.corp?.kind === 'row' ? detailTarget.corp : null;

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
          // A failed link shows in its own dialog, open on top of this one.
          saveError={linkTransactionTarget ? null : actionError}
          onEdit={() => actions.editFromDetail(detailTarget)}
          onSettleUp={
            detailTarget.status === 'outstanding' ? () => settleUpPayeeOf(detailTarget) : undefined
          }
          startWithUnassignConfirm={detailConfirmUnassign}
          onMarkAllPaid={() => markGroupPaid(detailTarget)}
          onTakeOut={(member) => takeOut(member)}
          onUncombine={() => uncombineAll(detailTarget)}
          onResolve={() => resolveGroup(detailTarget)}
          onUnassignAll={() => unassignGroup(detailTarget)}
          onLinkWalletPayment={() => linkWalletFor(detailTarget)}
          linkedTransactions={groupLinkedTransactions}
          onLinkTransaction={
            allMembers(detailTarget).every((m) => m.assignment.status === 'paid')
              ? () => actions.openLinkTransaction(detailTarget)
              : undefined
          }
          onUnlinkTransaction={handleUnlinkTransactionFromDetail}
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
            payees={allPayees}
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
          onPay={() => actions.corpPayFromDetail(corpDetail.view.corporationId)}
          notice={
            corpDetail.view.overlap && (
              <CorpOverlapNotice
                view={corpDetail.view}
                corpName={corpDetail.corpName}
                everyAssignment={everyAssignment}
                payeeById={payeeById}
                typeNames={typeNames}
                onChanged={refresh}
              />
            )
          }
        />
      )}

      {corpPayTarget !== null &&
        (() => {
          const book = corpView?.books.find((b) => b.loaded.corporationId === corpPayTarget);
          if (!book) return null;
          const codes = [
            ...new Set(
              characterFiltered.flatMap((dr) =>
                dr.corp?.kind === 'row' &&
                dr.corp.view.corporationId === corpPayTarget &&
                dr.corp.view.statementId &&
                dr.status === 'outstanding'
                  ? [dr.corp.view.statementId]
                  : []
              )
            ),
          ].flatMap((id) => {
            const statement = book.loaded.statements.find((s) => s.id === id);
            return statement
              ? [{ code: statement.code, period: `${statement.periodStart.slice(0, 7)}` }]
              : [];
          });
          return (
            <CorpPayDialog
              open
              onClose={() => actions.openCorpPay(null)}
              book={book}
              owed={corpOwedNow(corpPayTarget)}
              statementCodes={codes}
            />
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
            payees={allPayees}
            suggestion={detailTarget.assignment ? undefined : suggestionFor(detailTarget.row)}
            pricesFor={pricesFor}
            unreachableHubs={unreachableHubs}
            busy={busy}
            // A failed link shows in its own dialog, open on top of this one.
            saveError={linkTransactionTarget ? null : actionError}
            startWithUnassignConfirm={detailConfirmUnassign}
            onAssigned={handleAssignedFromDetail}
            onDismiss={() => dismissEntry(detailTarget)}
            onMarkPaid={() => markPaid(detailTarget)}
            onUnmarkPaid={() => unmarkPaid(detailTarget)}
            onResolve={() => resolveEntry(detailTarget)}
            onUndo={() => unassignEntry(detailTarget)}
            onEdit={() => actions.editFromDetail(detailTarget)}
            onSettleUp={
              detailTarget.status === 'outstanding'
                ? () => settleUpPayeeOf(detailTarget)
                : undefined
            }
            onLinkWalletPayment={
              detailTarget.status === 'outstanding' && detailTarget.assignment?.payeeId
                ? () => linkWalletFor(detailTarget)
                : undefined
            }
            onAddPayee={onAddPayee}
            onJoin={() => actions.joinFromDetail(detailTarget)}
            onSplit={
              detailTarget.assignment && !detailTarget.assignment.groupId
                ? () => actions.splitFromDetail(detailTarget)
                : undefined
            }
            linkedTransactions={detailLinkedTransactions}
            onLinkTransaction={
              detailTarget.status === 'paid'
                ? () => actions.openLinkTransaction(detailTarget)
                : undefined
            }
            onUnlinkTransaction={handleUnlinkTransactionFromDetail}
            corpNote={
              detailTarget.corp?.kind === 'label' ? corpStateHint(detailTarget.corp) : undefined
            }
          />
        )}

      {linkTransactionTarget &&
        assignmentsForLinkTarget(linkTransactionTarget, everyAssignment).length > 0 && (
          <LinkTransactionDialog
            open
            onClose={() => actions.openLinkTransaction(null)}
            candidates={linkTransactionCandidates}
            targetAmount={linkTransactionTargetAmount}
            busy={busy}
            saveError={actionError}
            onConfirm={(payment, source) => void handleConfirmLinkTransaction(payment, source)}
          />
        )}

      {splitTarget && splitTarget.assignment && hasData && (
        <Suspense fallback={null}>
          <SplitDialog
            open
            onClose={() => actions.openSplit(null)}
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
            payees={allPayees}
            typeNames={typeNames}
            pricesFor={pricesFor}
            busy={busy}
            onJoined={handleJoined}
          />
        </Suspense>
      )}

      {settleUpRows && hasData && (
        <Suspense fallback={null}>
          <SettleUpDialog
            open
            onClose={() => actions.openSettleUp(null)}
            rows={liveSettleUpRows ?? settleUpRows}
            payerId={settleUpStart.payerId}
            focusIds={settleUpStart.focusIds}
            systemNames={systemNames}
            arrivalCheck={settleUpRecheck}
            onPaid={() => {
              onClearSelection();
              refresh();
            }}
            onPickFromWallet={(() => {
              const payeeIds = [...new Set(settleUpRows.map((r) => r.assignment.payeeId))];
              const only = payeeIds.length === 1 ? payeeIds[0] : undefined;
              if (!only) return undefined;
              return (tickedIds: ReadonlySet<string>) => {
                // The entries ticked to settle, not the Payee's whole balance.
                const members = allDisplayRows
                  .flatMap(allMembers)
                  .filter((m) => tickedIds.has(m.assignment.id));
                actions.openSettleUp(null);
                actions.openLinkWallet({ payeeId: only, members });
              };
            })()}
          />
        </Suspense>
      )}

      {linkWalletPayee && hasData && (
        <Suspense fallback={null}>
          <LinkWalletPaymentDialog
            key={linkWalletPayee.id}
            open
            onClose={() => actions.openLinkWallet(null)}
            payee={linkWalletPayee}
            owed={linkWalletOwed}
            candidates={linkWalletCandidates}
            paymentSources={paymentSources}
            systemNames={systemNames}
            onLinked={() => {
              onClearSelection();
              refresh();
            }}
          />
        </Suspense>
      )}

      {linkPaymentOpen && hasData && linkSuggestions.length > 0 && (
        <Suspense fallback={null}>
          <LinkPaymentDialog
            open
            onClose={() => actions.openLinkPayment(false)}
            suggestions={linkSuggestions}
            systemNames={systemNames}
            showCharacter={characterCount > 1}
            onLinked={refresh}
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
