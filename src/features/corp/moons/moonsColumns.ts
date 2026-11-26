import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const MINERS_COLUMN_IDS = [
  'standing',
  'owed',
  'overdue',
  'account',
  'credit',
  'paid',
] as const;

export type MinersColumnId = (typeof MINERS_COLUMN_IDS)[number];

export const MINERS_PHONE_OFF: readonly MinersColumnId[] = ['account', 'credit'];

export const MINERS_NARROW_OFF: readonly MinersColumnId[] = ['standing', 'credit'];

export const MINERS_CARDS_BELOW_REM = 40;

export const useVisibleMinersColumns = createColumnVisibilitySetting({
  key: 'corpMoonsMinersVisibleColumns',
  ids: MINERS_COLUMN_IDS,
  allowEmpty: true,
});
