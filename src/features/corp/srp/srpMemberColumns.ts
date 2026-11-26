import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const MEMBER_CLAIM_COLUMN_IDS = ['state', 'lost', 'system', 'filed', 'amount'] as const;

export type MemberClaimColumnId = (typeof MEMBER_CLAIM_COLUMN_IDS)[number];

export const useVisibleMemberClaimColumns = createColumnVisibilitySetting({
  key: 'srpMemberClaimsVisibleColumns',
  ids: MEMBER_CLAIM_COLUMN_IDS,
  allowEmpty: true,
});
