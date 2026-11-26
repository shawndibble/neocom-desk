import { isBrowserChannelEnabled, isFeedChannelEnabled } from './preferencesStore';
import type { NotificationPreferencesValue } from './preferencesStore';
import type { NotificationPermissionState } from './permission';
import type { NotificationChannel } from './eventSelection';

export type ChannelOffReason =
  | 'masterOff'
  | 'permissionDenied'
  | 'permissionDefault'
  | 'permissionUnsupported'
  | 'installRequired'
  | 'deviceToggleOff'
  | 'alertsToggleOff';

export type ChannelOffMap = Record<NotificationChannel, ChannelOffReason | null>;

export const NO_CHANNEL_OFF: ChannelOffMap = { browser: null, feed: null };

export function channelOffReasons({
  permission,
  installRequired,
  prefsValue,
}: {
  permission: NotificationPermissionState;
  installRequired: boolean;
  prefsValue: NotificationPreferencesValue;
}): ChannelOffMap {
  if (!prefsValue.masterEnabled) return { browser: 'masterOff', feed: 'masterOff' };

  let browser: ChannelOffReason | null = null;
  if (installRequired) browser = 'installRequired';
  else if (permission === 'denied') browser = 'permissionDenied';
  else if (permission === 'default') browser = 'permissionDefault';
  else if (permission === 'unsupported') browser = 'permissionUnsupported';
  else if (!isBrowserChannelEnabled(prefsValue)) browser = 'deviceToggleOff';

  return {
    browser,
    feed: isFeedChannelEnabled(prefsValue) ? null : 'alertsToggleOff',
  };
}
