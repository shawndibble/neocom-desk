import type { HullRuleScope } from '../srpTypes';
import type { HullCatalog } from './hullCatalog';
import { ruleOf, type SrpSettingsForm } from './srpSettingsForm';

export interface HullRuleRow {
  scope: HullRuleScope;
  id: number;
  name: string;
  classId: number;
  count: number;
}

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

export function listedClassIds(
  form: SrpSettingsForm,
  catalog: HullCatalog,
  kept: readonly number[]
): Set<number> {
  const ids = new Set(kept);
  for (const [key, draft] of Object.entries(form.rules)) {
    if (!key.startsWith('class:') || draft.kind === 'none') continue;
    ids.add(Number(key.slice(6)));
  }
  return new Set([...ids].filter((id) => catalog.hullsByClass.has(id)));
}

export function buildHullRuleRows(
  catalog: HullCatalog,
  className: (classId: number) => string,
  listed: ReadonlySet<number>,
  expanded: ReadonlySet<number>,
  listedClasses: ReadonlySet<number> = new Set()
): HullRuleRow[] {
  const classes = [...catalog.classIds].sort((a, b) => className(a).localeCompare(className(b)));
  return classes.flatMap((classId) => {
    const hulls = (catalog.hullsByClass.get(classId) ?? []).filter((h) => listed.has(h.id));
    if (hulls.length === 0 && !listedClasses.has(classId)) return [];
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

export const isNotCovered = (form: SrpSettingsForm, row: HullRuleRow): boolean =>
  ruleOf(form, row.scope, row.id).kind === 'not-covered';
