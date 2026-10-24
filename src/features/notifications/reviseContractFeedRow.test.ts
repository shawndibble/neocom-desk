import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { reviseContractFeedRow } from './foregroundPoller';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const CHAR = { characterId: 7, name: 'Kestrel' };
const KEY = '7:contractCompleted:55';
const fire = (walletChangeIsk: number) => ({
  eventId: 'contractCompleted' as const,
  characterId: 7,
  contractId: 55,
  walletChangeIsk,
});

async function seedRow(extra: Record<string, unknown> = {}) {
  await db.notificationFeed.put({
    id: KEY,
    characterId: 7,
    eventId: 'contractCompleted',
    title: 'Contract completed',
    body: 'Original body',
    firedAt: 1_000,
    syncedAt: 5,
    ...extra,
  } as never);
}

describe('reviseContractFeedRow', () => {
  beforeEach(async () => {
    await db.notificationFeed.clear();
    syncMock.scheduleSync.mockClear();
  });

  it('writes the amount into the body, keeps firedAt, and queues a sync', async () => {
    await seedRow();
    await reviseContractFeedRow(fire(300), CHAR);
    const row = await db.notificationFeed.get(KEY);
    expect(row?.body).toContain('300');
    expect(row?.firedAt).toBe(1_000);
    expect(row?.syncedAt).toBeUndefined();
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(7, { collections: ['notificationFeed'] });
  });

  it('adds a later poll’s lines to what the row already carries', async () => {
    await seedRow();
    await reviseContractFeedRow(fire(300), CHAR);
    await reviseContractFeedRow(fire(-50), CHAR);
    const row = await db.notificationFeed.get(KEY);
    expect(row?.walletChangeIsk).toBe(250);
    expect(row?.body).toContain('250');
  });

  it('does nothing when the row is gone', async () => {
    await reviseContractFeedRow(fire(300), CHAR);
    expect(await db.notificationFeed.count()).toBe(0);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});
