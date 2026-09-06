import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { CombineEligibility } from './selection';

interface SelectionToolbarProps {
  /** How many currently-*visible* rows are checked. Zero renders nothing. */
  selectedCount: number;
  /** Whether any visible selectable row is still unchecked. */
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  /** Outstanding Assignments the selection would bill. */
  settleUpCount: number;
  onSettleUp: () => void;
  combine: CombineEligibility;
  onCombine: () => void;
  /** Still-unassigned rows the selection would dismiss. */
  dismissCount: number;
  onDismiss: () => void;
}

/**
 * One button in the toolbar. `blockedReason` is the whole point of the shape:
 * an action carries its own reason for being unavailable, so "disabled always
 * explains itself" holds by construction rather than by each call site
 * remembering to render one.
 */
interface ToolbarAction {
  id: string;
  label: string;
  primary?: boolean;
  /** `null` when the action can run; otherwise the one-line reason it cannot. */
  blockedReason: string | null;
  onRun: () => void;
}

/**
 * What can be done with the checked rows (issue #539), shown directly above
 * the table and only once something is checked.
 *
 * An action that cannot apply renders **disabled with its reason spelled out
 * below** rather than disappearing: a Combine button that vanishes teaches
 * nothing about why these particular three rows can't be combined. The reason
 * is real visible text, never a `title` attribute — a native `disabled` button
 * fires no pointer or focus events in Chromium or Firefox, so a tooltip on one
 * can never be read (and the same is true of Radix's `Tooltip`, which needs a
 * live trigger).
 *
 * Counts come from the caller already narrowed to *visible* rows — selection
 * survives a filter change, so acting on the full set would let a bulk action
 * reach rows the pilot cannot see.
 */
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
}: SelectionToolbarProps) {
  const { t } = useTranslation();
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
      onRun: onSettleUp,
    },
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

  const blocked = [selectAll, ...bulkActions].filter((a) => a.blockedReason !== null);

  const button = (action: ToolbarAction) => (
    <Button
      key={action.id}
      size="sm"
      variant={action.primary ? 'primary' : undefined}
      disabled={action.blockedReason !== null}
      onClick={action.onRun}
    >
      {action.label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xs border border-accent/40 bg-accent/5 p-2">
      <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('miningTax.selectionCount', { count: selectedCount })}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {button(selectAll)}
        <Button size="sm" onClick={onClear}>
          {t('miningTax.clearSelectionAction')}
        </Button>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">{bulkActions.map(button)}</div>

      {blocked.length > 0 && (
        <ul className="w-full space-y-0.5">
          {blocked.map((action) => (
            <li key={action.id} className="text-[0.6875rem] text-text-dim">
              {action.blockedReason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
