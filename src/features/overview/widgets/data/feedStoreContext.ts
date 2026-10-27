import { createContext, useContext } from 'react';
import { createFeedStore, type FeedStore } from './feedStore';

/** An empty store outside a provider, so a widget rendered alone shows its loading state. */
const FALLBACK = createFeedStore();

export const FeedStoreContext = createContext<FeedStore>(FALLBACK);

export function useFeedStore(): FeedStore {
  return useContext(FeedStoreContext);
}
