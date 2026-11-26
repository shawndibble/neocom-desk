export type ShareChoice<K = number> =
  { all: false; allowed: ReadonlySet<K> } | { all: true; excluded: ReadonlySet<K> };

export const noneShared = <K = number>(): ShareChoice<K> => ({ all: false, allowed: new Set() });
export const shareAll = <K = number>(): ShareChoice<K> => ({ all: true, excluded: new Set() });

function without<K>(set: ReadonlySet<K>, key: K): Set<K> {
  const next = new Set(set);
  next.delete(key);
  return next;
}

export function stopSharing<K>(choice: ShareChoice<K>, key: K): ShareChoice<K> {
  return choice.all
    ? { all: true, excluded: new Set(choice.excluded).add(key) }
    : { all: false, allowed: without(choice.allowed, key) };
}

export function addShared<K>(choice: ShareChoice<K>, key: K): ShareChoice<K> {
  return choice.all
    ? { all: true, excluded: without(choice.excluded, key) }
    : { all: false, allowed: new Set(choice.allowed).add(key) };
}

export interface BlueprintShare {
  choice: ShareChoice;
  locations: ReadonlySet<number>;
}

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

export function sharesBlueprint(
  share: BlueprintShare,
  typeId: number,
  placeId: number | null
): boolean {
  if (typeChosen(share.choice, typeId)) return true;
  return !share.choice.all && placeId !== null && share.locations.has(placeId);
}

export function shareType(share: BlueprintShare, typeId: number): BlueprintShare {
  return { ...share, choice: addShared(share.choice, typeId) };
}

export function stopSharingType(share: BlueprintShare, typeId: number): BlueprintShare {
  return { ...share, choice: stopSharing(share.choice, typeId) };
}

export function shareLocation(share: BlueprintShare, placeId: number): BlueprintShare {
  return { ...share, locations: new Set(share.locations).add(placeId) };
}

export function stopSharingLocation(share: BlueprintShare, placeId: number): BlueprintShare {
  return { ...share, locations: without(share.locations, placeId) };
}

export interface TypeStatus {
  direct: boolean;
  via: number[];
}

export function typeShareStatus(
  copies: readonly BlueprintCopy[],
  share: BlueprintShare
): Map<number, TypeStatus> {
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

export function copiesByPlace(copies: readonly BlueprintCopy[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const { placeId } of copies) {
    if (placeId !== null) counts.set(placeId, (counts.get(placeId) ?? 0) + 1);
  }
  return counts;
}
