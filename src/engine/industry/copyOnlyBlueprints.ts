/**
 * Blueprints that exist only as fixed-run copies (issue #6394): no original is
 * ever sold or owned, so a plan must not assume one. Hand-listed; the test
 * checks every id is a real manufacturing blueprint in the baked SDE.
 *
 * Deliberately absent: 76376 (Mutadaptive Construction Component) — nothing
 * confirms it has no original, so it keeps the ordinary assumption.
 */
const COPY_ONLY_BLUEPRINT_IDS: ReadonlySet<number> = new Set([
  53032, // Capital Ultratidal Entropic Mounting
  53033, // Capital Radiation Conversion Unit
  53034, // Capital Absorption Thruster Array
  33196, // Spatial Attunement Unit
]);

export function isCopyOnlyBlueprint(blueprintTypeID: number): boolean {
  return COPY_ONLY_BLUEPRINT_IDS.has(blueprintTypeID);
}

export const COPY_ONLY_BLUEPRINT_TYPE_IDS: readonly number[] = [...COPY_ONLY_BLUEPRINT_IDS];
