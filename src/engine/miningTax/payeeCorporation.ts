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

/** The Payee fields `payeesOfBookCorporation` reads. */
export interface PayeeLike {
  id: string;
  name: string;
  entityId?: number;
  entityKind?: 'corporation' | 'character' | 'alliance';
}

/**
 * The member's Payees that are a Corp Tax Book's corporation: one verified as it, or carrying its
 * id with no kind recorded; failing those, an unlinked one named exactly as it (EVE names are
 * unique). `link`:
 * the Payee is missing the verified link, and should be given it so every device agrees. Never one
 * linked to someone else, whatever its name.
 */
export function payeesOfBookCorporation(
  payees: readonly PayeeLike[],
  corporation: NamedCorporation
): { id: string; link: boolean }[] {
  const byId = payees.flatMap((p): { id: string; link: boolean }[] =>
    p.entityId !== corporation.corporationId
      ? []
      : p.entityKind === 'corporation'
        ? [{ id: p.id, link: false }]
        : p.entityKind === undefined
          ? [{ id: p.id, link: true }]
          : []
  );
  // A Payee already carrying the id is the corporation: a same-named unlinked one beside it stays
  // the separate label its owner made.
  if (byId.length > 0) return byId;
  return payees.flatMap((p) =>
    p.entityId === undefined && corporationNamed(p.name, [corporation])
      ? [{ id: p.id, link: true }]
      : []
  );
}
