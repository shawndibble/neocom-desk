import type { ProjectionRow } from '@/engine/projection';
import { webPushSupport } from '@/sync/webPushSupport';
import { readNotificationPermission } from './permission';
import { recordPushFailure, settlePushRegistration } from './pushFailure';
import { recordSeenEveTypes } from './seenEveTypes';
import { useNotificationPreferences } from './preferencesStore';
import { quietHoursPayload } from './quietTime';
import type { ServerEventRegistration } from './serverEvents';
import { recordAlertsGrantScopes } from './alertsGrant';
import { routeRulesForServer } from './nearbyRouteRules';

export async function uploadProjectionRows(
  rowsByCharacter: ReadonlyMap<number, ProjectionRow[]>,
  eveTypesByCharacter: ReadonlyMap<number, readonly string[]>,
  serverEventsByCharacter: ReadonlyMap<number, ServerEventRegistration> = new Map()
): Promise<void> {
  if (webPushSupport() !== 'supported') return;
  if (readNotificationPermission() !== 'granted') return;

  try {
    const { registerDeviceForWebPush } = await import('@/sync/deviceRegistration');
    const registration = await navigator.serviceWorker.ready;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';
    const result = await registerDeviceForWebPush(vapidKey, registration, rowsByCharacter, {
      skipIfUnchanged: true,
      eveTypesByCharacter,
      serverEventsByCharacter,
      quietHours: quietHoursPayload(useNotificationPreferences.getState().value),
      routeRules: await routeRulesForServer(serverEventsByCharacter),
    });
    settlePushRegistration(result);
    await recordSeenEveTypes(result?.seenTypes);
    await recordAlertsGrantScopes(result);
  } catch (err) {
    console.error('Scheduled Push projection upload failed', err);
    void recordPushFailure(err);
  }
}

export async function unregisterProjectionRegistration(): Promise<void> {
  if (webPushSupport() !== 'supported') return;
  if (readNotificationPermission() !== 'granted') return;

  try {
    const { unregisterDeviceForWebPush } = await import('@/sync/deviceRegistration');
    await unregisterDeviceForWebPush();
  } catch (err) {
    console.error('Scheduled Push unregistration failed', err);
  }
}
