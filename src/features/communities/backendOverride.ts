import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import type { FleetPayout, FleetShare } from '@/engine/communities/fleetPayouts';
import type { HeldQuote } from '@/engine/communities/buyback';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';
import type { SharedFitting } from '@/engine/communities/sharedFittings';
import type { SharedPlan } from '@/engine/communities/sharedPlans';
import type { DeliverySyncResult } from './requestDelivery';
import type { CommunityMember, CommunitySummary, JoinRequest } from './communityStore';

export interface CommunityBackendOverride {
  loadMine: () => CommunitySummary[];
  loadMembers: (communityId: string) => CommunityMember[];
  loadRequests: (communityId: string) => JoinRequest[];
  call: (name: string, data: unknown) => unknown;
  loadLibraries?: (communityId: string) => MemberLibrary[];
  loadFittings?: (communityId: string) => SharedFitting[];
  loadItemRequests?: (communityId: string) => CommunityRequest[];
  loadPledges?: (communityId: string, requestId: string) => RequestPledge[];
  loadAllPledges?: (communityId: string) => Record<string, RequestPledge[]>;
  savePledge?: (
    communityId: string,
    requestId: string,
    lines: RequestPledge['lines'] | null
  ) => void;
  saveQuote?: (communityId: string, requestId: string, quote: HeldQuote | null) => void;
  syncDeliveries?: (communityId: string) => DeliverySyncResult;
  loadFleetPayouts?: (communityId: string) => FleetPayout[];
  loadFleetShares?: (communityId: string, payoutId: string) => FleetShare[];
  loadPlans?: (communityId: string) => SharedPlan[];
}

let override: CommunityBackendOverride | null = null;

export function setCommunityBackendOverride(next: CommunityBackendOverride | null): void {
  override = next;
}

export function communityBackendOverride(): CommunityBackendOverride | null {
  return override;
}
