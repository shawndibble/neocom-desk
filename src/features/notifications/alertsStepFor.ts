/**
 * One Character's Alerts Grant sign-in, planned the way Settings' walk plans it
 * (`alertsNeeds`, `planAlertsWalk`), for the chains that ask outside Settings:
 * "Finish setting up" and the moon run's alerts step (issue #6103). Without
 * this they would ask for a default set, and a grant missing a scope a ticked
 * event needs costs the player a second sign-in from Settings.
 */
import { db } from '@/db';
import { alertsNeeds, planAlertsWalk, type AlertsWalkStep } from './alertsNeeds';
import { readAlertsGrants, readAlertsMail, readAlertsNearby } from './alertsGrant';
import { useNotificationPreferences } from './preferencesStore';

/**
 * `include` is what the caller has shown the player: mail is asked for only
 * where the permission was listed first (ADR 0030); a scope the grant already
 * holds is always kept.
 */
export async function planAlertsStepFor(
  characterId: number,
  include: { location: boolean; mail: boolean }
): Promise<AlertsWalkStep> {
  const prefsStore = useNotificationPreferences.getState();
  if (!prefsStore.hydrated) await prefsStore.hydrate();
  const token = await db.tokens.get(characterId);
  const [need] = alertsNeeds({
    characters: [{ characterId }],
    prefs: useNotificationPreferences.getState().value,
    grants: await readAlertsGrants(),
    nearby: await readAlertsNearby(),
    mail: await readAlertsMail(),
    deviceScopes: new Map([[characterId, new Set(token?.scopes ?? [])]]),
  });
  const [step] = need ? planAlertsWalk([need], include) : [];
  // Nothing ticked needs more: notifications alone, as the first-run offer asks.
  return step ?? { characterId, nearby: false, mail: false };
}
