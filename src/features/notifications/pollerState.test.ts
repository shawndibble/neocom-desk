import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import type {
  SkillQueueSnapshot,
  IndustryJobSnapshot,
  PlanetarySnapshot,
  MailSnapshot,
  CalendarSnapshot,
  ContractSnapshot,
  WalletSnapshot,
  MarketOrderSnapshot,
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
  useMailPollerState,
  MAIL_POLLER_STATE_KEY,
  DEFAULT_MAIL_POLLER_STATE,
  withCharacterMailSnapshot,
  useCalendarPollerState,
  CALENDAR_POLLER_STATE_KEY,
  DEFAULT_CALENDAR_POLLER_STATE,
  withCharacterCalendarSnapshot,
  useContractPollerState,
  CONTRACT_POLLER_STATE_KEY,
  DEFAULT_CONTRACT_POLLER_STATE,
  withCharacterContractSnapshot,
  useWalletPollerState,
  WALLET_POLLER_STATE_KEY,
  DEFAULT_WALLET_POLLER_STATE,
  withCharacterWalletSnapshot,
  useMarketOrderPollerState,
  MARKET_ORDER_POLLER_STATE_KEY,
  DEFAULT_MARKET_ORDER_POLLER_STATE,
  withCharacterMarketOrderSnapshot,
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

const MAIL_SNAPSHOT: MailSnapshot = {
  entries: [{ mailId: 5 }],
  nowMs: 999,
};

const CALENDAR_SNAPSHOT: CalendarSnapshot = {
  entries: [{ calendarEventId: 1, startMs: 12345 }],
  nowMs: 999,
};

const CONTRACT_SNAPSHOT: ContractSnapshot = {
  entries: [{ contractId: 1, status: 'in_progress' }],
  nowMs: 999,
};

const WALLET_SNAPSHOT: WalletSnapshot = {
  entries: [{ id: 5, amount: 100 }],
  nowMs: 999,
};

const MARKET_ORDER_SNAPSHOT: MarketOrderSnapshot = {
  entries: [{ orderId: 1, filled: true }],
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

beforeEach(async () => {
  useMailPollerState.setState({ value: DEFAULT_MAIL_POLLER_STATE, hydrated: false });
  useCalendarPollerState.setState({ value: DEFAULT_CALENDAR_POLLER_STATE, hydrated: false });
  useContractPollerState.setState({ value: DEFAULT_CONTRACT_POLLER_STATE, hydrated: false });
  useWalletPollerState.setState({ value: DEFAULT_WALLET_POLLER_STATE, hydrated: false });
  useMarketOrderPollerState.setState({ value: DEFAULT_MARKET_ORDER_POLLER_STATE, hydrated: false });
});

describe('useMailPollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useMailPollerState.getState().value).toEqual(DEFAULT_MAIL_POLLER_STATE);
    expect(useMailPollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(MAIL_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useMailPollerState.getState().setValue({ 7: MAIL_SNAPSHOT });
    expect((await db.settings.get(MAIL_POLLER_STATE_KEY))?.value).toEqual({ 7: MAIL_SNAPSHOT });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: MAIL_POLLER_STATE_KEY, value: { 7: MAIL_SNAPSHOT } });
    await useMailPollerState.getState().hydrate();
    expect(useMailPollerState.getState().value).toEqual({ 7: MAIL_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: MAIL_POLLER_STATE_KEY, value: { 7: { entries: 'nope' } } });
    await useMailPollerState.getState().hydrate();
    expect(useMailPollerState.getState().value).toEqual(DEFAULT_MAIL_POLLER_STATE);
  });
});

describe('withCharacterMailSnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterMailSnapshot({ 2: MAIL_SNAPSHOT }, 7, MAIL_SNAPSHOT);
    expect(next).toEqual({ 2: MAIL_SNAPSHOT, 7: MAIL_SNAPSHOT });
  });
});

describe('useCalendarPollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useCalendarPollerState.getState().value).toEqual(DEFAULT_CALENDAR_POLLER_STATE);
    expect(useCalendarPollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(CALENDAR_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useCalendarPollerState.getState().setValue({ 7: CALENDAR_SNAPSHOT });
    expect((await db.settings.get(CALENDAR_POLLER_STATE_KEY))?.value).toEqual({
      7: CALENDAR_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: CALENDAR_POLLER_STATE_KEY, value: { 7: CALENDAR_SNAPSHOT } });
    await useCalendarPollerState.getState().hydrate();
    expect(useCalendarPollerState.getState().value).toEqual({ 7: CALENDAR_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: CALENDAR_POLLER_STATE_KEY, value: { 7: { entries: 'nope' } } });
    await useCalendarPollerState.getState().hydrate();
    expect(useCalendarPollerState.getState().value).toEqual(DEFAULT_CALENDAR_POLLER_STATE);
  });
});

describe('withCharacterCalendarSnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterCalendarSnapshot({ 2: CALENDAR_SNAPSHOT }, 7, CALENDAR_SNAPSHOT);
    expect(next).toEqual({ 2: CALENDAR_SNAPSHOT, 7: CALENDAR_SNAPSHOT });
  });
});

describe('useContractPollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useContractPollerState.getState().value).toEqual(DEFAULT_CONTRACT_POLLER_STATE);
    expect(useContractPollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(CONTRACT_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useContractPollerState.getState().setValue({ 7: CONTRACT_SNAPSHOT });
    expect((await db.settings.get(CONTRACT_POLLER_STATE_KEY))?.value).toEqual({
      7: CONTRACT_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: CONTRACT_POLLER_STATE_KEY, value: { 7: CONTRACT_SNAPSHOT } });
    await useContractPollerState.getState().hydrate();
    expect(useContractPollerState.getState().value).toEqual({ 7: CONTRACT_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: CONTRACT_POLLER_STATE_KEY, value: { 7: { entries: 'nope' } } });
    await useContractPollerState.getState().hydrate();
    expect(useContractPollerState.getState().value).toEqual(DEFAULT_CONTRACT_POLLER_STATE);
  });

  it('rejects an entry with an unrecognized status', async () => {
    await db.settings.put({
      key: CONTRACT_POLLER_STATE_KEY,
      value: { 7: { entries: [{ contractId: 1, status: 'made_up' }], nowMs: 1 } },
    });
    await useContractPollerState.getState().hydrate();
    expect(useContractPollerState.getState().value).toEqual(DEFAULT_CONTRACT_POLLER_STATE);
  });
});

describe('withCharacterContractSnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterContractSnapshot({ 2: CONTRACT_SNAPSHOT }, 7, CONTRACT_SNAPSHOT);
    expect(next).toEqual({ 2: CONTRACT_SNAPSHOT, 7: CONTRACT_SNAPSHOT });
  });
});

describe('useWalletPollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useWalletPollerState.getState().value).toEqual(DEFAULT_WALLET_POLLER_STATE);
    expect(useWalletPollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(WALLET_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useWalletPollerState.getState().setValue({ 7: WALLET_SNAPSHOT });
    expect((await db.settings.get(WALLET_POLLER_STATE_KEY))?.value).toEqual({
      7: WALLET_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: WALLET_POLLER_STATE_KEY, value: { 7: WALLET_SNAPSHOT } });
    await useWalletPollerState.getState().hydrate();
    expect(useWalletPollerState.getState().value).toEqual({ 7: WALLET_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: WALLET_POLLER_STATE_KEY, value: { 7: { entries: 'nope' } } });
    await useWalletPollerState.getState().hydrate();
    expect(useWalletPollerState.getState().value).toEqual(DEFAULT_WALLET_POLLER_STATE);
  });

  it('rejects an entry missing a required numeric field', async () => {
    await db.settings.put({
      key: WALLET_POLLER_STATE_KEY,
      value: { 7: { entries: [{ amount: 100 }], nowMs: 1 } },
    });
    await useWalletPollerState.getState().hydrate();
    expect(useWalletPollerState.getState().value).toEqual(DEFAULT_WALLET_POLLER_STATE);
  });
});

describe('withCharacterWalletSnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterWalletSnapshot({ 2: WALLET_SNAPSHOT }, 7, WALLET_SNAPSHOT);
    expect(next).toEqual({ 2: WALLET_SNAPSHOT, 7: WALLET_SNAPSHOT });
  });
});

describe('useMarketOrderPollerState', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(useMarketOrderPollerState.getState().value).toEqual(DEFAULT_MARKET_ORDER_POLLER_STATE);
    expect(useMarketOrderPollerState.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(MARKET_ORDER_POLLER_STATE_KEY.startsWith('sync.')).toBe(false);
    await useMarketOrderPollerState.getState().setValue({ 7: MARKET_ORDER_SNAPSHOT });
    expect((await db.settings.get(MARKET_ORDER_POLLER_STATE_KEY))?.value).toEqual({
      7: MARKET_ORDER_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({
      key: MARKET_ORDER_POLLER_STATE_KEY,
      value: { 7: MARKET_ORDER_SNAPSHOT },
    });
    await useMarketOrderPollerState.getState().hydrate();
    expect(useMarketOrderPollerState.getState().value).toEqual({ 7: MARKET_ORDER_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({
      key: MARKET_ORDER_POLLER_STATE_KEY,
      value: { 7: { entries: 'nope' } },
    });
    await useMarketOrderPollerState.getState().hydrate();
    expect(useMarketOrderPollerState.getState().value).toEqual(DEFAULT_MARKET_ORDER_POLLER_STATE);
  });

  it('rejects an entry missing a required boolean field', async () => {
    await db.settings.put({
      key: MARKET_ORDER_POLLER_STATE_KEY,
      value: { 7: { entries: [{ orderId: 1 }], nowMs: 1 } },
    });
    await useMarketOrderPollerState.getState().hydrate();
    expect(useMarketOrderPollerState.getState().value).toEqual(DEFAULT_MARKET_ORDER_POLLER_STATE);
  });
});

describe('withCharacterMarketOrderSnapshot', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterMarketOrderSnapshot(
      { 2: MARKET_ORDER_SNAPSHOT },
      7,
      MARKET_ORDER_SNAPSHOT
    );
    expect(next).toEqual({ 2: MARKET_ORDER_SNAPSHOT, 7: MARKET_ORDER_SNAPSHOT });
  });
});
