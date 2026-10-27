/**
 * The Foreground Poller's two delivery channels plus the contract-feed
 * revision: what `PollDependencies.notify` / `recordToFeed` /
 * `reviseContractFeedRow` do live. Split out of `foregroundPoller.ts` (#4111).
 */
import { db } from '@/db';
import { scheduleSync } from '@/sync';
import { occurrenceKey, occurrenceFiredAt } from '@/engine/occurrenceKey';
import type { ContractNotificationFire } from '@/engine/notificationDiffs';
import { renderNotification, notificationSubjectId, type AnyNotificationFire } from './pollDomains';
import { recordFeedEntryAndSync } from './feedSync';
import { displayPageNotification, livePageDisplayEnv } from './display';
import { notificationOptionsFor } from './notificationOptions';
import type { CharacterRef } from './foregroundPoller';

/**
 * Delivery goes through `display.ts`, which prefers the Service Worker
 * registration's `showNotification` over `new Notification(...)` — the
 * constructor throws on Android Chrome and does not exist on iOS, so it is
 * the one path that reaches a phone at all. A failure on every path is
 * swallowed there: pollerState.ts is what prevents a re-fire, not this call
 * succeeding.
 *
 * `override` is the copy the delivery loop already rendered (and, for a
 * grouped burst, already count-adjusted) — `renderNotification` is only called
 * here as a fallback for a caller reaching this directly, outside that loop.
 */
export async function sendBrowserNotification(
  fire: AnyNotificationFire,
  character: CharacterRef,
  override?: { title: string; body: string }
): Promise<void> {
  const { title, body } = override ?? (await renderNotification(fire, character.name));
  await displayPageNotification(
    livePageDisplayEnv(),
    title,
    notificationOptionsFor(
      {
        eventId: fire.eventId,
        characterId: character.characterId,
        subjectId: notificationSubjectId(fire),
      },
      body
    )
  );
}

/**
 * Files the same copy the browser notification carries into the Notification
 * Feed. Always renders its own copy from the raw `fire` — never grouped the
 * way `sendBrowserNotification`'s toast is (`runForegroundPollOnce`'s doc
 * comment on the feed-delivery loop): one row per actual occurrence, each
 * keyed by its own `occurrenceKey`, is what keeps the feed agreeing with the
 * Scheduled Push backend's independent view of the same occurrences.
 */
export async function recordFeedNotification(
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<void> {
  try {
    const { title, body } = await renderNotification(fire, character.name);
    const now = Date.now();
    // Dated by the occurrence, not by this poll, wherever the fire knows when
    // it happened (`occurrenceFiredAt`): a device opened after days away
    // reports everything it missed in one poll, and stamping all of it `now`
    // would pile days of history onto one minute at the top of the feed.
    const firedAt = occurrenceFiredAt(fire, now);
    await recordFeedEntryAndSync({
      id: occurrenceKey(fire, now),
      characterId: character.characterId,
      eventId: fire.eventId,
      eveType: fire.eventId === 'eveNotification' ? fire.type : undefined,
      subjectId: notificationSubjectId(fire),
      title,
      body,
      firedAt,
      // Marks the row provisional until `fillTimeSettle` finds the sale.
      ...(fire.eventId === 'marketOrderFilled' && fire.fillMatch !== undefined
        ? { fillMatch: fire.fillMatch }
        : {}),
      ...('walletChangeIsk' in fire && fire.walletChangeIsk !== undefined
        ? { walletChangeIsk: fire.walletChangeIsk }
        : {}),
    });
  } catch {
    // Same fire-and-forget contract as sendBrowserNotification: pollerState
    // is already persisted, so a failed write must not abort the remaining
    // fires of this poll.
  }
}

/**
 * Rewrites a contract alert's existing feed row so its body carries the wallet
 * change that arrived after it (the journal lags the contract list by up to an
 * hour). Only the body moves: `firedAt`, `dismissedAt` and the row's key stay.
 * The browser toast that already went out is not touched.
 */
export async function reviseContractFeedRow(
  fire: ContractNotificationFire,
  character: CharacterRef
): Promise<void> {
  try {
    const key = occurrenceKey(fire, Date.now());
    const changed = await db.transaction('rw', db.notificationFeed, async () => {
      const row = await db.notificationFeed.get(key);
      if (row === undefined || fire.walletChangeIsk === undefined) return 0;
      // Lines land across polls, so this adds to what the row already carries.
      const total = (row.walletChangeIsk ?? 0) + fire.walletChangeIsk;
      const { body } = await renderNotification(
        { ...fire, walletChangeIsk: total },
        character.name
      );
      return db.notificationFeed
        .where('id')
        .equals(key)
        .modify((r) => {
          r.walletChangeIsk = total;
          r.body = body;
          // Same as `fillTimeSettle`: clearing this is what pushes the row again.
          delete r.syncedAt;
        });
    });
    if (changed > 0) scheduleSync(character.characterId, { collections: ['notificationFeed'] });
  } catch {
    // The wallet fire is already dropped and the baseline advanced; a failed
    // revision costs the amount on one row, not the poll.
  }
}
