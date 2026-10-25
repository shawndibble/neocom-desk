/**
 * What each Character's Alerts Grant must carry for the events ticked for the
 * Device channel (issue #5156; ADRs 0020, 0028, 0029, 0030), and so which
 * Characters need an EVE sign-in. Pure: the caller reads the preferences, the
 * grant records and the server's reported scope support.
 *
 * A sign-in replaces the grant's token with exactly the scopes requested, so a
 * Character is asked for the union of what its ticked events need and what it
 * already holds. Ticking a box never starts a sign-in; this only says what the
 * one walk will ask, so the player can read it first.
 */
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
/** Fixed order, so a summary and a walk read the same everywhere. */
export const ALERTS_PERMISSIONS: readonly AlertsPermission[] = [
  'notifications',
  'location',
  'mail',
];

export interface AlertsNeedsInput {
  characters: readonly { characterId: number }[];
  prefs: NotificationPreferencesValue;
  grants: Readonly<Record<number, AlertsGrantRecord>>;
  /** Server-reported support, and which grants carry it. Unsupported is never asked for. */
  nearby: AlertsExtraState;
  mail: AlertsExtraState;
  /** The scopes each Character's device sign-in holds; an event it cannot read is not effectively ticked. */
  deviceScopes: ReadonlyMap<number, ReadonlySet<string>>;
}

export interface CharacterAlertsNeed {
  characterId: number;
  /** What the grant holds now (nothing when off). */
  held: AlertsPermission[];
  /** What a sign-in would request: held plus what ticked events need. */
  wanted: AlertsPermission[];
  /** What the sign-in adds; a Character needing re-authorization is asked for all it wants. */
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
      // Every grant's token carries notifications.
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

/** One Character's turn in the walk: the optional scopes its single sign-in asks for beside notifications. */
export interface AlertsWalkStep {
  characterId: number;
  nearby: boolean;
  mail: boolean;
}

/**
 * The walk, one step per Character that has something to add. `include` is the
 * player's answer on the listing: a permission left out is not newly asked,
 * but one a grant already holds is always kept (a re-authorization would drop it).
 */
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

/**
 * Whether to nag about this Character's sign-in: only one that is on (holds a
 * grant) and is missing something. Off is the player's choice, so an off
 * Character is never counted; its own row still offers Log in….
 */
export function nagsForSignIn(need: CharacterAlertsNeed): boolean {
  return need.needsWalk && need.held.length > 0;
}

/** How many Characters that are on need a sign-in, and for which permissions in all. */
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
