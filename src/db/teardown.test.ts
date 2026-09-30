import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { ignoreIdbTeardown, isIdbTeardown } from './teardown';

describe('isIdbTeardown', () => {
  it('recognises a transaction the browser aborted', () => {
    expect(isIdbTeardown(new Dexie.AbortError())).toBe(true);
  });

  it('recognises a connection closed under the caller', () => {
    expect(isIdbTeardown(new Dexie.DatabaseClosedError())).toBe(true);
  });

  it('does not recognise any other failure', () => {
    expect(isIdbTeardown(new Dexie.ConstraintError())).toBe(false);
    expect(isIdbTeardown(new TypeError('boom'))).toBe(false);
    expect(isIdbTeardown(undefined)).toBe(false);
  });
});

describe('ignoreIdbTeardown', () => {
  it('resolves with the value when the work succeeds', async () => {
    await expect(ignoreIdbTeardown(Promise.resolve(7))).resolves.toBe(7);
  });

  it('resolves undefined when the transaction was aborted', async () => {
    await expect(
      ignoreIdbTeardown(Promise.reject(new Dexie.AbortError()))
    ).resolves.toBeUndefined();
  });

  it('still rejects with any other failure', async () => {
    const error = new TypeError('boom');
    await expect(ignoreIdbTeardown(Promise.reject(error))).rejects.toBe(error);
  });
});
