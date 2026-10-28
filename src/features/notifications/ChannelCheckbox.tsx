import { useTranslation } from 'react-i18next';
import { Checkbox, Tooltip } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import type { NotificationChannel } from './eventSelection';
import type { ChannelOffReason } from './channelOff';

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
  channelOff = null,
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
  /**
   * The channel itself is off (issue #5330): greyed with its tick kept, unlike a
   * missing scope, which shows the box unticked because nothing can happen there.
   */
  channelOff?: ChannelOffReason | null;
}) {
  const { t } = useTranslation();
  const off = channelOff !== null;
  const usable = enabled && !off;
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
          if (!usable) event.preventDefault();
        }}
        aria-disabled={usable ? undefined : true}
        aria-label={label}
        className={usable ? undefined : 'cursor-not-allowed! opacity-40'}
      />
      {caption !== undefined && (
        <span aria-hidden="true" className="font-mono text-[0.625rem] text-text-dim">
          {caption}
        </span>
      )}
    </label>
  );
  if (usable) return checkbox;
  const unavailableHint =
    disabledReason === 'capability'
      ? t('settings.notifications.corpCapabilityHint')
      : missingPermissionLabel !== undefined
        ? t('settings.notifications.needsPermission', { permission: missingPermissionLabel })
        : t('settings.notifications.reauthHint');
  // A missing scope or role is the Character's own fault and wins over the channel being off.
  const hint = enabled ? t(`settings.notifications.channelOff.${channelOff}`) : unavailableHint;
  return (
    <Tooltip content={hint} openOnTap>
      {checkbox}
    </Tooltip>
  );
}
