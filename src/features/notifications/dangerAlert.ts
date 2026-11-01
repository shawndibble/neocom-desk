/**
 * What the global alerts bell, panel and Danger banner decide, with no UI in
 * it: which entries are danger, what the bell badge says, what "Mark all read"
 * may touch, and which chip a notification type sits under.
 *
 * Danger is `entrySeverity(...) === 'critical'` (`alertGroups.ts`) — the one
 * judgement of consequence the app already makes, reused rather than restated.
 * Acknowledging a danger Alert is dismissing its feed entries, so there is no
 * "acknowledged" state here: an undismissed danger entry is an unacknowledged
 * one.
 *
 * Pure: no fetch/DOM/Dexie, no clock.
 */
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

/** The entry the Danger banner shows: newest undismissed danger entry, or null. */
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
  /** An unacknowledged danger Alert exists: the badge turns red. */
  danger: boolean;
}

export function bellBadge(entries: readonly NotificationFeedRecord[]): BellBadge {
  const waiting = live(entries);
  return { count: waiting.length, danger: waiting.some(isDangerEntry) };
}

/** "Mark all read" dismisses everything except danger, which only Acknowledge clears. */
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
  newMail: 'mail',
  newCalendarEvent: 'mail',
  calendarEventStarting: 'mail',
  structureFuelLow: 'structures',
  skyhookRaidable: 'structures',
  skillLevelComplete: 'skills',
  characterNotTraining: 'skills',
  skillQueueEnding: 'skills',
  acceleratorExpiring: 'skills',
  spExtractionReady: 'skills',
  cloneJumpReady: 'skills',
};

const STRUCTURE_TYPE_PREFIXES = ['Structure', 'Orbital', 'Moonmining', 'InfrastructureHub'];

/** The topic chip a group key (`alertGroupKey`) files under, or null when only All lists it. */
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

/**
 * The chips worth showing: a chip only earns its place when it narrows the list,
 * so those matching nothing, or every type, are left out, and with none left
 * (one type, or all alike) there is nothing to filter and no chips at all.
 */
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

/** Price alerts are the one type where "not now, ask again later" is honest. */
export function isSnoozable(group: Pick<AlertTypeGroup, 'key'>): boolean {
  return group.key === alertGroupKey({ eventId: 'priceAlertTriggered' });
}

/**
 * Where View goes for a group. An event uses its notification route; an EVE
 * notification has no page of its own, so structure types go to the corp page
 * and the rest stay on the Overview. Never `/alerts`, which now just opens
 * the panel this was clicked in.
 */
export function alertViewPath(groupKey: string): string {
  if (groupKey.startsWith('eveType:')) {
    return typeChipOfGroupKey(groupKey) === 'structures' ? '/corp' : '/overview';
  }
  const path = notificationUrlFor(groupKey.slice('event:'.length));
  return path === '/alerts' ? '/overview' : path;
}
