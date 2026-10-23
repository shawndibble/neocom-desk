/**
 * The rows of the Hull Rules editor: every ship class, collapsed by default, and
 * under an expanded class the hulls that carry a rule or were added from the search. Pure.
 */
import type { HullRuleScope } from '../srpTypes';
import type { HullCatalog } from './hullCatalog';
import { ruleOf, type SrpSettingsForm } from './srpSettingsForm';

export interface HullRuleRow {
  scope: HullRuleScope;
  id: number;
  name: string;
  classId: number;
  /** For a class: how many of its hulls are listed (have a rule or were added). Zero for a hull. */
  count: number;
}

/** Hull ids to list: those with a rule in the form, plus the ones the pilot added. */
export function listedHullIds(
  form: SrpSettingsForm,
  catalog: HullCatalog,
  added: readonly number[]
): Set<number> {
  const ids = new Set(added);
  for (const [key, draft] of Object.entries(form.rules)) {
    if (!key.startsWith('hull:') || draft.kind === 'none') continue;
    ids.add(Number(key.slice(5)));
  }
  return new Set([...ids].filter((id) => catalog.hull(id) !== undefined));
}

export function buildHullRuleRows(
  catalog: HullCatalog,
  className: (classId: number) => string,
  listed: ReadonlySet<number>,
  expanded: ReadonlySet<number>
): HullRuleRow[] {
  const classes = [...catalog.classIds].sort((a, b) => className(a).localeCompare(className(b)));
  return classes.flatMap((classId) => {
    const hulls = (catalog.hullsByClass.get(classId) ?? []).filter((h) => listed.has(h.id));
    const classRow: HullRuleRow = {
      scope: 'class',
      id: classId,
      name: className(classId),
      classId,
      count: hulls.length,
    };
    const hullRows: HullRuleRow[] = expanded.has(classId)
      ? hulls.map((h) => ({ scope: 'hull', id: h.id, name: h.name, classId, count: 0 }))
      : [];
    return [classRow, ...hullRows];
  });
}

/** Whether a row is a "Not covered" one, which the table tints. */
export const isNotCovered = (form: SrpSettingsForm, row: HullRuleRow): boolean =>
  ruleOf(form, row.scope, row.id).kind === 'not-covered';
