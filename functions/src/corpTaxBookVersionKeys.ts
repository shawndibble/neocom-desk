export const BOOK_VERSION_FIELD = 'bookVersion';
export const COLLECTION_VERSIONS_FIELD = 'collectionVersions';

export const OBSERVED = 'observed';
export const EXTRACTIONS = 'extractions';
export const PAYMENTS = 'payments';
export const DISMISSALS = 'dismissals';
export const DECLARATIONS = 'declarations';
export const DISPUTES = 'disputes';
export const ADJUSTMENTS = 'adjustments';
export const WRITE_OFFS = 'writeOffs';
export const TOLERANCE_EXEMPTIONS = 'toleranceExemptions';
export const MINER_PAID = 'minerPaid';
export const REBILLS = 'rebills';
export const TOKENS_COLLECTION = 'corpTaxBookTokens';
export const STATEMENTS = 'statements';
export const STATEMENT_LINKS = 'statementLinks';
export const LATE_NOTICES = 'lateNotices';
export const LATE_NOTICE_LINKS = 'lateNoticeLinks';
export const RUNNING_ACCOUNTS = 'accounts';
export const MINERS = 'miners';
export const META = 'meta';

export const UNVERSIONED_COLLECTIONS: ReadonlySet<string> = new Set([
  'officers',
  'audit',
  'srp',
  'srpClaims',
  'srpAudit',
  'srpOfficers',
  'srpDoctrines',
  'srpThrottle',
  'vetting',
  'vettingReviews',
  'vettingThrottle',
  'feederObserved',
]);

export const VERSIONED_COLLECTIONS = [
  MINERS,
  STATEMENTS,
  LATE_NOTICES,
  LATE_NOTICE_LINKS,
  RUNNING_ACCOUNTS,
  PAYMENTS,
  DISMISSALS,
  EXTRACTIONS,
  OBSERVED,
  DECLARATIONS,
  ADJUSTMENTS,
  WRITE_OFFS,
  TOLERANCE_EXEMPTIONS,
  MINER_PAID,
  'feeders',
  META,
  'minerTotals',
  'moonDocs',
  'readModels',
  'feederCoverage',
] as const;

export type VersionedCollection = (typeof VERSIONED_COLLECTIONS)[number];

export const READ_MODELS_SCHEMA = 2;

export function bookPathOf(
  path: string
): { corporationId: string; collection: string | null } | undefined {
  const parts = path.split('/');
  if (parts[0] !== 'corps' || parts.length < 2 || parts[1] === '') return undefined;
  return { corporationId: parts[1], collection: parts.length >= 3 ? parts[2] : null };
}

export const OBSERVED_UPDATED_AT_FIELD = 'updatedAt';
