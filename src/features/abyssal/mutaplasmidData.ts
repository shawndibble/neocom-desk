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
  lookupPromise ??= Promise.resolve()
    .then(() => loadMutaplasmids())
    .then(
      (data) => (ready = mutaplasmidLookup(data)),
      (err: unknown) => {
        lookupPromise = null;
        throw err;
      }
    );
  return lookupPromise;
}

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

export async function withCheckedMutations(fitting: Fitting): Promise<Fitting> {
  if (!hasMutations(fitting)) return fitting;
  return normaliseFittingMutations(fitting, await loadMutaplasmidLookup().catch(() => null));
}

export function loadedMutaplasmidLookup(): MutaplasmidLookup | null {
  return ready;
}

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

export function resetMutaplasmidLookupForTests(): void {
  lookupPromise = null;
  ready = null;
}
