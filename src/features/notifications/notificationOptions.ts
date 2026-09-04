/**
 * The `showNotification` options every fired notification carries, shared by
 * the page-context path (`display.ts`) and the Service Worker path
 * (`backgroundPoller.ts`) so the two cannot drift.
 *
 * Previously both passed `{ body }` alone, which left three things on the
 * table:
 *
 * - **`icon`** — without it Android draws a generic browser glyph rather than
 *   the app's mark.
 * - **`badge`** — the monochrome status-bar shape, masked to a silhouette at
 *   roughly 24dp. `badge-96.png` is deliberately just the hull hexagon from
 *   `favicon.svg`, not the full mark: the star body, its diamond hole and the
 *   four corner traces silt into a blob at that size.
 * - **`tag`** + **`renotify`** — without a tag, three wallet changes stack
 *   into three separate bubbles. The tag is per Character *and* per event, so
 *   a second wallet alert replaces the first without an industry alert
 *   replacing a mail one, and without one Character's alerts swallowing
 *   another's. `renotify` is required alongside it because a tag replacement
 *   is otherwise silent — the whole point here is to alert again.
 *
 * `data.url` is what `notificationClick.ts` navigates to; it is carried on the
 * notification rather than derived at click time because the Service Worker
 * handling the click has no idea which fire produced it.
 */
import type { NotificationEventId } from './events';

const ICON_URL = '/icons/icon-192.png';
const BADGE_URL = '/icons/badge-96.png';

/** Where each event's notification lands. Falls back to the dashboard. */
export const NOTIFICATION_ROUTES: Record<NotificationEventId, string> = {
  skillLevelComplete: '/skills/trained',
  characterNotTraining: '/skills/trained',
  industryJobComplete: '/industry',
  planetaryExtractionDone: '/planetary-industry',
  planetaryExtractorExpiring: '/planetary-industry',
  newMail: '/mail',
  newCalendarEvent: '/calendar',
  calendarEventStarting: '/calendar',
  contractAccepted: '/contracts',
  walletBalanceChanged: '/wallet',
  marketOrderFilled: '/orders',
  // ~100 EVE-native types (issue #274), most with no corresponding page in
  // the app — the Overview fallback is a deliberate choice for this event,
  // not an inherited default.
  eveNotification: '/overview',
  // Corp events (issue #299): the board and the roster are the only two
  // corp routes the app serves (`app/routeScopes.ts`).
  structureFuelLow: '/corp',
  corpIndustryJobReady: '/corp',
  corpMemberJoined: '/corp/members',
  corpMemberLeft: '/corp/members',
  corpWalletThreshold: '/corp',
};

export const NOTIFICATION_FALLBACK_ROUTE = '/overview';

/**
 * `renotify` is real and required for our tag behaviour, but TypeScript's DOM
 * lib has dropped it from `NotificationOptions`. Declared here rather than
 * cast away at each call site, so the option stays type-checked.
 */
export interface AppNotificationOptions extends NotificationOptions {
  renotify?: boolean;
}

/** Minimal shape of a fire — deliberately not `AnyNotificationFire`, so this module stays free of a cycle back through the poller. */
export interface NotificationTarget {
  eventId: NotificationEventId;
  characterId: number;
}

/**
 * An event id stored by an older build, or one this catalog has since
 * dropped, still has to go somewhere a user can act on.
 */
export function notificationUrlFor(eventId: string): string {
  return NOTIFICATION_ROUTES[eventId as NotificationEventId] ?? NOTIFICATION_FALLBACK_ROUTE;
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
    data: { url: notificationUrlFor(target.eventId) },
  };
}
