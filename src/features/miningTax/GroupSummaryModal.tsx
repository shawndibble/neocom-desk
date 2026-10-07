import { useState } from 'react';
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
import { SecurityValue } from '@/features/character/assetBrowserRows';
import type { MiningTaxAssignmentRecord } from '@/db';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatDateRange } from './groupRows';
import { PaymentLinksCard, type LinkedTransaction } from './PaymentLinksCard';
import { STATUS_TONE } from './statusTone';
import type { MoonMiningTaxRow } from './snapshot';
import { LedgerActionError } from './LedgerActionError';

export interface GroupMember {
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord;
}

interface GroupSummaryModalProps {
  open: boolean;
  onClose: () => void;
  /** 2+ Assignments combined into one obligation (issue #523), earliest date first. */
  members: readonly GroupMember[];
  systemName: string;
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  payeeDisplayName: string;
  busy: boolean;
  /** Why the last row action wrote nothing, shown until the next one — `useLedgerAction`'s message. */
  saveError?: string | null;
  /** Opens the one edit form for the whole combined entry (`EntryEditDialog`). */
  onEdit: () => void;
  /** Settles this Payee's whole balance — offered while any day is still owed. */
  onSettleUp?: () => void;
  onMarkAllPaid: () => void;
  /** "Take out of combined": that day keeps its Assignment and becomes its own row. */
  onTakeOut: (member: GroupMember) => void;
  /** "Uncombine all": every day keeps its Assignment and becomes its own row. */
  onUncombine: () => void;
  /** Accepts the new ore total on every day that grew since it was paid. */
  onResolve: () => void;
  /** Opens "Link a wallet payment" for this entry's owed days. */
  onLinkWalletPayment?: () => void;
  /** Deletes every day's Assignment — asked first. */
  onUnassignAll: () => void;
  /**
   * Every linked transaction across the whole group's members, deduplicated
   * — present only once every member is Paid. Absent entirely (rather than
   * an empty list) when there is nothing to show, so the section renders
   * nothing.
   */
  linkedTransactions?: readonly LinkedTransaction[];
  /** Opens the manual "Link transaction" picker, scoped to every member of this group at once — offered whenever the whole group is Paid. */
  onLinkTransaction?: () => void;
  onUnlinkTransaction?: (transaction: LinkedTransaction) => void;
}

/**
 * A combined entry (mockup F1, scope decision 20261004): one obligation, with
 * each EVE day still shown on its own — its own ore, and its own value → tax
 * line — because a session that ran past midnight UTC is one bill but two
 * ledger days. One Edit for the whole entry (the per-day Edit buttons made
 * a pilot correct the same session twice); the rarer moves — take a day out,
 * uncombine — sit in the More menu.
 */
export function GroupSummaryModal({
  open,
  onClose,
  members,
  systemName,
  systemSecurity,
  typeNames,
  payeeDisplayName,
  busy,
  saveError,
  onEdit,
  onSettleUp,
  onMarkAllPaid,
  onTakeOut,
  onUncombine,
  onResolve,
  onLinkWalletPayment,
  onUnassignAll,
  linkedTransactions,
  onLinkTransaction,
  onUnlinkTransaction,
}: GroupSummaryModalProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const sorted = [...members].sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date));
  const dates = sorted.map((m) => m.row.entry.date);
  const totalTaxOwed = members.reduce((sum, m) => sum + m.assignment.taxOwed, 0);
  const totalValue = members.reduce((sum, m) => sum + m.assignment.estimatedValue, 0);
  const anyOutstanding = members.some((m) => m.assignment.status === 'outstanding');
  const anyGrown = members.some((m) => m.assignment.status === 'needs-review');
  const allPaid = members.every((m) => m.assignment.status === 'paid');
  const taxPct = members[0]?.assignment.taxPct;
  const payment = members.find((m) => m.assignment.payment)?.assignment.payment;

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement={isPhone ? 'sheet' : 'center'}
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.detailTitle', { date: formatDateRange(dates), system: systemName })}
          <SecurityValue security={systemSecurity} />
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('miningTax.dateColumn') })}
            content={t('miningTax.dateEveHint')}
          />
        </span>
      }
      titleActions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="plain"
              icon={<Icon.More />}
              label={t('miningTax.combined.moreLabel')}
              disabled={busy}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {anyOutstanding && onLinkWalletPayment && (
              <>
                <DropdownMenuItem onSelect={onLinkWalletPayment}>
                  {t('miningTax.detail.linkWalletPayment')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {sorted.map((member) => (
              <DropdownMenuItem key={member.assignment.id} onSelect={() => onTakeOut(member)}>
                {t('miningTax.combined.takeOut', { date: member.row.entry.date })}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onUncombine}>
              {t('miningTax.combined.uncombineAll')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setConfirmUnassign(true)} className="text-danger">
              {t('miningTax.combined.unassignAll')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-text-dim">
            {payeeDisplayName}
            {taxPct !== undefined && ` · ${taxPct}%`}
            {' · '}
            {t('miningTax.combined.days', { count: members.length })}
          </span>
          <span className="shrink-0 text-xl font-medium tabular-nums">
            {formatIsk(totalTaxOwed)} ISK
          </span>
        </div>

        {allPaid &&
          (payment ||
            onLinkTransaction ||
            (linkedTransactions && linkedTransactions.length > 0)) && (
            <PaymentLinksCard
              linkedTransactions={linkedTransactions}
              onLinkTransaction={onLinkTransaction}
              onUnlinkTransaction={onUnlinkTransaction}
              busy={busy}
              paid={payment}
            />
          )}

        <ul className="space-y-2">
          {sorted.map((member) => (
            <li key={member.assignment.id} className="rounded-xs border border-line bg-panel-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
                <span className="font-semibold">{member.row.entry.date}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-text-dim tabular-nums">
                    {formatIsk(member.assignment.estimatedValue)} →{' '}
                    {formatIsk(member.assignment.taxOwed)} ISK
                  </span>
                  {member.assignment.status !== 'paid' && (
                    <StatChip
                      label={t('miningTax.statusColumn')}
                      value={t(`miningTax.status.${STATUS_LABEL_KEY[member.assignment.status]}`)}
                      tone={STATUS_TONE[member.assignment.status]}
                    />
                  )}
                </span>
              </div>
              <ul className="divide-y divide-line px-2 text-xs">
                {member.assignment.oreLines.map((line) => (
                  <li key={line.typeId} className="flex items-center justify-between py-1">
                    <span className="min-w-0 truncate">
                      <OreLink typeId={line.typeId}>
                        {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                      </OreLink>
                    </span>
                    <span className="tabular-nums text-text-dim">
                      {line.quantity.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className="text-[0.6875rem] text-text-dim">
          {t('miningTax.groupTotalValueLabel', { value: `${formatIsk(totalValue)} ISK` })}
        </p>

        {confirmUnassign && (
          <div
            role="alert"
            className="space-y-2 rounded-xs border border-danger/60 bg-danger/10 p-2 text-xs"
          >
            <p>{t('miningTax.combined.unassignConfirm', { count: members.length })}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" disabled={busy} onClick={onUnassignAll}>
                {t('miningTax.unassignAction')}
              </Button>
              <Button size="sm" onClick={() => setConfirmUnassign(false)}>
                {t('filters.cancel')}
              </Button>
            </div>
          </div>
        )}

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          {anyGrown ? (
            <Button variant="primary" disabled={busy} onClick={onResolve}>
              {t('miningTax.resolveConfirm')}
            </Button>
          ) : (
            anyOutstanding &&
            onSettleUp && (
              <Button variant="primary" disabled={busy} onClick={onSettleUp}>
                {t('miningTax.settleUpAction')}
              </Button>
            )
          )}
          {anyOutstanding && (
            <Button disabled={busy} onClick={onMarkAllPaid}>
              {t('miningTax.markGroupPaidAction')}
            </Button>
          )}
          <Button disabled={busy} onClick={onEdit}>
            {t('miningTax.combined.edit')}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
