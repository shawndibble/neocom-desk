import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db as localDb } from '@/db';
import {
  clearNotFound,
  getDocUnlessKnownMissing,
  isKnownMissing,
  rememberMissing,
} from './notFoundCache';

const missing = () => Promise.resolve({ exists: () => false, data: () => undefined });
const present = () => Promise.resolve({ exists: () => true, data: () => ({ a: 1 }) });

describe('notFoundCache', () => {
  beforeEach(async () => {
    await localDb.settings.clear();
  });

  it('skips the read while a miss is live', async () => {
    const read = vi.fn(missing);
    expect(await getDocUnlessKnownMissing('corps/1', 1000, read)).toBeUndefined();
    expect(await getDocUnlessKnownMissing('corps/1', 1000, read)).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads again after the TTL', async () => {
    await rememberMissing('corps/1', 1000, 0);
    expect(await isKnownMissing('corps/1', 999)).toBe(true);
    expect(await isKnownMissing('corps/1', 1000)).toBe(false);
    const read = vi.fn(present);
    expect(await getDocUnlessKnownMissing('corps/1', 1000, read)).toEqual({ a: 1 });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('is cleared by the create action', async () => {
    await rememberMissing('corps/1', 60_000);
    await clearNotFound('corps/1');
    const read = vi.fn(present);
    expect(await getDocUnlessKnownMissing('corps/1', 1000, read)).toEqual({ a: 1 });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('clears every miss under a trailing-slash prefix only', async () => {
    await rememberMissing('communities/a', 60_000);
    await rememberMissing('communities/b', 60_000);
    await rememberMissing('corps/1', 60_000);
    await clearNotFound('communities/');
    expect(await isKnownMissing('communities/a')).toBe(false);
    expect(await isKnownMissing('communities/b')).toBe(false);
    expect(await isKnownMissing('corps/1')).toBe(true);
  });

  it('does not remember a document that exists', async () => {
    await getDocUnlessKnownMissing('corps/2', 1000, present);
    expect(await isKnownMissing('corps/2')).toBe(false);
  });
});
