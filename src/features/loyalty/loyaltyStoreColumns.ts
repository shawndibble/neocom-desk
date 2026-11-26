import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const LOYALTY_STORE_OFFERS_COLUMN_IDS = ['sellsPerDay', 'profit', 'iskPerLp'] as const;
export type LoyaltyStoreOffersColumnId = (typeof LOYALTY_STORE_OFFERS_COLUMN_IDS)[number];

export const loyaltyStoreOffersColumnsStore = createColumnVisibilitySetting({
  key: 'loyaltyStoreOffersVisibleColumns',
  ids: LOYALTY_STORE_OFFERS_COLUMN_IDS,
});

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
export const LP_LANDING_STORE_PHONE_OFF: readonly LpLandingStoreColumnId[] = ['offers'];

export const lpLandingStoreColumnsStore = createColumnVisibilitySetting({
  key: 'lpLandingStoreVisibleColumns',
  ids: LP_LANDING_STORE_COLUMN_IDS,
  defaultVisible: LP_LANDING_STORE_DEFAULT_COLUMNS,
});

export const LP_LANDING_OFFER_COLUMN_IDS = ['store', 'turnIns', 'sellsPerDay', 'profit'] as const;
export type LpLandingOfferColumnId = (typeof LP_LANDING_OFFER_COLUMN_IDS)[number];

export const LP_LANDING_OFFER_PHONE_OFF: readonly LpLandingOfferColumnId[] = ['turnIns'];

export const lpLandingOfferColumnsStore = createColumnVisibilitySetting({
  key: 'lpLandingOfferVisibleColumns',
  ids: LP_LANDING_OFFER_COLUMN_IDS,
});
