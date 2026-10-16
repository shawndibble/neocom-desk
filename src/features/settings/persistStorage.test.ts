import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  PERSIST_ASKED_KEY,
  readPersisted,
  requestPersistence,
  requestPersistenceOnce,
} from './persistStorage';

function storage(persisted: boolean, grant = true) {
  return {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => grant),
  };
}

beforeEach(async () => {
  await db.settings.clear();
});

describe('requestPersistenceOnce', () => {
  it('asks once, records that it asked, and never asks again', async () => {
    const s = storage(false);
    await expect(requestPersistenceOnce(s)).resolves.toBe('granted');
    expect(s.persist).toHaveBeenCalledOnce();
    expect((await db.settings.get(PERSIST_ASKED_KEY))?.value).toBe(true);

    await expect(requestPersistenceOnce(s)).resolves.toBe('skipped');
    expect(s.persist).toHaveBeenCalledOnce();
  });

  it('records the ask even when the browser declines, and does not re-prompt', async () => {
    const s = storage(false, false);
    await expect(requestPersistenceOnce(s)).resolves.toBe('denied');
    await expect(requestPersistenceOnce(s)).resolves.toBe('skipped');
    expect(s.persist).toHaveBeenCalledOnce();
  });

  it('does not prompt when storage is already persisted', async () => {
    const s = storage(true);
    await expect(requestPersistenceOnce(s)).resolves.toBe('granted');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('does nothing, and records nothing, where the API is missing', async () => {
    await expect(requestPersistenceOnce(undefined)).resolves.toBe('unsupported');
    expect(await db.settings.get(PERSIST_ASKED_KEY)).toBeUndefined();
  });

  it('swallows a browser that throws', async () => {
    const s = {
      persisted: vi.fn(async () => false),
      persist: vi.fn(async () => {
        throw new Error('SecurityError');
      }),
    };
    await expect(requestPersistenceOnce(s)).resolves.toBe('denied');
  });
});

describe('requestPersistence / readPersisted', () => {
  it('asks on demand regardless of the recorded flag', async () => {
    await db.settings.put({ key: PERSIST_ASKED_KEY, value: true });
    const s = storage(false);
    await expect(requestPersistence(s)).resolves.toBe('granted');
    expect(s.persist).toHaveBeenCalledOnce();
  });

  it('reads the persisted state, or null when unsupported', async () => {
    await expect(readPersisted(storage(true))).resolves.toBe(true);
    await expect(readPersisted(undefined)).resolves.toBeNull();
  });
});
