import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBatchedMap } from './useBatchedMap';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useBatchedMap', () => {
  it('loads nothing for an empty key', () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve(1);
    };
    const { result } = renderHook(() => useBatchedMap('', load));
    expect(result.current).toEqual({ values: new Map(), pending: 0 });
    expect(calls).toBe(0);
  });

  it('loads every entry once, counting down what is left', async () => {
    const load = (entry: string) => Promise.resolve(entry.toUpperCase());
    const { result } = renderHook(() => useBatchedMap('a,b', load));
    expect(result.current.pending).toBe(2);
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(result.current.values).toEqual(
      new Map([
        ['a', 'A'],
        ['b', 'B'],
      ])
    );
  });

  it('drops a result that arrives after the key changed', async () => {
    const first = deferred<string>();
    const { result, rerender } = renderHook(({ key, load }) => useBatchedMap(key, load), {
      initialProps: {
        key: 'a',
        load: (() => first.promise) as (entry: string) => Promise<string>,
      },
    });
    rerender({ key: 'b', load: (entry) => Promise.resolve(`new-${entry}`) });
    await waitFor(() => expect(result.current.pending).toBe(0));
    await act(async () => first.resolve('old'));
    expect(result.current.values).toEqual(new Map([['b', 'new-b']]));
  });
});
