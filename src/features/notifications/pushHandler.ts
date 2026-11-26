import { createInstance } from 'i18next';
import { notifications } from '@/i18n/locales/en.json';
import {
  notificationOptionsFor,
  fallbackNotificationOptions,
  occurrencePath,
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
  vettingSharedText,
  corpTaxBookSyncStoppedText,
  communityRequestPledgedText,
  newMailText,
  priceAlertText,
} from './serverEventCopy';
import type { Translate } from '@/lib/translate';
import {
  incursionNearbyWording,
  skyhookRaidableNearbyWording,
} from './pollDomains/copy/nearbyWording';
import { vettingSharedPath } from '@/engine/vettingAlert';

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
  characterName?: (characterId: number) => Promise<string | undefined>;
  resolveNames?: (fire: EveNotificationFire) => Promise<EveNotificationNames>;
  timeZone?: () => Promise<string | undefined>;
  resolveIds?: (ids: readonly number[]) => Promise<ReadonlyMap<number, string>>;
  alreadyNotified?: (occurrenceKey: string) => Promise<boolean>;
}

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
  readonly eveType?: string;
  readonly fireAt?: number;
  readonly rawNotification?: RawEveNotification;
  readonly summaryCount?: number;
  readonly serverFire?: string;
}

function isNotificationEventId(value: unknown): value is NotificationEventId {
  return typeof value === 'string' && (NOTIFICATION_EVENT_IDS as readonly string[]).includes(value);
}

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
  const fireAtNum = typeof fireAt === 'string' && fireAt.length > 0 ? Number(fireAt) : NaN;

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
    ...(typeof serverFire === 'string' && serverFire.length > 0 ? { serverFire } : {}),
  };
}

interface Presented {
  title: string;
  body: string;
  feedKey: string | null;
  subjectId?: number;
  path?: string;
  feedBody?: string;
}

const t: Translate = (key, vars) => i18n.t(key, vars);

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
    case 'vettingShared':
      return { ...vettingSharedText(t, fire), feedKey, path: vettingSharedPath(fire) };
    case 'corpTaxBookSyncStopped':
      return { ...corpTaxBookSyncStoppedText(t, fire), feedKey };
    case 'newMail': {
      const character =
        (await withinBudget(
          Promise.resolve(env.characterName?.(fire.characterId)),
          undefined,
          NAME_READ_BUDGET_MS
        )) ?? t('notifications.fired.pushFallback.character');
      const names = await publicNames(env, fire.fromId === undefined ? [] : [fire.fromId]);
      const plain = newMailText(t, {}, character);
      const popup = newMailText(t, fire, character, {
        sender: fire.fromId === undefined ? undefined : names.get(fire.fromId),
      });
      return { ...popup, feedBody: plain.body, feedKey };
    }
    case 'incursionNearby': {
      const names = await publicNames(env, [fire.constellationId, fire.stagingSystemId]);
      return {
        ...incursionNearbyWording(t, fire, {
          constellation: names.get(fire.constellationId),
          system: names.get(fire.stagingSystemId),
        }),
        feedKey,
      };
    }
    case 'skyhookRaidableNearby': {
      const names = await publicNames(env, [fire.systemId, fire.planetId]);
      return {
        ...skyhookRaidableNearbyWording(
          t,
          fire,
          { system: names.get(fire.systemId), planet: names.get(fire.planetId) },
          now
        ),
        feedKey,
      };
    }
  }
}

async function publicNames(
  env: PushEnv,
  ids: readonly number[]
): Promise<ReadonlyMap<number, string>> {
  if (ids.length === 0 || !env.resolveIds) return new Map();
  return withinBudget(
    env.resolveIds(ids).catch(() => new Map<number, string>()),
    new Map<number, string>(),
    RESOLUTION_BUDGET_MS
  );
}

function genericPresented(payload: PushPayload): Presented {
  return { title: payload.title, body: payload.body, feedKey: payload.occurrenceKey };
}

const NAME_READ_BUDGET_MS = 1_000;
const PRESENT_BUDGET_MS = NAME_READ_BUDGET_MS + RESOLUTION_BUDGET_MS + 1_000;

async function present(env: PushEnv, payload: PushPayload, now: number): Promise<Presented> {
  const generic = genericPresented(payload);
  try {
    if (payload.serverFire !== undefined) {
      const fire = parseServerEventFire(payload.eventId, payload.characterId, payload.serverFire);
      return fire ? await presentServerFire(env, fire, now) : generic;
    }
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
      senderId: 0,
      senderType: '',
      text: raw.text,
      timestamp: raw.timestamp,
    };
    const names = (await env.resolveNames?.(fire)) ?? {};
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

  const { title, body, feedBody, feedKey, subjectId, path } = await withinBudget(
    present(env, payload, now),
    genericPresented(payload),
    PRESENT_BUDGET_MS
  );

  const notifiedBefore =
    feedKey !== null && env.alreadyNotified
      ? await withinBudget(
          env.alreadyNotified(feedKey).catch(() => false),
          false,
          NAME_READ_BUDGET_MS
        )
      : false;
  const ownPath = path ?? occurrencePath(payload.eventId, payload.occurrenceKey);
  const options = notificationOptionsFor(
    {
      eventId: payload.eventId,
      characterId: payload.characterId,
      subjectId,
      ...(ownPath === undefined ? {} : { path: ownPath }),
    },
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
          body: feedBody ?? body,
          firedAt: payload.fireAt === undefined ? now : Math.min(payload.fireAt, now),
          notifiedHereAt: now,
          ...(payload.eveType !== undefined ? { eveType: payload.eveType } : {}),
          ...(subjectId !== undefined ? { subjectId } : {}),
        });

  await Promise.allSettled([notify, feedWrite]);
}
