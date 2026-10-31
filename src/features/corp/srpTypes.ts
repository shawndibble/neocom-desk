// Client mirror of `functions/src/srpTypes.ts` (ADR 0026; layout and field docs live there).
// A copy, not an import: Functions builds separately; kept in step by hand.
import type { DoctrineCheck, DoctrineFitSnapshot } from '@/engine/srpDoctrine';

/** A claim's window, in days from the loss: corp default and the range a Director may set. */
export const DEFAULT_CLAIM_WINDOW_DAYS = 30;
export const MAX_CLAIM_WINDOW_DAYS = 365;
export const MAX_HULL_RULES = 500;

/** What a Hull Rule does for its hull or class (GLOSSARY.md "Hull Rule"). */
export type HullRuleKind = 'pay-fixed' | 'pay-percent' | 'not-covered' | 'officer-decides';
export const HULL_RULE_KINDS: readonly HullRuleKind[] = [
  'pay-fixed',
  'pay-percent',
  'not-covered',
  'officer-decides',
];

/** `hull` keys on an SDE type id, `class` on a ship group id. A hull rule wins over its class's. */
export type HullRuleScope = 'hull' | 'class';

export type HullRule = (
  | { scope: HullRuleScope; id: number; kind: 'pay-fixed'; iskAmount: number }
  | { scope: HullRuleScope; id: number; kind: 'pay-percent' }
  | { scope: HullRuleScope; id: number; kind: 'not-covered' | 'officer-decides' }
) & {
  /** Doctrine Fits a claim on this hull must match; absent or empty: the hull is not checked. */
  doctrineIds?: string[];
};

/**
 * A corp's Doctrine Fit (GLOSSARY.md): a snapshot of a Director's pasted or picked fit, so
 * later edits to a source Fitting never change it. `corps/{corporationId}/srpDoctrines/{id}`.
 */
export interface DoctrineFit {
  id: string;
  name: string;
  snapshot: DoctrineFitSnapshot;
  createdBy: number;
  createdAt: number;
}

/**
 * The doctrine-fit result stored on a claim at filing (never re-evaluated). `doctrineName` is
 * the matched or nearest fit's name then, so it stays readable after the fit is edited or deleted.
 * Absent on claims filed before doctrine-fit existed: read as 'not-checked'.
 */
export type DoctrineCheckRecord = DoctrineCheck & { doctrineName?: string };

/** What `saveSrpDoctrineCallable` takes: `id` absent creates, present replaces that fit. */
export interface SaveDoctrineInput {
  id?: string;
  name: string;
  snapshot: DoctrineFitSnapshot;
}

/** Jita values of a loss, no cargo. Each null when unpriced. */
export interface LossValues {
  killmailValue: number | null;
  hullValue: number | null;
  fitValue: number | null;
}

/** What filing the loss would pay, from the pricing the filing uses. */
export type PayoutQuote =
  | { kind: 'amount'; isk: number; basis: SrpClaimBasis }
  | {
      kind: 'officer';
      reason: 'officer-decides' | 'no-amount';
      suggested?: { isk: number; basis: SrpClaimBasis };
    }
  | { kind: 'not-covered' };

/** `previewSrpDoctrineCheckCallable`'s answer: the check a filing now would store, and its price. */
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

/** `getSrpClaimValuesCallable` result: the lost ship against the nearest Doctrine Fit, no cargo. */
export interface SrpClaimValues {
  hullValue: number | null;
  fitValue: number | null;
  /** Jita value of the nearest Doctrine Fit's hull, modules and rigs; null when none or unpriced. */
  doctrineValue: number | null;
  doctrineName?: string;
}

/** `corps/{corporationId}/srp/settings`. */
export interface SrpSettings {
  corporationId: number;
  /** Off hides SRP from members and refuses new claims; claims and rules are kept. */
  enabled: boolean;
  /** The corp's percent of the killmail value, 0-100; null when the corp prices no claim that way. */
  killmailPct: number | null;
  /** The corp's percent of the Jita Appraisal, 0-100; null when unset. */
  appraisalPct: number | null;
  hullRules: HullRule[];
  windowDays: number;
  /** A claim must say which Fleet or FC the loss was under. */
  requireFleetOrFc: boolean;
  /** Who turned SRP on, and who owns it now (a CEO reclaim moves it). */
  createdBy: number;
  createdAt: number;
  ownerCharacterId: number;
  updatedAt: number;
  updatedBy: number;
}

/** The patch `saveSrpSettingsCallable` takes; every field optional, at least one present. */
export interface SrpSettingsPatch {
  killmailPct?: number | null;
  appraisalPct?: number | null;
  hullRules?: HullRule[];
  windowDays?: number;
  requireFleetOrFc?: boolean;
}

/** `verifySrpOfficerCallable`'s answer. */
export interface SrpOfficerVerdict {
  corporationId: number;
  isCeo: boolean;
  isDirector: boolean;
  /** Director, Accountant or CEO: may approve, reject, override and mark paid. */
  canManage: boolean;
  srpEnabled: boolean;
  /** A settings doc exists. Absent from servers that predate it: read the doc then. */
  settingsExist?: boolean;
  /** Epoch ms: rules show the officer the claim queue until then. */
  expiresAt: number;
}

/** `getSrpStatusCallable`'s answer: what any member needs to show the SRP page. */
export interface SrpStatus {
  corporationId: number;
  enabled: boolean;
  /** The rules a pilot sees when filing; absent while SRP is off. */
  settings?: Pick<
    SrpSettings,
    'killmailPct' | 'appraisalPct' | 'hullRules' | 'windowDays' | 'requireFleetOrFc'
  >;
}

/** A claim's `state`. `closedAt` (epoch ms) is set when it becomes paid or rejected. */
export type SrpClaimState = 'pending' | 'approved' | 'paid' | 'rejected';

/** A claim's lifecycle order, for sorting a State column as the claim moves rather than A to Z. */
export const SRP_STATE_RANK: Record<SrpClaimState, number> = {
  pending: 0,
  approved: 1,
  paid: 2,
  rejected: 3,
};

/** `fileSrpClaimCallable`'s input beside the corporation and token. */
export interface FileSrpClaimInput {
  /** A pasted zKillboard (`/kill/<id>/`) or ESI (`/killmails/<id>/<hash>/`) link. */
  killmail: string;
  /** Which Fleet or FC the loss was under; required when the corp says so. */
  fleetOrFc?: string;
  /** Required when re-filing after a rejection. */
  note?: string;
}

/** How a claim's amount was reached (mirror of the pricing engine's basis). */
export type SrpClaimBasis =
  | { step: 'hull-fixed' }
  | { step: 'class-fixed' }
  | { step: 'killmail-percent'; percent: number }
  | { step: 'appraisal-percent'; percent: number };

/** `fileSrpClaimCallable`'s answer. */
export interface FiledSrpClaim {
  killmailId: number;
  state: 'pending';
  /** Whole ISK; null when an officer types the amount. */
  amount: number | null;
  basis: SrpClaimBasis | null;
}
