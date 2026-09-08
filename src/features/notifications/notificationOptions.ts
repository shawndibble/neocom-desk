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
import { HIGHLIGHT_PARAM } from '@/lib/useHighlightParam';
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
  // `notificationUrlForSubject` adds `?highlight=` where the fire knows its
  // subject, which pulses that row on arrival.
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

/**
 * What a fire was *about*, structurally — deliberately not `AnyNotificationFire`,
 * so this module stays free of a cycle back through the poller. Each event
 * reads whichever of these fields its own diff sets.
 */
export interface NotificationSubject {
  eventId: string;
  typeId?: number;
  journalEntryId?: number;
  contractId?: number;
  jobId?: number;
  memberCharacterId?: number;
}

interface SubjectRoute {
  /** The id of the row this fire was about, if its diff carries one. */
  readonly subjectOf: (fire: NotificationSubject) => number | undefined;
  /** How that id reaches the destination page. */
  readonly url: (base: string, subjectId: number) => string;
}

/** Every subject-routed event lands on a table that pulses the row (`lib/useHighlightParam`). */
const highlightRow = (base: string, subjectId: number) =>
  withParam(base, HIGHLIGHT_PARAM, String(subjectId));

/**
 * The events whose destination depends on *what the fire was about*, not only
 * on which event it was.
 *
 * An alert that opens the right page still leaves the pilot scanning a table
 * for the thing they were just told about. Every entry here names a
 * destination that is a table, keyed by an id the fire already carries, so
 * arriving means arriving *on the row*.
 *
 * The bar for an entry is that the row is **actually there on arrival**. That
 * rules out `corpMemberLeft` — the roster no longer lists them — and it rules
 * out every event whose destination is not a table at all: mail, the skill
 * tree, the colony cards, the corp board, the calendar. A key matching no row
 * is harmless, but an entry that can *never* match is a promise this cannot
 * keep.
 *
 * A table rather than an `if` per event: the URL builder and the "has this
 * fire a subject worth storing" check both answer to one entry, so a new event
 * is one line here instead of two edits that can disagree.
 */
const SUBJECT_ROUTES: Partial<Record<NotificationEventId, SubjectRoute>> = {
  // The fill itself — what sold, how many, to whom. ESI's transactions carry
  // no order id, so the panel resolves the item to its newest sell; every
  // other entry here is an exact row id.
  marketOrderFilled: { subjectOf: (fire) => fire.typeId, url: highlightRow },
  // The journal line that moved the balance.
  walletBalanceChanged: { subjectOf: (fire) => fire.journalEntryId, url: highlightRow },
  // The contract someone just took. Still listed — the filter defaults to every status.
  contractAccepted: { subjectOf: (fire) => fire.contractId, url: highlightRow },
  // The job sits in Active Jobs until it is delivered, which is the point.
  industryJobComplete: { subjectOf: (fire) => fire.jobId, url: highlightRow },
  // The new member's roster row.
  corpMemberJoined: { subjectOf: (fire) => fire.memberCharacterId, url: highlightRow },
};

/**
 * Where a fire lands, narrowed by what it was about where that changes the
 * answer.
 *
 * A fire carrying no subject — an older build's row, or one Web Push wrote —
 * degrades to the event's own route rather than to the fallback.
 */
export function notificationUrlForSubject(eventId: string, subjectId: number | undefined): string {
  const base = notificationUrlFor(eventId);
  const route = SUBJECT_ROUTES[eventId as NotificationEventId];
  return route === undefined || subjectId === undefined ? base : route.url(base, subjectId);
}

/** The row a fire was about, where its event has a use for one — see `NotificationFeedRecord.subjectId`. */
export function notificationSubjectId(fire: NotificationSubject): number | undefined {
  return SUBJECT_ROUTES[fire.eventId as NotificationEventId]?.subjectOf(fire);
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
