/**
 * The retired card board's card order, kept for its read side only: the order
 * the pilot dragged the old Overview's cards into. `widgets/migrate.ts` reads
 * it to lay out a returning pilot's first widget grid; nothing writes it now.
 * Same key, same forward-compatible parse as the hidden list beside it
 * (`hiddenCards.ts`), for the same reason.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { parseHiddenCards } from './hiddenCards';

export const OVERVIEW_CARD_ORDER_KEY = 'sync.overviewCardOrder';

export const useOverviewCardOrder = createSyncedSetting<string[]>({
  key: OVERVIEW_CARD_ORDER_KEY,
  defaultValue: [],
  parse: parseHiddenCards,
});
