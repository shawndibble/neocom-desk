import { requestNotificationPermission, type NotificationPermissionState } from './permission';
import { recordPushFailure, settlePushRegistration } from './pushFailure';
import { recordSeenEveTypes } from './seenEveTypes';
import { useNotificationPreferences } from './preferencesStore';
import { quietHoursPayload } from './quietTime';
import { recordAlertsGrantScopes } from './alertsGrant';
import { routeRulesForServer } from './nearbyRouteRules';
import { webPushSupport, type WebPushSupport } from '@/sync/webPushSupport';

export interface EnableWebPushResult {
  support: WebPushSupport;
  permission: NotificationPermissionState;
}

export async function enableWebPush(): Promise<EnableWebPushResult> {
  const support = webPushSupport();
  if (support === 'requires-install') {
    return { support, permission: 'default' };
  }

  const deviceRegistration =
    support === 'supported' ? import('@/sync/deviceRegistration') : undefined;
  deviceRegistration?.catch(() => {});

  const permission = await requestNotificationPermission();
  if (permission === 'granted' && deviceRegistration) {
    try {
      const { registerDeviceForWebPush } = await deviceRegistration;
      const registration = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';
      const [
        { enabledEveTypesByCharacter },
        { liveDependencies },
        { serverRegistrationsByCharacter },
      ] = await Promise.all([
        import('./projectionRebuild'),
        import('./foregroundPoller'),
        import('./serverEvents'),
      ]);
      const live = liveDependencies();
      const serverEventsByCharacter = await serverRegistrationsByCharacter(live);
      const result = await registerDeviceForWebPush(vapidKey, registration, new Map(), {
        eveTypesByCharacter: await enabledEveTypesByCharacter(live),
        serverEventsByCharacter,
        quietHours: quietHoursPayload(useNotificationPreferences.getState().value),
        routeRules: await routeRulesForServer(serverEventsByCharacter),
      });
      settlePushRegistration(result);
      await recordSeenEveTypes(result?.seenTypes);
      await recordAlertsGrantScopes(result);
    } catch (err) {
      console.error('Web Push device registration failed', err);
      void recordPushFailure(err);
    }
  }
  return { support, permission };
}
