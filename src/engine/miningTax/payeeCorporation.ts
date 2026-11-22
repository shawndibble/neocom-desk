/**
 * Which corporation a typed Payee name names (#6205). Payee setup uses this to
 * suggest the link, and a Corp Tax Book takes an unlinked Payee named exactly
 * as its corporation as its own (`payeesOfBookCorporation`). Whole names only,
 * ignoring case and surrounding spaces: a pilot types names, and EVE names are
 * unique case-insensitively.
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
  /** Payees are per Character: each Character's are judged apart. */
  characterId?: number;
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
  const byCharacter = new Map<number | undefined, PayeeLike[]>();
  for (const p of payees)
    byCharacter.set(p.characterId, [...(byCharacter.get(p.characterId) ?? []), p]);
  const link = new Map(
    [...byCharacter.values()].flatMap((own) =>
      ofOneCharacter(own, corporation).map((f) => [f.id, f.link] as const)
    )
  );
  // In the order given, so a caller's first is the first Payee it passed.
  return payees.flatMap((p) => {
    const l = link.get(p.id);
    return l === undefined ? [] : [{ id: p.id, link: l }];
  });
}

function ofOneCharacter(
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

/**
 * The ids of every Payee record that is the corporation of one of the member's Corp Tax Books: the
 * Payees a book is the authority for (decision 20261122, one card per corporation). One carrying
 * the corporation's id (kind `corporation`, or none recorded) is it; one with no entity id at all
 * is it when named exactly as it (EVE names are unique, so an unlinked label of that name is the
 * same recipient, whether or not the link was ever made). One linked to anything else is never it.
 */
export function bookOwnedPayeeIds(
  payees: readonly PayeeLike[],
  corporations: readonly NamedCorporation[]
): Set<string> {
  const out = new Set<string>();
  for (const p of payees)
    for (const corporation of corporations) {
      const owned =
        p.entityId === undefined
          ? corporationNamed(p.name, [corporation]) !== undefined
          : p.entityId === corporation.corporationId &&
            (p.entityKind === undefined || p.entityKind === 'corporation');
      if (owned) out.add(p.id);
    }
  return out;
}
