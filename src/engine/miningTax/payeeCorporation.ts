/**
 * Which corporation a typed Payee name names (#6205). A Corp Tax Book matches
 * a Payee by corporation id only (`isCorpEntityPayee`), so a Payee typed as
 * "Corp A" without that link is a second, conflicting Payee. Payee setup uses
 * this to suggest the link. Whole names only, ignoring case and surrounding
 * spaces: a pilot types names, and EVE names are unique case-insensitively.
 */
export interface NamedCorporation {
  corporationId: number;
  name: string;
}

export function corporationNamed<C extends NamedCorporation>(
  typed: string,
  corporations: readonly C[]
): C | undefined {
  const name = typed.trim();
  if (!name) return undefined;
  return corporations.find(
    (c) => c.name.trim().localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
  );
}
