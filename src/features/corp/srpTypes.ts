import type { DoctrineCheck, DoctrineFitSnapshot } from '@/engine/srpDoctrine';

export const DEFAULT_CLAIM_WINDOW_DAYS = 30;
export const MAX_CLAIM_WINDOW_DAYS = 365;
export const MAX_HULL_RULES = 500;

export type HullRuleKind = 'pay-fixed' | 'pay-percent' | 'not-covered' | 'officer-decides';
export const HULL_RULE_KINDS: readonly HullRuleKind[] = [
  'pay-fixed',
  'pay-percent',
  'not-covered',
  'officer-decides',
];

export type HullRuleScope = 'hull' | 'class';

export type HullRule = (
  | { scope: HullRuleScope; id: number; kind: 'pay-fixed'; iskAmount: number }
  | { scope: HullRuleScope; id: number; kind: 'pay-percent' }
  | { scope: HullRuleScope; id: number; kind: 'not-covered' | 'officer-decides' }
) & {
  doctrineIds?: string[];
};

export interface DoctrineFit {
  id: string;
  name: string;
  snapshot: DoctrineFitSnapshot;
  createdBy: number;
  createdAt: number;
  shareCode?: string;
}

export type MemberDoctrineFit = Pick<DoctrineFit, 'id' | 'name' | 'snapshot' | 'shareCode'>;

export type DoctrineCheckRecord = DoctrineCheck & { doctrineName?: string };

export interface SaveDoctrineInput {
  id?: string;
  name: string;
  snapshot: DoctrineFitSnapshot;
  shareCode?: string;
}

export interface LossValues {
  killmailValue: number | null;
  hullValue: number | null;
  fitValue: number | null;
}

export type PayoutQuote =
  | { kind: 'amount'; isk: number; basis: SrpClaimBasis }
  | {
      kind: 'officer';
      reason: 'officer-decides' | 'no-amount';
      suggested?: { isk: number; basis: SrpClaimBasis };
    }
  | { kind: 'not-covered' };

export interface DoctrinePreview {
  killmailId: number;
  hullTypeId: number;
  check: DoctrineCheckRecord;
  killedAt: number;
  solarSystemId: number;
  quote: PayoutQuote;
  hullRule: { scope: HullRuleScope; id: number; kind: HullRuleKind } | null;
  values: LossValues;
}

export interface SrpClaimValues {
  hullValue: number | null;
  fitValue: number | null;
  doctrineValue: number | null;
  doctrineName?: string;
}

export interface SrpSettings {
  corporationId: number;
  enabled: boolean;
  killmailPct: number | null;
  appraisalPct: number | null;
  hullRules: HullRule[];
  windowDays: number;
  requireFleetOrFc: boolean;
  createdBy: number;
  createdAt: number;
  ownerCharacterId: number;
  updatedAt: number;
  updatedBy: number;
}

export interface SrpSettingsPatch {
  killmailPct?: number | null;
  appraisalPct?: number | null;
  hullRules?: HullRule[];
  windowDays?: number;
  requireFleetOrFc?: boolean;
}

export interface SrpOfficerVerdict {
  corporationId: number;
  isCeo: boolean;
  isDirector: boolean;
  canManage: boolean;
  srpEnabled: boolean;
  settingsExist?: boolean;
  expiresAt: number;
}

export interface SrpStatus {
  corporationId: number;
  enabled: boolean;
  settings?: Pick<
    SrpSettings,
    'killmailPct' | 'appraisalPct' | 'hullRules' | 'windowDays' | 'requireFleetOrFc'
  >;
}

export type SrpClaimState = 'pending' | 'approved' | 'paid' | 'rejected';

export const SRP_STATE_RANK: Record<SrpClaimState, number> = {
  pending: 0,
  approved: 1,
  paid: 2,
  rejected: 3,
};

export interface FileSrpClaimInput {
  killmail: string;
  fleetOrFc?: string;
  note?: string;
}

export type SrpClaimBasis =
  | { step: 'hull-fixed' }
  | { step: 'class-fixed' }
  | { step: 'killmail-percent'; percent: number }
  | { step: 'appraisal-percent'; percent: number };

export interface FiledSrpClaim {
  killmailId: number;
  state: 'pending';
  amount: number | null;
  basis: SrpClaimBasis | null;
}
