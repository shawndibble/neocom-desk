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
