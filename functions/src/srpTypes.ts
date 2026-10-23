// SRP (issue #4848, epic #4608, ADR 0026): the shapes and layout the SRP
// callables, rules and later tickets share. No Firestore, no ESI.
//
// Firestore layout (rules in firestore.rules; every write is a callable):
//   corps/{corporationId}/srp/settings          the corp's SRP settings (SrpSettings)
//   corps/{corporationId}/srpClaims/{killmailId} one SRP Claim per killmail; the id IS the killmail
//                                               id, so a second claim is a create conflict. Written by
//                                               the file-claim callable (#4850); carries `uid`.
//   corps/{corporationId}/srpAudit/{at~rand}    immutable audit log
//   corps/{corporationId}/srpOfficers/{uid}     officer access record (24h) written by verifySrpOfficer
//
// `srp` is the collection that holds the settings doc; claims, audit and officers are
// sibling collections under the same `corps/{id}` umbrella.

export const CORPS_COLLECTION = 'corps';
export const SRP_SETTINGS_COLLECTION = 'srp';
export const SRP_SETTINGS_DOC = 'settings';
export const SRP_CLAIMS = 'srpClaims';
export const SRP_AUDIT = 'srpAudit';
export const SRP_OFFICERS = 'srpOfficers';

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

export type HullRule =
  | { scope: HullRuleScope; id: number; kind: 'pay-fixed'; iskAmount: number }
  | { scope: HullRuleScope; id: number; kind: 'pay-percent'; pct: number }
  | { scope: HullRuleScope; id: number; kind: 'not-covered' | 'officer-decides' };

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

/**
 * The fields of an SRP Claim doc that rules and the officer gate rely on. The
 * file-claim callable (#4850) writes the rest. `uid` and `ownerHash` are the filer's
 * verified identity, which is what lets a pilot read only their own claims.
 */
export interface SrpClaimKey {
  uid: string;
  /** The filer's ownerHash at filing; rules require it to match the reader's token. */
  ownerHash: string;
  corporationId: number;
  killmailId: number;
}
