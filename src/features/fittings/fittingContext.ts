/**
 * The ready dogma engine in React, and the one value the editor's fit checks
 * travel as. `useDogmaEngine` only listens for the module-level load
 * (`loadDogmaEngine`) — it never starts one, so a page that doesn't download
 * the engine today still doesn't. A fitting context exists only once the
 * engine, the pilot and the catalogue are all in; null stands for "still
 * loading" everywhere below it, so no component checks three things apart.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { PilotProfile } from '@/engine/fittings/types';
import { readyDogmaEngine, subscribeDogmaEngine, type DogmaEngine } from './dogmaFittingEngine';
import type { FittingCatalogue } from './useFittingCatalogue';

/** The ready engine, or null until `loadDogmaEngine` has resolved somewhere. */
export function useDogmaEngine(): DogmaEngine | null {
  return useSyncExternalStore(subscribeDogmaEngine, readyDogmaEngine, readyDogmaEngine);
}

/** What the editor's synchronous fit checks need, together: the engine, the pilot, the catalogue. */
export interface FittingContext {
  engine: DogmaEngine;
  /** The pilot the checks run under — skills for "can fly". */
  profile: PilotProfile;
  catalogue: FittingCatalogue;
}

/** One fitting context per engine, pilot and catalogue; null while any of the three is loading. */
export function useFittingContext(
  profile: PilotProfile | null,
  catalogue: FittingCatalogue | null
): FittingContext | null {
  const engine = useDogmaEngine();
  return useMemo(
    () =>
      engine === null || profile === null || catalogue === null
        ? null
        : { engine, profile, catalogue },
    [engine, profile, catalogue]
  );
}
