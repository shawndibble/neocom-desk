/**
 * One Character's blueprint choice for one Community: either an allowlist
 * (nothing is shared until picked) or "share all" with the blueprints the
 * Member has since stopped sharing. Under share-all a blueprint acquired later
 * is shared too, which an allowlist of type ids cannot express. Pure: storage
 * is `features/communities/shareSelection.ts`.
 */
export type ShareChoice =
  | { all: false; allowed: ReadonlySet<number> }
  | { all: true; excluded: ReadonlySet<number> };

export const noneShared = (): ShareChoice => ({ all: false, allowed: new Set() });
export const shareAll = (): ShareChoice => ({ all: true, excluded: new Set() });

/** The owned blueprint types this choice shares right now. */
export function effectiveSelection(owned: readonly number[], choice: ShareChoice): Set<number> {
  return new Set(
    owned.filter((typeId) =>
      choice.all ? !choice.excluded.has(typeId) : choice.allowed.has(typeId)
    )
  );
}

function without(set: ReadonlySet<number>, typeId: number): Set<number> {
  const next = new Set(set);
  next.delete(typeId);
  return next;
}

/** Revoke one blueprint: an exclusion under share-all, else drop it from the allowlist. */
export function stopSharing(choice: ShareChoice, typeId: number): ShareChoice {
  return choice.all
    ? { all: true, excluded: new Set(choice.excluded).add(typeId) }
    : { all: false, allowed: without(choice.allowed, typeId) };
}

/** Share one blueprint: lifts its exclusion under share-all, else grows the allowlist. */
export function addShared(choice: ShareChoice, typeId: number): ShareChoice {
  return choice.all
    ? { all: true, excluded: without(choice.excluded, typeId) }
    : { all: false, allowed: new Set(choice.allowed).add(typeId) };
}
