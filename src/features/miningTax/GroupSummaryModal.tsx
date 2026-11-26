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
import { SecurityValue } from '@/features/assets/assetBrowserRows';
import type { MiningTaxAssignmentRecord } from '@/db';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatDateRange } from './groupRows';
import { PayeeLedgerLink } from './PayeeLedgerLink';
import { STATUS_TONE } from './statusTone';
import type { MoonMiningTaxRow } from './snapshot';
import { LedgerActionError } from './LedgerActionError';
import { formatCount } from '@/lib/formatCount';

export interface GroupMember {
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord;
}

interface GroupSummaryModalProps {
  open: boolean;
  onClose: () => void;
  members: readonly GroupMember[];
  systemName: string;
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  payeeDisplayName: string;
  busy: boolean;
  saveError?: string | null;
  onEdit: () => void;
  onSettleUp?: () => void;
  onTakeOut: (member: GroupMember) => void;
  onUncombine: () => void;
  onResolve: () => void;
  onLinkWalletPayment?: () => void;
  onUnassignAll: () => void;
  onOpenLedger?: () => void;
  startWithUnassignConfirm?: boolean;
}

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
  onTakeOut,
  onUncombine,
  onResolve,
  onLinkWalletPayment,
  onUnassignAll,
  onOpenLedger,
  startWithUnassignConfirm = false,
}: GroupSummaryModalProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [confirmUnassign, setConfirmUnassign] = useState(startWithUnassignConfirm);
  const sorted = [...members].sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date));
  const dates = sorted.map((m) => m.row.entry.date);
  const totalTaxOwed = members.reduce((sum, m) => sum + m.assignment.taxOwed, 0);
  const totalValue = members.reduce((sum, m) => sum + m.assignment.estimatedValue, 0);
  const anyOutstanding = members.some((m) => m.assignment.status === 'outstanding');
  const anyGrown = members.some((m) => m.assignment.status === 'needs-review');
  const taxPct = members[0]?.assignment.taxPct;

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.Expanded />}
          label={t('miningTax.combined.moreLabel')}
          disabled={busy}
          className="-ml-px rounded-l-none"
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
  );

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
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-text-dim">
            <PayeeLedgerLink name={payeeDisplayName} onOpenLedger={onOpenLedger} />
            {taxPct !== undefined && ` · ${taxPct}%`}
            {' · '}
            {t('miningTax.combined.days', { count: members.length })}
          </span>
          <span className="shrink-0 text-xl font-medium tabular-nums">
            {formatIsk(totalTaxOwed)} ISK
          </span>
        </div>

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
                    <span className="tabular-nums text-text-dim">{formatCount(line.quantity)}</span>
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
              <Button
                size="sm"
                variant="danger"
                aria-disabled={busy || undefined}
                onClick={onUnassignAll}
              >
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
            <Button variant="primary" aria-disabled={busy || undefined} onClick={onResolve}>
              {t('miningTax.resolveConfirm')}
            </Button>
          ) : (
            anyOutstanding &&
            onSettleUp && (
              <Button variant="primary" aria-disabled={busy || undefined} onClick={onSettleUp}>
                {t('miningTax.settleUpAction')}
              </Button>
            )
          )}
          <div className="flex">
            <Button aria-disabled={busy || undefined} onClick={onEdit} className="rounded-r-none">
              {t('miningTax.combined.edit')}
            </Button>
            {moreMenu}
          </div>
          <Button className="ml-auto" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
