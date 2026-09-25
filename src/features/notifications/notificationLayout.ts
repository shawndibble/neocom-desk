/**
 * How one Character's (or All Characters') event list is laid out: ordinary
 * events, with Quickbar price alerts last among them, then the corp events
 * under one "Corp notifications" group header, then EVE notifications, which
 * is the longest list and so sits at the bottom where it cannot push the rest
 * off screen.
 *
 * This is display order only. The catalog's own order (`events.ts`) is what
 * the poller and the projection read, and nothing there changes.
 */
import { isCorpEventId, type NotificationEventId } from './events';

export interface NotificationEventLayout {
  /** Every event that is neither corp nor EVE, price alerts last. */
  readonly ordinary: readonly NotificationEventId[];
  readonly corp: readonly NotificationEventId[];
  /** The one EVE-notifications event, when it is among the ids given. */
  readonly eve: NotificationEventId | null;
}

const PRICE_ALERT: NotificationEventId = 'priceAlertTriggered';
const EVE: NotificationEventId = 'eveNotification';

/** Files `ids` (all of them, or a search's subset) into the on-screen sections, keeping their relative order. */
export function layoutNotificationEvents(
  ids: readonly NotificationEventId[]
): NotificationEventLayout {
  const corp = ids.filter(isCorpEventId);
  const rest = ids.filter((id) => !isCorpEventId(id) && id !== EVE);
  const ordinary = [
    ...rest.filter((id) => id !== PRICE_ALERT),
    ...rest.filter((id) => id === PRICE_ALERT),
  ];
  return { ordinary, corp, eve: ids.includes(EVE) ? EVE : null };
}
