import { loadGrantedScopes } from '@/app/grantedScopes';
import { alertsNeeds, planAlertsWalk, type AlertsWalkStep } from './alertsNeeds';
import { readAlertsGrants, readAlertsMail, readAlertsNearby } from './alertsGrant';
import { useNotificationPreferences } from './preferencesStore';

export async function planAlertsStepFor(
  characterId: number,
  include: { location: boolean; mail: boolean }
): Promise<AlertsWalkStep> {
  const prefsStore = useNotificationPreferences.getState();
  if (!prefsStore.hydrated) await prefsStore.hydrate();
  const [need] = alertsNeeds({
    characters: [{ characterId }],
    prefs: useNotificationPreferences.getState().value,
    grants: await readAlertsGrants(),
    nearby: await readAlertsNearby(),
    mail: await readAlertsMail(),
    deviceScopes: new Map([[characterId, await loadGrantedScopes(characterId)]]),
  });
  const [step] = need ? planAlertsWalk([need], include) : [];
  return step ?? { characterId, nearby: false, mail: false };
}
