/**
 * Stand-ins for the SRP backends (settings, officer queue, Doctrine Fits), for Storybook and
 * tests: set, the matching client answers from memory, so a page story shows without a network,
 * a sign-in or Firebase. Never set by the app itself. Its own module so a test that mocks a
 * client still leaves the override unset.
 */
import type {
  SrpApproveItem,
  SrpAuditEntry,
  SrpBatchOutcome,
  SrpClaim,
  SrpClaimOutcome,
  SrpMarkPaidItem,
} from './srpClaimTypes';
import type {
  DoctrineFit,
  MemberDoctrineFit,
  SaveDoctrineInput,
  SrpClaimValues,
  SrpOfficerVerdict,
  SrpSettings,
  SrpSettingsPatch,
  SrpStatus,
} from './srpTypes';

export interface SrpBackendOverride {
  verify: () => SrpOfficerVerdict;
  /** The settings doc, or null before SRP was ever turned on. */
  readSettings: () => SrpSettings | null;
  status: () => SrpStatus;
  turnOn: () => void;
  turnOff: () => void;
  save: (patch: SrpSettingsPatch) => void;
  reclaim: () => { officersRevoked: number };
}

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

export interface SrpDoctrineBackendOverride {
  list: () => DoctrineFit[];
  save: (input: SaveDoctrineInput) => { id: string };
  remove: (id: string) => void;
  /** A member's list for the Fittings library; absent: none. */
  memberList?: () => MemberDoctrineFit[];
}

let settings: SrpBackendOverride | null = null;
let officer: SrpOfficerBackendOverride | null = null;
let doctrine: SrpDoctrineBackendOverride | null = null;

export const setSrpBackendOverride = (next: SrpBackendOverride | null): void => {
  settings = next;
};
export const srpBackendOverride = (): SrpBackendOverride | null => settings;

export const setSrpOfficerBackendOverride = (next: SrpOfficerBackendOverride | null): void => {
  officer = next;
};
export const srpOfficerBackendOverride = (): SrpOfficerBackendOverride | null => officer;

export const setSrpDoctrineBackendOverride = (next: SrpDoctrineBackendOverride | null): void => {
  doctrine = next;
};
export const srpDoctrineBackendOverride = (): SrpDoctrineBackendOverride | null => doctrine;
