import { ALERTS_LOCATION_SCOPE, ALERTS_MAIL_SCOPE } from '@/auth/alertsScope';
import { EVE_ALLOWED_TYPES, isEventEnabledFor, isEveTypeEnabledFor } from './eventSelection';
import { eventScope, hasEventScope } from './events';
import {
  characterEveTypePrefs,
  characterEventPrefs,
  isBrowserChannelEnabled,
  type NotificationPreferencesValue,
} from './preferencesStore';
import { SERVER_PUSHED_EVENT_IDS } from './serverEvents';
import { alertsRowState, type AlertsExtraState, type AlertsGrantRecord } from './alertsGrant';

export type AlertsPermission = 'notifications' | 'location' | 'mail';
export const ALERTS_PERMISSIONS: readonly AlertsPermission[] = [
  'notifications',
  'location',
  'mail',
];

export interface AlertsNeedsInput {
  characters: readonly { characterId: number }[];
  prefs: NotificationPreferencesValue;
  grants: Readonly<Record<number, AlertsGrantRecord>>;
  nearby: AlertsExtraState;
  mail: AlertsExtraState;
  deviceScopes: ReadonlyMap<number, ReadonlySet<string>>;
}

export interface CharacterAlertsNeed {
  characterId: number;
  held: AlertsPermission[];
  wanted: AlertsPermission[];
  missing: AlertsPermission[];
  needsWalk: boolean;
}

const ordered = (set: ReadonlySet<AlertsPermission>) =>
  ALERTS_PERMISSIONS.filter((permission) => set.has(permission));

export function alertsNeeds(input: AlertsNeedsInput): CharacterAlertsNeed[] {
  const { prefs, nearby, mail } = input;
  const deviceChannelOn = prefs.masterEnabled && isBrowserChannelEnabled(prefs);
  return input.characters.map(({ characterId }) => {
    const state = alertsRowState(input.grants[characterId]);
    const held = new Set<AlertsPermission>();
    if (state !== 'off') {
      held.add('notifications');
      if (nearby.characterIds.includes(characterId)) held.add('location');
      if (mail.characterIds.includes(characterId)) held.add('mail');
    }
    const wanted = new Set(held);
    if (deviceChannelOn) {
      const eventPrefs = characterEventPrefs(prefs, characterId);
      const typePrefs = characterEveTypePrefs(prefs, characterId);
      const scopes = input.deviceScopes.get(characterId) ?? new Set<string>();
      if (EVE_ALLOWED_TYPES.some((type) => isEveTypeEnabledFor(typePrefs, type, 'browser'))) {
        wanted.add('notifications');
      }
      for (const eventId of SERVER_PUSHED_EVENT_IDS) {
        const scope = eventScope(eventId);
        if (!isEventEnabledFor(eventPrefs, eventId, 'browser') || !hasEventScope(eventId, scopes)) {
          continue;
        }
        if (scope === ALERTS_LOCATION_SCOPE && nearby.supported) wanted.add('location');
        if (scope === ALERTS_MAIL_SCOPE && mail.supported) wanted.add('mail');
      }
      if (wanted.has('location') || wanted.has('mail')) wanted.add('notifications');
    }
    if (state === 'needs-reauth') wanted.add('notifications');
    const missing = new Set(
      state === 'needs-reauth' ? wanted : [...wanted].filter((permission) => !held.has(permission))
    );
    return {
      characterId,
      held: ordered(held),
      wanted: ordered(wanted),
      missing: ordered(missing),
      needsWalk: missing.size > 0,
    };
  });
}

export interface AlertsWalkStep {
  characterId: number;
  nearby: boolean;
  mail: boolean;
}

export function planAlertsWalk(
  needs: readonly CharacterAlertsNeed[],
  include: { location: boolean; mail: boolean }
): AlertsWalkStep[] {
  const steps: AlertsWalkStep[] = [];
  for (const need of needs) {
    if (!need.needsWalk) continue;
    const nearby =
      need.held.includes('location') || (need.wanted.includes('location') && include.location);
    const mail = need.held.includes('mail') || (need.wanted.includes('mail') && include.mail);
    const addsSomething =
      !need.held.includes('notifications') ||
      (nearby && !need.held.includes('location')) ||
      (mail && !need.held.includes('mail')) ||
      need.missing.includes('notifications');
    if (addsSomething) steps.push({ characterId: need.characterId, nearby, mail });
  }
  return steps;
}

export function nagsForSignIn(need: CharacterAlertsNeed): boolean {
  return need.needsWalk && need.held.length > 0;
}

export function summarizeAlertsNeeds(needs: readonly CharacterAlertsNeed[]): {
  characters: number;
  permissions: AlertsPermission[];
} {
  const walking = needs.filter(nagsForSignIn);
  return {
    characters: walking.length,
    permissions: ordered(new Set(walking.flatMap((need) => need.missing))),
  };
}
