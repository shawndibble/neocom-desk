import { loadMailHeaders } from '@/features/character/mail';
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
    return result.cached.data;
  },
  toSnapshot: (headers, nowMs) => ({ entries: headers.map(toMailHeaderSnapshot), nowMs }),
});
