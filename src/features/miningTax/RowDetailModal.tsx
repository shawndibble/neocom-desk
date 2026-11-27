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
  LiveNote,
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
import { cx } from '@/lib/cx';
import { AssignDialog } from './AssignDialog';
import { PriceBreakdownCard } from './PriceBreakdownCard';
import { OrePricedCard } from './OrePricedCard';
import { usePriceBreakdown } from './usePriceBreakdown';
import { PayeeLedgerLink } from './PayeeLedgerLink';
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
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  priceSourcesFor?: (
    hubId: string | undefined,
    date: string
  ) => ReadonlyMap<number, TaxPriceSource>;
  payees: readonly PayeeRecord[];
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  unreachableHubs?: ReadonlySet<string>;
  busy: boolean;
  saveError?: string | null;
  onAssigned: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  onResolve: () => void;
  onUndo: () => void;
  onJoin?: () => void;
  onSplit?: () => void;
  onAddPayee?: () => void;
  onOpenLedger?: () => void;
  suggestion?: PayeeSuggestion;
  onSettleUp?: () => void;
  onLinkWalletPayment?: () => void;
  corpNote?: ReactNode;
  startWithUnassignConfirm?: boolean;
}

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
  onOpenLedger,
  suggestion,
  onSettleUp,
  onLinkWalletPayment,
  corpNote,
  startWithUnassignConfirm = false,
}: RowDetailModalProps) {
  const { t } = useTranslation();
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
  const showOreCard = !assigned && !(status === 'unassigned' && oreLines.length > 1);
  const unreportedByType = new Map(
    (assignment ? unreportedClaims(row.entry.oreLines, row.assignments, assignment.id) : []).map(
      (claim) => [claim.typeId, claim]
    )
  );

  const unreportedText = (typeId: number) => {
    const claim = unreportedByType.get(typeId);
    return claim
      ? t('miningTax.detailUnreported', {
          reported: formatCount(claim.reported),
          claimed: formatCount(claim.claimed),
        })
      : undefined;
  };

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
          <LiveNote className="text-xs text-text-dim">
            {t('miningTax.detail.breakdown.copied')}
          </LiveNote>
        )}
        {assigned && assignment && (
          <div className="flex items-baseline justify-between gap-3">
            <PayeeLedgerLink
              name={payeeName}
              className="min-w-0 text-left text-base font-semibold"
              onOpenLedger={payee ? onOpenLedger : undefined}
            />
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
              <Button size="sm" variant="danger" aria-disabled={busy || undefined} onClick={onUndo}>
                {t('miningTax.unassignAction')}
              </Button>
              <Button size="sm" onClick={() => setConfirmUnassign(false)}>
                {t('filters.cancel')}
              </Button>
            </div>
          </div>
        )}

        <LedgerActionError error={saveError} />
        {status === 'dismissed' ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" aria-disabled={busy || undefined} onClick={onUndo}>
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
                <Button size="sm" aria-disabled={busy || undefined} onClick={onDismiss}>
                  {t('miningTax.dismissAction')}
                </Button>
                {onJoin && (
                  <Button size="sm" aria-disabled={busy || undefined} onClick={onJoin}>
                    {t('miningTax.joinAction')}
                  </Button>
                )}
              </>
            }
          />
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {status === 'outstanding' && onSettleUp && (
              <Button variant="primary" aria-disabled={busy || undefined} onClick={onSettleUp}>
                {t('miningTax.settleUpAction')}
              </Button>
            )}
            {status === 'needs-review' && (
              <Button variant="primary" aria-disabled={busy || undefined} onClick={onResolve}>
                {t('miningTax.resolveConfirm')}
              </Button>
            )}
            {status === 'needs-review' && onSplit && (
              <Button aria-disabled={busy || undefined} onClick={onSplit}>
                {t('miningTax.detail.reviewSplitAction')}
              </Button>
            )}
            <div className="flex">
              <Button
                aria-disabled={busy || undefined}
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
