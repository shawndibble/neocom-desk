/**
 * Settings > Notifications' Delivery layer: how alerts reach this device.
 * The master switch, the two channels it gates (Device pop-ups, Alerts list),
 * Dismiss on View, and the entry to Alerts when closed.
 *
 * Desktop is one wrapping line with the Alerts when closed summary at its
 * right end. A phone gets plain 44px rows in a fixed order, the two channels
 * indented beneath the master switch. The permission prompt, the blocked
 * notice, the Play-app notice, the iOS install notice and the push-failure
 * retry stay with the Device pop-ups row: above the line on desktop, directly
 * under that row on a phone.
 *
 * The channels are independent rather than a fallback chain: device pop-ups
 * need a permission grant and an OS that will raise one (never iOS while the
 * app is closed, ADR 0007), while the Alerts list works everywhere and is the
 * only channel some devices will ever see, so switching one off must not
 * touch the other. Their longer explanations sit behind the info buttons (and
 * in the sr-only text the checkboxes are described by).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Checkbox, InfoTooltip } from '@/components/ui';
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { tabPath } from '@/lib/pageTabs';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { webPushSupport } from '@/sync/webPushSupport';
import { androidNotificationSettingsUrl, isPlayStoreApp } from '@/lib/playStoreApp';
import { assignLocation } from '@/app/navigation';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { AlertsWhenClosedSection } from './AlertsWhenClosedSection';
import { enableWebPush } from './webPush';
import { usePushFailure } from './pushFailure';
import {
  useNotificationPreferences,
  setDeviceNotificationPrefs,
  withMasterEnabled,
  withBrowserEnabled,
  withFeedEnabled,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
  isDismissOnView,
  withDismissOnView,
} from './preferences';
import {
  useNotificationPromptState,
  promptStateAfterAsk,
  type NotificationPermissionState,
} from './permission';

interface NotificationsDeliveryProps {
  permission: NotificationPermissionState;
  refreshPermission: () => void;
  browserBlocked: boolean;
  /** Alerts when closed is only offered once sync is set up and a Character exists. */
  alertsWhenClosedCharacters: readonly { characterId: number; name: string }[] | null;
}

export function NotificationsDelivery({
  permission,
  refreshPermission,
  browserBlocked,
  alertsWhenClosedCharacters,
}: NotificationsDeliveryProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const prefsValue = useNotificationPreferences((state) => state.value);
  const setPromptState = useNotificationPromptState((state) => state.setValue);
  const pushFailure = usePushFailure((state) => state.value);
  const [retrying, setRetrying] = useState(false);
  useHydratedStore(usePushFailure);

  // Records the ask here too, so someone who ignored the one-time explainer and
  // came to Settings instead is not offered it again on the next load.
  async function enableNotifications() {
    const { permission: outcome } = await enableWebPush();
    await setPromptState(promptStateAfterAsk(outcome));
    refreshPermission();
  }

  // Retry is the same call as Enable: permission is already granted, so it
  // only re-registers, and the outcome files itself (cleared or re-recorded).
  async function retryPushRegistration() {
    setRetrying(true);
    try {
      await enableWebPush();
    } finally {
      setRetrying(false);
    }
  }

  // iOS delivers Web Push only to an installed PWA (issue #356 AC1) — the
  // Enable button would either do nothing or grant a permission that can
  // never deliver anything, so this state shows why instead of the button.
  const installRequired = webPushSupport() === 'requires-install';
  // In the Play Store app Chrome delegates the grant to the Android app's own
  // notification toggle (docs/ANDROID-TWA.md), so the blocked notice has to
  // name that screen — browser site settings can't unblock it.
  const [inPlayStoreApp] = useState(isPlayStoreApp);

  const notices = (
    <>
      {browserBlocked &&
        (inPlayStoreApp ? (
          <div className="space-y-2 rounded-xs border border-warning/60 bg-warning/10 px-3 py-2">
            <p role="status" className="text-xs text-warning">
              {t('settings.notifications.blockedNoticePlayApp')}
            </p>
            <Button
              size="sm"
              variant="primary"
              onClick={() => assignLocation(androidNotificationSettingsUrl(window.location.href))}
            >
              {t('settings.notifications.openAndroidSettings')}
            </Button>
          </div>
        ) : (
          <p
            role="status"
            className="rounded-xs border border-warning/60 bg-warning/10 px-3 py-2 text-xs text-warning"
          >
            {t('settings.notifications.blockedNotice')}
          </p>
        ))}
      {pushFailure && permission === 'granted' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xs border border-warning/60 bg-warning/10 px-3 py-2">
          <p role="status" className="min-w-0 flex-1 text-xs text-warning">
            {t(`settings.notifications.pushFailed.${pushFailure.reason}`)}
          </p>
          <Button
            size="sm"
            variant="primary"
            loading={retrying}
            onClick={() => void retryPushRegistration()}
          >
            {t('settings.notifications.pushRetryButton')}
          </Button>
        </div>
      )}
      {/*
        `permission` reads 'unsupported' here, not 'default' — a
        non-installed iOS Safari tab has no Notification API to ask at
        all (issue #356 AC1). Gating this on 'default' alone would hide
        the explanation on exactly the platform it exists for.
      */}
      {installRequired && (permission === 'default' || permission === 'unsupported') && (
        <p
          role="status"
          className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-xs text-text-dim"
        >
          {t('settings.notifications.installRequiredNotice')}{' '}
          <Link to={tabPath(SETTINGS_TABS, 'dataAge')} className={inlineLinkClassName}>
            {t('settings.notifications.installRequiredLink')}
          </Link>
        </p>
      )}
      {permission === 'default' && !installRequired && (
        <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-text-dim">
            {t('settings.notifications.enableHint')}
          </p>
          <Button size="sm" variant="primary" onClick={() => void enableNotifications()}>
            {t('settings.notifications.enableButton')}
          </Button>
        </div>
      )}
    </>
  );

  const masterOff = !prefsValue.masterEnabled;
  // Channel rows indent under the master switch on a phone; the line has no indent.
  const rowClassName = cx('flex items-center gap-2 text-xs text-text', tappableRowClassName);

  return (
    <div className="space-y-2">
      {isDesktop && <div className="space-y-2 empty:hidden">{notices}</div>}
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-0.5">
        <label className={cx(rowClassName, 'font-medium')}>
          <Checkbox
            checked={prefsValue.masterEnabled}
            onChange={() =>
              void setDeviceNotificationPrefs(
                withMasterEnabled(prefsValue, !prefsValue.masterEnabled)
              )
            }
          />
          {t('settings.notifications.masterSwitchLabel')}
        </label>
        <fieldset className="contents">
          <legend className="sr-only">{t('settings.notifications.channelsLegend')}</legend>
          <span className="flex items-center gap-1.5 pl-6 md:pl-0">
            <label className={rowClassName}>
              <Checkbox
                aria-describedby="notifications-browser-channel-hint"
                checked={isBrowserChannelEnabled(prefsValue) && !browserBlocked}
                disabled={masterOff || browserBlocked}
                onChange={() =>
                  void setDeviceNotificationPrefs(
                    withBrowserEnabled(prefsValue, !isBrowserChannelEnabled(prefsValue))
                  )
                }
              />
              {t('settings.notifications.browserChannelLabel')}
            </label>
            <InfoTooltip
              label={t('settings.notifications.channelInfoLabel', {
                channel: t('settings.notifications.browserChannelLabel'),
              })}
              content={t('settings.notifications.browserChannelHint')}
            />
            <span id="notifications-browser-channel-hint" className="sr-only">
              {t('settings.notifications.browserChannelHint')}
            </span>
          </span>
          {!isDesktop && <div className="space-y-2 pb-1 pl-6 empty:hidden">{notices}</div>}
          <span className="flex items-center gap-1.5 pl-6 md:pl-0">
            <label className={rowClassName}>
              <Checkbox
                aria-describedby="notifications-feed-channel-hint"
                checked={isFeedChannelEnabled(prefsValue)}
                disabled={masterOff}
                onChange={() =>
                  void setDeviceNotificationPrefs(
                    withFeedEnabled(prefsValue, !isFeedChannelEnabled(prefsValue))
                  )
                }
              />
              {t('settings.notifications.feedChannelLabel')}
            </label>
            <InfoTooltip
              label={t('settings.notifications.channelInfoLabel', {
                channel: t('settings.notifications.feedChannelLabel'),
              })}
              content={t('settings.notifications.feedChannelHint')}
            />
            <span id="notifications-feed-channel-hint" className="sr-only">
              {t('settings.notifications.feedChannelHint')}
            </span>
          </span>
        </fieldset>
        <span className="flex items-center gap-1.5">
          <label className={rowClassName}>
            <Checkbox
              checked={isDismissOnView(prefsValue)}
              onChange={() =>
                void setDeviceNotificationPrefs(
                  withDismissOnView(prefsValue, !isDismissOnView(prefsValue))
                )
              }
            />
            {t('settings.notifications.dismissOnViewLabel')}
          </label>
          <InfoTooltip
            label={t('settings.notifications.channelInfoLabel', {
              channel: t('settings.notifications.dismissOnViewLabel'),
            })}
            content={t('settings.notifications.dismissOnViewHint')}
          />
        </span>
        {alertsWhenClosedCharacters !== null && (
          <AlertsWhenClosedSection characters={alertsWhenClosedCharacters} />
        )}
      </div>
    </div>
  );
}
