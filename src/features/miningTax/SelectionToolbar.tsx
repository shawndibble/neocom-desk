import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { CombineEligibility } from './selection';

interface SelectionToolbarProps {
  selectedCount: number;
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  settleUpCount: number;
  onSettleUp: () => void;
  combine: CombineEligibility;
  onCombine: () => void;
  dismissCount: number;
  onDismiss: () => void;
  linkPaymentBlockedReason?: string | null;
  onLinkPayment?: () => void;
}

interface ToolbarAction {
  id: string;
  label: string;
  primary?: boolean;
  blockedReason: string | null;
  describedOnly?: boolean;
  onRun: () => void;
}

const REASON_PRIORITY: string[] = ['combine', 'dismiss', 'select-all'];

export function SelectionToolbar({
  selectedCount,
  canSelectAll,
  onSelectAll,
  onClear,
  settleUpCount,
  onSettleUp,
  combine,
  onCombine,
  dismissCount,
  onDismiss,
  linkPaymentBlockedReason = null,
  onLinkPayment,
}: SelectionToolbarProps) {
  const { t } = useTranslation();
  const idBase = useId();
  if (selectedCount === 0) return null;

  const selectAll: ToolbarAction = {
    id: 'select-all',
    label: t('miningTax.selectAllAction'),
    blockedReason: canSelectAll ? null : t('miningTax.selectAllBlockedHint'),
    onRun: onSelectAll,
  };

  const bulkActions: ToolbarAction[] = [
    {
      id: 'settle-up',
      label: t('miningTax.settleUpSelectedAction', { count: settleUpCount }),
      primary: true,
      blockedReason: settleUpCount === 0 ? t('miningTax.settleUpBlockedHint') : null,
      describedOnly: true,
      onRun: onSettleUp,
    },
    ...(onLinkPayment
      ? [
          {
            id: 'link-payment',
            label: t('miningTax.linkPaymentSelectedAction'),
            blockedReason: linkPaymentBlockedReason,
            describedOnly: true,
            onRun: onLinkPayment,
          },
        ]
      : []),
    {
      id: 'combine',
      label: t('miningTax.combineSelectedAction', { count: selectedCount }),
      blockedReason: combine.ok ? null : t(`miningTax.combineBlocked.${combine.reason}`),
      onRun: onCombine,
    },
    {
      id: 'dismiss',
      label: t('miningTax.dismissSelectedAction', { count: dismissCount }),
      blockedReason: dismissCount === 0 ? t('miningTax.dismissBlockedHint') : null,
      onRun: onDismiss,
    },
  ];

  const all = [selectAll, ...bulkActions];
  const visibleReason = REASON_PRIORITY.map((id) => all.find((a) => a.id === id)).find(
    (a) => a?.blockedReason != null
  )?.blockedReason;
  const reasonId = (action: ToolbarAction) => `${idBase}-${action.id}-reason`;

  const button = (action: ToolbarAction) => (
    <Button
      key={action.id}
      size={action.primary ? 'md' : 'sm'}
      variant={action.primary ? 'primary' : undefined}
      aria-disabled={action.blockedReason !== null || undefined}
      aria-describedby={action.describedOnly && action.blockedReason ? reasonId(action) : undefined}
      onClick={action.onRun}
    >
      {action.label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xs border border-accent/40 bg-panel-2 p-2 shadow-lg">
      <span className={eyebrowClassName}>
        {t('miningTax.selectionCount', { count: selectedCount })}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {button(selectAll)}
        <Button size="sm" onClick={onClear}>
          {t('miningTax.clearSelectionAction')}
        </Button>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">{bulkActions.map(button)}</div>

      {all
        .filter((a) => a.describedOnly && a.blockedReason)
        .map((a) => (
          <span key={a.id} id={reasonId(a)} className="sr-only">
            {a.blockedReason}
          </span>
        ))}

      {visibleReason && <p className="w-full text-[0.6875rem] text-text-dim">{visibleReason}</p>}
    </div>
  );
}
