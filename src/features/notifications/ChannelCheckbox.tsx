import { useTranslation } from 'react-i18next';
import { Checkbox, Tooltip } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import type { NotificationChannel } from './eventSelection';
import type { ChannelOffReason } from './channelOff';

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
  missingPermissionLabel?: string;
  checked: boolean;
  onToggle: () => void;
  caption?: string;
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
        onClick={(event) => {
          if (!usable) event.preventDefault();
        }}
        aria-disabled={usable ? undefined : true}
        aria-label={label}
        className={usable ? undefined : 'cursor-not-allowed! opacity-40'}
      />
      {caption !== undefined && (
        <span aria-hidden="true" className="font-mono text-[0.6875rem] text-text-dim">
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
  const hint = enabled ? t(`settings.notifications.channelOff.${channelOff}`) : unavailableHint;
  return (
    <Tooltip content={hint} openOnTap>
      {checkbox}
    </Tooltip>
  );
}
