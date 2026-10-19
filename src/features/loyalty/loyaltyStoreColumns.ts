/**
 * LP Store's offers list — optional-column catalog and device-local
 * visible-columns preference, the `createColumnVisibilitySetting` pattern
 * (`src/lib/columnVisibility.ts`). `item` is the table's identity column and
 * never appears here.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const LOYALTY_STORE_OFFERS_COLUMN_IDS = ['profit', 'iskPerLp'] as const;
export type LoyaltyStoreOffersColumnId = (typeof LOYALTY_STORE_OFFERS_COLUMN_IDS)[number];

export const loyaltyStoreOffersColumnsStore = createColumnVisibilitySetting({
  key: 'loyaltyStoreOffersVisibleColumns',
  ids: LOYALTY_STORE_OFFERS_COLUMN_IDS,
});
