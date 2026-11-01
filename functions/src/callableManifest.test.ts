// The callable router actions are strings on the wire. These hold the manifest to the registrations
// in index.ts (the client side is covered at compile time: callRouted takes a CallableAction).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CALLABLE_ACTIONS,
  ROUTER_FUNCTIONS,
  groupOf,
  type CallableGroup,
} from './callableManifest.js';

// Frozen: deployed clients send these names. Add a line for a new action; never edit or delete one.
const WIRE_NAMES = [
  'alerts:registerDevice',
  'alerts:saveAlertGrant',
  'alerts:deleteAlertGrant',
  'community:createCommunityCallable',
  'community:previewCommunityCallable',
  'community:joinCommunityCallable',
  'community:setCommunityApprovalCallable',
  'community:decideCommunityJoinRequestCallable',
  'community:leaveCommunityCallable',
  'community:removeCommunityMemberCallable',
  'community:transferCommunityAdminCallable',
  'community:reserveCommunityMailInviteCallable',
  'community:confirmCommunityMailInviteCallable',
  'community:releaseCommunityMailInviteCallable',
  'community:revokeCommunityInviteCallable',
  'community:regenerateCommunityInviteCallable',
  'community:deleteCommunityCallable',
  'community:postCommunityRequestCallable',
  'community:editCommunityRequestCallable',
  'community:extendCommunityRequestCallable',
  'community:setCommunityRequestClosedCallable',
  'community:reserveCommunityPledgeMailCallable',
  'community:confirmCommunityPledgeMailCallable',
  'community:releaseCommunityPledgeMailCallable',
  'community:removeCommunityRequestCallable',
  'community:createCommunityFleetPayoutCallable',
  'community:setCommunityFleetShareDoneCallable',
  'community:removeCommunityFleetPayoutCallable',
  'community:removeCommunityPledgeCallable',
  'corpTaxBook:createCorpTaxBookFeederInviteCallable',
  'corpTaxBook:revokeCorpTaxBookFeederInviteCallable',
  'corpTaxBook:previewCorpTaxBookFeederInviteCallable',
  'corpTaxBook:acceptCorpTaxBookFeederInviteCallable',
  'corpTaxBook:saveCorpTaxBookSyncGrantCallable',
  'corpTaxBook:saveCorpTaxBookFeederGrantCallable',
  'corpTaxBook:addOwnCorpTaxBookFeederCallable',
  'corpTaxBook:removeOwnCorpTaxBookFeederCallable',
  'corpTaxBook:leaveCorpTaxBookFeederCallable',
  'corpTaxBook:getCorpTaxBookFeederStatusCallable',
  'corpTaxBook:getCorpTaxBookFeederViewAccessCallable',
  'corpTaxBook:requestCorpTaxBookFeederRateCallable',
  'corpTaxBook:setCorpTaxBookFeederPayeeCallable',
  'corpTaxBook:dismissCorpTaxBookFeederHistoryCallable',
  'corpTaxBook:setCorpTaxBookFeederRateCallable',
  'corpTaxBook:setCorpTaxBookFeederModeCallable',
  'corpTaxBook:setCorpTaxBookRefineryLabelCallable',
  'corpTaxBook:setCorpTaxBookOwnRefineryLabelCallable',
  'corpTaxBook:learnCorpTaxBookRefinerySystemsCallable',
  'corpTaxBook:setCorpTaxBookFeederPayeeFromBookCallable',
  'corpTaxBook:startCorpTaxBookFeederRemovalCallable',
  'corpTaxBook:recordCorpTaxBookFeederRemovalSentCallable',
  'corpTaxBook:cancelCorpTaxBookFeederRemovalCallable',
  'corpTaxBook:getCorpTaxBookRemovalLinkCallable',
  'corpTaxBook:forceCorpTaxBookRemovalCallable',
  'corpTaxBook:recordCorpTaxBookFeederPayoutCallable',
  'corpTaxBook:markCorpTaxBookFeederPayoutCallable',
  'corpTaxBook:reconcileCorpTaxBookFeederPayoutsCallable',
  'corpTaxBook:listCorpTaxBookFeederInvitesCallable',
  'corpTaxBook:revokeCorpTaxBookSyncGrantCallable',
  'corpTaxBook:verifyCorpOfficerCallable',
  'corpTaxBook:turnOnCorpTaxBookCallable',
  'corpTaxBook:deleteCorpTaxBookCallable',
  'corpTaxBook:reclaimCorpTaxBookCallable',
  'corpTaxBook:syncCorpTaxBookCallable',
  'corpTaxBook:editCorpTaxBookCallable',
  'corpTaxBook:verifySrpOfficerCallable',
  'corpTaxBook:getSrpStatusCallable',
  'corpTaxBook:fileSrpClaimCallable',
  'corpTaxBook:previewSrpDoctrineCheckCallable',
  'corpTaxBook:getSrpClaimValuesCallable',
  'corpTaxBook:saveSrpDoctrineCallable',
  'corpTaxBook:deleteSrpDoctrineCallable',
  'corpTaxBook:turnOnSrpCallable',
  'corpTaxBook:turnOffSrpCallable',
  'corpTaxBook:saveSrpSettingsCallable',
  'corpTaxBook:approveSrpClaimCallable',
  'corpTaxBook:approveSrpClaimsCallable',
  'corpTaxBook:rejectSrpClaimCallable',
  'corpTaxBook:changeSrpClaimAmountCallable',
  'corpTaxBook:markSrpClaimPaidCallable',
  'corpTaxBook:markSrpClaimsPaidCallable',
  'corpTaxBook:reclaimSrpCallable',
  'corpTaxBook:claimCorpTaxBookPaymentCallable',
  'corpTaxBook:confirmCorpTaxBookGroupingCallable',
  'corpTaxBook:declineCorpTaxBookGroupingCallable',
  'corpTaxBook:listPendingCorpTaxBookGroupingsCallable',
  'corpTaxBook:readCorpTaxBookStatementCallable',
  'corpTaxBook:declineCorpTaxBookGroupingByTokenCallable',
  'corpTaxBook:stopCorpTaxBookRemindersCallable',
];

const index = readFileSync(join(__dirname, 'index.ts'), 'utf8');
const HELPER_GROUP: Record<string, CallableGroup> = {
  alertsAction: 'alerts',
  communityAction: 'community',
  corpTaxBookAction: 'corpTaxBook',
};
const registered = [
  ...index.matchAll(/^(communityAction|corpTaxBookAction|alertsAction)\(\s*'(\w+)'/gm),
].map((m) => `${HELPER_GROUP[m[1]]}:${m[2]}`);

describe('callable manifest', () => {
  it('keeps every wire name and its group', () => {
    const current = (Object.keys(CALLABLE_ACTIONS) as CallableGroup[]).flatMap((g) =>
      CALLABLE_ACTIONS[g].map((n) => `${g}:${n}`)
    );
    expect(WIRE_NAMES.filter((n) => !current.includes(n))).toEqual([]);
  });

  it('names each action in exactly one group', () => {
    const all = Object.values(CALLABLE_ACTIONS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(groupOf('registerDevice')).toBe('alerts');
    expect(groupOf('mintFirebaseToken')).toBeUndefined();
  });

  it('registers every manifest action once, through its own group helper', () => {
    const declared = (Object.keys(CALLABLE_ACTIONS) as CallableGroup[]).flatMap((g) =>
      CALLABLE_ACTIONS[g].map((n) => `${g}:${n}`)
    );
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual([...declared].sort());
  });

  it('deploys no per-name community, Corp Tax Book, SRP or alerts callable', () => {
    const loose = [
      ...index.matchAll(
        /^export const (\w*(?:Communit|CorpTaxBook|CorpOfficer|Srp)\w*Callable|registerDevice|saveAlertGrant|deleteAlertGrant) =/gm
      ),
    ];
    expect(loose.map((m) => m[1])).toEqual([]);
  });

  it('ROUTER_FUNCTIONS names the deployed router exports of index.ts, one per group', () => {
    const routers = [...index.matchAll(/^export const (\w+Call) = onCall/gm)].map((m) => m[1]);
    expect(Object.keys(ROUTER_FUNCTIONS).sort()).toEqual(Object.keys(CALLABLE_ACTIONS).sort());
    expect(routers.sort()).toEqual(Object.values(ROUTER_FUNCTIONS).sort());
  });
});
