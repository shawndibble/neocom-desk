/**
 * Delivers one Character's fires: folds wallet lines into contract alerts,
 * writes the feed rows, then raises the grouped browser notifications. Split
 * out of `foregroundPoller.ts` (#4111).
 */
import i18n from '@/i18n';
import { occurrenceKey } from '@/engine/occurrenceKey';
import { renderNotification, type AnyNotificationFire } from '../pollDomains';
import { groupIdenticalFires, type RenderedFire } from '../groupFires';
import { foldWalletFires } from '../walletFold';
import {
  isEventEnabledFor,
  isEveTypeAllowed,
  isEveTypeEnabledFor,
  type EveTypeEnabledMap,
  type NotificationChannel,
} from '../eventSelection';
import type { CharacterRef, PollDependencies } from '../foregroundPoller';
import type { CharacterUpdate, LiveChannels } from './pollCharacter';

/**
 * A layer underneath `isEventEnabledFor` for `eveNotification` fires only
 * (issue #274): every other event's channel gate is the single check above,
 * but this one event covers the Notification Allow-List's types (issue
 * #350), each independently opt-out-able. Non-`eveNotification` fires pass
 * through unchanged. Only ever reached for allow-listed types — the poll
 * loop below drops everything else before this runs.
 */
function eveTypeAllowsChannel(
  fire: AnyNotificationFire,
  eveTypePrefs: EveTypeEnabledMap,
  channel: NotificationChannel
): boolean {
  if (fire.eventId !== 'eveNotification') return true;
  return isEveTypeEnabledFor(eveTypePrefs, fire.type, channel);
}

/** `"{{title}} x{{count}}"` — the suffix a grouped browser-toast title carries (`groupFires.ts`). */
function groupedTitle(title: string, count: number): string {
  return i18n.t('notifications.groupedTitle', { title, count });
}

/** Delivers one Character's fires across the browser and feed channels. */
export async function dispatchFires(
  deps: PollDependencies,
  channels: LiveChannels,
  character: CharacterRef,
  update: CharacterUpdate
): Promise<void> {
  const { browser: browserEnabled, feed: feedEnabled } = channels;
  // Notification Allow-List (GLOSSARY.md round 44): a type outside the
  // closed list is dropped here, before either channel and before any
  // name-resolution work (renderNotification → the domain's `names`)
  // that recordToFeed/notify would otherwise trigger for it.
  const allowed = update.fires.filter(
    (fire) => fire.eventId !== 'eveNotification' || isEveTypeAllowed(fire.type)
  );

  // A wallet change a contract caused rides on that contract's alert instead
  // of raising its own (`walletFold.ts`). Per channel, since a contract event
  // can be on for one and off for the other.
  const folded = await foldWalletFires({
    foldEnabled: update.walletFoldEnabled,
    walletStandalone: update.walletStandalone,
    fires: allowed,
    isEnabled: (channel, eventId) =>
      (channel === 'feed' ? feedEnabled : browserEnabled) &&
      isEventEnabledFor(update.eventPrefs, eventId, channel),
    rowExists: deps.feedRowExists,
    nowMs: deps.now(),
  });
  const feedSourceFires = folded.feedFires;
  const browserSourceFires = folded.browserFires;
  for (const revision of folded.revisions) {
    await deps.reviseContractFeedRow(revision, character);
  }

  // Browser: grouped, and checked against the feed *before* the feed loop
  // below writes anything (issue #360). Web Push, or another device/tab
  // syncing the feed, may have already delivered this exact occurrence —
  // `deps.alreadyDelivered` is what lets the poller suppress its own
  // redundant bubble for it. This must run before this device's own feed
  // loop: that loop's `recordToFeed` writes a row keyed by the very same
  // Occurrence Key, and for the common case of an event with both channels
  // enabled, checking after that write would make every occurrence appear
  // "already delivered" by itself. Checked per fire, by Occurrence Key, not
  // by comparing rendered copy — grouping (`groupIdenticalFires`) happens
  // after, on whatever survives.
  const browserFires: AnyNotificationFire[] = [];
  for (const fire of browserSourceFires) {
    if (
      !browserEnabled ||
      !isEventEnabledFor(update.eventPrefs, fire.eventId, 'browser') ||
      !eveTypeAllowsChannel(fire, update.eveTypePrefs, 'browser')
    ) {
      continue;
    }
    if (await deps.alreadyDelivered(occurrenceKey(fire, deps.now()))) continue;
    browserFires.push(fire);
  }

  // Feed: one row per actual occurrence, never grouped — each fire's own
  // Occurrence Key (`@/engine/occurrenceKey`) is what lets the Scheduled
  // Push backend, independently observing the same occurrence, agree with
  // the Foreground Poller on the feed row it belongs to (GLOSSARY.md round
  // 44/48). Collapsing several fires into one feed write, the way the
  // browser channel below does, would permanently lose the other
  // occurrences from the feed's history — nothing re-fires an
  // already-high-water-marked diff to recover them.
  for (const fire of feedSourceFires) {
    const eventId = fire.eventId;
    if (
      feedEnabled &&
      isEventEnabledFor(update.eventPrefs, eventId, 'feed') &&
      eveTypeAllowsChannel(fire, update.eveTypePrefs, 'feed')
    ) {
      await deps.recordToFeed(fire, character);
    }
  }
  const rendered: RenderedFire<AnyNotificationFire>[] = [];
  for (const fire of browserFires) {
    rendered.push({ fire, ...(await renderNotification(fire, character.name)) });
  }
  for (const group of groupIdenticalFires(rendered)) {
    const title = group.count > 1 ? groupedTitle(group.title, group.count) : group.title;
    await deps.notify(group.fire, character, { title, body: group.body });
  }
  // Every browser fire went out, grouped or not. Marked after the feed loop
  // above wrote their rows, so there is a row to mark.
  if (browserFires.length > 0) {
    await deps.markDelivered(browserFires.map((fire) => occurrenceKey(fire, deps.now())));
  }
}
