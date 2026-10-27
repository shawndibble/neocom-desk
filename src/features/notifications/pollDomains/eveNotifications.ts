import { loadCharacterNotifications } from '@/features/character/notifications';
import { loadStructureName } from '@/features/character/structures';
import {
  projectEveNotificationReinforcementExit,
  reinforcementExitStructureIds,
} from '@/engine/projection';
import type { CharacterNotification } from '@/esi/endpoints';
import type {
  EveNotificationEntrySnapshot,
  EveNotificationFire,
  EveNotificationSnapshot,
} from '@/engine/notificationDiffs';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { resolveEveNotificationNames } from '../eveNotificationNames';
import type { EveNotificationNames } from '../eveNotificationText';
import { isEveTypeAllowed, isEveTypeEnabledFor } from '../eventSelection';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { currentEveTypePrefs, resolveProjectionNames } from './shared';

/* EVE's own notifications ---------------------------------------------------- */

const isEveNotificationEntrySnapshot = shapeGuard<EveNotificationEntrySnapshot>({
  notificationId: is.number,
  type: is.string,
  senderId: is.number,
  senderType: is.string,
  text: is.string,
  timestamp: is.string,
});

/**
 * The ninth domain (issue #274): EVE's own server-pushed notifications, a
 * different, non-overlapping set from every other domain here — those are
 * all synthesized by diffing; this one is fed to the app pre-formed. Single
 * `eveNotification` event covering roughly a hundred underlying `type`
 * strings, filtered individually at delivery time
 * (`foregroundPoller.ts`/`preferences.ts`) rather than modeled as one
 * `NotificationEventId` per type — CCP adds types without notice, so the
 * catalog cannot be a closed enum (esi/esi-issues#1380).
 */
export const eveNotificationDomain = defineDomain<
  CharacterNotification,
  EveNotificationSnapshot,
  EveNotificationFire,
  EveNotificationNames
>({
  source: SNAPSHOT_SOURCES.eveNotification,
  stateKey: 'notifications.pollerState.eveNotification',
  entriesKey: 'entries',
  isEntry: isEveNotificationEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterNotifications(characterId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (notifications, nowMs) => ({
    entries: notifications.map((n) => ({
      notificationId: n.notification_id,
      type: n.type,
      senderId: n.sender_id,
      senderType: n.sender_type,
      text: n.text ?? '',
      timestamp: n.timestamp,
    })),
    nowMs,
  }),
  // Structure reinforcement exits (issue #359): the only EVE Notification
  // shape with a future, fixed-enough timestamp to project. Kept to the same
  // gates the live browser channel already applies to this domain
  // (`foregroundPoller.ts`'s `isEveTypeAllowed` + `eveTypeAllowsChannel`) —
  // Scheduled Push is that channel's closed-app analog (see the comment on
  // `projection` above), so a type the user has switched browser
  // notifications off for, or that fell off the round-45 allow-list, must
  // not reach the backend either.
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const eveTypePrefs = await currentEveTypePrefs(characterId);
    const eligible = snapshot.entries.filter(
      (entry) =>
        isEveTypeAllowed(entry.type) && isEveTypeEnabledFor(eveTypePrefs, entry.type, 'browser')
    );
    // Only ids the projector will actually put in a row's text (issue #359
    // follow-up, Sentry N+1): most of `eligible` is outside the 72-hour
    // horizon and produces no row at all, so resolving every one of their
    // structure ids up front fanned `loadStructureName` out over names whose
    // results were always going to be discarded.
    const structureIds = reinforcementExitStructureIds(eligible, nowMs);
    const structureNames = await resolveProjectionNames(structureIds, (id) =>
      loadStructureName(characterId, id)
    );
    return projectEveNotificationReinforcementExit(
      characterId,
      characterName,
      eligible,
      structureNames,
      NOTIFICATION_EVENT_ENTRIES.eveNotification.projection.push,
      nowMs
    );
  },
  // Best-effort, time-boxed and never rejects (issue #300): whatever it could
  // not look up in its budget renders as an id or a neutral phrase rather
  // than holding the notification back.
  names: resolveEveNotificationNames,
});
