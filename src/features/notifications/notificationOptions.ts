import { ALERT_CHARACTER_PARAM } from '@/lib/alertCharacterParam';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import {
  sharedMoonPopPath,
  sharedPopIdOfOccurrenceKey,
} from '@/engine/notificationDiffs/sharedMoonPop';
import type { NotificationEventId } from './events';

const ICON_URL = '/icons/icon-192.png';
const BADGE_URL = '/icons/badge-96.png';

export const NOTIFICATION_ROUTES: Record<NotificationEventId, string> = {
  skillLevelComplete: '/skills/plans',
  characterNotTraining: '/skills/trained',
  skillQueueEnding: '/skills',
  omegaLapsed: '/skills',
  acceleratorExpiring: '/characters',
  acceleratorEnded: '/characters',
  spExtractionReady: '/characters',
  industryJobComplete: '/industry',
  cloneJumpReady: '/clones',
  planetaryExtractionDone: '/planetary-industry',
  planetaryExtractorExpiring: '/planetary-industry',
  mercenaryDenReinforced: '/overview',
  mercenaryDenAnarchy: '/overview',
  newMail: '/mail',
  newCalendarEvent: '/calendar',
  calendarEventStarting: '/calendar',
  sharedMoonPop: '/calendar',
  contractAccepted: '/contracts/history',
  contractCompleted: '/contracts/history',
  contractFailed: '/contracts/history',
  courierDeliveryDue: '/contracts/history',
  contractExpiring: '/contracts/history',
  walletBalanceChanged: '/wallet/journal',
  marketOrderFilled: '/market/history',
  marketOrderUndercut: '/market/orders',
  ordersLapsing: '/market/orders',
  eveNotification: '/alerts',
  structureFuelLow: '/corp/structures',
  skyhookRaidable: '/corp',
  corpIndustryJobReady: '/industry',
  corpMemberJoined: '/corp/members',
  corpMemberLeft: '/corp/members',
  corpWalletThreshold: '/corp/wallet',
  priceAlertTriggered: '/market/browser',
  stockBelowTarget: '/market/stock',
  incursionNearby: '/travel/route',
  skyhookRaidableNearby: '/overview',
  shipLost: '/overview',
  characterNeedsLogin: '/characters',
  communityJoinRequest: '/communities',
  communityMemberJoined: '/communities',
  communityRequestPledged: '/communities',
  vettingShared: '/corp/vetting/open',
  corpTaxBookSyncStopped: '/corp/moons/overview',
};

export const NOTIFICATION_FALLBACK_ROUTE = '/alerts';

export interface AppNotificationOptions extends NotificationOptions {
  renotify?: boolean;
}

export interface NotificationTarget {
  eventId: NotificationEventId;
  characterId: number;
  subjectId?: number;
  path?: string;
}

export function notificationUrlFor(eventId: string): string {
  return NOTIFICATION_ROUTES[eventId as NotificationEventId] ?? NOTIFICATION_FALLBACK_ROUTE;
}

export function occurrencePath(eventId: string, occurrenceKey: string): string | undefined {
  if (eventId !== 'sharedMoonPop') return undefined;
  const popId = sharedPopIdOfOccurrenceKey(occurrenceKey);
  return popId === undefined ? undefined : sharedMoonPopPath(popId);
}

function withParam(url: string, key: string, value: string): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${path}?${params}`;
}

type SubjectUrl = (base: string, subjectId: number) => string;

const highlightRow: SubjectUrl = (base, subjectId) =>
  withParam(base, HIGHLIGHT_PARAM, String(subjectId));

const SUBJECT_URLS: Partial<Record<NotificationEventId, SubjectUrl>> = {
  marketOrderFilled: highlightRow,
  marketOrderUndercut: highlightRow,
  walletBalanceChanged: highlightRow,
  contractAccepted: highlightRow,
  contractCompleted: highlightRow,
  contractFailed: highlightRow,
  courierDeliveryDue: highlightRow,
  contractExpiring: highlightRow,
  industryJobComplete: highlightRow,
  corpIndustryJobReady: highlightRow,
  corpMemberJoined: highlightRow,
  priceAlertTriggered: (base, subjectId) => withParam(base, 'type', String(subjectId)),
  stockBelowTarget: (base, subjectId) => withParam(base, 'market', String(subjectId)),
  incursionNearby: (base, subjectId) => withParam(base, 'stops', String(subjectId)),
  corpWalletThreshold: (base, subjectId) => withParam(base, 'division', String(subjectId)),
};

export const SUBJECT_ROUTED_EVENT_IDS = Object.keys(SUBJECT_URLS) as NotificationEventId[];

export function notificationUrlForSubject(
  eventId: string,
  subjectId: number | undefined,
  characterId?: number,
  occurrenceKey?: string
): string {
  const base = notificationUrlFor(eventId);
  const url = SUBJECT_URLS[eventId as NotificationEventId];
  const own = occurrenceKey === undefined ? undefined : occurrencePath(eventId, occurrenceKey);
  const routed =
    own ?? (url === undefined || subjectId === undefined ? base : url(base, subjectId));
  return characterId === undefined
    ? routed
    : withParam(routed, ALERT_CHARACTER_PARAM, String(characterId));
}

export function notificationTagFor(target: NotificationTarget): string {
  return `${target.characterId}:${target.eventId}`;
}

export function notificationOptionsFor(
  target: NotificationTarget,
  body: string
): AppNotificationOptions {
  return {
    body,
    icon: ICON_URL,
    badge: BADGE_URL,
    tag: notificationTagFor(target),
    renotify: true,
    data: {
      url:
        target.path === undefined
          ? notificationUrlForSubject(target.eventId, target.subjectId, target.characterId)
          : withParam(target.path, ALERT_CHARACTER_PARAM, String(target.characterId)),
    },
  };
}

const PUSH_FALLBACK_TAG = 'push:fallback';

export function fallbackNotificationOptions(body: string): AppNotificationOptions {
  return {
    body,
    icon: ICON_URL,
    badge: BADGE_URL,
    tag: PUSH_FALLBACK_TAG,
    renotify: true,
    data: { url: NOTIFICATION_FALLBACK_ROUTE },
  };
}
