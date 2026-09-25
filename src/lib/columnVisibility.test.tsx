import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { createColumnVisibilitySetting, useColumnVisibility } from './columnVisibility';

const IDS = ['a', 'b', 'c'] as const;

let keySeq = 0;
const freshKey = () => `test.columns.${++keySeq}`;

beforeEach(async () => {
  await db.settings.clear();
});

describe('createColumnVisibilitySetting', () => {
  it('shows every column by default, so adding a picker hides nothing', () => {
    const store = createColumnVisibilitySetting({ key: freshKey(), ids: IDS });
    expect(store.getState().value).toEqual(['a', 'b', 'c']);
  });

  it('takes a narrower default when given one', () => {
    const store = createColumnVisibilitySetting({
      key: freshKey(),
      ids: IDS,
      defaultVisible: ['a'],
    });
    expect(store.getState().value).toEqual(['a']);
  });

  it('falls back to the default when the stored list names an unknown id', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: ['a', 'gone'] });
    const store = createColumnVisibilitySetting({ key, ids: IDS });
    await store.getState().hydrate();
    expect(store.getState().value).toEqual(['a', 'b', 'c']);
  });

  it('reads back a valid stored list', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: ['c'] });
    const store = createColumnVisibilitySetting({ key, ids: IDS });
    await store.getState().hydrate();
    expect(store.getState().value).toEqual(['c']);
  });
});

describe('useColumnVisibility', () => {
  it('toggles a column off and back on, and resets to the default', async () => {
    const store = createColumnVisibilitySetting({ key: freshKey(), ids: IDS });
    const { result } = renderHook(() => useColumnVisibility(store, ['a', 'b', 'c']));
    await waitFor(() => expect(store.getState().hydrated).toBe(true));

    act(() => result.current.toggle('b'));
    expect(result.current.visible).toEqual(['a', 'c']);

    act(() => result.current.toggle('b'));
    expect(result.current.visible).toEqual(['a', 'c', 'b']);

    act(() => result.current.reset());
    expect(result.current.visible).toEqual(['a', 'b', 'c']);
  });

  it('isVisible answers from the stored list', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: ['a'] });
    const store = createColumnVisibilitySetting({ key, ids: IDS });
    const { result } = renderHook(() => useColumnVisibility(store, ['a', 'b', 'c']));
    await waitFor(() => expect(result.current.isVisible('b')).toBe(false));
    expect(result.current.isVisible('a')).toBe(true);
  });
});
