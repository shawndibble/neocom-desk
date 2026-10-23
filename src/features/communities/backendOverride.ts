/**
 * A stand-in for the Community backend, for Storybook and its smoke test: set,
 * the reads and every callable answer from memory, so a page story shows
 * sample Communities and their shared content without a network or a sign-in.
 * Never set by the app itself.
 *
 * Its own module, not part of `communityStore.ts`, so a test that mocks the
 * store with a factory still leaves the shared-content clients
 * (`sharedFittings.ts`, `sharedPlans.ts`) reading "no stand-in".
 */
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
  /** A callable by name; its result is what the real one would return. */
  call: (name: string, data: unknown) => unknown;
  /** Every Member's Shared Blueprints, for the Community Library. */
  loadLibraries?: (communityId: string) => MemberLibrary[];
  /** Every Fitting shared into the Community, by anyone. */
  loadFittings?: (communityId: string) => SharedFitting[];
  /** Every Request on the board, any status. */
  loadItemRequests?: (communityId: string) => CommunityRequest[];
  /** Every Member's Pledges on one Request. */
  loadPledges?: (communityId: string, requestId: string) => RequestPledge[];
  /** Every Pledge in the Community, by Request id. */
  loadAllPledges?: (communityId: string) => Record<string, RequestPledge[]>;
  /** Writes (or, with null, withdraws) the signed-in Member's Pledge on one Request. */
  savePledge?: (
    communityId: string,
    requestId: string,
    lines: RequestPledge['lines'] | null
  ) => void;
  /** Holds (or, with null, clears) the signed-in Member's Quote on one standing Request. */
  saveQuote?: (communityId: string, requestId: string, quote: HeldQuote | null) => void;
  /** What marking deliveries from contracts found, for the panel's flags and notes. */
  syncDeliveries?: (communityId: string) => DeliverySyncResult;
  /** Every Fleet Payout in the Community, any status. */
  loadFleetPayouts?: (communityId: string) => FleetPayout[];
  /** Every Fleet Share of one Fleet Payout. */
  loadFleetShares?: (communityId: string, payoutId: string) => FleetShare[];
  /** Every Skill Plan shared into the Community, by anyone. */
  loadPlans?: (communityId: string) => SharedPlan[];
}

let override: CommunityBackendOverride | null = null;

export function setCommunityBackendOverride(next: CommunityBackendOverride | null): void {
  override = next;
}

/** The stand-in in use; null in the app. */
export function communityBackendOverride(): CommunityBackendOverride | null {
  return override;
}
