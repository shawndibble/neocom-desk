import type { NotificationFeedRecord } from '@/db';
import { compareSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import { entryChannelTarget, type EntryChannelTarget } from './feedSelection';
import { eveTypeLabel } from './eveTypeLabel';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';

export interface AlertTypeGroup {
  key: string;
  target: EntryChannelTarget;
  severity: DeadlineSeverity;
  count: number;
  newestFiredAt: number;
  entries: NotificationFeedRecord[];
  characterIds: number[];
}

export function alertGroupKey(entry: Pick<NotificationFeedRecord, 'eventId' | 'eveType'>): string {
  const target = entryChannelTarget(entry);
  return target.kind === 'eveType' ? `eveType:${target.type}` : `event:${target.eventId}`;
}

const EVE_TYPE_SEVERITY: Readonly<Record<string, DeadlineSeverity>> = {
  StructureUnderAttack: 'critical',
  StructureLostShields: 'critical',
  StructureLostArmor: 'critical',
  StructureDestroyed: 'critical',
  OrbitalAttacked: 'critical',
  OrbitalReinforced: 'critical',
  CorpKicked: 'critical',
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
  StructureWentHighPower: 'clear',
  MoonminingExtractionStarted: 'watch',
  MoonminingExtractionFinished: 'watch',
  MoonminingLaserFired: 'watch',
  MoonminingAutomaticFracture: 'watch',
  MoonminingExtractionCancelled: 'watch',
  CorpAppNewMsg: 'watch',
};

const EVENT_SEVERITY: Readonly<Partial<Record<NotificationEventId, DeadlineSeverity>>> = {
  characterNotTraining: 'warning',
  structureFuelLow: 'warning',
  skyhookRaidable: 'warning',
  corpWalletThreshold: 'warning',
  planetaryExtractorExpiring: 'warning',
  mercenaryDenReinforced: 'critical',
  mercenaryDenAnarchy: 'warning',
  skillQueueEnding: 'warning',
  omegaLapsed: 'warning',
  acceleratorExpiring: 'warning',
  acceleratorEnded: 'watch',
  courierDeliveryDue: 'warning',
  contractFailed: 'warning',
  marketOrderUndercut: 'warning',
  stockBelowTarget: 'warning',
  shipLost: 'warning',
  characterNeedsLogin: 'warning',
  incursionNearby: 'watch',
  skyhookRaidableNearby: 'watch',
  communityJoinRequest: 'watch',
  communityMemberJoined: 'watch',
  communityRequestPledged: 'watch',
  vettingShared: 'watch',
  corpTaxBookSyncStopped: 'warning',
  spExtractionReady: 'watch',
  industryJobComplete: 'watch',
  cloneJumpReady: 'watch',
  corpIndustryJobReady: 'watch',
  planetaryExtractionDone: 'watch',
  skillLevelComplete: 'watch',
  contractAccepted: 'watch',
  newCalendarEvent: 'watch',
  calendarEventStarting: 'watch',
  newMail: 'watch',
  corpMemberJoined: 'watch',
  corpMemberLeft: 'watch',
  marketOrderFilled: 'clear',
  walletBalanceChanged: 'clear',
  priceAlertTriggered: 'clear',
  contractCompleted: 'clear',
};

export function alertSeverity(target: EntryChannelTarget): DeadlineSeverity {
  return (
    (target.kind === 'eveType' ? EVE_TYPE_SEVERITY[target.type] : EVENT_SEVERITY[target.eventId]) ??
    'watch'
  );
}

export function entrySeverity(
  entry: Pick<NotificationFeedRecord, 'eventId' | 'eveType'> & { id?: string }
): DeadlineSeverity {
  if (entry.eventId === 'skyhookRaidable' && entry.id?.endsWith(':danger')) return 'critical';
  return alertSeverity(entryChannelTarget(entry));
}

function compareGroups(a: AlertTypeGroup, b: AlertTypeGroup): number {
  const bySeverity = compareSeverity(a.severity, b.severity);
  return bySeverity !== 0 ? bySeverity : b.newestFiredAt - a.newestFiredAt;
}

const EVENT_LABEL_KEY = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event.labelKey]));

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
        severity: entrySeverity(entry),
        count: 1,
        newestFiredAt: entry.firedAt,
        entries: [entry],
        characterIds: [entry.characterId],
      });
      continue;
    }
    existing.count += 1;
    existing.entries.push(entry);
    const severity = entrySeverity(entry);
    if (compareSeverity(severity, existing.severity) < 0) existing.severity = severity;
    if (entry.firedAt > existing.newestFiredAt) existing.newestFiredAt = entry.firedAt;
    if (!existing.characterIds.includes(entry.characterId)) {
      existing.characterIds.push(entry.characterId);
    }
  }

  const groups = [...byKey.values()];
  for (const group of groups) group.entries.sort((a, b) => b.firedAt - a.firedAt);
  return groups.sort(compareGroups);
}
