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
 * (`characterId`, `eventId`, `occurrenceKey`, `title`, `body`, optional
 * `eveType`) — the backend (issue #358) sends already-rendered text, since it
 * has no SDE and no i18n catalog (ADR 0010).
 *
 * Server-polled EVE notifications (ADR 0020, issue #3757) arrive as the raw
 * notification instead of rendered text: `notificationId`,
 * `notificationTimestamp` and `notificationText` ride alongside the generic
 * `title`/`body`, which stay as the floor when rendering fails. A burst
 * arrives as one summary push (`summaryCount`) that writes no feed row; the
 * Foreground Poller files those when the app opens.
 *
 * Server-pushed events (issue #5121: community, price alert, ship lost) carry
 * the raw fire the Foreground Poller's diff would have built (`fire`, JSON).
 * The worker renders it with the app's own copy (`serverEventCopy.ts`) and keys
 * the feed row by the poller's own Occurrence Key derivation.
 *
 * Whenever this device already showed a pop-up for the occurrence (the open
 * app's poll beat the push), the push still shows one — it must — but replaces
 * the earlier one under the same tag silently instead of buzzing twice.
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
import { createInstance } from 'i18next';
// Named, not default: Vite exports each top-level key of a JSON module on its
// own, so only the `notifications` subtree reaches the service worker bundle.
import { notifications } from '@/i18n/locales/en.json';
import {
  notificationOptionsFor,
  fallbackNotificationOptions,
  type AppNotificationOptions,
} from './notificationOptions';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from './events';
import type { NewNotificationFeedEntry } from './feed';
import { occurrenceKey } from '@/engine/occurrenceKey';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import { RESOLUTION_BUDGET_MS, withinBudget } from './eveNotificationNamePlan';
import { renderEveNotification, type EveNotificationNames } from './eveNotificationRender';
import { parseServerEventFire, type ServerEventFire } from './serverEventPayload';
import {
  communityJoinRequestText,
  communityMemberJoinedText,
  communityRequestPledgedText,
  priceAlertText,
  shipLostText,
  type Translate,
} from './serverEventCopy';

/**
 * The service worker's own i18next instance, not `@/i18n`: that module loads
 * every locale string plus `react-i18next` (and React with it) — about half a
 * megabyte in `sw.mjs` for the two fallback strings a push can need. Same
 * locale file, same keys; only the subtree this handler reads.
 */
const i18n = createInstance();
void i18n.init({
  resources: { en: { translation: { notifications } } },
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
});

export interface PushEnv {
  showNotification: (title: string, options: AppNotificationOptions) => Promise<void>;
  recordFeedEntry: (entry: NewNotificationFeedEntry) => Promise<void>;
  /** The Character's name for the body copy; absent or `undefined` falls back to a neutral phrase. */
  characterName?: (characterId: number) => Promise<string | undefined>;
  /** Names for a raw EVE notification, already within the resolution budget; never rejects. */
  resolveNames?: (fire: EveNotificationFire) => Promise<EveNotificationNames>;
  /** The Time format zone (`'UTC'` for EVE time) the body's times render in; absent means the host's own. Never rejects. */
  timeZone?: () => Promise<string | undefined>;
  /** Public names (types, systems) for ids, within the resolution budget; never rejects. */
  resolveIds?: (ids: readonly number[]) => Promise<ReadonlyMap<number, string>>;
  /** Whether this device already showed a pop-up for the Occurrence Key (`feed.feedSuppressesToast`). */
  alreadyNotified?: (occurrenceKey: string) => Promise<boolean>;
}

/** The raw notification a server-polled push carries (issue #3756). */
export interface RawEveNotification {
  readonly notificationId: number;
  readonly timestamp: string;
  readonly text: string;
}

export interface PushPayload {
  readonly characterId: number;
  readonly eventId: NotificationEventId;
  readonly occurrenceKey: string;
  readonly title: string;
  readonly body: string;
  /**
   * The raw ESI type underneath an `eveNotification` row (issue #274's
   * per-type opt-out; `engine/projection.ts`'s `ProjectionRow.eveType`),
   * absent for every other `eventId`. Without this, a push-delivered
   * `eveNotification` occurrence could not be muted per-type the way the
   * Foreground Poller's own feed write already is.
   */
  readonly eveType?: string;
  /**
   * The projection row's `fireAt` — the moment the occurrence was scheduled
   * to happen — so the feed row is dated by it rather than by when the push
   * arrived. Absent from pushes sent by a Cloud Function deployed before it
   * existed; the feed row then falls back to arrival time.
   */
  readonly fireAt?: number;
  /** Present on a single server-polled EVE notification, which the worker renders itself. */
  readonly rawNotification?: RawEveNotification;
  /** Present on a summary push: how many new EVE notifications the Character has. */
  readonly summaryCount?: number;
  /** Present on a server-pushed event (issue #5121): the raw fire, as JSON. */
  readonly serverFire?: string;
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

  const {
    characterId,
    eventId,
    occurrenceKey: payloadKey,
    title,
    body,
    eveType,
    fireAt,
    notificationId,
    notificationTimestamp,
    notificationText,
    summaryCount,
    fire: serverFire,
  } = data as Record<string, unknown>;
  const characterIdNum = typeof characterId === 'string' ? Number(characterId) : NaN;
  if (!Number.isFinite(characterIdNum)) return null;
  if (!isNotificationEventId(eventId)) return null;
  if (typeof payloadKey !== 'string' || payloadKey.length === 0) return null;
  if (typeof title !== 'string' || title.length === 0) return null;
  if (typeof body !== 'string') return null;
  if (eveType !== undefined && typeof eveType !== 'string') return null;
  // Lenient, unlike the fields above: a bad fireAt only costs the feed row its date.
  const fireAtNum = typeof fireAt === 'string' && fireAt.length > 0 ? Number(fireAt) : NaN;

  // Lenient like fireAt: a malformed raw block only costs the rendered copy, since
  // the generic title/body are still there to show.
  const notificationIdNum =
    typeof notificationId === 'string' && notificationId.length > 0 ? Number(notificationId) : NaN;
  const raw: RawEveNotification | null =
    eventId === 'eveNotification' &&
    typeof eveType === 'string' &&
    Number.isSafeInteger(notificationIdNum) &&
    typeof notificationTimestamp === 'string' &&
    typeof notificationText === 'string'
      ? {
          notificationId: notificationIdNum,
          timestamp: notificationTimestamp,
          text: notificationText,
        }
      : null;
  const summaryNum =
    typeof summaryCount === 'string' && summaryCount.length > 0 ? Number(summaryCount) : NaN;

  return {
    characterId: characterIdNum,
    eventId,
    occurrenceKey: payloadKey,
    title,
    body,
    ...(eveType !== undefined ? { eveType } : {}),
    ...(Number.isFinite(fireAtNum) ? { fireAt: fireAtNum } : {}),
    ...(raw !== null ? { rawNotification: raw } : {}),
    ...(Number.isInteger(summaryNum) && summaryNum > 0 ? { summaryCount: summaryNum } : {}),
    // Lenient like the raw block: a bad fire only costs the rendered copy.
    ...(typeof serverFire === 'string' && serverFire.length > 0 ? { serverFire } : {}),
  };
}

interface Presented {
  title: string;
  body: string;
  /** The feed row's key: the Foreground Poller's own derivation for a raw notification. */
  feedKey: string | null;
  /** The row the fire was about, for the click target (a price alert's item). */
  subjectId?: number;
}

const t: Translate = (key, vars) => i18n.t(key, vars);

/** A server-pushed fire in the app's own words; a loss names its hull and system when the lookup answers. */
async function presentServerFire(
  env: PushEnv,
  fire: ServerEventFire,
  now: number
): Promise<Presented> {
  const feedKey = occurrenceKey(fire, now);
  switch (fire.eventId) {
    case 'communityJoinRequest':
      return { ...communityJoinRequestText(t, fire), feedKey };
    case 'communityMemberJoined':
      return { ...communityMemberJoinedText(t, fire), feedKey };
    case 'communityRequestPledged':
      return { ...communityRequestPledgedText(t, fire), feedKey };
    case 'priceAlertTriggered':
      return { ...priceAlertText(t, fire), feedKey, subjectId: fire.typeId };
    case 'shipLost': {
      const ids = [fire.shipTypeId, fire.systemId].filter((id): id is number => id !== undefined);
      const names =
        ids.length === 0 || !env.resolveIds
          ? new Map<number, string>()
          : await withinBudget(
              env.resolveIds(ids).catch(() => new Map<number, string>()),
              new Map<number, string>(),
              RESOLUTION_BUDGET_MS
            );
      return {
        ...shipLostText(t, fire, {
          ship: fire.shipTypeId === undefined ? undefined : names.get(fire.shipTypeId),
          system: fire.systemId === undefined ? undefined : names.get(fire.systemId),
        }),
        feedKey,
      };
    }
  }
}

/** The sender's own generic copy, keyed by the payload's key — the floor every failure lands on. */
function genericPresented(payload: PushPayload): Presented {
  return { title: payload.title, body: payload.body, feedKey: payload.occurrenceKey };
}

const NAME_READ_BUDGET_MS = 1_000;
/** Backstop over `present` as a whole: the name read plus the lookup budget, plus slack. */
const PRESENT_BUDGET_MS = NAME_READ_BUDGET_MS + RESOLUTION_BUDGET_MS + 1_000;

/**
 * Title and body for a payload, never throwing. A raw EVE notification is
 * rendered here; a summary gets its own sentence; anything else shows what the
 * sender wrote. Every failure lands on the payload's generic copy.
 */
async function present(env: PushEnv, payload: PushPayload, now: number): Promise<Presented> {
  const generic = genericPresented(payload);
  try {
    if (payload.serverFire !== undefined) {
      const fire = parseServerEventFire(payload.eventId, payload.characterId, payload.serverFire);
      return fire ? await presentServerFire(env, fire, now) : generic;
    }
    // Short, so the name lookups below keep their own budget inside `handlePush`'s backstop.
    const name =
      (await withinBudget(
        Promise.resolve(env.characterName?.(payload.characterId)),
        undefined,
        NAME_READ_BUDGET_MS
      )) ?? undefined;
    if (payload.summaryCount !== undefined) {
      return {
        title: i18n.t('notifications.fired.eveNotificationSummary.title'),
        body: i18n.t(
          name === undefined
            ? 'notifications.fired.eveNotificationSummary.body'
            : 'notifications.fired.eveNotificationSummary.bodyWithCharacter',
          { count: payload.summaryCount, character: name }
        ),
        // The Foreground Poller files the rows themselves when the app opens.
        feedKey: null,
      };
    }
    const raw = payload.rawNotification;
    if (raw === undefined || payload.eveType === undefined) return generic;
    const fire: EveNotificationFire = {
      eventId: 'eveNotification',
      characterId: payload.characterId,
      notificationId: raw.notificationId,
      type: payload.eveType,
      // Not carried on the wire; nothing the renderer or the key reads.
      senderId: 0,
      senderType: '',
      text: raw.text,
      timestamp: raw.timestamp,
    };
    const names = (await env.resolveNames?.(fire)) ?? {};
    // A preference read must never hold back (or drop) the rich body.
    const timeZone = await env.timeZone?.().catch(() => undefined);
    const { title, body } = renderEveNotification(
      (key, options) => i18n.t(key, options),
      fire,
      { name: name ?? i18n.t('notifications.fired.pushFallback.character') },
      names,
      timeZone
    );
    return { title, body, feedKey: occurrenceKey(fire, now) };
  } catch {
    return generic;
  }
}

/**
 * Never rejects, and always calls `showNotification` exactly once — see the
 * WebKit note above. `showNotification` and `recordFeedEntry` run
 * independently (`allSettled`, not sequential `await`s) so a Dexie failure
 * never suppresses the notification the user actually sees.
 */
export async function handlePush(env: PushEnv, rawText: string | null, now: number): Promise<void> {
  const payload = parsePushPayload(rawText);

  if (payload === null) {
    await Promise.allSettled([
      env.showNotification(
        i18n.t('notifications.fired.pushFallback.title'),
        fallbackNotificationOptions(i18n.t('notifications.fired.pushFallback.body'))
      ),
    ]);
    return;
  }

  // Bounded like the name lookups: a stuck store read must not hold the
  // notification back, because WebKit revokes the subscription on a silent push.
  const { title, body, feedKey, subjectId } = await withinBudget(
    present(env, payload, now),
    genericPresented(payload),
    PRESENT_BUDGET_MS
  );

  // Read before this push writes its own row (which marks it notified here).
  const notifiedBefore =
    feedKey !== null && env.alreadyNotified
      ? await withinBudget(
          env.alreadyNotified(feedKey).catch(() => false),
          false,
          NAME_READ_BUDGET_MS
        )
      : false;
  const options = notificationOptionsFor(
    { eventId: payload.eventId, characterId: payload.characterId, subjectId },
    body
  );
  const notify = env.showNotification(
    title,
    notifiedBefore ? { ...options, silent: true, renotify: false } : options
  );

  const feedWrite =
    feedKey === null
      ? Promise.resolve()
      : env.recordFeedEntry({
          id: feedKey,
          characterId: payload.characterId,
          eventId: payload.eventId,
          title,
          body,
          // Never in the future, should the server's clock run ahead of this device's.
          firedAt: payload.fireAt === undefined ? now : Math.min(payload.fireAt, now),
          // So this device's Foreground Poller does not toast it a second time.
          notifiedHereAt: now,
          ...(payload.eveType !== undefined ? { eveType: payload.eveType } : {}),
          ...(subjectId !== undefined ? { subjectId } : {}),
        });

  await Promise.allSettled([notify, feedWrite]);
}
