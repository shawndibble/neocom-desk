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
