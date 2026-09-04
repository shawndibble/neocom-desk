/**
 * The Occurrence Key (CONTEXT.md round 44, issue #348): the deterministic
 * identity of one notification occurrence, derived from the Character, the
 * Notification Event and the natural id of the thing that happened. Two
 * devices' Foreground Pollers and the Scheduled Push backend, each
 * independently observing the same character-state change, compute the
 * identical key — which is what makes cross-party de-duplication possible.
 *
 * Distinct from `features/notifications/feed.ts`'s old `crypto.randomUUID()`
 * row id, which round 20 minted randomly because nothing then needed two
 * observers to agree.
 *
 * Some cases carry no natural id of their own: `characterNotTraining` is the
 * *absence* of training, `walletBalanceChanged` and `corpWalletThreshold`'s
 * `balanceBelow` case are threshold crossings, not entities with an id.
 * Those bucket on `nowMs` at day granularity instead, so two devices polling
 * minutes apart still agree. `corpWalletThreshold`'s `transactionAbove` case
 * is the exception: the diff itself high-water-marks it by the journal
 * entry's own id, so that id is the key, not a bucket.
 *
 * The `switch` below is exhaustive over every `NotificationEventId`
 * (`default`'s `never` assignment): adding a Notification Event without
 * adding a case here is a compile error, never a silent fallback to a random
 * id.
 */
import type {
  NotificationFire,
  IndustryJobNotificationFire,
  PlanetaryNotificationFire,
  MailNotificationFire,
  NewCalendarEventFire,
  CalendarEventStartingFire,
  ExtractorExpiringFire,
  ContractNotificationFire,
  WalletNotificationFire,
  MarketOrderNotificationFire,
  EveNotificationFire,
  StructureFuelLowFire,
  CorpIndustryJobNotificationFire,
  CorpMemberJoinedFire,
  CorpMemberLeftFire,
  CorpWalletThresholdFire,
} from './notificationDiffs';

/**
 * Every fire an Occurrence Key can be derived from — the same members as
 * `features/notifications/pollDomains.ts`'s `AnyNotificationFire`, kept as an
 * independent union rather than importing that one: engines don't depend on
 * the feature layer above them (ARCHITECTURE.md), and every fire type it
 * unions already lives in this module's sibling `notificationDiffs.ts`.
 */
export type OccurrenceFire =
  | NotificationFire
  | IndustryJobNotificationFire
  | PlanetaryNotificationFire
  | MailNotificationFire
  | NewCalendarEventFire
  | CalendarEventStartingFire
  | ExtractorExpiringFire
  | ContractNotificationFire
  | WalletNotificationFire
  | MarketOrderNotificationFire
  | EveNotificationFire
  | StructureFuelLowFire
  | CorpIndustryJobNotificationFire
  | CorpMemberJoinedFire
  | CorpMemberLeftFire
  | CorpWalletThresholdFire;

const DAY_MS = 86_400_000;

function dayBucket(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

/**
 * `nowMs` only matters for the two bucketed events below — every other case
 * derives entirely from the fire's own, already-fixed natural id.
 */
export function occurrenceKey(fire: OccurrenceFire, nowMs: number): string {
  const characterId = fire.characterId;
  switch (fire.eventId) {
    case 'skillLevelComplete':
      return [characterId, fire.eventId, fire.skillId, fire.level, fire.finishMs].join(':');
    case 'characterNotTraining':
      return [characterId, fire.eventId, dayBucket(nowMs)].join(':');
    case 'industryJobComplete':
    case 'corpIndustryJobReady':
      return [characterId, fire.eventId, fire.jobId].join(':');
    case 'planetaryExtractionDone':
      return [characterId, fire.eventId, fire.planetId, fire.expiryTimeMs].join(':');
    case 'planetaryExtractorExpiring':
      return [characterId, fire.eventId, fire.pinId, fire.expiryTimeMs, fire.thresholdMs].join(':');
    case 'newCalendarEvent':
    case 'calendarEventStarting':
      return [characterId, fire.eventId, fire.calendarEventId].join(':');
    case 'contractAccepted':
      return [characterId, fire.eventId, fire.contractId].join(':');
    case 'marketOrderFilled':
      return [characterId, fire.eventId, fire.orderId].join(':');
    case 'newMail':
      return [characterId, fire.eventId, fire.mailId].join(':');
    case 'eveNotification':
      return [characterId, fire.eventId, fire.notificationId].join(':');
    case 'structureFuelLow':
      return [characterId, fire.eventId, fire.structureId, fire.fuelExpiresMs].join(':');
    case 'corpMemberJoined':
    case 'corpMemberLeft':
      return [characterId, fire.eventId, fire.memberCharacterId].join(':');
    case 'walletBalanceChanged':
      return [characterId, fire.eventId, dayBucket(nowMs)].join(':');
    case 'corpWalletThreshold':
      // `transactionAbove` has a real natural id (the journal entry the diff
      // itself high-water-marks by); only `balanceBelow` is a genuine
      // threshold crossing with nothing to key on but a day bucket.
      return fire.kind === 'transactionAbove'
        ? [characterId, fire.eventId, fire.kind, fire.division, fire.journalEntryId].join(':')
        : [characterId, fire.eventId, fire.kind, fire.division, dayBucket(nowMs)].join(':');
    default: {
      const exhaustive: never = fire;
      throw new Error(`occurrenceKey: unhandled Notification Event ${JSON.stringify(exhaustive)}`);
    }
  }
}
