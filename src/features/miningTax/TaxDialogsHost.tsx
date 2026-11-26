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
import { conflictSiblings } from '@/features/miningTax/corpBook/conflictSummary';
import type { ResolveTarget } from '@/features/miningTax/corpBook/resolve/targets';
import { CorpRowDetailModal } from '@/features/miningTax/corpBook/CorpRowDetailModal';
import { isBookRow } from '@/features/miningTax/corpBook/corpRows';
import type { useCorpStateHint } from '@/features/miningTax/corpBook/useCorpStateText';
import { isCorpPayeeId } from '@/features/miningTax/corpBook/corpRows';
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
  allDisplayRows: readonly DisplayRow[];
  characterFiltered: readonly DisplayRow[];
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  /** Every personal Payee's Running account: what Settle up, the ledger and Paid read. */
  accounts: PayeeRunningAccounts;
  /** Every Made Payment linked to a Payee. */
  links: readonly PayeePaymentLink[];
  /** The corporations of the member's Corp Tax Books: a donation to one is the book's. */
  bookCorporations: ReadonlySet<number>;
  /** The active Character: whose Miner a book's ledger opens on. */
  activeCharacterId: number | null;
  /** Every stored Payee record; the pickers list one per recipient (`duplicateAliases`). */
  allPayees: PayeeRecord[];
  /** Duplicate records of one Payee mapped to its primary (`payeeDuplicateAliases`). */
  duplicateAliases: ReadonlyMap<string, string>;
  payeeById: ReadonlyMap<string, PayeeRecord>;
  balances: readonly PayeeBalance[];
  madePayments: readonly MadePayment[];
  paymentSources: readonly MadePaymentSources[];
  linkSuggestions: ReturnType<typeof useLinkSuggestions>;
  corpView: CorpBookView | null;
  /** Something reached a Corp Tax Book (a declaration or a dispute, #6206): read the books again. */
  reloadCorpBooks: () => void;
  /** Opens the Resolve dialog (resolving in the app) on a problem. */
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
  /** A bulk action or payment landed: row keys changed, so the table selection goes. */
  onClearSelection: () => void;
  /** The Add-payee shortcut in the row detail; absent when there is no character to add one for. */
  onAddPayee: (() => void) | undefined;
  /** A short confirmation for a row-menu action that has no dialog to show it in ("Copied"). */
  /** A transient message; with `onUndo` it carries an Undo (DESIGN 6c, Transient messages). */
  onToast: (message: string, onUndo?: () => void) => void;
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
    allDisplayRows,
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
  const [errorTarget, setErrorTarget] = useState(detailTarget);
  // A row-menu action that failed opens its row's detail to say so; that open
  // is a target change too, and must not wipe the message it opened for.
  const [failedMenuRow, setFailedMenuRow] = useState<DisplayRow | null>(null);
  if (errorTarget !== detailTarget) {
    setErrorTarget(detailTarget);
    if (detailTarget !== failedMenuRow) {
      setActionError(null);
      setFailedMenuRow(null);
    }
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
  const pickablePayees = useMemo(
    () => accounts.assignable(allPayees).filter((p) => !duplicateAliases.has(p.id)),
    [allPayees, duplicateAliases, accounts]
  );

  /**
   * The picker list plus the duplicate record an existing Assignment still names: the dialog finds
   * its Payee by id, and a duplicate is otherwise not listed.
   */
  function payeesWithRecordsOf(payeeIds: readonly (string | undefined)[]): PayeeRecord[] {
    // A Payee an existing Assignment names is always found, archived or a book's or not.
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

  /** Settle up from a row: its Payee's balance, paid by the Character who mined it. */
  function settleUpPayeeOf(dr: DisplayRow) {
    const payeeId = dr.assignment?.payeeId;
    if (!payeeId) return;
    const primary = accounts.primaryIdOf(payeeId);
    const balance = balances.find((b) => b.payee.id === primary);
    actions.openDetail(null);
    if (balance && balance.members.length > 0)
      actions.openSettleUp(settleUpRowsFor(balance.members), { payerId: dr.row.characterId });
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
    if (menuRow && !result.ok) {
      // Stale view (already assigned): the reload already ran, so a note is all there is to say.
      if (result.reason === 'already-assigned') return onToast(t('miningTax.saveFailed'));
      setFailedMenuRow(menuRow);
      actions.openDetail(menuRow);
    }
  }

  /** The Assign form's submit, from inside RowDetailModal — same refresh-and-close every other row action takes. */
  function handleAssignedFromDetail() {
    actions.openDetail(null);
    refresh();
  }

  function dismissEntry(dr: DisplayRow, fromMenu = false) {
    void runAndClose(() => dismissRow(dr.row), fromMenu ? dr : undefined);
  }

  /** The detail's "Open ledger": the detail closes and its Payee's ledger opens in its place. */
  function openPayeeLedger() {
    const payeeId = detailTarget?.assignment?.payeeId;
    if (!payeeId) return;
    actions.openDetail(null);
    actions.openLedger({ kind: 'personal', payeeId });
  }

  /**
   * Unlinks a payment from a Payee's ledger, then says so with an Undo that links the same payment
   * to the same Payee again (as it was: amount, day and owner).
   */
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

  /** "Link a payment" for a row: a payment to its Payee, which pays the oldest days. */
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

  // The personal Payees a payment may be linked to (a Corp Tax Book credits itself).
  const linkablePayees = useMemo(
    () => accounts.linkable(allPayees).filter((p) => !isCorpPayeeId(p.id)),
    [accounts, allPayees]
  );
  // Every payment no link holds and no Corp Tax Book counts: whichever Character sent it, since a
  // merged Payee's money can come from any alt.
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

  // Settle up's Payee: one per dialog, its account what it pays.
  const settleUpPayeeId = settleUpRows?.[0]?.assignment.payeeId;
  const settleUpAccount = settleUpPayeeId ? accounts.of(settleUpPayeeId) : undefined;
  const settleUpPayee = settleUpPayeeId
    ? payeeById.get(accounts.primaryIdOf(settleUpPayeeId))
    : undefined;

  // The Payee ledger: a personal Payee's account, or the book Miner of the active Character.
  // A book's ledger is one Miner's: the one picked, else the active Character's, else the first.
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
      // A Payee nothing was billed to has no account: its ledger opens empty.
      // A Payee a book is the authority for opens its old history only (read-only, no balance).
      const account =
        (accounts.isBookOwned(ledgerTarget.payeeId)
          ? accounts.historyOf(ledgerTarget.payeeId)
          : accounts.of(ledgerTarget.payeeId)) ??
        PayeeRunningAccount.build({ payeeId: ledgerTarget.payeeId, charges: [], links: [] });
      const byId = new Map(everyAssignment.map((a) => [a.id, a]));
      return {
        account: account.account,
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
            // A recorded or legacy link names no payer of its own, and no transaction.
            const payer =
              l.kind === 'recorded' || l.kind === 'legacy'
                ? undefined
                : characterNameOf(
                    madePayments.find((m) => m.key === paymentLinkKey(l))?.characterId ?? 0
                  );
            // A legacy link names its old payment's transactions: its entry is the first of them.
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
    // A day the book has not billed yet is listed as it stands now, so today's mining shows.
    const open = openDayCharges(
      allDisplayRows.flatMap((dr) => (dr.corp?.kind === 'row' ? [dr.corp.view] : [])),
      book.loaded.corporationId,
      miner.minerId,
      (id) => systemLabel(systemNames, id)
    );
    return { ...source, charges: [...source.charges, ...open] };
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
  ]);
  const ledgerTitle =
    ledgerTarget?.kind === 'personal'
      ? (payeeById.get(ledgerTarget.payeeId)?.name ?? '')
      : ledgerTarget?.kind === 'book'
        ? (ledgerBook?.payee.name ?? '')
        : '';

  const corpDetail = detailTarget?.corp?.kind === 'row' ? detailTarget.corp : null;
  // The member's own entry for a book day, when one lines up: "Fix my records" opens it to edit.
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
            // The detail is closed first: Resolve is its own dialog, and may send the member back here.
            actions.openDetail(null);
            onResolve(target);
          }}
          {...(ownEntry ? { onFixRecords: () => actions.openDetail(ownEntry) } : {})}
          onOpenLedger={() => {
            actions.openDetail(null);
            actions.openLedger({
              kind: 'book',
              corporationId: corpDetail.view.corporationId,
              ...(corpDetail.view.minerId ? { minerId: corpDetail.view.minerId } : {}),
            });
          }}
          notice={
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
                typeNames={typeNames}
                onChanged={() => {
                  // The take-over rewrote the entry this detail was opened on: close and reload, like every row action.
                  actions.openDetail(null);
                  refresh();
                }}
                onBookChanged={reloadCorpBooks}
                mail={{
                  characterId: corpDetail.view.characterId,
                  memberName: detailTarget.row.characterName,
                  corporationId: corpDetail.view.corporationId,
                  corpName: corpDetail.corpName,
                  contact: corpView?.books.find(
                    (b) => b.loaded.corporationId === corpDetail.view.corporationId
                  )?.loaded.taxContact,
                }}
                onResolve={(target) => {
                  actions.openDetail(null);
                  onResolve(target);
                }}
              />
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
          // Each of the member's Miners' own code: money pays the Miner's oldest day whatever it
          // carries; the code only says whose money it is.
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
            // A failed link shows in its own dialog, open on top of this one.
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
            // A recorded payment, or a contract paid in kind: linked to the Payee, swapped for its
            // wallet transaction once one shows up.
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
            // "I won't pay it": every owed day of this Payee becomes a dismissal.
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
                    // An archived Payee is never linkable (`linkable`), so it is offered none.
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
