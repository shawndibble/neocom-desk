import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { checkStorageAtRisk, clearStorageAttention, useStorageAtRisk } from './storageAtRisk';

function storage(persisted: boolean) {
  return { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => true) };
}

beforeEach(async () => {
  useStorageAtRisk.setState({ atRisk: false });
  await db.characters.clear();
  await db.characters.put({ characterId: 1, name: 'Pilot', ownerHash: 'h', addedAt: 0 });
});

describe('checkStorageAtRisk', () => {
  it('flags an installed app whose storage is not protected', async () => {
    await checkStorageAtRisk(true, storage(false));
    expect(useStorageAtRisk.getState().atRisk).toBe(true);
  });

  it('clears once storage is protected', async () => {
    useStorageAtRisk.setState({ atRisk: true });
    await checkStorageAtRisk(true, storage(true));
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });

  it('never flags a browser tab', async () => {
    await checkStorageAtRisk(false, storage(false));
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });

  it('never flags a device with no Characters to lose', async () => {
    await db.characters.clear();
    await checkStorageAtRisk(true, storage(false));
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });

  it('never flags a browser that cannot say', async () => {
    const throwing = {
      persisted: vi.fn(async () => {
        throw new Error('SecurityError');
      }),
      persist: vi.fn(async () => true),
    };
    await checkStorageAtRisk(true, throwing);
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });

  it('lets a slow, older read never undo a newer answer', async () => {
    let answerOld: (persisted: boolean) => void = () => {};
    const slow = {
      persisted: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            answerOld = resolve;
          })
      ),
      persist: vi.fn(async () => true),
    };
    const stale = checkStorageAtRisk(true, slow);
    clearStorageAttention();
    await checkStorageAtRisk(true, storage(true));
    answerOld(false);
    await stale;
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });
});
