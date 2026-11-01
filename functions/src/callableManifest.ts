// The callable router seam, declared once. Group membership of every router action (the old
// per-callable export names, which are the wire names: deployed clients send them as
// `{ action }`) lives here. The server registers each action through its group's helper, typed
// to this list, and the client's `callRouted` takes the same union and looks its router up here.
// So a misspelt or mis-grouped action is a compile error on either side, not a runtime
// `invalid-argument`. Action names are on the wire: never rename or remove one while deployed
// clients may still send it (callableManifest.test.ts holds a frozen snapshot).
//
// Dependency-free on purpose: the client bundle imports this file.

export const CALLABLE_ACTIONS = {
  alerts: ['registerDevice', 'saveAlertGrant', 'deleteAlertGrant'],
  community: [
    'createCommunityCallable',
    'previewCommunityCallable',
    'joinCommunityCallable',
    'setCommunityApprovalCallable',
    'decideCommunityJoinRequestCallable',
    'leaveCommunityCallable',
    'removeCommunityMemberCallable',
    'transferCommunityAdminCallable',
    'reserveCommunityMailInviteCallable',
    'confirmCommunityMailInviteCallable',
    'releaseCommunityMailInviteCallable',
    'revokeCommunityInviteCallable',
    'regenerateCommunityInviteCallable',
    'deleteCommunityCallable',
    'postCommunityRequestCallable',
    'editCommunityRequestCallable',
    'extendCommunityRequestCallable',
    'setCommunityRequestClosedCallable',
    'reserveCommunityPledgeMailCallable',
    'confirmCommunityPledgeMailCallable',
    'releaseCommunityPledgeMailCallable',
    'removeCommunityRequestCallable',
    'createCommunityFleetPayoutCallable',
    'setCommunityFleetShareDoneCallable',
    'removeCommunityFleetPayoutCallable',
    'removeCommunityPledgeCallable',
  ],
  corpTaxBook: [
    'createCorpTaxBookFeederInviteCallable',
    'revokeCorpTaxBookFeederInviteCallable',
    'previewCorpTaxBookFeederInviteCallable',
    'acceptCorpTaxBookFeederInviteCallable',
    'saveCorpTaxBookSyncGrantCallable',
    'saveCorpTaxBookFeederGrantCallable',
    'addOwnCorpTaxBookFeederCallable',
    'removeOwnCorpTaxBookFeederCallable',
    'leaveCorpTaxBookFeederCallable',
    'getCorpTaxBookFeederStatusCallable',
    'getCorpTaxBookFeederViewAccessCallable',
    'requestCorpTaxBookFeederRateCallable',
    'setCorpTaxBookFeederPayeeCallable',
    'dismissCorpTaxBookFeederHistoryCallable',
    'setCorpTaxBookFeederRateCallable',
    'setCorpTaxBookFeederModeCallable',
    'setCorpTaxBookRefineryLabelCallable',
    'setCorpTaxBookOwnRefineryLabelCallable',
    'learnCorpTaxBookRefinerySystemsCallable',
    'setCorpTaxBookFeederPayeeFromBookCallable',
    'startCorpTaxBookFeederRemovalCallable',
    'recordCorpTaxBookFeederRemovalSentCallable',
    'cancelCorpTaxBookFeederRemovalCallable',
    'getCorpTaxBookRemovalLinkCallable',
    'forceCorpTaxBookRemovalCallable',
    'recordCorpTaxBookFeederPayoutCallable',
    'markCorpTaxBookFeederPayoutCallable',
    'reconcileCorpTaxBookFeederPayoutsCallable',
    'listCorpTaxBookFeederInvitesCallable',
    'revokeCorpTaxBookSyncGrantCallable',
    'verifyCorpOfficerCallable',
    'turnOnCorpTaxBookCallable',
    'deleteCorpTaxBookCallable',
    'reclaimCorpTaxBookCallable',
    'syncCorpTaxBookCallable',
    'editCorpTaxBookCallable',
    'verifySrpOfficerCallable',
    'getSrpStatusCallable',
    'fileSrpClaimCallable',
    'previewSrpDoctrineCheckCallable',
    'getSrpClaimValuesCallable',
    'saveSrpDoctrineCallable',
    'deleteSrpDoctrineCallable',
    'turnOnSrpCallable',
    'turnOffSrpCallable',
    'saveSrpSettingsCallable',
    'approveSrpClaimCallable',
    'approveSrpClaimsCallable',
    'rejectSrpClaimCallable',
    'changeSrpClaimAmountCallable',
    'markSrpClaimPaidCallable',
    'markSrpClaimsPaidCallable',
    'reclaimSrpCallable',
    'claimCorpTaxBookPaymentCallable',
    'confirmCorpTaxBookGroupingCallable',
    'declineCorpTaxBookGroupingCallable',
    'listPendingCorpTaxBookGroupingsCallable',
    'readCorpTaxBookStatementCallable',
    'declineCorpTaxBookGroupingByTokenCallable',
    'stopCorpTaxBookRemindersCallable',
  ],
} as const;

export type CallableGroup = keyof typeof CALLABLE_ACTIONS;
export type CallableAction<G extends CallableGroup = CallableGroup> =
  (typeof CALLABLE_ACTIONS)[G][number];

/** The deployed router function each group is served by. */
export const ROUTER_FUNCTIONS = {
  alerts: 'alertsCall',
  community: 'communityCall',
  corpTaxBook: 'corpTaxBookCall',
} as const satisfies Record<CallableGroup, string>;

const GROUP_OF = new Map<string, CallableGroup>(
  (Object.keys(CALLABLE_ACTIONS) as CallableGroup[]).flatMap((group) =>
    CALLABLE_ACTIONS[group].map((name): [string, CallableGroup] => [name, group])
  )
);

/** The group an action belongs to, or undefined for a name that is no router action. */
export function groupOf(name: string): CallableGroup | undefined {
  return GROUP_OF.get(name);
}
