/**
 * The SRP settings form as plain data: saved settings in, the
 * strings the inputs edit, the problems that block Save, and the patch
 * `saveSrpSettingsCallable` takes. Pure: no fetch, DOM or Dexie.
 *
 * Percents are valid 1-100 or blank (blank = that step of the pricing chain is off, the
 * same rule as `engine/srpPricing.ts`). A `pay-percent` Hull Rule means "follow the corp's
 * percent chain" (killmail percent, then Appraisal percent) and carries no figure of its own.
 */
import {
  MAX_CLAIM_WINDOW_DAYS,
  type HullRule,
  type HullRuleKind,
  type HullRuleScope,
  type SrpSettings,
  type SrpSettingsPatch,
} from '../srpTypes';

export type RuleChoice = 'none' | HullRuleKind;

export interface RuleDraft {
  kind: RuleChoice;
  /** Plain digit string for `pay-fixed`; blank is a problem. */
  isk: string;
  /** Doctrine Fit ids a claim on this hull must match (hull scope only); empty: not checked. */
  doctrineIds: string[];
}

export interface SrpSettingsForm {
  enabled: boolean;
  killmailPct: string;
  appraisalPct: string;
  windowDays: string;
  requireFleetOrFc: boolean;
  /** Keyed by `ruleKey`; a missing entry is `none`. */
  rules: Record<string, RuleDraft>;
}

export const NO_RULE: RuleDraft = { kind: 'none', isk: '', doctrineIds: [] };
const MAX_FIXED_ISK = 1e13;

export const ruleKey = (scope: HullRuleScope, id: number) => `${scope}:${id}`;

export function ruleOf(form: SrpSettingsForm, scope: HullRuleScope, id: number): RuleDraft {
  return form.rules[ruleKey(scope, id)] ?? NO_RULE;
}

export function setRule(
  form: SrpSettingsForm,
  scope: HullRuleScope,
  id: number,
  rule: RuleDraft
): SrpSettingsForm {
  // No rule holds no Doctrine Fits: they would not be saved, so they are not kept in the form.
  const next = rule.kind === 'none' ? { ...rule, doctrineIds: [] } : rule;
  return { ...form, rules: { ...form.rules, [ruleKey(scope, id)]: next } };
}

/**
 * Attaches the Doctrine Fits a hull's claims are checked against. A hull with no rule of its own
 * cannot hold them (a rule needs a kind, and picking one for the Director could change what the
 * hull pays), so this is inert there until the Director picks a rule.
 */
export function setDoctrineIds(
  form: SrpSettingsForm,
  hullId: number,
  doctrineIds: string[]
): SrpSettingsForm {
  const rule = ruleOf(form, 'hull', hullId);
  return rule.kind === 'none' ? form : setRule(form, 'hull', hullId, { ...rule, doctrineIds });
}

export function formFromSettings(s: SrpSettings): SrpSettingsForm {
  const rules: Record<string, RuleDraft> = {};
  for (const r of s.hullRules) {
    rules[ruleKey(r.scope, r.id)] = {
      kind: r.kind,
      isk: r.kind === 'pay-fixed' ? String(r.iskAmount) : '',
      doctrineIds: [...(r.doctrineIds ?? [])],
    };
  }
  return {
    enabled: s.enabled,
    killmailPct: s.killmailPct === null ? '' : String(s.killmailPct),
    appraisalPct: s.appraisalPct === null ? '' : String(s.appraisalPct),
    windowDays: String(s.windowDays),
    requireFleetOrFc: s.requireFleetOrFc,
    rules,
  };
}

function parsePct(value: string): number | null | 'invalid' {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 'invalid';
}

function parseWindow(value: string): number | null {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_CLAIM_WINDOW_DAYS
    ? n
    : null;
}

function parseFixed(value: string): number | null {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= MAX_FIXED_ISK ? n : null;
}

export interface FormProblems {
  killmailPct: boolean;
  appraisalPct: boolean;
  windowDays: boolean;
  /** Rule keys of Pay: fixed ISK rows with no usable amount. */
  fixedIsk: string[];
  /** A Pay: corp percent rule exists but both corp percents are blank. */
  percentRuleWithoutPercent: boolean;
  count: number;
}

export function formProblems(form: SrpSettingsForm): FormProblems {
  const entries = Object.entries(form.rules);
  const fixedIsk = entries
    .filter(([, r]) => r.kind === 'pay-fixed' && parseFixed(r.isk) === null)
    .map(([key]) => key);
  const km = parsePct(form.killmailPct);
  const ap = parsePct(form.appraisalPct);
  const percentRuleWithoutPercent =
    km === null && ap === null && entries.some(([, r]) => r.kind === 'pay-percent');
  const problems = {
    killmailPct: km === 'invalid',
    appraisalPct: ap === 'invalid',
    windowDays: parseWindow(form.windowDays) === null,
    fixedIsk,
    percentRuleWithoutPercent,
  };
  const count =
    Number(problems.killmailPct) +
    Number(problems.appraisalPct) +
    Number(problems.windowDays) +
    fixedIsk.length +
    Number(percentRuleWithoutPercent);
  return { ...problems, count };
}

/** `live`: ids of the Doctrine Fits that still exist; a deleted one is not sent. */
function rulesOf(form: SrpSettingsForm, live?: ReadonlySet<string>): HullRule[] {
  const out: HullRule[] = [];
  for (const [key, draft] of Object.entries(form.rules)) {
    if (draft.kind === 'none') continue;
    const [scope, id] = key.split(':') as [HullRuleScope, string];
    const ids = scope === 'hull' ? draft.doctrineIds.filter((d) => !live || live.has(d)) : [];
    const base = {
      scope,
      id: Number(id),
      ...(ids.length > 0 ? { doctrineIds: [...ids].sort() } : {}),
    };
    if (draft.kind === 'pay-fixed') {
      out.push({ ...base, kind: 'pay-fixed', iskAmount: parseFixed(draft.isk) ?? 0 });
    } else if (draft.kind === 'pay-percent') {
      out.push({ ...base, kind: 'pay-percent' });
    } else {
      out.push({ ...base, kind: draft.kind });
    }
  }
  // Classes first, then hulls, each by id: a stable list, so an unchanged form compares equal.
  return out.sort((a, b) => (a.scope === b.scope ? a.id - b.id : a.scope === 'class' ? -1 : 1));
}

const sameRules = (a: HullRule[], b: HullRule[]) => JSON.stringify(a) === JSON.stringify(b);

/** Only what changed; the rules go as the whole list. Enabled is a separate callable, not here. */
export function formToPatch(
  form: SrpSettingsForm,
  saved: SrpSettings,
  liveDoctrineIds?: ReadonlySet<string>
): SrpSettingsPatch {
  const patch: SrpSettingsPatch = {};
  const km = parsePct(form.killmailPct);
  const ap = parsePct(form.appraisalPct);
  if (km !== 'invalid' && km !== saved.killmailPct) patch.killmailPct = km;
  if (ap !== 'invalid' && ap !== saved.appraisalPct) patch.appraisalPct = ap;
  const days = parseWindow(form.windowDays);
  if (days !== null && days !== saved.windowDays) patch.windowDays = days;
  if (form.requireFleetOrFc !== saved.requireFleetOrFc)
    patch.requireFleetOrFc = form.requireFleetOrFc;
  // Compared as the saved form would send them, so stale legacy pcts and list order never read
  // as edits.
  const rules = rulesOf(form, liveDoctrineIds);
  if (!sameRules(rules, rulesOf(formFromSettings(saved), liveDoctrineIds))) patch.hullRules = rules;
  return patch;
}

export function formIsDirty(
  form: SrpSettingsForm,
  saved: SrpSettings,
  liveDoctrineIds?: ReadonlySet<string>
): boolean {
  return (
    form.enabled !== saved.enabled ||
    Object.keys(formToPatch(form, saved, liveDoctrineIds)).length > 0
  );
}
