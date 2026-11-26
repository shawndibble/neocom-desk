import { createContext, useContext } from 'react';
import { createFeedStore, type FeedStore } from './feedStore';

const FALLBACK = createFeedStore();

export const FeedStoreContext = createContext<FeedStore>(FALLBACK);

export function useFeedStore(): FeedStore {
  return useContext(FeedStoreContext);
}
