/**
 * Which delivery channel of the event table is unusable right now, and why
 * (issue #5330). One check for every row, chip and column header, so the
 * Device and Alerts boxes cannot disagree about when they are greyed out.
 *
 * Greyed boxes keep their ticks: a channel coming back must not have lost the
 * user's choices. Pure; the caller reads the permission and preferences.
 */
import { isBrowserChannelEnabled, isFeedChannelEnabled } from './preferencesStore';
import type { NotificationPreferencesValue } from './preferencesStore';
import type { NotificationPermissionState } from './permission';
import type { NotificationChannel } from './eventSelection';

/** The key under `settings.notifications.channelOff` that says why. */
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
  /** iOS Safari outside an installed PWA: no Notification API until installed. */
  installRequired: boolean;
  prefsValue: NotificationPreferencesValue;
}): ChannelOffMap {
  // The master switch gates both channels and disables the toggles the other reasons point at.
  if (!prefsValue.masterEnabled) return { browser: 'masterOff', feed: 'masterOff' };

  // The permission is the more basic fault, so it is named before the toggle.
  // Install comes first: on iOS outside the installed app, asking can never deliver.
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
