import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDB_RELOAD_KEY, isIdbConnectionLost, reloadOnceForLostIdb } from './idbConnectionLost';

function unknownError(message: string): Error {
  const e = new Error(message);
  e.name = 'UnknownError';
  return e;
}

describe('isIdbConnectionLost', () => {
  it('matches WebKit’s lost-connection and cursor failures', () => {
    expect(isIdbConnectionLost(unknownError('Unable to open cursor'))).toBe(true);
    expect(isIdbConnectionLost(unknownError('Connection to Indexed Database server lost.'))).toBe(
      true
    );
  });

  it('finds the failure inside a Dexie wrapper', () => {
    const wrapper = Object.assign(new Error('wrapped'), {
      inner: unknownError('Unable to open cursor'),
    });
    expect(isIdbConnectionLost(wrapper)).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isIdbConnectionLost(new Error('Unable to open cursor'))).toBe(false);
    expect(isIdbConnectionLost(unknownError('something else'))).toBe(false);
    expect(isIdbConnectionLost(undefined)).toBe(false);
  });
});

describe('reloadOnceForLostIdb', () => {
  let store: Map<string, string>;
  let storage: Pick<Storage, 'getItem' | 'setItem'>;
  beforeEach(() => {
    store = new Map();
    storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    };
  });

  it('reloads the first time, then not again within the cooldown', () => {
    const reload = vi.fn();
    const error = unknownError('Unable to open cursor');
    expect(reloadOnceForLostIdb(error, 1_000, reload, storage)).toBe(true);
    expect(reloadOnceForLostIdb(error, 2_000, reload, storage)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the cooldown has passed', () => {
    const reload = vi.fn();
    const error = unknownError('Unable to open cursor');
    store.set(IDB_RELOAD_KEY, '1000');
    expect(reloadOnceForLostIdb(error, 1000 + 6 * 60 * 1000, reload, storage)).toBe(true);
  });

  it('never reloads for an unrelated error', () => {
    const reload = vi.fn();
    expect(reloadOnceForLostIdb(new Error('x'), 1, reload, storage)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
