/**
 * Device-local persistence of each character's last-polled skill-queue
 * snapshot (AC6, issue #172) — the "old state" half of the diff functions in
 * `engine/notificationDiffs.ts`. Never synced: it exists purely so a reload
 * doesn't lose the baseline and re-fire a notification for a completion the
 * poller already reported.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { SkillQueueEntrySnapshot, SkillQueueSnapshot } from '@/engine/notificationDiffs';

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
