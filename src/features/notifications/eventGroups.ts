/**
 * The named groups Settings > Notifications files the Notification Events
 * under: what a person is thinking about when they look for a row, not how
 * the catalog is ordered. Corp events keep their own "Corp notifications"
 * group (one permission line, one best-effort note) and EVE notifications
 * stay last, where their long list cannot push the rest off screen.
 *
 * Display only. The catalog's own order (`events.ts`) is what the poller and
 * the projection read. These are not Notification Families (GLOSSARY.md),
 * which only arrange EVE notification types.
 */
import { type NotificationEventId } from './events';

export const EVENT_GROUP_KEYS = [
  'skills',
  'industryPi',
  'market',
  'mailCalendar',
  'world',
] as const;
export type EventGroupKey = (typeof EVENT_GROUP_KEYS)[number];

/** Exhaustive on purpose: a new catalog event does not typecheck until it is filed here. */
const GROUP_OF: Record<NotificationEventId, EventGroupKey | 'corp' | 'eve'> = {
  skillLevelComplete: 'skills',
  characterNotTraining: 'skills',
  skillQueueEnding: 'skills',
  spExtractionReady: 'skills',
  cloneJumpReady: 'skills',
  industryJobComplete: 'industryPi',
  planetaryExtractionDone: 'industryPi',
  planetaryExtractorExpiring: 'industryPi',
  mercenaryDenReinforced: 'industryPi',
  mercenaryDenAnarchy: 'industryPi',
  marketOrderFilled: 'market',
  marketOrderUndercut: 'market',
  contractAccepted: 'market',
  contractCompleted: 'market',
  contractFailed: 'market',
  courierDeliveryDue: 'market',
  contractExpiring: 'market',
  ordersLapsing: 'market',
  walletBalanceChanged: 'market',
  stockBelowTarget: 'market',
  priceAlertTriggered: 'market',
  newMail: 'mailCalendar',
  newCalendarEvent: 'mailCalendar',
  calendarEventStarting: 'mailCalendar',
  incursionNearby: 'world',
  shipLost: 'world',
  communityJoinRequest: 'world',
  communityMemberJoined: 'world',
  communityRequestPledged: 'world',
  structureFuelLow: 'corp',
  corpIndustryJobReady: 'corp',
  corpMemberJoined: 'corp',
  corpMemberLeft: 'corp',
  corpWalletThreshold: 'corp',
  eveNotification: 'eve',
};

const PRICE_ALERT: NotificationEventId = 'priceAlertTriggered';

export interface NotificationEventGroups {
  readonly groups: readonly { key: EventGroupKey; eventIds: readonly NotificationEventId[] }[];
  readonly corp: readonly NotificationEventId[];
  /** The one EVE-notifications event, when it is among the ids given. */
  readonly eve: NotificationEventId | null;
}

/** Files `ids` (all of them, or a search's subset) into the on-screen groups, keeping their relative order. */
export function groupNotificationEvents(
  ids: readonly NotificationEventId[]
): NotificationEventGroups {
  const groups = EVENT_GROUP_KEYS.map((key) => {
    const members = ids.filter((id) => GROUP_OF[id] === key);
    // The price alert reads Quickbar rather than ESI, so it goes last in its group.
    return {
      key,
      eventIds: [
        ...members.filter((id) => id !== PRICE_ALERT),
        ...members.filter((id) => id === PRICE_ALERT),
      ],
    };
  }).filter((group) => group.eventIds.length > 0);
  return {
    groups,
    corp: ids.filter((id) => GROUP_OF[id] === 'corp'),
    eve: ids.find((id) => GROUP_OF[id] === 'eve') ?? null,
  };
}
