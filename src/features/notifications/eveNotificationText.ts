/**
 * Renderer for EVE's own notifications (issue #274), kept separate from
 * `foregroundPoller.ts`'s `notificationText` if-chain because this one has a
 * different exhaustiveness shape: that chain is closed over a fixed
 * `NotificationEventId` union, while this domain covers roughly a hundred
 * open-ended `type` strings CCP can add to without notice
 * (esi/esi-issues#1380). A generic body — the raw type plus the character —
 * is what every type gets in v1; special-casing a handful of high-traffic
 * types with a proper body (bill amounts, war target, structure name) is a
 * follow-up, not required for AC2's "never dropped or thrown on".
 */
import i18n from '@/i18n';
import type { EveNotificationFire } from '@/engine/notificationDiffs';

/** Deliberately not `CharacterRef` — importing it back from `foregroundPoller.ts` would be a cycle. */
export interface EveNotificationTextCharacter {
  name: string;
}

export function eveNotificationText(
  fire: EveNotificationFire,
  character: EveNotificationTextCharacter
): { title: string; body: string } {
  return {
    title: i18n.t('notifications.fired.eveNotification.title'),
    body: i18n.t('notifications.fired.eveNotification.body', {
      character: character.name,
      type: fire.type,
    }),
  };
}
