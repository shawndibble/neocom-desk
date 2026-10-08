import { useId } from 'react';
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
  /** "Link payment": the ticked owed entries, when they all belong to one Payee — `null` says why not. */
  linkPaymentBlockedReason?: string | null;
  onLinkPayment?: () => void;
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
  /**
   * Keep the reason off the visible bar and expose it only as the disabled
   * button's accessible description (issue #3065): Settle up and Link payment
   * usually share one sentence, which otherwise prints twice.
   */
  describedOnly?: boolean;
  onRun: () => void;
}

/**
 * Which blocked action gets the bar's single visible reason line when several
 * are blocked: Combine first (the one a pilot cannot guess), then Dismiss, then
 * Select all.
 */
const REASON_PRIORITY: string[] = ['combine', 'dismiss', 'select-all'];

/**
 * What can be done with the checked rows (issue #539), shown directly above
 * the table and only once something is checked.
 *
 * An action that cannot apply renders **disabled with its reason spelled out
 * below** rather than disappearing (at most one reason line in total, picked by
 * `REASON_PRIORITY`; Settle up and Link payment explain themselves to assistive
 * tech only, via `aria-describedby`): a Combine button that vanishes teaches
 * nothing about why these particular three rows can't be combined. The reason
 * is real visible text (except Settle up / Link payment, see below), never a `title` attribute — a native `disabled` button
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
      // The bar's one primary, decision-committing action reads this app's
      // `md` touch tier (44px) — every other action here stays `sm`, the
      // accepted size for an ordinary secondary bulk action (issue #1175).
      size={action.primary ? 'md' : 'sm'}
      variant={action.primary ? 'primary' : undefined}
      disabled={action.blockedReason !== null}
      aria-describedby={action.describedOnly && action.blockedReason ? reasonId(action) : undefined}
      onClick={action.onRun}
    >
      {action.label}
    </Button>
  );

  return (
    // Opaque surface token: the bar is pinned over the scrolling ledger, so a
    // translucent tint lets the rows show through (issue #2984).
    <div className="flex flex-wrap items-center gap-2 rounded-xs border border-accent/40 bg-panel-2 p-2 shadow-lg">
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
