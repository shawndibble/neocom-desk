/**
 * The Corp Tax Book's value lists that the client mirrors (resolving in the app). Kept in a module
 * with no imports so the root test suite's parity test (`functionsMirror.test.ts`) can read them
 * without the functions package's dependencies.
 */

/** Mirror of the client's `TAX_CONTACT_MAX_CHARACTERS` (`functionsMirror.test.ts` keeps them equal). */
export const TAX_CONTACT_MAX_CHARACTERS = 5;

/** Who received a transfer, as the member's own wallet journal names it. */
export const TRANSFER_RECIPIENTS = ['corporation', 'character', 'otherCorporation'] as const;

/** What checking one claimed transfer against the book found. */
export const CLAIM_CHECK_RESULTS = [
  'found',
  /** The book already credited the payment, to the Miner it names. */
  'credited',
  'division',
  'notSynced',
  'tooOld',
  'notFound',
  'ambiguous',
  'person',
  'otherCorp',
] as const;

/**
 * What a member says about a day (resolving in the app): `payee`, the ore went to another Payee
 * (#6206); `quantity`, the book recorded more ore than they mined; `rate`, the book's rate is
 * higher than the one that applies; `notPaying`, they will not pay it. Mirrors the engine's
 * `DisputeKind` (`src/engine/corpTaxBook/disputes.ts`).
 */
export const DISPUTE_KINDS = ['payee', 'quantity', 'rate', 'notPaying'] as const;

/**
 * A running account's late notices (#6294): when one is due — `behind`, the Miner's oldest unpaid
 * day is `days` old; `dayOfMonth`, on that day of each month while they owe — the least owed for
 * one, and the days before another. Mirrors `src/engine/corpTaxBook/notices.ts`.
 */
export const NOTICE_AFTER_KINDS = ['behind', 'dayOfMonth'] as const;
export const NOTICE_DEFAULTS = {
  after: { kind: 'behind', days: 14 },
  minimum: 10_000_000,
  cooldownDays: 7,
} as const;
/** A running account's notice rules, as a book stores them. Mirrors the client's `NoticeRules`. */
export interface NoticeRules {
  after: { kind: 'behind'; days: number } | { kind: 'dayOfMonth'; day: number };
  minimum: number;
  cooldownDays: number;
  /** Owing this much is due a notice early; absent: off. */
  earlyAt?: number;
}
/** What the server accepts for each notice rule: the settings form offers the same range. */
export const NOTICE_RULE_BOUNDS = {
  behindDays: { min: 1, max: 365 },
  dayOfMonth: { min: 1, max: 28 },
  minimum: { min: 0, max: 1e12 },
  cooldownDays: { min: 1, max: 90 },
  earlyAt: { min: 1, max: 1e12 },
} as const;
/** A running account's per-day tolerance, in percent; mirrors `DAY_SETTLE_TOLERANCE_PCT`. */
export const DAY_TOLERANCE_PCT_DEFAULT = 0.5;

/**
 * Every action the book writes to its audit trail (`appendAudit`). The Activity log needs a
 * sentence for each (`corpTaxBook.moons.activity.actions.<action>`); `AuditFeed.ui.test.tsx` fails
 * for one without. Add the name here when you write a new one.
 */
export const AUDIT_ACTIONS = [
  'scheduledSyncOn',
  'scheduledSyncOff',
  'scheduledSyncStopped',
  'turnOn',
  'reclaim',
  'sync',
  'addRate',
  'setRecordRate',
  'updateSettings',
  'recordPayment',
  'markNotTax',
  'assignPayment',
  'reassignPayment',
  'ignoreUncounted',
  'dismiss',
  'dismissRecords',
  'reverseDismissal',
  'linkSurvey',
  'setFullyMined',
  'setMiner',
  'unlink',
  'regroupMiner',
  'addAdjustment',
  'reverseAdjustment',
  'editAdjustment',
  'reverseWriteOff',
  'setToleranceExemption',
  'writeOff',
  'rebill',
  'closeAccount',
  'issueStatement',
  'issueLateNotice',
  'settleStatements',
  'declare',
  'rejectDispute',
  'dismissDispute',
  'resolveDeclaration',
  'recordReminder',
  'recordMail',
  'recordLateNoticeMail',
  'recordAccounts',
  'recordCheckpoints',
  'resetCheckpoint',
  'setPopSharing',
  'setPopSharingMoon',
  'stopReminders',
  'confirmGrouping',
  'declineGrouping',
  'claimPayment',
  'disputeConflict',
  'withdrawDispute',
  'refineryLabelSet',
  'refinerySystemLearned',
  'refineryArchived',
  'refineryRestored',
  'feederInviteCreated',
  'feederInviteRevoked',
  'feederJoined',
  'feederRejoined',
  'feederJoinUndone',
  'feederLeft',
  'feederRemovalStarted',
  'feederRemovalNoticeSent',
  'feederRemovalCancelled',
  'feederRemovalForced',
  'feederRemoved',
  'feederRemovedBookDeleted',
  'feederDisconnected',
  'feederRateRequested',
  'feederRateAgreed',
  'feederModeSet',
  'feederPayeeSet',
  'feederPayoutRecorded',
  'feederPayoutMarked',
  'feederPayoutsReconciled',
  'feederPayoutDisputed',
  'feederPopSharingSet',
  'feederViewDismissed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Edit actions that re-check the caller's roles live (D7): dismissals, write-offs, rebills, "not
 * tax", moving a payment and resetting a checkpoint. The callable refuses them on the 10-minute
 * role cache, so the client sends its access token with each. One list for both sides
 * (`LIVE_CHECK_ACTIONS` on the server, `needsLiveToken` on the client), so they cannot drift.
 */
export const LIVE_CHECK_ACTION_NAMES = [
  'dismiss',
  'dismissRecords',
  'dismissDispute',
  'reverseDismissal',
  'reverseAdjustment',
  'editAdjustment',
  'reverseWriteOff',
  'setToleranceExemption',
  'writeOff',
  'rebill',
  'markNotTax',
  'resetCheckpoint',
  'reassignPayment',
] as const;
