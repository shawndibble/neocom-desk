/**
 * What happens when a Web Push arrives (ADR 0009, ADR 0010, issue #357): show
 * a notification and write a Notification Feed row keyed by the payload's
 * Occurrence Key, so the Foreground Poller finds the row already there
 * instead of creating a duplicate when it later observes the same change.
 *
 * Extracted from `src/sw.ts` for the same reason `notificationClick.ts` was:
 * ADR 0007's carve-out (preserved by ADR 0009) makes the Service Worker file
 * orchestration-only and untested, so anything with a decision in it lives
 * here instead.
 *
 * WebKit revokes a site's push subscription when a push event completes
 * without posting a notification, so there is no silent path here: a
 * malformed or missing payload still shows a fallback notification, just
 * without a feed write (no Occurrence Key to key it by).
 *
 * The payload wire format mirrors `engine/projection.ts`'s `ProjectionRow`
 * (`characterId`, `eventId`, `occurrenceKey`, `title`, `body`) — the backend
 * (issue #358) sends already-rendered text, since it has no SDE and no i18n
 * catalog (ADR 0010).
 *
 * The fields sit under a top-level `data` key, not flat: FCM's Admin SDK only
 * ever sends webpush `data` payloads as a `{[key: string]: string}` map, and
 * `@firebase/messaging`'s own service-worker listener confirms what reaches
 * `event.data.json()` on the wire is `{ data: {...}, notification?, from,
 * collapse_key, fcmMessageId }` — the custom fields nested, not flat, and
 * every value a string (`node_modules/@firebase/messaging/dist/index.sw.cjs`,
 * `getMessagePayloadInternal`/`propagateDataPayload`). `characterId` is
 * therefore parsed from a string, not read as one.
 */
import i18n from '@/i18n';
import {
  notificationOptionsFor,
  fallbackNotificationOptions,
  type AppNotificationOptions,
} from './notificationOptions';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from './events';
import type { NewNotificationFeedEntry } from './feed';

export interface PushEnv {
  showNotification: (title: string, options: AppNotificationOptions) => Promise<void>;
  recordFeedEntry: (entry: NewNotificationFeedEntry) => Promise<void>;
}

export interface PushPayload {
  readonly characterId: number;
  readonly eventId: NotificationEventId;
  readonly occurrenceKey: string;
  readonly title: string;
  readonly body: string;
}

function isNotificationEventId(value: unknown): value is NotificationEventId {
  return typeof value === 'string' && (NOTIFICATION_EVENT_IDS as readonly string[]).includes(value);
}

/**
 * `rawText` is `PushMessageData.text()` — decoding as text never throws,
 * unlike `.json()`, which is what makes malformed JSON a value this function
 * returns `null` for rather than something its caller must catch.
 */
export function parsePushPayload(rawText: string | null): PushPayload | null {
  if (rawText === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const { data } = parsed as Record<string, unknown>;
  if (typeof data !== 'object' || data === null) return null;

  const { characterId, eventId, occurrenceKey, title, body } = data as Record<string, unknown>;
  const characterIdNum = typeof characterId === 'string' ? Number(characterId) : NaN;
  if (!Number.isFinite(characterIdNum)) return null;
  if (!isNotificationEventId(eventId)) return null;
  if (typeof occurrenceKey !== 'string' || occurrenceKey.length === 0) return null;
  if (typeof title !== 'string' || title.length === 0) return null;
  if (typeof body !== 'string') return null;

  return { characterId: characterIdNum, eventId, occurrenceKey, title, body };
}

/**
 * Never rejects, and always calls `showNotification` exactly once — see the
 * WebKit note above. `showNotification` and `recordFeedEntry` run
 * independently (`allSettled`, not sequential `await`s) so a Dexie failure
 * never suppresses the notification the user actually sees.
 */
export async function handlePush(env: PushEnv, rawText: string | null, now: number): Promise<void> {
  const payload = parsePushPayload(rawText);

  const notify =
    payload === null
      ? env.showNotification(
          i18n.t('notifications.fired.pushFallback.title'),
          fallbackNotificationOptions(i18n.t('notifications.fired.pushFallback.body'))
        )
      : env.showNotification(
          payload.title,
          notificationOptionsFor(
            { eventId: payload.eventId, characterId: payload.characterId },
            payload.body
          )
        );

  const feedWrite =
    payload === null
      ? Promise.resolve()
      : env.recordFeedEntry({
          id: payload.occurrenceKey,
          characterId: payload.characterId,
          eventId: payload.eventId,
          title: payload.title,
          body: payload.body,
          firedAt: now,
        });

  await Promise.allSettled([notify, feedWrite]);
}
