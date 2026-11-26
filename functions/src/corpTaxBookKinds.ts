export const TAX_CONTACT_MAX_CHARACTERS = 5;

export const TRANSFER_RECIPIENTS = ['corporation', 'character', 'otherCorporation'] as const;

export const CLAIM_CHECK_RESULTS = [
  'found',
  'credited',
  'division',
  'notSynced',
  'tooOld',
  'notFound',
  'ambiguous',
  'person',
  'otherCorp',
] as const;

export const DISPUTE_KINDS = ['payee', 'quantity', 'rate', 'notPaying'] as const;

export const NOTICE_AFTER_KINDS = ['behind', 'dayOfMonth'] as const;
export const NOTICE_DEFAULTS = {
  after: { kind: 'behind', days: 14 },
  minimum: 10_000_000,
  cooldownDays: 7,
} as const;
export interface NoticeRules {
  after: { kind: 'behind'; days: number } | { kind: 'dayOfMonth'; day: number };
  minimum: number;
  cooldownDays: number;
  earlyAt?: number;
}
export const NOTICE_RULE_BOUNDS = {
  behindDays: { min: 1, max: 365 },
  dayOfMonth: { min: 1, max: 28 },
  minimum: { min: 0, max: 1e12 },
  cooldownDays: { min: 1, max: 90 },
  earlyAt: { min: 1, max: 1e12 },
} as const;
export const DAY_TOLERANCE_PCT_DEFAULT = 0.5;

export function daySettleTolerance(tax: number, pct: number = DAY_TOLERANCE_PCT_DEFAULT): number {
  return (Math.max(0, tax) * pct) / 100;
}

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
  'reassignPayment',
] as const;

export const PAYMENT_NOTE_MAX = 500;
