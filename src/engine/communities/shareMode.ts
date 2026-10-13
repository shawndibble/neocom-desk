/**
 * One Character's choice of what to share with one Community: either an
 * allowlist (nothing is shared until picked) or "share all" with the entries
 * the Member has since stopped sharing. Under share-all an entry acquired
 * later is shared too, which an allowlist cannot express. `K` is the entry's
 * key: a blueprint type id, or a Fitting's `source-key` string. Pure: storage
 * is `features/communities/shareSelection.ts`.
 */
export type ShareChoice<K = number> =
  { all: false; allowed: ReadonlySet<K> } | { all: true; excluded: ReadonlySet<K> };

export const noneShared = <K = number>(): ShareChoice<K> => ({ all: false, allowed: new Set() });
export const shareAll = <K = number>(): ShareChoice<K> => ({ all: true, excluded: new Set() });

/** The owned entries this choice shares right now. */
export function effectiveSelection<K>(owned: readonly K[], choice: ShareChoice<K>): Set<K> {
  return new Set(
    owned.filter((key) => (choice.all ? !choice.excluded.has(key) : choice.allowed.has(key)))
  );
}

function without<K>(set: ReadonlySet<K>, key: K): Set<K> {
  const next = new Set(set);
  next.delete(key);
  return next;
}

/** Revoke one entry: an exclusion under share-all, else drop it from the allowlist. */
export function stopSharing<K>(choice: ShareChoice<K>, key: K): ShareChoice<K> {
  return choice.all
    ? { all: true, excluded: new Set(choice.excluded).add(key) }
    : { all: false, allowed: without(choice.allowed, key) };
}

/** Share one entry: lifts its exclusion under share-all, else grows the allowlist. */
export function addShared<K>(choice: ShareChoice<K>, key: K): ShareChoice<K> {
  return choice.all
    ? { all: true, excluded: without(choice.excluded, key) }
    : { all: false, allowed: new Set(choice.allowed).add(key) };
}

/**
 * A Character's blueprint choice for one Community: the by-type choice above
 * plus standing location rules. A shared location (a resolved station or
 * structure id, never a container) shares every copy whose place is there,
 * including copies that arrive later; a copy moved away is no longer shared
 * by it. Under share-all the locations are irrelevant.
 */
export interface BlueprintShare {
  choice: ShareChoice;
  locations: ReadonlySet<number>;
}

/** One owned blueprint copy: its type and resolved station or structure (null when unknown). */
export interface BlueprintCopy {
  typeId: number;
  placeId: number | null;
}

export const noBlueprintsShared = (): BlueprintShare => ({
  choice: noneShared(),
  locations: new Set(),
});
export const shareAllBlueprints = (): BlueprintShare => ({
  choice: shareAll(),
  locations: new Set(),
});

const typeChosen = (choice: ShareChoice, typeId: number) =>
  choice.all ? !choice.excluded.has(typeId) : choice.allowed.has(typeId);

/** Whether one copy is shared: its type is chosen, or (switch off) its place is a shared location. */
export function sharesBlueprint(
  share: BlueprintShare,
  typeId: number,
  placeId: number | null
): boolean {
  if (typeChosen(share.choice, typeId)) return true;
  return !share.choice.all && placeId !== null && share.locations.has(placeId);
}

export function shareLocation(share: BlueprintShare, placeId: number): BlueprintShare {
  return { ...share, locations: new Set(share.locations).add(placeId) };
}

export function stopSharingLocation(share: BlueprintShare, placeId: number): BlueprintShare {
  return { ...share, locations: without(share.locations, placeId) };
}

/**
 * For every owned type: whether the by-type choice shares it (`direct`, the
 * one a Stop sharing button undoes) and which shared locations hold a copy of
 * it (`via`, ascending; always empty under share-all).
 */
export function typeShareStatus(
  copies: readonly BlueprintCopy[],
  share: BlueprintShare
): Map<number, { direct: boolean; via: number[] }> {
  const via = new Map<number, Set<number>>();
  for (const { typeId, placeId } of copies) {
    if (!via.has(typeId)) via.set(typeId, new Set());
    if (!share.choice.all && placeId !== null && share.locations.has(placeId)) {
      via.get(typeId)!.add(placeId);
    }
  }
  return new Map(
    [...via].map(([typeId, places]) => [
      typeId,
      { direct: typeChosen(share.choice, typeId), via: [...places].sort((a, b) => a - b) },
    ])
  );
}

/** How many copies sit at each known place. */
export function copiesByPlace(copies: readonly BlueprintCopy[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const { placeId } of copies) {
    if (placeId !== null) counts.set(placeId, (counts.get(placeId) ?? 0) + 1);
  }
  return counts;
}
