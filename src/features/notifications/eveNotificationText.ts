import i18n from '@/i18n';
import { timeZoneFor, useTimeFormat } from '@/lib/timeFormat';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import {
  renderEveNotification,
  type EveNotificationNames,
  type EveNotificationTextCharacter,
} from './eveNotificationRender';

export {
  EVE_NOTIFICATION_RENDERED_TYPES,
  orbitalAggressorId,
  type EveNotificationNames,
  type EveNotificationTextCharacter,
} from './eveNotificationRender';

export function eveNotificationText(
  fire: EveNotificationFire,
  character: EveNotificationTextCharacter,
  names: EveNotificationNames = {}
): { title: string; body: string } {
  return renderEveNotification(
    (key, options) => i18n.t(key, options),
    fire,
    character,
    names,
    timeZoneFor(useTimeFormat.getState().value)
  );
}
