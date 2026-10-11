import { describe, expect, it, vi } from 'vitest';
import { createFeedStore } from './feedStore';

const state = (data: number | null, loading = false) => ({ data, error: false, loading });

describe('createFeedStore', () => {
  it('starts empty and keeps one identity until something changes', () => {
    const store = createFeedStore();
    const first = store.get();
    expect(first).toEqual({});
    expect(store.get()).toBe(first);
  });

  it('publishes a new snapshot and notifies on a change', () => {
    const store = createFeedStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.get();
    store.set('mail', state(null, true) as never);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).not.toBe(before);
    expect(store.get().mail?.loading).toBe(true);
  });

  it('ignores a write that changes nothing', () => {
    const store = createFeedStore();
    const data = { unread: 1 };
    store.set('mail', { data, error: false, loading: false } as never);
    const listener = vi.fn();
    store.subscribe(listener);
    const snapshot = store.get();
    store.set('mail', { data, error: false, loading: false } as never);
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toBe(snapshot);
  });

  it('forgets a feed on clear and stops notifying after unsubscribe', () => {
    const store = createFeedStore();
    store.set('mail', state(1) as never);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.clear('mail');
    expect(store.get().mail).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.set('mail', state(2) as never);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
