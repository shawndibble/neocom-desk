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
import { MarketItemLink } from '@/features/market/MarketItemLink';
import type { MiningTaxAssignmentRecord } from '@/db';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatDateRange } from './groupRows';
import { PaymentLinksCard, type LinkedTransaction } from './PaymentLinksCard';
import { STATUS_TONE } from './statusTone';
import type { MoonMiningTaxRow } from './snapshot';

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
  /** Opens the one edit form for the whole combined entry (`CombinedEditDialog`). */
  onEdit: () => void;
  /** Settles this Payee's whole balance — offered while any day is still owed. */
  onSettleUp?: () => void;
  onMarkAllPaid: () => void;
  /** "Take out of combined": that day keeps its Assignment and becomes its own row. */
  onTakeOut: (member: GroupMember) => void;
  /** "Uncombine all": every day keeps its Assignment and becomes its own row. */
  onUncombine: () => void;
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
  onEdit,
  onSettleUp,
  onMarkAllPaid,
  onTakeOut,
  onUncombine,
  linkedTransactions,
  onLinkTransaction,
  onUnlinkTransaction,
}: GroupSummaryModalProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const sorted = [...members].sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date));
  const dates = sorted.map((m) => m.row.entry.date);
  const totalTaxOwed = members.reduce((sum, m) => sum + m.assignment.taxOwed, 0);
  const totalValue = members.reduce((sum, m) => sum + m.assignment.estimatedValue, 0);
  const anyOutstanding = members.some((m) => m.assignment.status === 'outstanding');
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
          <SecurityValue security={systemSecurity} t={t} />
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
            {sorted.map((member) => (
              <DropdownMenuItem key={member.assignment.id} onSelect={() => onTakeOut(member)}>
                {t('miningTax.combined.takeOut', { date: member.row.entry.date })}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onUncombine}>
              {t('miningTax.combined.uncombineAll')}
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
              summary={
                payment && (
                  <p className="text-xs tabular-nums">
                    {t('miningTax.payment.paidLine', {
                      amount: formatIsk(payment.amount, 0),
                      date: payment.paidOn,
                    })}
                  </p>
                )
              }
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
                      <MarketItemLink typeId={line.typeId}>
                        {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                      </MarketItemLink>
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

        <div className="flex flex-wrap gap-2 pt-1">
          {anyOutstanding && onSettleUp && (
            <Button variant="primary" size="sm" disabled={busy} onClick={onSettleUp}>
              {t('miningTax.settleUpAction')}
            </Button>
          )}
          {anyOutstanding && (
            <Button size="sm" disabled={busy} onClick={onMarkAllPaid}>
              {t('miningTax.markGroupPaidAction')}
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={onEdit}>
            {t('miningTax.combined.edit')}
          </Button>
          <Button size="sm" className="ml-auto" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
