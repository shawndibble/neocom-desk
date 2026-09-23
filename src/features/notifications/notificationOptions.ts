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
 *   roughly 24dp. `badge-96.png` is the mark's own positive space: the hull
 *   hexagon as a ring plus a solid star, not a filled shape with the star
 *   punched out of it. The diamond hole inside the star and the four corner
 *   traces stay out — they silt into a blob at that size — but the ring and
 *   star read down to 16px.
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
import { HIGHLIGHT_PARAM } from '@/lib/useHighlightParam';
import type { NotificationEventId } from './events';

const ICON_URL = '/icons/icon-192.png';
const BADGE_URL = '/icons/badge-96.png';

/** Where each event's notification lands. Falls back to the Alerts page. */
export const NOTIFICATION_ROUTES: Record<NotificationEventId, string> = {
  skillLevelComplete: '/skills/trained',
  characterNotTraining: '/skills/trained',
  // The Characters table view, not the skill tree: "ready to extract" is a
  // roster-wide, cross-character fact, and that table is where the SP-ready
  // column and its threshold live.
  spExtractionReady: '/characters',
  industryJobComplete: '/industry',
  planetaryExtractionDone: '/planetary-industry',
  planetaryExtractorExpiring: '/planetary-industry',
  newMail: '/mail',
  newCalendarEvent: '/calendar',
  calendarEventStarting: '/calendar',
  // The explicit History path because Search, not History, is the page's
  // default tab — and this alert is about a row in *History*.
  // `notificationUrlForSubject` then adds `?highlight=`, which
  // `useHighlightParam` spends on arrival whether or not a row matched;
  // landing on the wrong tab would burn it for nothing.
  contractAccepted: '/contracts/history',
  // Same destination as acceptance (issue #1091) — both are about a row in
  // History, just a later transition of the same contract.
  contractCompleted: '/contracts/history',
  contractFailed: '/contracts/history',
  // `?tab=` deep-links straight to the tab that actually shows the event,
  // not just the page — `Wallet.tsx` reads it once on mount.
  walletBalanceChanged: '/wallet?tab=journal',
  // The *history*, not Open Orders: a filled order has left the open list, so
  // the tab this used to land on is the one place the thing it is telling you
  // about is guaranteed not to be. Transactions is where the fill itself is
  // written down — what sold, how many, for how much, to whom.
  // `notificationUrlForSubject` adds `?highlight=` where the fire knows its
  // subject, which pulses that row on arrival.
  marketOrderFilled: '/market/history/transactions',
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
  // `notificationUrlForSubject` adds `?type=` below — Market Browser's own
  // item-selection param (`engine/market/urlState.ts`'s `buildMarketParams`),
  // not `HIGHLIGHT_PARAM`: Market Browser selects an item by that param on
  // load rather than pulsing a table row.
  priceAlertTriggered: '/market/browser',
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
   * The row the fire was about, for the events whose destination depends on
   * it. Baked into `data.url` at fire time rather than resolved on click: the
   * Service Worker handling a `notificationclick` has no idea which fire
   * produced the bubble it is closing.
   */
  subjectId?: number;
}

/**
 * An event id stored by an older build, or one this catalog has since
 * dropped, still has to go somewhere a user can act on.
 */
export function notificationUrlFor(eventId: string): string {
  return NOTIFICATION_ROUTES[eventId as NotificationEventId] ?? NOTIFICATION_FALLBACK_ROUTE;
}

/** Adds one query parameter, whether or not `url` already carries a query string. */
function withParam(url: string, key: string, value: string): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${path}?${params}`;
}

/** How a subject id reaches the destination page. */
type SubjectUrl = (base: string, subjectId: number) => string;

/** Every highlight-routed event lands on a table that pulses the row (`lib/useHighlightParam`). */
const highlightRow: SubjectUrl = (base, subjectId) =>
  withParam(base, HIGHLIGHT_PARAM, String(subjectId));

/**
 * The events whose destination depends on *what the fire was about*, not only
 * on which event it was — and how the id reaches that page.
 *
 * An alert that opens the right page still leaves the pilot scanning a table
 * for the thing they were just told about. Every entry here names a
 * destination keyed by an id the fire already carries, so arriving means
 * arriving *on the row*.
 *
 * The bar for an entry is that the row is **actually there on arrival**. That
 * rules out `corpMemberLeft` — the roster no longer lists them — and it rules
 * out every event whose destination is not a table at all: mail, the skill
 * tree, the colony cards, the corp board, the calendar. A key matching no row
 * is harmless, but an entry that can *never* match is a promise this cannot
 * keep.
 *
 * Which field of the fire is the subject lives on the event's poll domain
 * (`domainCopy.ts`'s `subjectOf`, issue #1249); only the URL shape is here,
 * because the Service Worker (`pushHandler.ts`) and the Alerts page build
 * URLs from a stored event id and must not import the poll registry.
 * `pollDomains.test.ts` pins the two to the same set of events.
 */
const SUBJECT_URLS: Partial<Record<NotificationEventId, SubjectUrl>> = {
  marketOrderFilled: highlightRow,
  walletBalanceChanged: highlightRow,
  contractAccepted: highlightRow,
  contractCompleted: highlightRow,
  contractFailed: highlightRow,
  industryJobComplete: highlightRow,
  corpMemberJoined: highlightRow,
  // The item itself, selected via Market Browser's own `?type=` param rather
  // than a pulsed table row — there is no table on arrival to pulse.
  priceAlertTriggered: (base, subjectId) => withParam(base, 'type', String(subjectId)),
};

/** The events a subject id routes for — see `SUBJECT_URLS`. */
export const SUBJECT_ROUTED_EVENT_IDS = Object.keys(SUBJECT_URLS) as NotificationEventId[];

/**
 * Where a fire lands, narrowed by what it was about where that changes the
 * answer.
 *
 * A fire carrying no subject — an older build's row, or one Web Push wrote —
 * degrades to the event's own route rather than to the fallback.
 */
export function notificationUrlForSubject(eventId: string, subjectId: number | undefined): string {
  const base = notificationUrlFor(eventId);
  const url = SUBJECT_URLS[eventId as NotificationEventId];
  return url === undefined || subjectId === undefined ? base : url(base, subjectId);
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
    data: { url: notificationUrlForSubject(target.eventId, target.subjectId) },
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
