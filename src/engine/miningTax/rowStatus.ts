export type MiningTaxRowStatus =
  'unassigned' | 'outstanding' | 'tracked' | 'paid' | 'needs-review' | 'dismissed';

export const STATUS_LABEL_KEY: Record<MiningTaxRowStatus, string> = {
  unassigned: 'unassigned',
  'needs-review': 'needsReview',
  outstanding: 'outstanding',
  tracked: 'tracked',
  paid: 'paid',
  dismissed: 'dismissed',
};
