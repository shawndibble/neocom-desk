import { db } from '@/db';
import { scheduleSync } from '@/sync';
import { occurrenceKey, occurrenceFiredAt } from '@/engine/occurrenceKey';
import type { ContractNotificationFire } from '@/engine/notificationDiffs';
import { renderNotification, notificationSubjectId, type AnyNotificationFire } from './pollDomains';
import { recordFeedEntryAndSync } from './feedSync';
import { displayPageNotification, livePageDisplayEnv } from './display';
import { notificationOptionsFor, occurrencePath } from './notificationOptions';
import type { CharacterRef } from './foregroundPoller';

export async function sendBrowserNotification(
  fire: AnyNotificationFire,
  character: CharacterRef,
  override?: { title: string; body: string }
): Promise<void> {
  const { title, body } = override ?? (await renderNotification(fire, character.name));
  const path = occurrencePath(fire.eventId, occurrenceKey(fire, Date.now()));
  await displayPageNotification(
    livePageDisplayEnv(),
    title,
    notificationOptionsFor(
      {
        eventId: fire.eventId,
        characterId: character.characterId,
        subjectId: notificationSubjectId(fire),
        ...(path === undefined ? {} : { path }),
      },
      body
    )
  );
}

export async function recordFeedNotification(
  fire: AnyNotificationFire,
  character: CharacterRef
): Promise<void> {
  try {
    const { title, body } = await renderNotification(fire, character.name);
    const now = Date.now();
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
      ...(fire.eventId === 'marketOrderFilled' && fire.fillMatch !== undefined
        ? { fillMatch: fire.fillMatch }
        : {}),
      ...('walletChangeIsk' in fire && fire.walletChangeIsk !== undefined
        ? { walletChangeIsk: fire.walletChangeIsk }
        : {}),
    });
  } catch {}
}

export async function reviseContractFeedRow(
  fire: ContractNotificationFire,
  character: CharacterRef
): Promise<void> {
  try {
    const key = occurrenceKey(fire, Date.now());
    const changed = await db.transaction('rw', db.notificationFeed, async () => {
      const row = await db.notificationFeed.get(key);
      if (row === undefined || fire.walletChangeIsk === undefined) return 0;
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
          delete r.syncedAt;
        });
    });
    if (changed > 0) scheduleSync(character.characterId, { collections: ['notificationFeed'] });
  } catch {}
}
