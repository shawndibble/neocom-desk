// SRP (ADR 0026): the shapes and layout the SRP
// callables, rules and later tickets share. No Firestore, no ESI.
//
// Firestore layout (rules in firestore.rules; every write is a callable):
//   corps/{corporationId}/srp/settings          the corp's SRP settings (SrpSettings)
//   corps/{corporationId}/srpClaims/{killmailId} one SRP Claim per killmail; the id IS the killmail
//                                               id, so a second claim is a create conflict. Written by
//                                               the file-claim callable; carries `uid`.
//   corps/{corporationId}/srpAudit/{at~rand}    immutable audit log
//   corps/{corporationId}/srpDoctrines/{id}      the corp's Doctrine Fit snapshots (DoctrineFit)
//   corps/{corporationId}/srpOfficers/{uid}     officer access record (1h) written by verifySrpOfficer
import type { DoctrineFitSnapshot } from './srpDoctrine.js';

export const CORPS_COLLECTION = 'corps';
export const SRP_SETTINGS_COLLECTION = 'srp';
export const SRP_SETTINGS_DOC = 'settings';
export const SRP_CLAIMS = 'srpClaims';
export const SRP_AUDIT = 'srpAudit';
export const SRP_OFFICERS = 'srpOfficers';
export const SRP_DOCTRINES = 'srpDoctrines';

export const SRP_SCHEMA_VERSION = 1;
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
  schemaVersion: number;
}

/** The patch `saveSrpSettingsCallable` takes; every field optional, at least one present. */
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

/** An SRP Claim's state (scope decision: Pending -> Approved -> Paid, plus Rejected). */
export type SrpClaimState = 'pending' | 'approved' | 'paid' | 'rejected';

// Retention sweep contract: it reads a claim's `state` and `closedAt` only. `closedAt` is the epoch
// ms the claim became Paid or Rejected, set by the callables that close it; re-filing sets state
// back to 'pending' and removes it. Absent while Pending or Approved; such a claim is never swept.
