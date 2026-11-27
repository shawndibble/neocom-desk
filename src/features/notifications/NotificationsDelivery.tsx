import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Checkbox, InfoTooltip } from '@/components/ui';
import { LiveNote, LiveStatus } from '@/components/ui/LiveStatus';
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatTimeOfDay } from '@/lib/timestamp';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { tabPath } from '@/lib/pageTabs';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { webPushSupport } from '@/sync/webPushSupport';
import { androidNotificationSettingsUrl, isPlayStoreApp } from '@/lib/playStoreApp';
import { assignLocation } from '@/app/navigation';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Well } from '@/components/ui/Well';
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

  async function enableNotifications() {
    const { permission: outcome } = await enableWebPush();
    await setPromptState(promptStateAfterAsk(outcome));
    refreshPermission();
    return outcome;
  }

  async function retryPushRegistration() {
    setRetrying(true);
    try {
      await enableWebPush();
    } finally {
      setRetrying(false);
    }
  }

  const installRequired = webPushSupport() === 'requires-install';
  const [inPlayStoreApp] = useState(isPlayStoreApp);

  const notices = (
    <>
      {browserBlocked &&
        (inPlayStoreApp ? (
          <Well tone="warning" size="wide" className="space-y-2">
            <LiveNote className="text-xs text-warning">
              {t('settings.notifications.blockedNoticePlayApp')}
            </LiveNote>
            <Button
              size="sm"
              variant="primary"
              onClick={() => assignLocation(androidNotificationSettingsUrl(window.location.href))}
            >
              {t('settings.notifications.openAndroidSettings')}
            </Button>
          </Well>
        ) : (
          <LiveNote className="rounded-xs border border-warning/60 bg-warning/10 px-3 py-2 text-xs text-warning">
            {t('settings.notifications.blockedNotice')}
          </LiveNote>
        ))}
      {pushFailure && permission === 'granted' && (
        <Well tone="warning" size="wide" className="flex flex-wrap items-center gap-2">
          <LiveNote className="min-w-0 flex-1 text-xs text-warning">
            {t(`settings.notifications.pushFailed.${pushFailure.reason}`)}{' '}
            {t('settings.notifications.pushFailedAt', {
              time: formatTimeOfDay(new Date(pushFailure.at)),
            })}
          </LiveNote>
          <Button
            size="sm"
            variant="primary"
            loading={retrying}
            onClick={() => void retryPushRegistration()}
          >
            {t('settings.notifications.pushRetryButton')}
          </Button>
        </Well>
      )}
      {installRequired && (permission === 'default' || permission === 'unsupported') && (
        <>
          <LiveStatus>{t('settings.notifications.installRequiredNotice')}</LiveStatus>
          <Well as="p" size="wide" className="text-xs text-text-dim">
            {t('settings.notifications.installRequiredNotice')}{' '}
            <Link to={tabPath(SETTINGS_TABS, 'app')} className={inlineLinkClassName}>
              {t('settings.notifications.installRequiredLink')}
            </Link>
          </Well>
        </>
      )}
    </>
  );

  const needsGrant = permission === 'default' && !installRequired;
  async function toggleBrowserChannel() {
    if (needsGrant) {
      if ((await enableNotifications()) === 'granted') {
        await setDeviceNotificationPrefs(withBrowserEnabled(prefsValue, true));
      }
      return;
    }
    await setDeviceNotificationPrefs(
      withBrowserEnabled(prefsValue, !isBrowserChannelEnabled(prefsValue))
    );
  }

  const masterOff = !prefsValue.masterEnabled;
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
                checked={isBrowserChannelEnabled(prefsValue) && !browserBlocked && !needsGrant}
                disabled={masterOff || browserBlocked}
                onChange={() => void toggleBrowserChannel()}
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
