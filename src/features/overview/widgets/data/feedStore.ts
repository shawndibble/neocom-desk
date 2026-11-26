import type { FeedId, FeedMap, FeedState, Feeds } from './types';

export interface FeedStore {
  get: () => Feeds;
  set: <K extends FeedId>(id: K, state: FeedState<FeedMap[K]>) => void;
  clear: (id: FeedId) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createFeedStore(): FeedStore {
  let feeds: Feeds = {};
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    get: () => feeds,
    set: (id, state) => {
      const current = feeds[id] as FeedState<unknown> | undefined;
      if (
        current &&
        current.data === state.data &&
        current.error === state.error &&
        current.loading === state.loading
      ) {
        return;
      }
      feeds = { ...feeds, [id]: state };
      emit();
    },
    clear: (id) => {
      if (!(id in feeds)) return;
      const { [id]: _dropped, ...rest } = feeds;
      void _dropped;
      feeds = rest;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
