import type { PushMessage } from './eveNotificationPush.js';

export interface MailHeader {
  mailId: number;
  sentMs?: number;
  fromId?: number;
  subject?: string;
}

export interface NewMailFire {
  eventId: 'newMail';
  characterId: number;
  mailId: number;
  sentMs?: number;
  fromId?: number;
  subject?: string;
}

export const MAX_MAIL_PUSHES = 5;
export const MAX_SUBJECT_CHARS = 200;

export interface NewMailSelection {
  fires: NewMailFire[];
  highWaterId: number;
}

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

export function mailOccurrenceKey(fire: Pick<NewMailFire, 'characterId' | 'mailId'>): string {
  return [fire.characterId, 'newMail', fire.mailId].join(':');
}

export function buildMailPush(fire: NewMailFire, nowMs: number): PushMessage {
  return {
    data: {
      characterId: String(fire.characterId),
      eventId: 'newMail',
      occurrenceKey: mailOccurrenceKey(fire),
      title: 'New mail',
      body: 'You have new mail.',
      fireAt: String(fire.sentMs === undefined ? nowMs : Math.min(fire.sentMs, nowMs)),
      fire: JSON.stringify(fire),
    },
  };
}

export const mailPushedEntry = (
  deviceId: string,
  fire: Pick<NewMailFire, 'characterId' | 'mailId'>
) => `${deviceId}|${mailOccurrenceKey(fire)}`;
