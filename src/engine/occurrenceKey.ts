/**
 * The Occurrence Key (GLOSSARY.md round 44, issue #348): the deterministic
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
 * `corpWalletThreshold`'s `transactionAbove` case has always done. See
 * `docs/context/decisions/20260905-195857-wallet-alerts-key-on-the-journal-entry-not.md`.
 *
 * The `switch` below is exhaustive over every `NotificationEventId`
 * (`default`'s `never` assignment): adding a Notification Event without
 * adding a case here is a compile error, never a silent fallback to a random
 * id.
 */
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
  CorpIndustryJobNotificationFire,
  CorpMemberJoinedFire,
  CorpMemberLeftFire,
  CorpWalletThresholdFire,
  StructureReinforcementExitFire,
  PriceAlertTriggeredFire,
  ShipLostFire,
} from './notificationDiffs';
import type {
  CommunityJoinRequestFire,
  CommunityMemberJoinedFire,
  CommunityRequestPledgedFire,
} from './communities/communityAlert';
import type { StockBelowTargetFire } from './stockTargets/stockAlert';
import type { IncursionNearbyFire } from './incursions/incursionAlert';
import { parseInstant } from './esiInstant';
import { DAY_MS } from '@/lib/age';

/**
 * Every fire an Occurrence Key can be derived from — the same members as
 * `features/notifications/pollDomains/`'s `AnyNotificationFire`, kept as an
 * independent union rather than importing that one: engines don't depend on
 * the feature layer above them (ARCHITECTURE.md), and every fire type it
 * unions already lives in this module's sibling `notificationDiffs.ts`.
 */
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
  | CorpIndustryJobNotificationFire
  | CorpMemberJoinedFire
  | CorpMemberLeftFire
  | CorpWalletThresholdFire
  | StructureReinforcementExitFire
  | PriceAlertTriggeredFire
  | ShipLostFire
  | StockBelowTargetFire
  | CommunityJoinRequestFire
  | CommunityMemberJoinedFire
  | CommunityRequestPledgedFire
  | IncursionNearbyFire;

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
    // Keyed on the tail's own finish ms *and* the threshold it crossed
    // (issue #1410), on `planetaryExtractorExpiring`'s `(expiryTimeMs,
    // thresholdMs)` precedent: `finishMs` is fixed once queued, so a new tail
    // (queue grown, shrunk, or the old tail completed) is already a distinct
    // occurrence on that alone — but `thresholdMs` is also required, because
    // `diffSkillQueueEnding` can re-fire for the *same* tail after a
    // lower-then-raised lead time (its own window-crossing rule). Without
    // `thresholdMs` in the key, that genuinely new fire would compute the
    // identical key to the first one and get silently dropped as
    // already-delivered.
    case 'skillQueueEnding':
      return [characterId, fire.eventId, fire.finishMs, fire.thresholdMs].join(':');
    // spExtractionReady shares characterNotTraining's reasoning: "ready" is a
    // threshold crossing with no entity id of its own, so two devices agree
    // only by bucketing the day they each independently observed it.
    case 'characterNotTraining':
    case 'spExtractionReady':
      return [characterId, fire.eventId, dayBucket(nowMs)].join(':');
    case 'industryJobComplete':
    case 'corpIndustryJobReady':
      return [characterId, fire.eventId, fire.jobId].join(':');
    // Keyed on the jump, not the ready time: `readyAtMs` depends on the
    // Infomorph Synchronizing level each device read, and one that could not
    // read skills falls back to level 0 — the same cooldown must still be one
    // occurrence.
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
    // The deadline and the threshold it crossed (issue #1713), on
    // `planetaryExtractorExpiring`'s precedent: `diffCourierDeliveryDue` can
    // re-fire for the same contract after a lower-then-raised lead time.
    case 'courierDeliveryDue':
    case 'contractExpiring':
      return [characterId, fire.eventId, fire.contractId, fire.deadlineMs, fire.thresholdMs].join(
        ':'
      );
    // The soonest expiry and the threshold, never the count (issue #3797): the
    // count is what the window held when each device saw it open.
    case 'ordersLapsing':
      return [characterId, fire.eventId, fire.soonestMs, fire.thresholdMs].join(':');
    case 'marketOrderFilled':
      return [characterId, fire.eventId, fire.orderId].join(':');
    // The order's own price is the extra part: a relist at a new price is a
    // new occurrence, but a beaten -> clear -> beaten cycle at an unchanged
    // price reuses this key — the diff still fires, but `alreadyDelivered`
    // suppresses the repeat toast and the feed row is overwritten in place
    // rather than duplicated. Not `dayBucket`: this fire always has a real
    // natural id (`orderId`), so bucketing by day would only throw away a
    // genuine same-day re-undercut for no reason a day bucket exists to solve.
    case 'marketOrderUndercut':
      return [characterId, fire.eventId, fire.orderId, fire.price].join(':');
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
    // The re-fire identity `diffPriceAlertTriggered` itself diffs against
    // (`20260909-192510-quickbar-price-alerts-re-arm-key-hub-price.md`): an
    // edited target price or direction is a distinct occurrence, not a
    // re-observation of the old one.
    case 'priceAlertTriggered':
      return [characterId, fire.eventId, fire.typeId, fire.targetPrice, fire.direction].join(':');
    // The killmail itself: zKillboard ids a loss once and never changes it.
    case 'shipLost':
      return [characterId, fire.eventId, fire.killmailId].join(':');
    // The Character at the Community, at the time it asked or joined: someone
    // turned away who asks again, or a Member who leaves and rejoins, is a new
    // occurrence and must not be deduped against the first.
    case 'communityJoinRequest':
    case 'communityMemberJoined':
      return [characterId, fire.eventId, fire.communityId, fire.uid, fire.at].join(':');
    // The latest new Pledge in the Community, by Request, Pledger and the time
    // it was written. A re-Pledge after a poll that saw the withdrawal writes a
    // later `at` and is its own occurrence; the same Pledge read twice, or an
    // update to it, is not (the diff does not refire it either).
    case 'communityRequestPledged':
      return [characterId, fire.eventId, fire.communityId, fire.requestId, fire.uid, fire.at].join(
        ':'
      );
    // The diff only fires on a drop into Low or Out, so the drop itself —
    // per list, item, Stock Target and status, bucketed by day — is the
    // identity: the same drop seen twice in a day is one occurrence.
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
    // Once per Incursion: its constellation and staging system name it for
    // as long as it lasts, so no day bucket — an Incursion leaving range and
    // coming back is the same occurrence, not a second alert.
    case 'incursionNearby':
      return [characterId, fire.eventId, fire.constellationId, fire.stagingSystemId].join(':');
    default: {
      const exhaustive: never = fire;
      throw new Error(`occurrenceKey: unhandled Notification Event ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * When the occurrence actually happened, for the feed row's `firedAt` — the
 * poll clock only for the fires that have no time of their own.
 *
 * This matters because a device polls only while the app is open: one opened
 * after days away reports everything it missed in a single poll. Dating those
 * rows by that poll stacks days of history onto one minute — the feed shows
 * them as having just happened, and they sort above genuinely newer rows.
 *
 * Exhaustive over every `NotificationEventId` for `occurrenceKey`'s reason: a
 * new Notification Event has to state which clock dates it, rather than
 * defaulting to the poll's and being wrong quietly. `nowMs` is the honest
 * answer only where there is no past moment to use — a market order fill has
 * none of its own (ESI's order history records when an order was *issued*,
 * never when it filled), and the times some others carry are deadlines in
 * the future (a fuel expiry, an extractor's expiry warning, a calendar
 * event's start), not the moment the thing happened.
 *
 * The job, colony, contract and mail moments are clamped to `nowMs`
 * (`pastOrNow`) so a server clock running ahead of this device never dates a
 * row in the future.
 */
export function occurrenceFiredAt(fire: OccurrenceFire, nowMs: number): number {
  const pastOrNow = (ms: number | undefined): number =>
    ms === undefined || !Number.isFinite(ms) ? nowMs : Math.min(ms, nowMs);
  switch (fire.eventId) {
    case 'walletBalanceChanged':
      return fire.dateMs;
    // The killmail's own time, which a poll after days away must not replace.
    case 'shipLost':
      return pastOrNow(fire.timeMs);
    // The completed entry's `finish_date`, already in the past by the time
    // the diff fires (`isCompleted`). Null when the queue carried no date.
    case 'skillLevelComplete':
      return fire.finishMs ?? nowMs;
    // The cooldown's end, already in the past by the time the diff fires.
    case 'cloneJumpReady':
      return fire.readyAtMs;
    // ESI's own `timestamp` for the notification, as an ISO string.
    case 'eveNotification': {
      return parseInstant(fire.timestamp) ?? nowMs;
    }
    // The job's `end_date`, already in the past by the time the diff fires.
    case 'industryJobComplete':
    case 'corpIndustryJobReady':
      return pastOrNow(fire.endMs);
    // The colony's soonest extractor expiry — the moment it went idle.
    case 'planetaryExtractionDone':
      return pastOrNow(fire.expiryTimeMs);
    // ESI's `date_accepted` / `date_completed`, when the contract carried it.
    case 'contractAccepted':
    case 'contractCompleted':
      return pastOrNow(fire.occurredMs);
    // The mail header's own `timestamp`.
    case 'newMail':
      return pastOrNow(fire.sentMs);
    case 'characterNotTraining':
    // falls through: skillQueueEnding's tail finish is a future deadline too, not the moment the queue actually runs dry (same reasoning as planetaryExtractorExpiring).
    case 'skillQueueEnding':
    case 'spExtractionReady':
    case 'planetaryExtractorExpiring':
    case 'newCalendarEvent':
    case 'calendarEventStarting':
    case 'contractFailed':
    // falls through: a future deadline, not the moment the contract failed.
    case 'courierDeliveryDue':
    case 'contractExpiring':
    case 'ordersLapsing':
    case 'marketOrderFilled':
    case 'structureReinforcementExit':
    case 'structureFuelLow':
    case 'corpMemberJoined':
    case 'corpMemberLeft':
    case 'corpWalletThreshold':
    // A price crossing has no timestamp of its own — Fuzzwork's aggregate
    // carries no "as of" time finer than the poll that read it. Same for a
    // station undercut: no "as of" time either.
    // falls through
    case 'priceAlertTriggered':
    case 'marketOrderUndercut':
    // An asset list carries no per-item time; the poll that saw the drop is it.
    // falls through
    case 'stockBelowTarget':
    // The feed carries no spawn time; the poll that saw it in range is it.
    // falls through
    case 'incursionNearby':
    // Neither the waiting list nor the roster is read with a time the poll could use.
    // falls through
    case 'communityJoinRequest':
    case 'communityMemberJoined':
    case 'communityRequestPledged':
      return nowMs;
    default: {
      const exhaustive: never = fire;
      throw new Error(
        `occurrenceFiredAt: unhandled Notification Event ${JSON.stringify(exhaustive)}`
      );
    }
  }
}
