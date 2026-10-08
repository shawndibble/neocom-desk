import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { createColumnVisibilitySetting, useColumnVisibility } from './columnVisibility';
import { PHONE_QUERY } from './useIsPhone';

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

describe('useColumnVisibility phoneOffByDefault', () => {
  const ALL = ['a', 'b', 'c'] as const;
  const realMatchMedia = window.matchMedia;

  function setPhone(isPhone: boolean) {
    window.matchMedia = ((media: string) =>
      ({
        media,
        matches: isPhone && media === PHONE_QUERY,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it('starts those columns unticked on a phone with nothing stored', async () => {
    setPhone(true);
    const store = createColumnVisibilitySetting({ key: freshKey(), ids: ALL });
    const { result } = renderHook(() => useColumnVisibility(store, ALL, ['b']));
    await waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(result.current.visible).toEqual(['a', 'c']);
    expect(result.current.isVisible('b')).toBe(false);
  });

  it('shows every column by default away from a phone', async () => {
    setPhone(false);
    const store = createColumnVisibilitySetting({ key: freshKey(), ids: ALL });
    const { result } = renderHook(() => useColumnVisibility(store, ALL, ['b']));
    await waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(result.current.visible).toEqual(['a', 'b', 'c']);
  });

  it('ticking a phone-off column shows it, and unticking hides it again', async () => {
    setPhone(true);
    const store = createColumnVisibilitySetting({ key: freshKey(), ids: ALL });
    const { result } = renderHook(() => useColumnVisibility(store, ALL, ['b']));
    await waitFor(() => expect(store.getState().hydrated).toBe(true));

    act(() => result.current.toggle('b'));
    expect(result.current.isVisible('b')).toBe(true);
    expect(store.getState().value).toEqual(['a', 'c', 'b']);

    act(() => result.current.toggle('b'));
    expect(result.current.isVisible('b')).toBe(false);
  });

  it('reads a stored selection as saved, even one that ticks a phone-off column', async () => {
    setPhone(true);
    const key = freshKey();
    await db.settings.put({ key, value: ['a', 'b', 'c'] });
    const store = createColumnVisibilitySetting({ key, ids: ALL });
    const { result } = renderHook(() => useColumnVisibility(store, ALL, ['b']));
    await waitFor(() => expect(result.current.isVisible('b')).toBe(true));
    expect(result.current.visible).toEqual(['a', 'b', 'c']);
  });

  it('resets to the compact default on a phone', async () => {
    setPhone(true);
    const store = createColumnVisibilitySetting({ key: freshKey(), ids: ALL });
    const { result } = renderHook(() => useColumnVisibility(store, ALL, ['b']));
    await waitFor(() => expect(store.getState().hydrated).toBe(true));
    act(() => result.current.toggle('b'));
    act(() => result.current.reset());
    expect(result.current.visible).toEqual(['a', 'c']);
  });
});
