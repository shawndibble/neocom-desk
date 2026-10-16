/**
 * The bundled mutaplasmid data (`public/data/mutaplasmids.json`) as a
 * `MutaplasmidLookup` (`engine/fittings/mutaplasmids.ts`), built once a
 * session. The one way the feature layer reaches it.
 */
import { useEffect, useState } from 'react';
import { mutaplasmidLookup, type MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import { loadMutaplasmids } from '@/sde/loadSde';

let lookupPromise: Promise<MutaplasmidLookup> | null = null;
let ready: MutaplasmidLookup | null = null;

export function loadMutaplasmidLookup(): Promise<MutaplasmidLookup> {
  lookupPromise ??= loadMutaplasmids().then(
    (data) => (ready = mutaplasmidLookup(data)),
    (err: unknown) => {
      lookupPromise = null; // allow a retry
      throw err;
    }
  );
  return lookupPromise;
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
