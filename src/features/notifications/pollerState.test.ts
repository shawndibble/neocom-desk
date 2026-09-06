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
  createPollerStateStore,
  EMPTY_POLLER_STATE,
  isSnapshotWith,
  withCharacterSnapshot,
} from './pollerState';
import {
  skillQueueDomain,
  industryJobDomain,
  colonyDomain,
  mailDomain,
  calendarDomain,
  contractDomain,
  walletDomain,
  marketOrderDomain,
} from './pollDomains';

/** A snapshot guard that only checks the shared `{ nowMs, entries[] }` frame. */
const isSnapshotOfAnything = isSnapshotWith<{ nowMs: number }>('entries', () => true);

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
  entries: [{ id: 5, amount: 100, thresholdIsk: 0, dateMs: 999 }],
  nowMs: 999,
};

const MARKET_ORDER_SNAPSHOT: MarketOrderSnapshot = {
  entries: [{ orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 }],
  nowMs: 999,
};

beforeEach(async () => {
  await db.settings.clear();
  skillQueueDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
});

describe('skillQueueDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(skillQueueDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(skillQueueDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(skillQueueDomain.stateKey.startsWith('sync.')).toBe(false);
    await skillQueueDomain.store.getState().setValue({ 7: SNAPSHOT });
    expect((await db.settings.get(skillQueueDomain.stateKey))?.value).toEqual({ 7: SNAPSHOT });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: skillQueueDomain.stateKey, value: { 7: SNAPSHOT } });
    await skillQueueDomain.store.getState().hydrate();
    expect(skillQueueDomain.store.getState().value).toEqual({ 7: SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: skillQueueDomain.stateKey, value: { 7: { entries: 'nope' } } });
    await skillQueueDomain.store.getState().hydrate();
    expect(skillQueueDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });

  it('rejects an entry missing a required numeric field', async () => {
    await db.settings.put({
      key: skillQueueDomain.stateKey,
      value: { 7: { entries: [{ skillId: 1, queuePosition: 0, finishMs: null }], nowMs: 1 } },
    });
    await skillQueueDomain.store.getState().hydrate();
    expect(skillQueueDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (skill queue)', () => {
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
  industryJobDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
  colonyDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
});

describe('industryJobDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(industryJobDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(industryJobDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(industryJobDomain.stateKey.startsWith('sync.')).toBe(false);
    await industryJobDomain.store.getState().setValue({ 7: JOB_SNAPSHOT });
    expect((await db.settings.get(industryJobDomain.stateKey))?.value).toEqual({
      7: JOB_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: industryJobDomain.stateKey, value: { 7: JOB_SNAPSHOT } });
    await industryJobDomain.store.getState().hydrate();
    expect(industryJobDomain.store.getState().value).toEqual({ 7: JOB_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({
      key: industryJobDomain.stateKey,
      value: { 7: { entries: 'nope' } },
    });
    await industryJobDomain.store.getState().hydrate();
    expect(industryJobDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (industry jobs)', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: JOB_SNAPSHOT }, 7, JOB_SNAPSHOT);
    expect(next).toEqual({ 2: JOB_SNAPSHOT, 7: JOB_SNAPSHOT });
  });
});

describe('colonyDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(colonyDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(colonyDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(colonyDomain.stateKey.startsWith('sync.')).toBe(false);
    await colonyDomain.store.getState().setValue({ 7: COLONY_SNAPSHOT });
    expect((await db.settings.get(colonyDomain.stateKey))?.value).toEqual({
      7: COLONY_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: colonyDomain.stateKey, value: { 7: COLONY_SNAPSHOT } });
    await colonyDomain.store.getState().hydrate();
    expect(colonyDomain.store.getState().value).toEqual({ 7: COLONY_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: colonyDomain.stateKey, value: { 7: { colonies: 'nope' } } });
    await colonyDomain.store.getState().hydrate();
    expect(colonyDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (colonies)', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: COLONY_SNAPSHOT }, 7, COLONY_SNAPSHOT);
    expect(next).toEqual({ 2: COLONY_SNAPSHOT, 7: COLONY_SNAPSHOT });
  });
});

beforeEach(async () => {
  mailDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
  calendarDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
  contractDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
  walletDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
  marketOrderDomain.store.setState({ value: EMPTY_POLLER_STATE, hydrated: false });
});

describe('mailDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(mailDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(mailDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(mailDomain.stateKey.startsWith('sync.')).toBe(false);
    await mailDomain.store.getState().setValue({ 7: MAIL_SNAPSHOT });
    expect((await db.settings.get(mailDomain.stateKey))?.value).toEqual({ 7: MAIL_SNAPSHOT });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: mailDomain.stateKey, value: { 7: MAIL_SNAPSHOT } });
    await mailDomain.store.getState().hydrate();
    expect(mailDomain.store.getState().value).toEqual({ 7: MAIL_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: mailDomain.stateKey, value: { 7: { entries: 'nope' } } });
    await mailDomain.store.getState().hydrate();
    expect(mailDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (mail)', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: MAIL_SNAPSHOT }, 7, MAIL_SNAPSHOT);
    expect(next).toEqual({ 2: MAIL_SNAPSHOT, 7: MAIL_SNAPSHOT });
  });
});

describe('calendarDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(calendarDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(calendarDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(calendarDomain.stateKey.startsWith('sync.')).toBe(false);
    await calendarDomain.store.getState().setValue({ 7: CALENDAR_SNAPSHOT });
    expect((await db.settings.get(calendarDomain.stateKey))?.value).toEqual({
      7: CALENDAR_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: calendarDomain.stateKey, value: { 7: CALENDAR_SNAPSHOT } });
    await calendarDomain.store.getState().hydrate();
    expect(calendarDomain.store.getState().value).toEqual({ 7: CALENDAR_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: calendarDomain.stateKey, value: { 7: { entries: 'nope' } } });
    await calendarDomain.store.getState().hydrate();
    expect(calendarDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (calendar)', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: CALENDAR_SNAPSHOT }, 7, CALENDAR_SNAPSHOT);
    expect(next).toEqual({ 2: CALENDAR_SNAPSHOT, 7: CALENDAR_SNAPSHOT });
  });
});

describe('contractDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(contractDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(contractDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(contractDomain.stateKey.startsWith('sync.')).toBe(false);
    await contractDomain.store.getState().setValue({ 7: CONTRACT_SNAPSHOT });
    expect((await db.settings.get(contractDomain.stateKey))?.value).toEqual({
      7: CONTRACT_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: contractDomain.stateKey, value: { 7: CONTRACT_SNAPSHOT } });
    await contractDomain.store.getState().hydrate();
    expect(contractDomain.store.getState().value).toEqual({ 7: CONTRACT_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: contractDomain.stateKey, value: { 7: { entries: 'nope' } } });
    await contractDomain.store.getState().hydrate();
    expect(contractDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });

  it('rejects an entry with an unrecognized status', async () => {
    await db.settings.put({
      key: contractDomain.stateKey,
      value: { 7: { entries: [{ contractId: 1, status: 'made_up' }], nowMs: 1 } },
    });
    await contractDomain.store.getState().hydrate();
    expect(contractDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (contracts)', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: CONTRACT_SNAPSHOT }, 7, CONTRACT_SNAPSHOT);
    expect(next).toEqual({ 2: CONTRACT_SNAPSHOT, 7: CONTRACT_SNAPSHOT });
  });
});

describe('walletDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(walletDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(walletDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(walletDomain.stateKey.startsWith('sync.')).toBe(false);
    await walletDomain.store.getState().setValue({ 7: WALLET_SNAPSHOT });
    expect((await db.settings.get(walletDomain.stateKey))?.value).toEqual({
      7: WALLET_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({ key: walletDomain.stateKey, value: { 7: WALLET_SNAPSHOT } });
    await walletDomain.store.getState().hydrate();
    expect(walletDomain.store.getState().value).toEqual({ 7: WALLET_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: walletDomain.stateKey, value: { 7: { entries: 'nope' } } });
    await walletDomain.store.getState().hydrate();
    expect(walletDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });

  it('drops a baseline written before entries carried dateMs, so the upgrade costs one quiet poll instead of replaying the journal', async () => {
    await db.settings.put({
      key: walletDomain.stateKey,
      value: { 7: { entries: [{ id: 5, amount: 100, thresholdIsk: 0 }], nowMs: 999 } },
    });
    await walletDomain.store.getState().hydrate();
    // No baseline means `diffWalletBalanceChanged` fires nothing this poll and
    // the next save writes a complete snapshot.
    expect(walletDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });

  it('rejects an entry whose dateMs is NaN, which would sort the feed row nowhere', async () => {
    await db.settings.put({
      key: walletDomain.stateKey,
      value: { 7: { entries: [{ id: 5, amount: 100, thresholdIsk: 0, dateMs: NaN }], nowMs: 999 } },
    });
    await walletDomain.store.getState().hydrate();
    expect(walletDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });

  it('rejects an entry missing a required numeric field', async () => {
    await db.settings.put({
      key: walletDomain.stateKey,
      value: { 7: { entries: [{ amount: 100 }], nowMs: 1 } },
    });
    await walletDomain.store.getState().hydrate();
    expect(walletDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (wallet)', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: WALLET_SNAPSHOT }, 7, WALLET_SNAPSHOT);
    expect(next).toEqual({ 2: WALLET_SNAPSHOT, 7: WALLET_SNAPSHOT });
  });
});

describe('marketOrderDomain.store', () => {
  it('defaults to no prior snapshots, unhydrated', () => {
    expect(marketOrderDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
    expect(marketOrderDomain.store.getState().hydrated).toBe(false);
  });

  it('persists to Dexie under a non-syncing key', async () => {
    expect(marketOrderDomain.stateKey.startsWith('sync.')).toBe(false);
    await marketOrderDomain.store.getState().setValue({ 7: MARKET_ORDER_SNAPSHOT });
    expect((await db.settings.get(marketOrderDomain.stateKey))?.value).toEqual({
      7: MARKET_ORDER_SNAPSHOT,
    });
  });

  it('hydrates a persisted value', async () => {
    await db.settings.put({
      key: marketOrderDomain.stateKey,
      value: { 7: MARKET_ORDER_SNAPSHOT },
    });
    await marketOrderDomain.store.getState().hydrate();
    expect(marketOrderDomain.store.getState().value).toEqual({ 7: MARKET_ORDER_SNAPSHOT });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({
      key: marketOrderDomain.stateKey,
      value: { 7: { entries: 'nope' } },
    });
    await marketOrderDomain.store.getState().hydrate();
    expect(marketOrderDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });

  it('rejects an entry missing a required boolean field', async () => {
    await db.settings.put({
      key: marketOrderDomain.stateKey,
      value: { 7: { entries: [{ orderId: 1 }], nowMs: 1 } },
    });
    await marketOrderDomain.store.getState().hydrate();
    expect(marketOrderDomain.store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});

describe('withCharacterSnapshot (market orders)', () => {
  it('sets one character snapshot without disturbing others', () => {
    const next = withCharacterSnapshot({ 2: MARKET_ORDER_SNAPSHOT }, 7, MARKET_ORDER_SNAPSHOT);
    expect(next).toEqual({ 2: MARKET_ORDER_SNAPSHOT, 7: MARKET_ORDER_SNAPSHOT });
  });
});

describe('isSnapshotWith', () => {
  const isEntry = (raw: unknown): boolean =>
    typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'number';

  it('accepts a snapshot whose entries all pass the element guard', () => {
    const guard = isSnapshotWith<{ nowMs: number }>('entries', isEntry);
    expect(guard({ entries: [{ id: 1 }, { id: 2 }], nowMs: 5 })).toBe(true);
  });

  it('accepts an empty entries array', () => {
    const guard = isSnapshotWith<{ nowMs: number }>('entries', isEntry);
    expect(guard({ entries: [], nowMs: 5 })).toBe(true);
  });

  it('rejects a snapshot with no nowMs', () => {
    const guard = isSnapshotWith<{ nowMs: number }>('entries', isEntry);
    expect(guard({ entries: [] })).toBe(false);
  });

  it('rejects a snapshot whose entries field is not an array', () => {
    const guard = isSnapshotWith<{ nowMs: number }>('entries', isEntry);
    expect(guard({ entries: 'nope', nowMs: 5 })).toBe(false);
  });

  it('rejects a snapshot with one bad entry', () => {
    const guard = isSnapshotWith<{ nowMs: number }>('entries', isEntry);
    expect(guard({ entries: [{ id: 1 }, { id: 'two' }], nowMs: 5 })).toBe(false);
  });

  it('reads the entries field the domain names, not always "entries"', () => {
    const guard = isSnapshotWith<{ nowMs: number }>('colonies', isEntry);
    expect(guard({ colonies: [{ id: 1 }], nowMs: 5 })).toBe(true);
    expect(guard({ entries: [{ id: 1 }], nowMs: 5 })).toBe(false);
  });

  it('rejects a non-object', () => {
    const guard = isSnapshotWith<{ nowMs: number }>('entries', isEntry);
    expect(guard(null)).toBe(false);
    expect(guard(7)).toBe(false);
  });
});

describe('createPollerStateStore', () => {
  it('refuses a key in the syncing namespace', () => {
    expect(() =>
      createPollerStateStore('sync.notifications.pollerState', isSnapshotOfAnything)
    ).toThrow();
  });

  it('rejects a stored state keyed by something other than a character id', async () => {
    const store = createPollerStateStore('notifications.pollerState.spec', isSnapshotOfAnything);
    await db.settings.put({
      key: 'notifications.pollerState.spec',
      value: { notANumber: { entries: [], nowMs: 1 } },
    });
    await store.getState().hydrate();
    expect(store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });

  it('rejects an array where a state map is expected', async () => {
    const store = createPollerStateStore('notifications.pollerState.spec2', isSnapshotOfAnything);
    await db.settings.put({ key: 'notifications.pollerState.spec2', value: [] });
    await store.getState().hydrate();
    expect(store.getState().value).toEqual(EMPTY_POLLER_STATE);
  });
});
