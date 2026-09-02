import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import type { SkillQueueSnapshot } from '@/engine/notificationDiffs';
import {
  useSkillQueuePollerState,
  SKILL_QUEUE_POLLER_STATE_KEY,
  DEFAULT_SKILL_QUEUE_POLLER_STATE,
  withCharacterSnapshot,
} from './pollerState';

const SNAPSHOT: SkillQueueSnapshot = {
  entries: [{ skillId: 1, finishedLevel: 3, queuePosition: 0, finishMs: 12345 }],
  nowMs: 999,
};

beforeEach(async () => {
  await db.settings.clear();
  useSkillQueuePollerState.setState({ value: DEFAULT_SKILL_QUEUE_POLLER_STATE, hydrated: false });
});

describe('useSkillQueuePollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useSkillQueuePollerState.getState().value).toEqual(DEFAULT_SKILL_QUEUE_POLLER_STATE);
    expect(useSkillQueuePollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(SKILL_QUEUE_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useSkillQueuePollerState.getState().setValue({ 7: SNAPSHOT });
    expect((await db.settings.get(SKILL_QUEUE_POLLER_STATE_KEY))?.value).toEqual({ 7: SNAPSHOT });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: SKILL_QUEUE_POLLER_STATE_KEY, value: { 7: SNAPSHOT } });
    await useSkillQueuePollerState.getState().hydrate();
    expect(useSkillQueuePollerState.getState().value).toEqual({ 7: SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: SKILL_QUEUE_POLLER_STATE_KEY, value: { 7: { entries: 'nope' } } });
    await useSkillQueuePollerState.getState().hydrate();
    expect(useSkillQueuePollerState.getState().value).toEqual(DEFAULT_SKILL_QUEUE_POLLER_STATE);
  });

  it('rejects an entry missing a required numeric field', async () => {
    await db.settings.put({
      key: SKILL_QUEUE_POLLER_STATE_KEY,
      value: { 7: { entries: [{ skillId: 1, queuePosition: 0, finishMs: null }], nowMs: 1 } },
    });
    await useSkillQueuePollerState.getState().hydrate();
    expect(useSkillQueuePollerState.getState().value).toEqual(DEFAULT_SKILL_QUEUE_POLLER_STATE);
  });
});

describe('withCharacterSnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: SNAPSHOT }, 7, SNAPSHOT);
    expect(next).toEqual({ 2: SNAPSHOT, 7: SNAPSHOT });
  });

  it('overwrites an existing snapshot for the same character', () => {
    const updated: SkillQueueSnapshot = { entries: [], nowMs: 5000 };
    const next = withCharacterSnapshot({ 7: SNAPSHOT }, 7, updated);
    expect(next[7]).toEqual(updated);
  });
});
