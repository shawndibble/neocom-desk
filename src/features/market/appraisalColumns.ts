import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const APPRAISAL_COLUMN_IDS = [
  'buyEach',
  'sellEach',
  'splitEach',
  'buyTotal',
  'sellTotal',
  'refineTotal',
  'refineWithLeftover',
  'turnIn',
  'lpTotal',
  'volume',
  'iskPerM3',
  'salesTax',
  'brokerFee',
  'sellAfterFees',
] as const;

export type AppraisalColumnId = (typeof APPRAISAL_COLUMN_IDS)[number];

const OFF_BY_DEFAULT: readonly AppraisalColumnId[] = [
  'splitEach',
  'iskPerM3',
  'salesTax',
  'brokerFee',
  'sellAfterFees',
];

export const DEFAULT_VISIBLE_APPRAISAL_COLUMNS: readonly AppraisalColumnId[] =
  APPRAISAL_COLUMN_IDS.filter((id) => !OFF_BY_DEFAULT.includes(id));

export const VISIBLE_APPRAISAL_COLUMNS_KEY = 'appraisalVisibleColumns';

export const useVisibleAppraisalColumns = createColumnVisibilitySetting({
  key: VISIBLE_APPRAISAL_COLUMNS_KEY,
  ids: APPRAISAL_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_APPRAISAL_COLUMNS,
  allowEmpty: true,
});
