/**
 * A stand-in for the SRP officer queue's backend, for Storybook: set, every
 * `srpOfficerClient` call answers from memory. Never set by the app itself. Its own module, like
 * `srpBackendOverride.ts`, so a test that mocks the client still leaves it unset.
 */
import type {
  SrpApproveItem,
  SrpAuditEntry,
  SrpBatchOutcome,
  SrpClaim,
  SrpClaimOutcome,
  SrpMarkPaidItem,
} from './srpClaimTypes';
import type { SrpClaimValues } from './srpTypes';

export interface SrpOfficerBackendOverride {
  claims: () => SrpClaim[];
  activity: () => SrpAuditEntry[];
  claimAudit: (killmailId: number) => SrpAuditEntry[];
  claimValues: (killmailId: number) => SrpClaimValues;
  approve: (item: SrpApproveItem) => SrpClaimOutcome;
  approveMany: (items: SrpApproveItem[]) => SrpBatchOutcome;
  reject: (killmailId: number, reason: string) => SrpClaimOutcome;
  change: (killmailId: number, amount: number, reason: string) => SrpClaimOutcome;
  markPaid: (item: SrpMarkPaidItem) => SrpClaimOutcome;
  markPaidMany: (items: SrpMarkPaidItem[]) => SrpBatchOutcome;
}

let override: SrpOfficerBackendOverride | null = null;

export const setSrpOfficerBackendOverride = (next: SrpOfficerBackendOverride | null): void => {
  override = next;
};

export const srpOfficerBackendOverride = (): SrpOfficerBackendOverride | null => override;
