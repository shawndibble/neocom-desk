import { loadMailHeaders, prefetchMailBodies } from '@/features/character/mail';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { MailHeader } from '@/esi/endpoints';
import type {
  MailHeaderSnapshot,
  MailNotificationFire,
  MailSnapshot,
} from '@/engine/notificationDiffs';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import { optionalDateMs } from './shared';

/* Mail ----------------------------------------------------------------------- */

const isMailHeaderSnapshot = shapeGuard<MailHeaderSnapshot>({
  mailId: is.number,
  sentMs: is.optional(is.number),
  fromId: is.optional(is.number),
});

function toMailHeaderSnapshot(header: MailHeader): MailHeaderSnapshot {
  const sentMs = optionalDateMs(header.timestamp);
  return {
    mailId: header.mail_id,
    ...(sentMs === undefined ? {} : { sentMs }),
    ...(header.from === undefined ? {} : { fromId: header.from }),
  };
}

export const mailDomain = defineDomain<MailHeader, MailSnapshot, MailNotificationFire>({
  source: SNAPSHOT_SOURCES.mail,
  stateKey: 'notifications.pollerState.mail',
  entriesKey: 'entries',
  isEntry: isMailHeaderSnapshot,
  load: async (characterId) => {
    const result = await loadMailHeaders(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // Only after a read that reached ESI (a cache hit or an offline fallback
    // proves nothing landed); see `detailPrefetch.ts` for the triggers.
    // Bodies are the active Character's alone (decision 20261102): an alt's
    // headers still feed its alerts, but its mail is fetched when opened.
    if (
      !result.cached.fromCache &&
      useActiveCharacter.getState().activeCharacterId === characterId
    ) {
      void prefetchMailBodies(characterId, result.cached.data);
    }
    return result.cached.data;
  },
  toSnapshot: (headers, nowMs) => ({ entries: headers.map(toMailHeaderSnapshot), nowMs }),
});
