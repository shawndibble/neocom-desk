/**
 * The bundled mutaplasmid data (`public/data/mutaplasmids.json`) as a
 * `MutaplasmidLookup` (`engine/fittings/mutaplasmids.ts`), built once a
 * session. The one way the feature layer reaches it.
 */
import { useEffect, useState } from 'react';
import {
  hasMutations,
  mutaplasmidLookup,
  normaliseFittingMutations,
  type MutaplasmidLookup,
} from '@/engine/fittings/mutaplasmids';
import { loadMutaplasmids } from '@/sde/loadSde';
import type { Fitting } from '@/engine/fittings/types';
import type { AttributeNameFor } from '@/engine/fittings/eftMutations';

let lookupPromise: Promise<MutaplasmidLookup> | null = null;
let ready: MutaplasmidLookup | null = null;

export function loadMutaplasmidLookup(): Promise<MutaplasmidLookup> {
  // Started inside a promise, so any failure — a sync throw included — is a rejection.
  lookupPromise ??= Promise.resolve()
    .then(() => loadMutaplasmids())
    .then(
      (data) => (ready = mutaplasmidLookup(data)),
      (err: unknown) => {
        lookupPromise = null; // allow a retry
        throw err;
      }
    );
  return lookupPromise;
}

/**
 * The roll names an EFT export of `fitting` needs (`fittingToEft`'s
 * `attributeName`): loaded only when it carries a mutated item, and
 * undefined when it carries none or the data won't load — the export then
 * writes each block without its rolls rather than failing.
 */
export async function eftAttributeNamesFor(
  fitting: Fitting
): Promise<AttributeNameFor | undefined> {
  if (!hasMutations(fitting)) return undefined;
  try {
    return (await loadMutaplasmidLookup()).attributeName;
  } catch {
    return undefined;
  }
}

/**
 * `normaliseFittingMutations` for a decoded share code (the codec checks shape
 * only); every mutation dropped when the data won't load. Run on each decode
 * of a code that may be a stranger's.
 */
export async function withCheckedMutations(fitting: Fitting): Promise<Fitting> {
  if (!hasMutations(fitting)) return fitting;
  return normaliseFittingMutations(fitting, await loadMutaplasmidLookup().catch(() => null));
}

/**
 * The lookup if it is already loaded, else null: never starts a load, never
 * subscribes. For a row-level guess (how many items a menu will render) that
 * must not pull the data in per row.
 */
export function loadedMutaplasmidLookup(): MutaplasmidLookup | null {
  return ready;
}

/** The lookup once loaded; null while it loads or if it failed (a later render retries). */
export function useMutaplasmidLookup(): MutaplasmidLookup | null {
  const [lookup, setLookup] = useState<MutaplasmidLookup | null>(ready);
  useEffect(() => {
    if (lookup) return;
    let live = true;
    loadMutaplasmidLookup().then(
      (loaded) => {
        if (live) setLookup(loaded);
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [lookup]);
  return lookup;
}

/** Whether `typeId` is an Abyssal type: null while the data loads, false if it won't load. */
export function useIsAbyssalType(typeId: number): boolean | null {
  const lookup = useMutaplasmidLookup();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (lookup) return;
    let live = true;
    loadMutaplasmidLookup().catch(() => {
      if (live) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [lookup]);
  if (lookup) return lookup.isAbyssalType(typeId);
  return failed ? false : null;
}

/** Test-only: forget the loaded lookup. */
export function resetMutaplasmidLookupForTests(): void {
  lookupPromise = null;
  ready = null;
}
