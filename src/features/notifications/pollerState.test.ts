import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import type {
  SkillQueueSnapshot,
  IndustryJobSnapshot,
  PlanetarySnapshot,
} from '@/engine/notificationDiffs';
import {
  useSkillQueuePollerState,
  SKILL_QUEUE_POLLER_STATE_KEY,
  DEFAULT_SKILL_QUEUE_POLLER_STATE,
  withCharacterSnapshot,
  useIndustryJobPollerState,
  INDUSTRY_JOB_POLLER_STATE_KEY,
  DEFAULT_INDUSTRY_JOB_POLLER_STATE,
  withCharacterJobSnapshot,
  useColonyPollerState,
  COLONY_POLLER_STATE_KEY,
  DEFAULT_COLONY_POLLER_STATE,
  withCharacterColonySnapshot,
} from './pollerState';

const SNAPSHOT: SkillQueueSnapshot = {
  entries: [{ skillId: 1, finishedLevel: 3, queuePosition: 0, finishMs: 12345 }],
  nowMs: 999,
};

const JOB_SNAPSHOT: IndustryJobSnapshot = {
  entries: [{ jobId: 1, endMs: 12345, blueprintTypeId: 100, productTypeId: 200, activityId: 1 }],
  nowMs: 999,
};

const COLONY_SNAPSHOT: PlanetarySnapshot = {
  colonies: [{ planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 12345 }] }],
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

beforeEach(async () => {
  useIndustryJobPollerState.setState({ value: DEFAULT_INDUSTRY_JOB_POLLER_STATE, hydrated: false });
  useColonyPollerState.setState({ value: DEFAULT_COLONY_POLLER_STATE, hydrated: false });
});

describe('useIndustryJobPollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useIndustryJobPollerState.getState().value).toEqual(DEFAULT_INDUSTRY_JOB_POLLER_STATE);
    expect(useIndustryJobPollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(INDUSTRY_JOB_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useIndustryJobPollerState.getState().setValue({ 7: JOB_SNAPSHOT });
    expect((await db.settings.get(INDUSTRY_JOB_POLLER_STATE_KEY))?.value).toEqual({
      7: JOB_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: INDUSTRY_JOB_POLLER_STATE_KEY, value: { 7: JOB_SNAPSHOT } });
    await useIndustryJobPollerState.getState().hydrate();
    expect(useIndustryJobPollerState.getState().value).toEqual({ 7: JOB_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({
      key: INDUSTRY_JOB_POLLER_STATE_KEY,
      value: { 7: { entries: 'nope' } },
    });
    await useIndustryJobPollerState.getState().hydrate();
    expect(useIndustryJobPollerState.getState().value).toEqual(DEFAULT_INDUSTRY_JOB_POLLER_STATE);
  });
});

describe('withCharacterJobSnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterJobSnapshot({ 2: JOB_SNAPSHOT }, 7, JOB_SNAPSHOT);
    expect(next).toEqual({ 2: JOB_SNAPSHOT, 7: JOB_SNAPSHOT });
  });
});

describe('useColonyPollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useColonyPollerState.getState().value).toEqual(DEFAULT_COLONY_POLLER_STATE);
    expect(useColonyPollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(COLONY_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useColonyPollerState.getState().setValue({ 7: COLONY_SNAPSHOT });
    expect((await db.settings.get(COLONY_POLLER_STATE_KEY))?.value).toEqual({
      7: COLONY_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: COLONY_POLLER_STATE_KEY, value: { 7: COLONY_SNAPSHOT } });
    await useColonyPollerState.getState().hydrate();
    expect(useColonyPollerState.getState().value).toEqual({ 7: COLONY_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: COLONY_POLLER_STATE_KEY, value: { 7: { colonies: 'nope' } } });
    await useColonyPollerState.getState().hydrate();
    expect(useColonyPollerState.getState().value).toEqual(DEFAULT_COLONY_POLLER_STATE);
  });
});

describe('withCharacterColonySnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterColonySnapshot({ 2: COLONY_SNAPSHOT }, 7, COLONY_SNAPSHOT);
    expect(next).toEqual({ 2: COLONY_SNAPSHOT, 7: COLONY_SNAPSHOT });
  });
});
