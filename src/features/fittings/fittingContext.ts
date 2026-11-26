import { useMemo, useSyncExternalStore } from 'react';
import type { PilotProfile } from '@/engine/fittings/types';
import {
  readyDogmaEngine,
  subscribeDogmaEngine,
  type ChargeBasis,
  type DogmaEngine,
} from './dogmaFittingEngine';
import type { FittingCatalogue } from './useFittingCatalogue';

export function useDogmaEngine(): DogmaEngine | null {
  return useSyncExternalStore(subscribeDogmaEngine, readyDogmaEngine, readyDogmaEngine);
}

export interface FittingContext {
  engine: DogmaEngine;
  profile: PilotProfile;
  catalogue: FittingCatalogue;
  basis?: ChargeBasis;
}

export function useFittingContext(
  profile: PilotProfile | null,
  catalogue: FittingCatalogue | null,
  basis: ChargeBasis | null = null
): FittingContext | null {
  const engine = useDogmaEngine();
  return useMemo(
    () =>
      engine === null || profile === null || catalogue === null
        ? null
        : { engine, profile, catalogue, ...(basis === null ? {} : { basis }) },
    [engine, profile, catalogue, basis]
  );
}
