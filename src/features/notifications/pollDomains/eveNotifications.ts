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

const isEveNotificationEntrySnapshot = shapeGuard<EveNotificationEntrySnapshot>({
  notificationId: is.number,
  type: is.string,
  senderId: is.number,
  senderType: is.string,
  text: is.string,
  timestamp: is.string,
});

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
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const eveTypePrefs = await currentEveTypePrefs(characterId);
    const eligible = snapshot.entries.filter(
      (entry) =>
        isEveTypeAllowed(entry.type) && isEveTypeEnabledFor(eveTypePrefs, entry.type, 'browser')
    );
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
  names: resolveEveNotificationNames,
});
