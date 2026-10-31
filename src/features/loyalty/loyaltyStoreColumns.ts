/**
 * LP Store's offers list — optional-column catalog and device-local
 * visible-columns preference, the `createColumnVisibilitySetting` pattern
 * (`src/lib/columnVisibility.ts`). `item` is the table's identity column and
 * never appears here.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const LOYALTY_STORE_OFFERS_COLUMN_IDS = ['sellsPerDay', 'profit', 'iskPerLp'] as const;
export type LoyaltyStoreOffersColumnId = (typeof LOYALTY_STORE_OFFERS_COLUMN_IDS)[number];

export const loyaltyStoreOffersColumnsStore = createColumnVisibilitySetting({
  key: 'loyaltyStoreOffersVisibleColumns',
  ids: LOYALTY_STORE_OFFERS_COLUMN_IDS,
});

/** The landing's Stores view (`lpLanding.ts`): `store` and `lpValue` are its fixed columns. */
export const LP_LANDING_STORE_COLUMN_IDS = [
  'yourLp',
  'bestOffer',
  'offers',
  'concord',
  'nearest',
] as const;
export type LpLandingStoreColumnId = (typeof LP_LANDING_STORE_COLUMN_IDS)[number];

export const LP_LANDING_STORE_DEFAULT_COLUMNS: readonly LpLandingStoreColumnId[] = [
  'yourLp',
  'bestOffer',
  'offers',
  'nearest',
];
/** A phone card's meta line has room for less: the offer count is the first to go. */
export const LP_LANDING_STORE_PHONE_OFF: readonly LpLandingStoreColumnId[] = ['offers'];

export const lpLandingStoreColumnsStore = createColumnVisibilitySetting({
  key: 'lpLandingStoreVisibleColumns',
  ids: LP_LANDING_STORE_COLUMN_IDS,
  defaultVisible: LP_LANDING_STORE_DEFAULT_COLUMNS,
});

/** The landing's Offers view: `item` and `iskPerLp` are its fixed columns. */
export const LP_LANDING_OFFER_COLUMN_IDS = ['store', 'turnIns', 'sellsPerDay', 'profit'] as const;
export type LpLandingOfferColumnId = (typeof LP_LANDING_OFFER_COLUMN_IDS)[number];

/** The turn-in count is the first to go from a phone card's meta line. */
export const LP_LANDING_OFFER_PHONE_OFF: readonly LpLandingOfferColumnId[] = ['turnIns'];

export const lpLandingOfferColumnsStore = createColumnVisibilitySetting({
  key: 'lpLandingOfferVisibleColumns',
  ids: LP_LANDING_OFFER_COLUMN_IDS,
});
