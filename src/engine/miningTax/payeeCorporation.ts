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

export interface PayeeLike {
  id: string;
  characterId?: number;
  name: string;
  entityId?: number;
  entityKind?: 'corporation' | 'character' | 'alliance';
}

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
  if (byId.length > 0) return byId;
  return payees.flatMap((p) =>
    p.entityId === undefined && corporationNamed(p.name, [corporation])
      ? [{ id: p.id, link: true }]
      : []
  );
}

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
