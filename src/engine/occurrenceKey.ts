import type {
  NotificationFire,
  SpExtractionFire,
  CloneJumpReadyFire,
  IndustryJobNotificationFire,
  PlanetaryNotificationFire,
  MailNotificationFire,
  NewCalendarEventFire,
  CalendarEventStartingFire,
  ExtractorExpiringFire,
  ContractNotificationFire,
  WalletNotificationFire,
  MarketOrderNotificationFire,
  MarketOrderUndercutFire,
  OrdersLapsingFire,
  EveNotificationFire,
  StructureFuelLowFire,
  MercenaryDenReinforcedFire,
  AcceleratorExpiringFire,
  AcceleratorEndedFire,
  SkyhookRaidableFire,
  MercenaryDenAnarchyFire,
  CorpIndustryJobNotificationFire,
  CorpMemberJoinedFire,
  CorpMemberLeftFire,
  CorpWalletThresholdFire,
  StructureReinforcementExitFire,
  PriceAlertTriggeredFire,
  ShipLostFire,
  CharacterNeedsLoginFire,
  SharedMoonPopFire,
} from './notificationDiffs';
import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from './communities/communityAlert';
import type { StockBelowTargetFire } from './stockTargets/stockAlert';
import type { IncursionNearbyFire } from './incursions/incursionAlert';
import type { SkyhookRaidableNearbyFire } from './skyhooks/skyhookAlert';
import { parseInstant } from './esiInstant';
import { utcDay } from './localDay';
import { DAY_MS } from '@/lib/age';
import type { VettingSharedFire } from './vettingAlert';
import type { CorpTaxBookSyncStoppedFire } from './corpTaxBook/syncStoppedAlert';

export type OccurrenceFire =
  | NotificationFire
  | SpExtractionFire
  | CloneJumpReadyFire
  | IndustryJobNotificationFire
  | PlanetaryNotificationFire
  | MailNotificationFire
  | NewCalendarEventFire
  | CalendarEventStartingFire
  | ExtractorExpiringFire
  | ContractNotificationFire
  | WalletNotificationFire
  | MarketOrderNotificationFire
  | MarketOrderUndercutFire
  | OrdersLapsingFire
  | EveNotificationFire
  | StructureFuelLowFire
  | MercenaryDenReinforcedFire
  | AcceleratorExpiringFire
  | AcceleratorEndedFire
  | SkyhookRaidableFire
  | MercenaryDenAnarchyFire
  | CorpIndustryJobNotificationFire
  | CorpMemberJoinedFire
  | CorpMemberLeftFire
  | CorpWalletThresholdFire
  | StructureReinforcementExitFire
  | PriceAlertTriggeredFire
  | ShipLostFire
  | CharacterNeedsLoginFire
  | StockBelowTargetFire
  | CommunityJoinRequestFire
  | CommunityMemberJoinedFire
  | CommunityRequestPledgedFire
  | IncursionNearbyFire
  | SkyhookRaidableNearbyFire
  | VettingSharedFire
  | CorpTaxBookSyncStoppedFire
  | SharedMoonPopFire;

function dayBucket(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

export function occurrenceKey(fire: OccurrenceFire, nowMs: number): string {
  const characterId = fire.characterId;
  switch (fire.eventId) {
    case 'skillLevelComplete':
      return [characterId, fire.eventId, fire.skillId, fire.level, fire.finishMs].join(':');
    case 'skillQueueEnding':
      return [characterId, fire.eventId, fire.finishMs, fire.thresholdMs].join(':');
    case 'omegaLapsed':
      return [characterId, fire.eventId, fire.skillId, fire.level].join(':');
    case 'characterNotTraining':
    case 'spExtractionReady':
      return [characterId, fire.eventId, dayBucket(nowMs)].join(':');
    case 'industryJobComplete':
    case 'corpIndustryJobReady':
      return [characterId, fire.eventId, fire.jobId].join(':');
    case 'cloneJumpReady':
      return [characterId, fire.eventId, fire.lastJumpMs].join(':');
    case 'planetaryExtractionDone':
      return [characterId, fire.eventId, fire.planetId, fire.expiryTimeMs].join(':');
    case 'planetaryExtractorExpiring':
      return [characterId, fire.eventId, fire.pinId, fire.expiryTimeMs, fire.thresholdMs].join(':');
    case 'newCalendarEvent':
    case 'calendarEventStarting':
      return [characterId, fire.eventId, fire.calendarEventId].join(':');
    case 'contractAccepted':
    case 'contractCompleted':
    case 'contractFailed':
      return [characterId, fire.eventId, fire.contractId].join(':');
    case 'courierDeliveryDue':
    case 'contractExpiring':
      return [characterId, fire.eventId, fire.contractId, fire.deadlineMs, fire.thresholdMs].join(
        ':'
      );
    case 'ordersLapsing':
      return [characterId, fire.eventId, fire.soonestMs, fire.thresholdMs].join(':');
    case 'marketOrderFilled':
      return [characterId, fire.eventId, fire.orderId].join(':');
    case 'marketOrderUndercut':
      return [characterId, fire.eventId, fire.orderId, fire.price].join(':');
    case 'newMail':
      return [characterId, fire.eventId, fire.mailId].join(':');
    case 'eveNotification':
    case 'structureReinforcementExit':
      return [characterId, fire.eventId, fire.notificationId].join(':');
    case 'structureFuelLow':
      return [characterId, fire.eventId, fire.structureId, fire.fuelExpiresMs].join(':');
    case 'acceleratorExpiring':
      return [characterId, fire.eventId, fire.expiresAtMs, fire.thresholdMs].join(':');
    case 'acceleratorEnded':
      return [characterId, fire.eventId, utcDay(fire.atMs)].join(':');
    case 'mercenaryDenReinforced':
      return [characterId, fire.eventId, fire.denId, fire.reinforcedUntilMs, fire.phase].join(':');
    case 'skyhookRaidable':
      return [characterId, fire.eventId, fire.skyhookId, fire.windowStartMs, fire.phase].join(':');
    case 'mercenaryDenAnarchy':
      return [characterId, fire.eventId, fire.denId, fire.thresholdPct, nowMs].join(':');
    case 'corpMemberJoined':
    case 'corpMemberLeft':
      return [characterId, fire.eventId, fire.memberCharacterId].join(':');
    case 'walletBalanceChanged':
      return [characterId, fire.eventId, fire.journalEntryId].join(':');
    case 'corpWalletThreshold':
      return fire.kind === 'transactionAbove'
        ? [characterId, fire.eventId, fire.kind, fire.division, fire.journalEntryId].join(':')
        : [characterId, fire.eventId, fire.kind, fire.division, dayBucket(nowMs)].join(':');
    case 'priceAlertTriggered':
      return [characterId, fire.eventId, fire.typeId, fire.targetPrice, fire.direction].join(':');
    case 'shipLost':
      return [characterId, fire.eventId, fire.killmailId].join(':');
    case 'characterNeedsLogin':
      return [characterId, fire.eventId, fire.sinceMs].join(':');
    case 'communityJoinRequest':
    case 'communityMemberJoined':
      return [characterId, fire.eventId, fire.communityId, fire.uid, fire.at].join(':');
    case 'vettingShared':
      return [characterId, fire.eventId, fire.corporationId, fire.reviewId].join(':');
    case 'corpTaxBookSyncStopped':
      return [characterId, fire.eventId, fire.corporationId, fire.stoppedAt].join(':');
    case 'communityRequestPledged':
      return [characterId, fire.eventId, fire.communityId, fire.requestId, fire.uid, fire.at].join(
        ':'
      );
    case 'stockBelowTarget':
      return [
        characterId,
        fire.eventId,
        fire.listId,
        fire.typeId,
        fire.target,
        fire.status,
        dayBucket(nowMs),
      ].join(':');
    case 'incursionNearby':
      return [fire.eventId, fire.constellationId, fire.stagingSystemId].join(':');
    case 'skyhookRaidableNearby':
      return [fire.eventId, fire.systemId, fire.planetId, fire.startMs].join(':');
    case 'sharedMoonPop':
      return [fire.eventId, fire.popId, fire.popAtMs, fire.thresholdMs].join(':');
    default: {
      const exhaustive: never = fire;
      throw new Error(`occurrenceKey: unhandled Notification Event ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function occurrenceFiredAt(fire: OccurrenceFire, nowMs: number): number {
  const pastOrNow = (ms: number | undefined): number =>
    ms === undefined || !Number.isFinite(ms) ? nowMs : Math.min(ms, nowMs);
  switch (fire.eventId) {
    case 'walletBalanceChanged':
      return fire.dateMs;
    case 'shipLost':
      return pastOrNow(fire.timeMs);
    case 'characterNeedsLogin':
      return fire.sinceMs;
    case 'corpTaxBookSyncStopped':
      return pastOrNow(fire.stoppedAt);
    case 'skillLevelComplete':
      return fire.finishMs ?? nowMs;
    case 'cloneJumpReady':
      return fire.readyAtMs;
    case 'eveNotification': {
      return parseInstant(fire.timestamp) ?? nowMs;
    }
    case 'industryJobComplete':
    case 'corpIndustryJobReady':
      return pastOrNow(fire.endMs);
    case 'planetaryExtractionDone':
      return pastOrNow(fire.expiryTimeMs);
    case 'contractAccepted':
    case 'contractCompleted':
      return pastOrNow(fire.occurredMs);
    case 'acceleratorEnded':
      return pastOrNow(fire.atMs);
    case 'newMail':
      return pastOrNow(fire.sentMs);
    case 'characterNotTraining':
    case 'omegaLapsed':
    case 'skillQueueEnding':
    case 'spExtractionReady':
    case 'planetaryExtractorExpiring':
    case 'newCalendarEvent':
    case 'calendarEventStarting':
    case 'contractFailed':
    case 'courierDeliveryDue':
    case 'contractExpiring':
    case 'ordersLapsing':
    case 'marketOrderFilled':
    case 'structureReinforcementExit':
    case 'structureFuelLow':
    case 'mercenaryDenReinforced':
    case 'skyhookRaidable':
    case 'acceleratorExpiring':
    case 'sharedMoonPop':
    case 'mercenaryDenAnarchy':
    case 'corpMemberJoined':
    case 'corpMemberLeft':
    case 'corpWalletThreshold':
    case 'priceAlertTriggered':
    case 'marketOrderUndercut':
    case 'stockBelowTarget':
    case 'incursionNearby':
    case 'skyhookRaidableNearby':
    case 'communityJoinRequest':
    case 'communityMemberJoined':
    case 'communityRequestPledged':
    case 'vettingShared':
      return nowMs;
    default: {
      const exhaustive: never = fire;
      throw new Error(
        `occurrenceFiredAt: unhandled Notification Event ${JSON.stringify(exhaustive)}`
      );
    }
  }
}
