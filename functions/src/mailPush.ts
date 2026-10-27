// New-mail pushes to a closed app (issue #5143, ADR 0029). Pure. Mirrors
// `diffNewMail` (src/engine/notificationDiffs/mailCalendar.ts) and the
// Occurrence Key of `newMail` (src/engine/occurrenceKey.ts); the parity test at
// the root pins both. The ESI call lives in esiMail.ts, the run loop in
// pollEveNotifications.ts.
//
// Privacy: a mail's sender and subject exist here only in memory, long enough to
// build the push. Nothing in this module is written to Firestore except mail ids
// (the high-water mark and the pushed log, which hold no content).

import type { PushMessage } from './eveNotificationPush.js';

/** One entry of ESI's `GET /characters/{id}/mail/`: only what the diff and the push need. */
export interface MailHeader {
  mailId: number;
  /** Epoch ms of the header's `timestamp`. */
  sentMs?: number;
  /** The header's `from` character id (or mailing list id). */
  fromId?: number;
  subject?: string;
}

/** The fire the service worker parses (`serverEventPayload.ts`): the poller's fire plus the sender and subject. */
export interface NewMailFire {
  eventId: 'newMail';
  characterId: number;
  mailId: number;
  sentMs?: number;
  fromId?: number;
  subject?: string;
}

/** A burst bigger than this pushes only its newest mails; the rest reach the Alerts list when the app opens. */
export const MAX_MAIL_PUSHES = 5;
/** A subject longer than this is cut: it only has to fill a pop-up, and FCM caps a payload at 4096 bytes. */
export const MAX_SUBJECT_CHARS = 200;

export interface NewMailSelection {
  /** Oldest first. */
  fires: NewMailFire[];
  /** The mark to store: the highest mail id seen, own-sent mail included, as the app's diff reads it. */
  highWaterId: number;
}

/**
 * Fires per mail id newly above the high-water mark, except mail the Character
 * sent itself, exactly as `diffNewMail` does. No mark (`null`) is the first poll:
 * it seeds silently, so turning mail alerts on never replays the inbox.
 */
export function selectNewMail(
  characterId: number,
  highWaterId: number | null,
  headers: readonly MailHeader[]
): NewMailSelection {
  const highest = headers.reduce((max, h) => Math.max(max, h.mailId), 0);
  if (highWaterId === null) return { fires: [], highWaterId: highest };
  const fires = headers
    .filter((h) => h.mailId > highWaterId && h.fromId !== characterId)
    .sort((a, b) => a.mailId - b.mailId)
    .map((h): NewMailFire => ({
      eventId: 'newMail',
      characterId,
      mailId: h.mailId,
      ...(h.sentMs === undefined ? {} : { sentMs: h.sentMs }),
      ...(h.fromId === undefined ? {} : { fromId: h.fromId }),
      ...(h.subject === undefined
        ? {}
        : { subject: [...h.subject].slice(0, MAX_SUBJECT_CHARS).join('') }),
    }));
  return { fires, highWaterId: Math.max(highWaterId, highest) };
}

/** The Foreground Poller's Occurrence Key for the same mail; the parity test pins them. */
export function mailOccurrenceKey(fire: Pick<NewMailFire, 'characterId' | 'mailId'>): string {
  return [fire.characterId, 'newMail', fire.mailId].join(':');
}

/**
 * The push: the raw fire as JSON (`fire`), which the worker words with the
 * poller's copy, and a generic floor that names nothing. The sender's name is
 * resolved in the worker through public `/universe/names`, not here.
 */
export function buildMailPush(fire: NewMailFire, nowMs: number): PushMessage {
  return {
    data: {
      characterId: String(fire.characterId),
      eventId: 'newMail',
      occurrenceKey: mailOccurrenceKey(fire),
      title: 'New mail',
      body: 'You have new mail.',
      // As `occurrenceFiredAt` dates it: the header's own time, never in the future.
      fireAt: String(fire.sentMs === undefined ? nowMs : Math.min(fire.sentMs, nowMs)),
      fire: JSON.stringify(fire),
    },
  };
}

/** The 'already pushed' log entry: one mail to one device. Holds an id, never content. */
export const mailPushedEntry = (
  deviceId: string,
  fire: Pick<NewMailFire, 'characterId' | 'mailId'>
) => `${deviceId}|${mailOccurrenceKey(fire)}`;
