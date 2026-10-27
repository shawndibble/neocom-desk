/** The dogma engine's load status in React (see `dogmaEngineStatus.ts`). */
import { useSyncExternalStore } from 'react';
import { useOnline } from '@/stores/network';
import {
  dogmaEngineStatus,
  subscribeDogmaEngineStatus,
  type DogmaEngineStatus,
} from './dogmaEngineStatus';

/** The engine's load status, re-rendering as it changes. */
export function useDogmaEngineStatus(): DogmaEngineStatus {
  return useSyncExternalStore(subscribeDogmaEngineStatus, dogmaEngineStatus, dogmaEngineStatus);
}

/**
 * The ship data never downloaded and there is no connection to fetch it: the
 * one condition every stats view words as "needs a one-time download, connect
 * once" instead of "couldn't load".
 */
export function useShipDataNeedsConnection(): boolean {
  const online = useOnline();
  const status = useDogmaEngineStatus();
  return !online && status === 'failed';
}
