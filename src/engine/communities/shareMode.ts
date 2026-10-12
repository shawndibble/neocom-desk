/**
 * One Character's choice of what to share with one Community: either an
 * allowlist (nothing is shared until picked) or "share all" with the entries
 * the Member has since stopped sharing. Under share-all an entry acquired
 * later is shared too, which an allowlist cannot express. `K` is the entry's
 * key: a blueprint type id, or a Fitting's `source-key` string. Pure: storage
 * is `features/communities/shareSelection.ts`.
 */
export type ShareChoice<K = number> =
  | { all: false; allowed: ReadonlySet<K> }
  | { all: true; excluded: ReadonlySet<K> };

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
