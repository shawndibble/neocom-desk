import type { DoctrineCheck, DoctrineFitSnapshot } from './srpDoctrine.js';
import type { SrpBasis } from './srpPricing.js';

export const CORPS_COLLECTION = 'corps';
export const SRP_SETTINGS_COLLECTION = 'srp';
export const SRP_SETTINGS_DOC = 'settings';
export const SRP_CLAIMS = 'srpClaims';
export const SRP_AUDIT = 'srpAudit';
export const SRP_OFFICERS = 'srpOfficers';
export const SRP_DOCTRINES = 'srpDoctrines';
export const SRP_THROTTLE = 'srpThrottle';

export const SRP_COLLECTIONS: readonly string[] = [
  SRP_SETTINGS_COLLECTION,
  SRP_CLAIMS,
  SRP_AUDIT,
  SRP_OFFICERS,
  SRP_DOCTRINES,
  SRP_THROTTLE,
];

export const SRP_SCHEMA_VERSION = 1;
export const DEFAULT_CLAIM_WINDOW_DAYS = 30;
export const MAX_CLAIM_WINDOW_DAYS = 365;
export const MAX_HULL_RULES = 500;
export const MAX_DOCTRINES = 100;
export const MAX_RULE_DOCTRINES = 20;

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
  | { kind: 'amount'; isk: number; basis: SrpBasis }
  | {
      kind: 'officer';
      reason: 'officer-decides' | 'no-amount';
      suggested?: { isk: number; basis: SrpBasis };
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
  schemaVersion: number;
}

export interface SrpSettingsPatch {
  killmailPct?: number | null;
  appraisalPct?: number | null;
  hullRules?: HullRule[];
  windowDays?: number;
  requireFleetOrFc?: boolean;
}

export function defaultSrpSettings(): Pick<
  SrpSettings,
  'killmailPct' | 'appraisalPct' | 'hullRules' | 'windowDays' | 'requireFleetOrFc'
> {
  return {
    killmailPct: null,
    appraisalPct: null,
    hullRules: [],
    windowDays: DEFAULT_CLAIM_WINDOW_DAYS,
    requireFleetOrFc: false,
  };
}

export type SrpClaimState = 'pending' | 'approved' | 'paid' | 'rejected';
