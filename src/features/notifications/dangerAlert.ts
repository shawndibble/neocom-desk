import type { NotificationFeedRecord } from '@/db';
import { alertGroupKey, entrySeverity, type AlertTypeGroup } from './alertGroups';
import { notificationUrlFor } from './notificationOptions';

export function isDangerEntry(
  entry: Pick<NotificationFeedRecord, 'eventId' | 'eveType'> & { id?: string }
): boolean {
  return entrySeverity(entry) === 'critical';
}

const live = (entries: readonly NotificationFeedRecord[]) =>
  entries.filter((entry) => entry.dismissedAt === undefined);

export function selectDangerBanner(
  entries: readonly NotificationFeedRecord[]
): NotificationFeedRecord | null {
  let best: NotificationFeedRecord | null = null;
  for (const entry of live(entries)) {
    if (isDangerEntry(entry) && (best === null || entry.firedAt > best.firedAt)) best = entry;
  }
  return best;
}

export interface BellBadge {
  count: number;
  danger: boolean;
}

export function bellBadge(entries: readonly NotificationFeedRecord[]): BellBadge {
  const waiting = live(entries);
  return { count: waiting.length, danger: waiting.some(isDangerEntry) };
}

export function markAllReadTargets(
  entries: readonly NotificationFeedRecord[]
): NotificationFeedRecord[] {
  return live(entries).filter((entry) => !isDangerEntry(entry));
}

export const ALERT_CHIPS = [
  'all',
  'danger',
  'market',
  'industry',
  'mail',
  'calendar',
  'structures',
  'skills',
] as const;
export type AlertChip = (typeof ALERT_CHIPS)[number];
type TopicChip = Exclude<AlertChip, 'all' | 'danger'>;

const EVENT_CHIP: Readonly<Record<string, TopicChip>> = {
  marketOrderFilled: 'market',
  marketOrderUndercut: 'market',
  priceAlertTriggered: 'market',
  stockBelowTarget: 'market',
  walletBalanceChanged: 'market',
  contractAccepted: 'market',
  contractCompleted: 'market',
  contractFailed: 'market',
  courierDeliveryDue: 'market',
  contractExpiring: 'market',
  ordersLapsing: 'market',
  industryJobComplete: 'industry',
  corpIndustryJobReady: 'industry',
  planetaryExtractionDone: 'industry',
  planetaryExtractorExpiring: 'industry',
  mercenaryDenReinforced: 'industry',
  mercenaryDenAnarchy: 'industry',
  sharedMoonPop: 'industry',
  newMail: 'mail',
  newCalendarEvent: 'calendar',
  calendarEventStarting: 'calendar',
  structureFuelLow: 'structures',
  skyhookRaidable: 'structures',
  skillLevelComplete: 'skills',
  characterNotTraining: 'skills',
  skillQueueEnding: 'skills',
  omegaLapsed: 'skills',
  acceleratorExpiring: 'skills',
  acceleratorEnded: 'skills',
  spExtractionReady: 'skills',
  cloneJumpReady: 'skills',
};

const STRUCTURE_TYPE_PREFIXES = ['Structure', 'Orbital', 'Moonmining', 'InfrastructureHub'];

export function typeChipOfGroupKey(key: string): TopicChip | null {
  if (key.startsWith('eveType:')) {
    const type = key.slice('eveType:'.length);
    return STRUCTURE_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix)) ? 'structures' : null;
  }
  return EVENT_CHIP[key.slice('event:'.length)] ?? null;
}

export function filterByChip<G extends Pick<AlertTypeGroup, 'key' | 'severity'>>(
  groups: readonly G[],
  chip: AlertChip
): G[] {
  if (chip === 'all') return [...groups];
  if (chip === 'danger') return groups.filter((group) => group.severity === 'critical');
  return groups.filter((group) => typeChipOfGroupKey(group.key) === chip);
}

export function usefulChips(
  groups: readonly Pick<AlertTypeGroup, 'key' | 'severity'>[]
): AlertChip[] {
  const narrowing = ALERT_CHIPS.filter((chip) => {
    if (chip === 'all') return false;
    const matched = filterByChip(groups, chip).length;
    return matched > 0 && matched < groups.length;
  });
  return narrowing.length === 0 ? [] : ['all', ...narrowing];
}

export function isSnoozable(group: Pick<AlertTypeGroup, 'key'>): boolean {
  return group.key === alertGroupKey({ eventId: 'priceAlertTriggered' });
}

export function alertViewPath(groupKey: string): string {
  if (groupKey.startsWith('eveType:')) {
    return typeChipOfGroupKey(groupKey) === 'structures' ? '/corp' : '/overview';
  }
  const path = notificationUrlFor(groupKey.slice('event:'.length));
  return path === '/alerts' ? '/overview' : path;
}
