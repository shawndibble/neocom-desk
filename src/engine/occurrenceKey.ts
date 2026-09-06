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
 * *absence* of training, and `corpWalletThreshold`'s `balanceBelow` case is a
 * threshold crossing, not an entity with an id. Those bucket on `nowMs` at
 * day granularity instead, so two devices polling minutes apart still agree.
 *
 * A day bucket is a last resort, not a default. It collapses every occurrence
 * of its event within one UTC day onto a single row, so a second occurrence
 * that day overwrites the first — and the same occurrence seen on two
 * different days becomes two rows. `walletBalanceChanged` was bucketed that
 * way originally and should not have been: `diffWalletBalanceChanged`
 * high-water-marks on the journal entry's `id` and emits one fire per entry,
 * so the entry id was always available. It is now the key, matching what
 * `corpWalletThreshold`'s `transactionAbove` case has always done. See the
 * superseding decision file.
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
  StructureReinforcementExitFire,
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
  | CorpWalletThresholdFire
  | StructureReinforcementExitFire;

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
    case 'structureReinforcementExit':
      return [characterId, fire.eventId, fire.notificationId].join(':');
    case 'structureFuelLow':
      return [characterId, fire.eventId, fire.structureId, fire.fuelExpiresMs].join(':');
    case 'corpMemberJoined':
    case 'corpMemberLeft':
      return [characterId, fire.eventId, fire.memberCharacterId].join(':');
    case 'walletBalanceChanged':
      return [characterId, fire.eventId, fire.journalEntryId].join(':');
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

/**
 * When the occurrence actually happened, for the feed row's `firedAt` — the
 * poll time only when the fire has nothing better.
 *
 * Opt-in per event rather than exhaustive: most fires genuinely have no
 * occurrence time to offer. A market order fill is the clearest case — ESI's
 * order history records when an order was *issued*, never when it filled, so
 * the poll that noticed it is the only time there is. Events whose only
 * timestamp lies in the future (a fuel expiry, an extractor's expiry) are
 * deadlines, not occurrence times, and stay on the poll clock too.
 *
 * This matters because a device polls only while the app is open: one opened
 * after days away reports everything it missed in a single poll. Dating those
 * rows by that poll stacks days of history onto one minute — the feed shows
 * them as having just happened, and they sort above genuinely newer rows.
 */
export function occurrenceFiredAt(fire: OccurrenceFire, nowMs: number): number {
  return fire.eventId === 'walletBalanceChanged' ? fire.dateMs : nowMs;
}
