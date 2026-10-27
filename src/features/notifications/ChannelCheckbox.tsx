import { useTranslation } from 'react-i18next';
import { Checkbox, Tooltip } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import type { NotificationChannel } from './eventSelection';

/**
 * One event's checkbox for one delivery channel. Its accessible name names
 * both — "New Mail, browser notifications" — because two visually adjacent
 * checkboxes on a row are indistinguishable to a screen reader otherwise, and
 * the column caption above is not associated with them.
 *
 * `disabledReason` picks the tooltip when `enabled` is false: a missing
 * scope reads "re-authorize", but a corp event a Character lacks the
 * in-game role for cannot be fixed by re-authing at all (issue #299) — that
 * needs its own copy, the same distinction `corpAuthFailure.ts` draws for
 * the poller's own 403 handling. `null` (the eve-type sub-rows, which are
 * never capability- or scope-gated of their own) falls back to the scope
 * copy for parity with this component's pre-#299 behaviour.
 */
export function ChannelCheckbox({
  channel,
  eventLabel,
  enabled,
  disabledReason,
  missingPermissionLabel,
  checked,
  onToggle,
  caption,
}: {
  channel: NotificationChannel;
  eventLabel: string;
  enabled: boolean;
  disabledReason: 'scope' | 'capability' | null;
  /** Names the declined Permission in the scope tooltip (issue #1525); absent for a Core Grant scope. */
  missingPermissionLabel?: string;
  checked: boolean;
  onToggle: () => void;
  /**
   * A short visible caption beside the box (the chips' D and A). It lives inside
   * the label so a click on it toggles the box: a caption outside the label looks
   * clickable and does nothing, which reads as a click that did not register.
   */
  caption?: string;
}) {
  const { t } = useTranslation();
  const label = t(`settings.notifications.toggleLabel.${channel}`, { event: eventLabel });
  const checkbox = (
    <label
      className={
        caption === undefined
          ? touchCheckboxLabelClassName
          : 'inline-flex cursor-pointer items-center justify-center gap-0.5 py-1 touch:min-h-9 touch:min-w-9'
      }
    >
      <Checkbox
        checked={enabled && checked}
        onChange={onToggle}
        // Not `disabled` — same reasoning as MobileOpportunityList (keeps the
        // Tooltip trigger in the hover/touch path). `preventDefault` on click
        // blocks the toggle instead, before `onChange` fires.
        onClick={(event) => {
          if (!enabled) event.preventDefault();
        }}
        aria-disabled={enabled ? undefined : true}
        aria-label={label}
        className={enabled ? undefined : 'cursor-not-allowed! opacity-40'}
      />
      {caption !== undefined && (
        <span aria-hidden="true" className="font-mono text-[0.625rem] text-text-dim">
          {caption}
        </span>
      )}
    </label>
  );
  if (enabled) return checkbox;
  const hint =
    disabledReason === 'capability'
      ? t('settings.notifications.corpCapabilityHint')
      : missingPermissionLabel !== undefined
        ? t('settings.notifications.needsPermission', { permission: missingPermissionLabel })
        : t('settings.notifications.reauthHint');
  return (
    <Tooltip content={hint} openOnTap>
      {checkbox}
    </Tooltip>
  );
}
