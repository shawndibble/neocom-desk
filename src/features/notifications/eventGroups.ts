import { type NotificationEventId } from './events';
import { isNpcCorporationId } from '@/esi/entityIds';

export const EVENT_GROUP_KEYS = [
  'skills',
  'industryPi',
  'market',
  'mailCalendar',
  'world',
] as const;
export type EventGroupKey = (typeof EVENT_GROUP_KEYS)[number];

const GROUP_OF: Record<NotificationEventId, EventGroupKey | 'corp' | 'eve'> = {
  skillLevelComplete: 'skills',
  characterNotTraining: 'skills',
  skillQueueEnding: 'skills',
  omegaLapsed: 'skills',
  acceleratorExpiring: 'skills',
  acceleratorEnded: 'skills',
  spExtractionReady: 'skills',
  cloneJumpReady: 'skills',
  industryJobComplete: 'industryPi',
  planetaryExtractionDone: 'industryPi',
  planetaryExtractorExpiring: 'industryPi',
  mercenaryDenReinforced: 'industryPi',
  mercenaryDenAnarchy: 'industryPi',
  sharedMoonPop: 'industryPi',
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
  skyhookRaidableNearby: 'world',
  shipLost: 'world',
  characterNeedsLogin: 'world',
  communityJoinRequest: 'world',
  communityMemberJoined: 'world',
  communityRequestPledged: 'world',
  vettingShared: 'world',
  corpTaxBookSyncStopped: 'world',
  structureFuelLow: 'corp',
  skyhookRaidable: 'corp',
  corpIndustryJobReady: 'corp',
  corpMemberJoined: 'corp',
  corpMemberLeft: 'corp',
  corpWalletThreshold: 'corp',
  eveNotification: 'eve',
};

const PRICE_ALERT: NotificationEventId = 'priceAlertTriggered';

export function corpEventsApply(corporationIds: readonly (number | undefined)[]): boolean {
  return (
    corporationIds.length === 0 ||
    corporationIds.some((id) => id === undefined || !isNpcCorporationId(id))
  );
}

export interface NotificationEventGroups {
  readonly groups: readonly { key: EventGroupKey; eventIds: readonly NotificationEventId[] }[];
  readonly corp: readonly NotificationEventId[];
  readonly eve: NotificationEventId | null;
}

export function groupNotificationEvents(
  ids: readonly NotificationEventId[]
): NotificationEventGroups {
  const groups = EVENT_GROUP_KEYS.map((key) => {
    const members = ids.filter((id) => GROUP_OF[id] === key);
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
