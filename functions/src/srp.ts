// SRP (ADR 0026): the pure half of the callables, input parsing
// with no Firestore. The admin-SDK half is srpStore.ts; the layout and shapes
// are in srpTypes.ts.

import { HttpsError } from 'firebase-functions/v2/https';
import { record } from './communities.js';
import { int } from './corpTaxBook.js';
import {
  HULL_RULE_KINDS,
  MAX_CLAIM_WINDOW_DAYS,
  MAX_HULL_RULES,
  type HullRule,
  type HullRuleKind,
  type HullRuleScope,
  type SrpSettingsPatch,
} from './srpTypes.js';

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpsError('invalid-argument', `${field} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function parseHullRule(raw: unknown): HullRule {
  const d = record(raw);
  const scope: HullRuleScope = oneOf(d.scope, 'scope', ['hull', 'class'] as const);
  const id = int(d.id, 'id', 1, 2_147_483_647);
  const kind: HullRuleKind = oneOf(d.kind, 'kind', HULL_RULE_KINDS);
  if (kind === 'pay-fixed') {
    if (typeof d.iskAmount !== 'number' || !Number.isFinite(d.iskAmount)) {
      throw new HttpsError('invalid-argument', 'iskAmount must be a number');
    }
    // The engine treats under 1 ISK as unset, so a smaller amount would silently never pay.
    if (d.iskAmount < 1 || d.iskAmount > 1e13) {
      throw new HttpsError('invalid-argument', 'iskAmount must be 1 to 1e13');
    }
    return { scope, id, kind, iskAmount: d.iskAmount };
  }
  // Pay: corp percent follows the corp's own chain; a stored legacy `pct` is ignored.
  return { scope, id, kind };
}

function parseHullRules(raw: unknown): HullRule[] {
  if (!Array.isArray(raw) || raw.length > MAX_HULL_RULES) {
    throw new HttpsError(
      'invalid-argument',
      `hullRules must be a list of at most ${MAX_HULL_RULES}`
    );
  }
  const rules = raw.map(parseHullRule);
  const seen = new Set<string>();
  for (const rule of rules) {
    const key = `${rule.scope}:${rule.id}`;
    if (seen.has(key)) {
      throw new HttpsError('invalid-argument', `${rule.scope} ${rule.id} has a rule twice`);
    }
    seen.add(key);
  }
  return rules;
}

/** 1-100, the range the engine and the settings form use (under 1 reads as unset). */
function pctField(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 100) {
    throw new HttpsError('invalid-argument', `${name} must be 1-100`);
  }
  return value;
}

/** A percent, or null for "this step is not used". */
function nullablePct(value: unknown, field: string): number | null {
  return value === null ? null : pctField(value, field);
}

export function parseSrpSettingsPatch(data: unknown): SrpSettingsPatch {
  const d = record(data);
  const patch: SrpSettingsPatch = {};
  if (d.killmailPct !== undefined) patch.killmailPct = nullablePct(d.killmailPct, 'killmailPct');
  if (d.appraisalPct !== undefined) {
    patch.appraisalPct = nullablePct(d.appraisalPct, 'appraisalPct');
  }
  if (d.hullRules !== undefined) patch.hullRules = parseHullRules(d.hullRules);
  if (d.windowDays !== undefined) {
    patch.windowDays = int(d.windowDays, 'windowDays', 1, MAX_CLAIM_WINDOW_DAYS);
  }
  if (d.requireFleetOrFc !== undefined) {
    if (typeof d.requireFleetOrFc !== 'boolean') {
      throw new HttpsError('invalid-argument', 'requireFleetOrFc must be true or false');
    }
    patch.requireFleetOrFc = d.requireFleetOrFc;
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'no settings given');
  }
  return patch;
}
