/**
 * Device-local persistence of each character's last-polled skill-queue
 * snapshot (AC6, issue #172) — the "old state" half of the diff functions in
 * `engine/notificationDiffs.ts`. Never synced: it exists purely so a reload
 * doesn't lose the baseline and re-fire a notification for a completion the
 * poller already reported.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type {
  SkillQueueEntrySnapshot,
  SkillQueueSnapshot,
  IndustryJobEntrySnapshot,
  IndustryJobSnapshot,
  ColonyExtractorSnapshot,
  ColonySnapshotEntry,
  PlanetarySnapshot,
  MailHeaderSnapshot,
  MailSnapshot,
  CalendarEventEntrySnapshot,
  CalendarSnapshot,
  ContractEntrySnapshot,
  ContractSnapshot,
  ContractStatus,
} from '@/engine/notificationDiffs';

export const SKILL_QUEUE_POLLER_STATE_KEY = 'notifications.pollerState.skillQueue';

export type SkillQueuePollerState = Record<number, SkillQueueSnapshot>;

export const DEFAULT_SKILL_QUEUE_POLLER_STATE: SkillQueuePollerState = {};

function isEntrySnapshot(raw: unknown): raw is SkillQueueEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.skillId === 'number' &&
    typeof r.finishedLevel === 'number' &&
    typeof r.queuePosition === 'number' &&
    (r.finishMs === null || typeof r.finishMs === 'number')
  );
}

function isSnapshot(raw: unknown): raw is SkillQueueSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.nowMs === 'number' && Array.isArray(r.entries) && r.entries.every(isEntrySnapshot)
  );
}

function isPollerState(raw: unknown): raw is SkillQueuePollerState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isSnapshot(value)
  );
}

export const useSkillQueuePollerState = createLocalSetting<SkillQueuePollerState>({
  key: SKILL_QUEUE_POLLER_STATE_KEY,
  defaultValue: DEFAULT_SKILL_QUEUE_POLLER_STATE,
  parse: (raw) => (isPollerState(raw) ? raw : null),
});

export function withCharacterSnapshot(
  state: SkillQueuePollerState,
  characterId: number,
  snapshot: SkillQueueSnapshot
): SkillQueuePollerState {
  return { ...state, [characterId]: snapshot };
}

export const INDUSTRY_JOB_POLLER_STATE_KEY = 'notifications.pollerState.industryJobs';

export type IndustryJobPollerState = Record<number, IndustryJobSnapshot>;

export const DEFAULT_INDUSTRY_JOB_POLLER_STATE: IndustryJobPollerState = {};

function isJobEntrySnapshot(raw: unknown): raw is IndustryJobEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.jobId === 'number' &&
    typeof r.endMs === 'number' &&
    typeof r.blueprintTypeId === 'number' &&
    (r.productTypeId === null || typeof r.productTypeId === 'number') &&
    typeof r.activityId === 'number'
  );
}

function isJobSnapshot(raw: unknown): raw is IndustryJobSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.nowMs === 'number' && Array.isArray(r.entries) && r.entries.every(isJobEntrySnapshot)
  );
}

function isJobPollerState(raw: unknown): raw is IndustryJobPollerState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isJobSnapshot(value)
  );
}

export const useIndustryJobPollerState = createLocalSetting<IndustryJobPollerState>({
  key: INDUSTRY_JOB_POLLER_STATE_KEY,
  defaultValue: DEFAULT_INDUSTRY_JOB_POLLER_STATE,
  parse: (raw) => (isJobPollerState(raw) ? raw : null),
});

export function withCharacterJobSnapshot(
  state: IndustryJobPollerState,
  characterId: number,
  snapshot: IndustryJobSnapshot
): IndustryJobPollerState {
  return { ...state, [characterId]: snapshot };
}

export const COLONY_POLLER_STATE_KEY = 'notifications.pollerState.colonies';

export type ColonyPollerState = Record<number, PlanetarySnapshot>;

export const DEFAULT_COLONY_POLLER_STATE: ColonyPollerState = {};

function isExtractorSnapshot(raw: unknown): raw is ColonyExtractorSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.pinId === 'number' && typeof r.expiryTimeMs === 'number';
}

function isColonySnapshotEntry(raw: unknown): raw is ColonySnapshotEntry {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.planetId === 'number' &&
    Array.isArray(r.extractors) &&
    r.extractors.every(isExtractorSnapshot)
  );
}

function isPlanetarySnapshot(raw: unknown): raw is PlanetarySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.nowMs === 'number' &&
    Array.isArray(r.colonies) &&
    r.colonies.every(isColonySnapshotEntry)
  );
}

function isColonyPollerState(raw: unknown): raw is ColonyPollerState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isPlanetarySnapshot(value)
  );
}

export const useColonyPollerState = createLocalSetting<ColonyPollerState>({
  key: COLONY_POLLER_STATE_KEY,
  defaultValue: DEFAULT_COLONY_POLLER_STATE,
  parse: (raw) => (isColonyPollerState(raw) ? raw : null),
});

export function withCharacterColonySnapshot(
  state: ColonyPollerState,
  characterId: number,
  snapshot: PlanetarySnapshot
): ColonyPollerState {
  return { ...state, [characterId]: snapshot };
}

export const MAIL_POLLER_STATE_KEY = 'notifications.pollerState.mail';

export type MailPollerState = Record<number, MailSnapshot>;

export const DEFAULT_MAIL_POLLER_STATE: MailPollerState = {};

function isMailHeaderSnapshot(raw: unknown): raw is MailHeaderSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.mailId === 'number';
}

function isMailSnapshot(raw: unknown): raw is MailSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.nowMs === 'number' && Array.isArray(r.entries) && r.entries.every(isMailHeaderSnapshot)
  );
}

function isMailPollerState(raw: unknown): raw is MailPollerState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isMailSnapshot(value)
  );
}

export const useMailPollerState = createLocalSetting<MailPollerState>({
  key: MAIL_POLLER_STATE_KEY,
  defaultValue: DEFAULT_MAIL_POLLER_STATE,
  parse: (raw) => (isMailPollerState(raw) ? raw : null),
});

export function withCharacterMailSnapshot(
  state: MailPollerState,
  characterId: number,
  snapshot: MailSnapshot
): MailPollerState {
  return { ...state, [characterId]: snapshot };
}

export const CALENDAR_POLLER_STATE_KEY = 'notifications.pollerState.calendar';

export type CalendarPollerState = Record<number, CalendarSnapshot>;

export const DEFAULT_CALENDAR_POLLER_STATE: CalendarPollerState = {};

function isCalendarEventEntrySnapshot(raw: unknown): raw is CalendarEventEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.calendarEventId === 'number' && typeof r.startMs === 'number';
}

function isCalendarSnapshot(raw: unknown): raw is CalendarSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.nowMs === 'number' &&
    Array.isArray(r.entries) &&
    r.entries.every(isCalendarEventEntrySnapshot)
  );
}

function isCalendarPollerState(raw: unknown): raw is CalendarPollerState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isCalendarSnapshot(value)
  );
}

export const useCalendarPollerState = createLocalSetting<CalendarPollerState>({
  key: CALENDAR_POLLER_STATE_KEY,
  defaultValue: DEFAULT_CALENDAR_POLLER_STATE,
  parse: (raw) => (isCalendarPollerState(raw) ? raw : null),
});

export function withCharacterCalendarSnapshot(
  state: CalendarPollerState,
  characterId: number,
  snapshot: CalendarSnapshot
): CalendarPollerState {
  return { ...state, [characterId]: snapshot };
}

export const CONTRACT_POLLER_STATE_KEY = 'notifications.pollerState.contracts';

export type ContractPollerState = Record<number, ContractSnapshot>;

export const DEFAULT_CONTRACT_POLLER_STATE: ContractPollerState = {};

const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'outstanding',
  'in_progress',
  'finished_issuer',
  'finished_contractor',
  'finished',
  'cancelled',
  'rejected',
  'failed',
  'deleted',
  'reversed',
];

function isContractStatus(raw: unknown): raw is ContractStatus {
  return typeof raw === 'string' && (CONTRACT_STATUSES as readonly string[]).includes(raw);
}

function isContractEntrySnapshot(raw: unknown): raw is ContractEntrySnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.contractId === 'number' && isContractStatus(r.status);
}

function isContractSnapshot(raw: unknown): raw is ContractSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.nowMs === 'number' &&
    Array.isArray(r.entries) &&
    r.entries.every(isContractEntrySnapshot)
  );
}

function isContractPollerState(raw: unknown): raw is ContractPollerState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isContractSnapshot(value)
  );
}

export const useContractPollerState = createLocalSetting<ContractPollerState>({
  key: CONTRACT_POLLER_STATE_KEY,
  defaultValue: DEFAULT_CONTRACT_POLLER_STATE,
  parse: (raw) => (isContractPollerState(raw) ? raw : null),
});

export function withCharacterContractSnapshot(
  state: ContractPollerState,
  characterId: number,
  snapshot: ContractSnapshot
): ContractPollerState {
  return { ...state, [characterId]: snapshot };
}
