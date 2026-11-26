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

function eveTypeAllowsChannel(
  fire: AnyNotificationFire,
  eveTypePrefs: EveTypeEnabledMap,
  channel: NotificationChannel
): boolean {
  if (fire.eventId !== 'eveNotification') return true;
  return isEveTypeEnabledFor(eveTypePrefs, fire.type, channel);
}

function groupedTitle(title: string, count: number): string {
  return i18n.t('notifications.groupedTitle', { title, count });
}

export async function dispatchFires(
  deps: PollDependencies,
  channels: LiveChannels,
  character: CharacterRef,
  update: CharacterUpdate
): Promise<void> {
  const { browser: browserEnabled, feed: feedEnabled } = channels;
  const allowed = update.fires.filter(
    (fire) => fire.eventId !== 'eveNotification' || isEveTypeAllowed(fire.type)
  );

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
  if (browserFires.length > 0) {
    await deps.markDelivered(browserFires.map((fire) => occurrenceKey(fire, deps.now())));
  }
}
