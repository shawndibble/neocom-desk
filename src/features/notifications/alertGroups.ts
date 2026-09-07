/**
 * The feed, collapsed to one row per notification *type*.
 *
 * `groupFires.ts` already groups identical fires — same event, same rendered
 * copy — which is the right unit for a burst of toasts. This is the other
 * axis, and the one the Alerts page and the Overview's alerts column are
 * built on: a device that has been away for a week comes back to hundreds of
 * rows across a dozen-odd types, and a list that prints a row per fire is
 * unusable on exactly the days it matters. Three hundred alerts across
 * seventeen types is a dozen rows here.
 *
 * Keyed on `entryChannelTarget` rather than `eventId`: every EVE notification
 * shares the one `eveNotification` event, so grouping on the event alone
 * would fold "structure under attack" into "corp bill due". That is also the
 * key the per-type mute writes against (`NotificationContextMenu`), so a
 * group and the control that silences it always name the same thing.
 *
 * Pure: no fetch/DOM/Dexie, no clock. Labels are the view's job — they need a
 * translator, and a group carries its `target` so the view can resolve one.
 */
import type { NotificationFeedRecord } from '@/db';
import { compareSeverity, type DeadlineSeverity } from '@/engine/severity';
import { entryChannelTarget, type EntryChannelTarget } from './feedSelection';
import { eveTypeLabel } from './eveTypeLabel';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';

export interface AlertTypeGroup {
  /** Stable identity for a React key and for expand/collapse state. */
  key: string;
  target: EntryChannelTarget;
  severity: DeadlineSeverity;
  count: number;
  newestFiredAt: number;
  /** Every fire of this type, newest first. */
  entries: NotificationFeedRecord[];
  /** Characters this type fired for, in first-seen order — the page is device-wide. */
  characterIds: number[];
}

/** One type's identity. `event:`/`eveType:` prefixed so the two namespaces cannot collide. */
export function alertGroupKey(entry: Pick<NotificationFeedRecord, 'eventId' | 'eveType'>): string {
  const target = entryChannelTarget(entry);
  return target.kind === 'eveType' ? `eveType:${target.type}` : `event:${target.eventId}`;
}

/**
 * Severity that is worth interrupting a triage board for, per type.
 *
 * A judgement about consequence, not a restatement of the notification
 * preferences: a type can be worth a feed row (`eventSelection.ts` decides
 * that) and still be the last thing you should look at. The two lists move
 * independently on purpose.
 *
 * `watch` is the floor rather than `clear`, because an unlisted type is one
 * this table has no opinion about — a row written by a newer build, or an
 * eveType outside the allow-list — and quietly filing it under "nothing to
 * see" is the one wrong answer. Everything here is opted *down* from watch,
 * or up.
 */
const EVE_TYPE_SEVERITY: Readonly<Record<string, DeadlineSeverity>> = {
  // Something is being taken from you right now.
  StructureUnderAttack: 'critical',
  StructureLostShields: 'critical',
  StructureLostArmor: 'critical',
  StructureDestroyed: 'critical',
  OrbitalAttacked: 'critical',
  OrbitalReinforced: 'critical',
  CorpKicked: 'critical',
  // A clock you can still beat.
  StructureFuelAlert: 'warning',
  StructureLowReagentsAlert: 'warning',
  StructureNoReagentsAlert: 'warning',
  StructureWentLowPower: 'warning',
  StructureImpendingAbandonmentAssetsAtRisk: 'warning',
  StructuresJobsPaused: 'warning',
  StructuresJobsCancelled: 'warning',
  StructureServicesOffline: 'warning',
  CorpAllBillMsg: 'warning',
  BillOutOfMoneyMsg: 'warning',
  CorpOfficeExpirationMsg: 'warning',
  InfrastructureHubBillAboutToExpire: 'warning',
  WarDeclared: 'warning',
  AllWarDeclaredMsg: 'warning',
  CorpBecameWarEligible: 'warning',
  // Happened, needs reading, costs nothing to be late on.
  StructureWentHighPower: 'clear',
  MoonminingExtractionFinished: 'watch',
  MoonminingAutomaticFracture: 'watch',
  CorpAppNewMsg: 'watch',
};

const EVENT_SEVERITY: Readonly<Partial<Record<NotificationEventId, DeadlineSeverity>>> = {
  // A standing fault: training stopped and nothing is replacing it.
  characterNotTraining: 'warning',
  structureFuelLow: 'warning',
  corpWalletThreshold: 'warning',
  planetaryExtractorExpiring: 'warning',
  // Waiting on you, but nothing is burning.
  industryJobComplete: 'watch',
  corpIndustryJobReady: 'watch',
  planetaryExtractionDone: 'watch',
  skillLevelComplete: 'watch',
  contractAccepted: 'watch',
  newCalendarEvent: 'watch',
  calendarEventStarting: 'watch',
  newMail: 'watch',
  corpMemberJoined: 'watch',
  corpMemberLeft: 'watch',
  // News. It already went the way you wanted.
  marketOrderFilled: 'clear',
  walletBalanceChanged: 'clear',
};

export function alertSeverity(target: EntryChannelTarget): DeadlineSeverity {
  return (
    (target.kind === 'eveType' ? EVE_TYPE_SEVERITY[target.type] : EVENT_SEVERITY[target.eventId]) ??
    'watch'
  );
}

/**
 * Worst first, then liveliest — a tie on severity breaks on the newest fire,
 * so two equally urgent types are ordered by which is still happening.
 */
function compareGroups(a: AlertTypeGroup, b: AlertTypeGroup): number {
  const bySeverity = compareSeverity(a.severity, b.severity);
  return bySeverity !== 0 ? bySeverity : b.newestFiredAt - a.newestFiredAt;
}

const EVENT_LABEL_KEY = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event.labelKey]));

/**
 * What to call a group, in the reader's language.
 *
 * Two catalogues, because a group is keyed on one of two namespaces: an EVE
 * notification's own `type` (`notifications.eveTypeName.*`, with
 * `humanizeEveType` underneath it) or an app event id
 * (`settings.notifications.event.*`). Neither belongs inline at a call site —
 * the board's alerts column and the Alerts page name the same groups, and two
 * copies of this would eventually name them differently.
 *
 * Not a field on `AlertTypeGroup`: resolving it needs a translator, and the
 * grouping itself is pure.
 */
export function alertGroupLabel(
  t: (key: string, options: { defaultValue: string }) => string,
  target: EntryChannelTarget
): string {
  if (target.kind === 'eveType') return eveTypeLabel(t, target.type);
  const key = EVENT_LABEL_KEY.get(target.eventId);
  return key === undefined ? target.eventId : t(key, { defaultValue: target.eventId });
}

export function groupAlertsByType(entries: readonly NotificationFeedRecord[]): AlertTypeGroup[] {
  const byKey = new Map<string, AlertTypeGroup>();
  for (const entry of entries) {
    const key = alertGroupKey(entry);
    const existing = byKey.get(key);
    if (existing === undefined) {
      const target = entryChannelTarget(entry);
      byKey.set(key, {
        key,
        target,
        severity: alertSeverity(target),
        count: 1,
        newestFiredAt: entry.firedAt,
        entries: [entry],
        characterIds: [entry.characterId],
      });
      continue;
    }
    existing.count += 1;
    existing.entries.push(entry);
    // Never assume the caller handed them over in order: `readFeed` does, but
    // a filtered or merged list need not, and a group claiming the wrong
    // "newest" would sort itself into the wrong place.
    if (entry.firedAt > existing.newestFiredAt) existing.newestFiredAt = entry.firedAt;
    if (!existing.characterIds.includes(entry.characterId)) {
      existing.characterIds.push(entry.characterId);
    }
  }

  const groups = [...byKey.values()];
  for (const group of groups) group.entries.sort((a, b) => b.firedAt - a.firedAt);
  return groups.sort(compareGroups);
}
