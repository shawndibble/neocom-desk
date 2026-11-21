import { useState, type ReactNode } from 'react';
import { NOTICE_MS, useTimedToast } from '@/components/ui/useTimedToast';
import { writeToClipboard } from '@/lib/clipboard';
import { OreLink } from './OreIcon';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  InfoTooltip,
  Modal,
  StatChip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SecurityValue } from '@/features/assets/assetBrowserRows';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import type { TaxPriceSource } from '@/engine/miningTax/priceBasis';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { unreportedClaims } from '@/engine/miningTax/ownership';
import { CharacterLink, SystemLink } from '@/features/entities';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate } from '@/lib/localDate';
import { useIsPhone } from '@/lib/useIsPhone';
import { cx } from '@/lib/cx';
import { AssignDialog } from './AssignDialog';
import { PriceBreakdownCard } from './PriceBreakdownCard';
import { OrePricedCard } from './OrePricedCard';
import { usePriceBreakdown } from './usePriceBreakdown';
import { PaymentLinksCard, type PaidByLink } from './PaymentLinksCard';
import { StatusPill } from './StatusPill';
import type { MoonMiningTaxRow } from './snapshot';
import type { PayeeSuggestion } from './suggestPayee';
import { LedgerActionError } from './LedgerActionError';
import { labelWithoutSystem } from './assignmentLabel';
import { formatCount } from '@/lib/formatCount';

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord | null;
  status: MiningTaxRowStatus;
  systemName: string;
  /** Undefined while still resolving, null when unresolvable — `SecurityValue` renders nothing either way. */
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  /** Which price tier produced each `pricesFor` number — feeds the price breakdown. */
  priceSourcesFor?: (
    hubId: string | undefined,
    date: string
  ) => ReadonlyMap<number, TaxPriceSource>;
  payees: readonly PayeeRecord[];
  /**
   * Prices at a given Payee's hub on a given date, forwarded to
   * `AssignDialog`, which resolves its own from whichever Payee is selected.
   * This modal's own read-only valuation of an entry with *no* Assignment
   * (and so no Payee to name a hub) calls it with `undefined`/`row.entry.date`
   * — the default hub, at the day this ore was actually mined.
   */
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  /** Hubs whose price source could not be reached — see `AssignDialog.unreachableHubs`. */
  unreachableHubs?: ReadonlySet<string>;
  busy: boolean;
  /** Why the last row action wrote nothing, shown until the next one — `useLedgerAction`'s message. */
  saveError?: string | null;
  /** A new Assignment from the Assign form lands here — refresh and close, same as every other action below. */
  onAssigned: () => void;
  /** Opens `EntryEditDialog` for this entry — the same edit form a combined entry uses, owed or paid. */
  onEdit: () => void;
  onDismiss: () => void;
  onResolve: () => void;
  /** Deletes the Assignment outright — "Undo" on a Dismissed row, "Unassign" on any other assigned one, so a wrong Payee or a mis-split can always be taken back to Unassigned. */
  onUndo: () => void;
  /** Opens `JoinAssignDialog` to fold another same-system entry into this one (issue #523) — offered only for Unassigned/Outstanding rows that aren't already part of a joined group. */
  onJoin?: () => void;
  /** Opens `SplitDialog` to move part of this day's ore to a second Payee — offered for Outstanding/Paid/Needs-review rows that aren't part of a joined group. */
  onSplit?: () => void;
  /** Opens the Payee manager over this modal when the pilot has no Payees yet. */
  onAddPayee?: () => void;
  /**
   * The linked payments whose money reached this entry's day, off its Payee's account. Absent
   * while nothing reached it, so the section renders nothing.
   */
  paidBy?: readonly PaidByLink[];
  /** Unlinks one of `paidBy`. */
  onUnlinkPayment?: (key: string) => void;
  /** The Payee to pre-select for an unassigned entry — see `AssignDialog.suggestion`. */
  suggestion?: PayeeSuggestion;
  /** Settles this entry's whole Payee balance — the usual next step for an owed entry. */
  onSettleUp?: () => void;
  /** Opens "Link a wallet payment" for this entry's Payee, for ISK already sent. */
  onLinkWalletPayment?: () => void;
  /** What a Corp Tax Book says about this entry (pending record, unattributed), shown under the status line (#4065). */
  corpNote?: ReactNode;
  /** Opens with the "unassign this entry?" question showing — the row menu's Unassign. */
  startWithUnassignConfirm?: boolean;
  /** A row dated before it is read-only (decision 20261120-235011, "a lock date"). */
  lockDate?: string;
}

/** Stand-in so the breakdown hook can run for a row with no assignment (its text is never used). */
function placeholderAssignment(row: MoonMiningTaxRow): MiningTaxAssignmentRecord {
  return {
    id: '',
    characterId: row.characterId,
    date: row.entry.date,
    solarSystemId: row.entry.solarSystemId,
    oreLines: row.unassignedOreLines,
    taxPct: 0,
    estimatedValue: 0,
    taxOwed: 0,
    status: 'dismissed',
    updatedAt: 0,
  };
}

/**
 * Row detail (issue #523, reworked by scope decision 20261004 — mockup F4).
 * An unassigned entry opens straight into the Assign form, with the Payee
 * last used in its system pre-selected. An assigned one opens as a summary —
 * who it's owed to, how much, what was mined — with one main action for its
 * status (Settle up when owed, Accept new total when grown) and Edit, which
 * opens the same `EntryEditDialog` a combined entry uses. Everything rarer
 * (split, combine, link a payment, unassign) lives in the chevron attached to
 * the Edit button (a split button), and Unassign asks first: it deletes the Assignment.
 */
export function RowDetailModal({
  open,
  onClose,
  row,
  assignment,
  status,
  systemName,
  systemSecurity,
  typeNames,
  priceSourcesFor,
  payees,
  pricesFor,
  unreachableHubs,
  busy,
  saveError,
  onAssigned,
  onEdit,
  onDismiss,
  onResolve,
  onUndo,
  onJoin,
  onSplit,
  onAddPayee,
  paidBy,
  onUnlinkPayment,
  suggestion,
  onSettleUp,
  onLinkWalletPayment,
  corpNote,
  startWithUnassignConfirm = false,
  lockDate,
}: RowDetailModalProps) {
  const locked = lockDate !== undefined && row.entry.date < lockDate;
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [confirmUnassign, setConfirmUnassign] = useState(startWithUnassignConfirm);
  const [copied, setCopied] = useState<{ at: number } | null>(null);
  useTimedToast(copied, () => setCopied(null), NOTICE_MS);
  const oreLines = assignment ? assignment.oreLines : row.unassignedOreLines;
  const estimatedValue = assignment
    ? assignment.estimatedValue
    : computeAssignmentValue(oreLines, pricesFor(undefined, row.entry.date), 0).estimatedValue;
  const payee = payees.find((p) => p.id === assignment?.payeeId);
  const payeeName = payee?.name ?? t('miningTax.unknownPayee');
  const assigned = assignment !== null && status !== 'dismissed';
  // The Assign form already lists the ore (with split checkboxes) when it is
  // creating across more than one line — showing it again above would be
  // pure duplication.
  const showOreCard = !assigned && !(status === 'unassigned' && oreLines.length > 1);
  // A split side that claimed the client's figure ahead of ESI (issue #6180)
  // shows how much of it the ledger has caught up with.
  const unreportedByType = new Map(
    (assignment ? unreportedClaims(row.entry.oreLines, row.assignments, assignment.id) : []).map(
      (claim) => [claim.typeId, claim]
    )
  );

  // What a split side's amount column says when ESI hasn't caught up with its claim.
  const unreportedText = (typeId: number) => {
    const claim = unreportedByType.get(typeId);
    return claim
      ? t('miningTax.detailUnreported', {
          reported: formatCount(claim.reported),
          claimed: formatCount(claim.claimed),
        })
      : undefined;
  };

  // The breakdown card only shows for an assigned row; hooks can't be
  // conditional, so the one that builds its copy text takes a placeholder
  // assignment otherwise and the item is simply not offered.
  const breakdownCopy = usePriceBreakdown({
    assignment: assignment ?? placeholderAssignment(row),
    payee,
    systemName,
    typeNames,
    pricesFor,
    priceSourcesFor,
  });

  const moreItems = [
    onLinkWalletPayment && (status === 'outstanding' || status === 'paid') && (
      <DropdownMenuItem key="wallet" onSelect={onLinkWalletPayment}>
        {t('miningTax.detail.linkWalletPayment')}
      </DropdownMenuItem>
    ),
    onJoin && status === 'outstanding' && (
      <DropdownMenuItem key="join" onSelect={onJoin}>
        {t('miningTax.joinAction')}
      </DropdownMenuItem>
    ),
    onSplit && (status === 'outstanding' || status === 'paid') && (
      <DropdownMenuItem key="split" onSelect={onSplit}>
        {t('miningTax.detail.splitAction')}
      </DropdownMenuItem>
    ),
  ].filter(Boolean);

  const moreMenu = assigned && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.Expanded />}
          label={t('miningTax.detail.moreLabel')}
          disabled={busy}
          className="-ml-px rounded-l-none"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {moreItems}
        {moreItems.length > 0 && <DropdownMenuSeparator />}
        {assignment && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                void writeToClipboard(breakdownCopy.text);
                setCopied({ at: Date.now() });
              }}
            >
              {t('miningTax.detail.breakdown.copy')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => setConfirmUnassign(true)} className="text-danger">
          {t('miningTax.detail.unassignAction')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissOnOutsidePress={status !== 'unassigned'}
      placement={isPhone ? 'sheet' : 'center'}
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.detailTitle', { date: row.entry.date, system: systemName })}
          <SecurityValue security={systemSecurity} />
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('miningTax.dateColumn') })}
            content={t('miningTax.dateEveHint')}
          />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        {copied && (
          <p role="status" className="text-xs text-text-dim">
            {t('miningTax.detail.breakdown.copied')}
          </p>
        )}
        {/* Who it's owed to and how much lead, the same way the combined
            view does; the pilot and the paperwork sit on the line below. */}
        {assigned && assignment && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-base font-semibold">{payeeName}</span>
            <span
              className={cx(
                'shrink-0 text-xl font-medium tabular-nums',
                status === 'outstanding' && 'text-isk-neg'
              )}
            >
              {formatIsk(assignment.taxOwed)} ISK
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-dim">
          <span>
            <CharacterLink id={row.characterId}>{row.characterName}</CharacterLink>
            {' · '}
            <SystemLink systemId={row.entry.solarSystemId}>{systemName}</SystemLink>
            {assigned && assignment && (
              <>
                {' · '}
                {assignment.taxPct}%{' · '}
                {assignment.label && `${labelWithoutSystem(assignment.label, systemName)} · `}
                {t('miningTax.detail.valueLine', { value: formatIsk(estimatedValue) })}
              </>
            )}
            {assignment?.paidAt !== undefined &&
              ` · ${t('miningTax.paidAtLabel')} ${formatLocalDate(new Date(assignment.paidAt))}`}
          </span>
          <StatusPill status={status} label={t(`miningTax.status.${STATUS_LABEL_KEY[status]}`)} />
        </div>

        {corpNote && (
          <p className="rounded-xs border border-line p-2 text-xs text-text-dim">{corpNote}</p>
        )}

        {status === 'dismissed' && (
          <div className="flex flex-wrap gap-2">
            <StatChip
              label={t('miningTax.estimatedValueColumn')}
              value={`${formatIsk(estimatedValue)} ISK`}
            />
          </div>
        )}

        {showOreCard && (
          <OrePricedCard
            title={t('miningTax.oreColumn')}
            lines={oreLines.map((line) => ({
              typeId: line.typeId,
              name: typeNames.get(line.typeId) ?? `#${line.typeId}`,
              quantity: unreportedText(line.typeId) ?? formatCount(line.quantity),
            }))}
          />
        )}

        {assigned && assignment && (
          <PriceBreakdownCard
            assignment={assignment}
            payee={payee}
            systemName={systemName}
            typeNames={typeNames}
            pricesFor={pricesFor}
            priceSourcesFor={priceSourcesFor}
            quantityFor={unreportedText}
          />
        )}

        {paidBy && paidBy.length > 0 && (
          <PaymentLinksCard
            paidBy={paidBy}
            {...(onUnlinkPayment && !locked ? { onUnlink: onUnlinkPayment } : {})}
            busy={busy}
          />
        )}

        {assignment && row.duplicateAssignmentIds?.includes(assignment.id) && (
          <p
            role="alert"
            className="rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs text-text-dim"
          >
            {t('miningTax.duplicateRowHint')}
          </p>
        )}

        {status === 'needs-review' && assignment?.reviewDiff && (
          <div className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs">
            <p className="font-semibold text-warning uppercase">{t('miningTax.resolveTitle')}</p>
            <p className="text-text-dim">{t('miningTax.resolveHint')}</p>
            <ul className="space-y-1">
              {assignment.reviewDiff.map((diff) => (
                <li key={diff.typeId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <OreLink typeId={diff.typeId}>
                      {typeNames.get(diff.typeId) ?? `#${diff.typeId}`}
                    </OreLink>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatCount(diff.before)} → {formatCount(diff.after)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {confirmUnassign && (
          <div
            role="alert"
            className="space-y-2 rounded-xs border border-danger/60 bg-danger/10 p-2 text-xs"
          >
            <p>{t('miningTax.detail.unassignConfirm', { payee: payeeName })}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" disabled={busy} onClick={onUndo}>
                {t('miningTax.unassignAction')}
              </Button>
              <Button size="sm" onClick={() => setConfirmUnassign(false)}>
                {t('filters.cancel')}
              </Button>
            </div>
          </div>
        )}

        <LedgerActionError error={saveError} />
        {locked ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <p className="text-xs text-text-dim">
              {t('miningTax.detail.locked', { date: lockDate })}
            </p>
            <Button className="ml-auto" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        ) : status === 'dismissed' ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={onUndo}>
              {t('miningTax.undismissAction')}
            </Button>
            <Button size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        ) : status === 'unassigned' ? (
          <AssignDialog
            row={row}
            payees={payees}
            systemName={systemName}
            typeNames={typeNames}
            pricesFor={pricesFor}
            unreachableHubs={unreachableHubs}
            busy={busy}
            onAssigned={onAssigned}
            onCancel={onClose}
            onAddPayee={onAddPayee}
            suggestion={suggestion}
            extraActions={
              <>
                <Button size="sm" disabled={busy} onClick={onDismiss}>
                  {t('miningTax.dismissAction')}
                </Button>
                {onJoin && (
                  <Button size="sm" disabled={busy} onClick={onJoin}>
                    {t('miningTax.joinAction')}
                  </Button>
                )}
              </>
            }
          />
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {status === 'outstanding' && onSettleUp && (
              <Button variant="primary" disabled={busy} onClick={onSettleUp}>
                {t('miningTax.settleUpAction')}
              </Button>
            )}
            {status === 'needs-review' && (
              <Button variant="primary" disabled={busy} onClick={onResolve}>
                {t('miningTax.resolveConfirm')}
              </Button>
            )}
            {status === 'needs-review' && onSplit && (
              <Button disabled={busy} onClick={onSplit}>
                {t('miningTax.detail.reviewSplitAction')}
              </Button>
            )}
            <div className="flex">
              <Button
                disabled={busy}
                onClick={onEdit}
                className={moreMenu ? 'rounded-r-none' : undefined}
              >
                {t('miningTax.detail.editAction')}
              </Button>
              {moreMenu}
            </div>
            <Button className="ml-auto" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
