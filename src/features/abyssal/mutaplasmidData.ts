/**
 * The bundled mutaplasmid data (`public/data/mutaplasmids.json`) as a
 * `MutaplasmidLookup` (`engine/fittings/mutaplasmids.ts`), built once a
 * session. The one way the feature layer reaches it.
 */
import { useEffect, useState } from 'react';
import { mutaplasmidLookup, type MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
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
  const mutated = fitting.modules.some((m) => m.mutation) || fitting.drones.some((d) => d.mutation);
  if (!mutated) return undefined;
  try {
    return (await loadMutaplasmidLookup()).attributeName;
  } catch {
    return undefined;
  }
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

/** Test-only: forget the loaded lookup. */
export function resetMutaplasmidLookupForTests(): void {
  lookupPromise = null;
  ready = null;
}
