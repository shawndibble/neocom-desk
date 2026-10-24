import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  PERSIST_ASKED_INSTALLED_KEY,
  PERSIST_ASKED_KEY,
  readPersisted,
  requestPersistence,
  requestPersistenceOnce,
  requestPersistenceWhenInstalled,
} from './persistStorage';

function storage(persisted: boolean, grant = true) {
  return {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => grant),
  };
}

beforeEach(async () => {
  await db.settings.clear();
  await db.characters.clear();
});

async function seedCharacter() {
  await db.characters.put({ characterId: 1, name: 'Pilot', ownerHash: 'h', addedAt: 0 });
}

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

  it('asks only once when two callers race', async () => {
    const s = storage(false);
    const results = await Promise.all([requestPersistenceOnce(s), requestPersistenceOnce(s)]);
    expect(results.sort()).toEqual(['granted', 'skipped']);
    expect(s.persist).toHaveBeenCalledOnce();
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

describe('requestPersistenceWhenInstalled', () => {
  it('asks once when launched installed with Characters and storage not persisted', async () => {
    await seedCharacter();
    const s = storage(false);
    await expect(requestPersistenceWhenInstalled(true, s)).resolves.toBe('granted');
    await expect(requestPersistenceWhenInstalled(true, s)).resolves.toBe('skipped');
    expect(s.persist).toHaveBeenCalledOnce();
    expect((await db.settings.get(PERSIST_ASKED_INSTALLED_KEY))?.value).toBe(true);
  });

  it('asks even when the first-Character ask already happened in the browser tab', async () => {
    await seedCharacter();
    await db.settings.put({ key: PERSIST_ASKED_KEY, value: true });
    const s = storage(false);
    await expect(requestPersistenceWhenInstalled(true, s)).resolves.toBe('granted');
    expect(s.persist).toHaveBeenCalledOnce();
  });

  it('does nothing in a browser tab', async () => {
    await seedCharacter();
    const s = storage(false);
    await expect(requestPersistenceWhenInstalled(false, s)).resolves.toBe('skipped');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('does nothing, and records nothing, with no Characters yet', async () => {
    const s = storage(false);
    await expect(requestPersistenceWhenInstalled(true, s)).resolves.toBe('skipped');
    expect(s.persist).not.toHaveBeenCalled();
    expect(await db.settings.get(PERSIST_ASKED_INSTALLED_KEY)).toBeUndefined();
  });

  it('does not ask when storage is already persisted', async () => {
    await seedCharacter();
    const s = storage(true);
    await expect(requestPersistenceWhenInstalled(true, s)).resolves.toBe('skipped');
    expect(s.persist).not.toHaveBeenCalled();
  });
});
