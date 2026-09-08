/**
 * The `showNotification` options every fired notification carries, shared by
 * the page-context path (`display.ts`) and the Service Worker path
 * (`pushHandler.ts`) so the two cannot drift.
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

/** Where each event's notification lands. Falls back to the Alerts page. */
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
  // `?tab=` deep-links straight to the tab that actually shows the event,
  // not just the page — `Wallet.tsx` reads it once on mount.
  walletBalanceChanged: '/wallet?tab=journal',
  // The *history*, not Open Orders: a filled order has left the open list, so
  // the tab this used to land on is the one place the thing it is telling you
  // about is guaranteed not to be. Transactions is where the fill itself is
  // written down — what sold, how many, for how much, to whom.
  // `notificationUrlForSubject` adds `&highlight=` where the fire knows its
  // item, which pulses that row on arrival.
  marketOrderFilled: '/market?section=transactions',
  // ~100 EVE-native types (issue #274), most with no corresponding page in
  // the app. `/alerts` is a deliberate choice for this event rather than an
  // inherited default — and now a real destination rather than a shrug: the
  // page groups by `eveType`, so a tapped "structure under attack" lands on
  // the list of every structure-under-attack alert, which is the closest thing
  // to a page these types have.
  eveNotification: '/alerts',
  // Corp events (issue #299): the board and the roster are the only two
  // corp routes the app serves (`app/routeScopes.ts`).
  structureFuelLow: '/corp',
  corpIndustryJobReady: '/corp',
  corpMemberJoined: '/corp/members',
  corpMemberLeft: '/corp/members',
  corpWalletThreshold: '/corp',
};

export const NOTIFICATION_FALLBACK_ROUTE = '/alerts';

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
  /**
   * The item the fire was about, for the events whose destination depends on
   * it. Baked into `data.url` at fire time rather than resolved on click: the
   * Service Worker handling a `notificationclick` has no idea which fire
   * produced the bubble it is closing.
   */
  typeId?: number;
}

/**
 * An event id stored by an older build, or one this catalog has since
 * dropped, still has to go somewhere a user can act on.
 */
export function notificationUrlFor(eventId: string): string {
  return NOTIFICATION_ROUTES[eventId as NotificationEventId] ?? NOTIFICATION_FALLBACK_ROUTE;
}

/**
 * The query key `TransactionsPanel` reads to scroll to and pulse one row.
 * Exported so the panel and the link that sends it there cannot disagree on
 * the spelling.
 */
export const HIGHLIGHT_PARAM = 'highlight';

/** Adds one query parameter, whether or not `url` already carries a query string. */
function withParam(url: string, key: string, value: string): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${path}?${params}`;
}

/**
 * The events whose destination depends on *what the fire was about*, not only
 * on which event it was.
 *
 * A table rather than an `if` naming `marketOrderFilled` inside two separate
 * functions: the URL builder and the "has this fire a subject worth storing"
 * check both answer to one entry, so adding a second such event is one line
 * here instead of two edits that can disagree. Anything absent from this
 * table ignores its subject and resolves to `NOTIFICATION_ROUTES` exactly as
 * before.
 */
const SUBJECT_ROUTES: Partial<
  Record<NotificationEventId, (base: string, typeId: number) => string>
> = {
  // Landing on the Transactions tab already beats landing on Open Orders, but
  // a pilot with a page of fills still has to hunt for the one they were just
  // told about; the item id turns that into an arrival on the row itself.
  marketOrderFilled: (base, typeId) => withParam(base, HIGHLIGHT_PARAM, String(typeId)),
};

/**
 * Where a fire lands, narrowed by what it was about where that changes the
 * answer.
 *
 * A fire carrying no subject — an older build's row, or one Web Push wrote —
 * degrades to the event's own route rather than to the fallback.
 */
export function notificationUrlForSubject(eventId: string, typeId: number | undefined): string {
  const base = notificationUrlFor(eventId);
  const route = SUBJECT_ROUTES[eventId as NotificationEventId];
  return route === undefined || typeId === undefined ? base : route(base, typeId);
}

/** The item a fire was about, where its event has a use for one — see `NotificationFeedRecord.typeId`. */
export function notificationSubjectTypeId(fire: {
  eventId: string;
  typeId?: number;
}): number | undefined {
  return fire.eventId in SUBJECT_ROUTES ? fire.typeId : undefined;
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
    data: { url: notificationUrlForSubject(target.eventId, target.typeId) },
  };
}

/**
 * Same shared `icon`/`badge`/`tag`+`renotify` shape as {@link notificationOptionsFor},
 * for the one caller (`pushHandler.ts`'s malformed-payload path) that has no
 * `NotificationTarget` to key a tag with — there is no Character or Event id
 * to trust in an unparseable push. A fixed tag still matters here: several
 * malformed pushes in a row should replace one bubble, not stack into many.
 */
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
