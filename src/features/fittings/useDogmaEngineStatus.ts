import { useSyncExternalStore } from 'react';
import { useOnline } from '@/stores/network';
import {
  dogmaEngineStatus,
  subscribeDogmaEngineStatus,
  type DogmaEngineStatus,
} from './dogmaEngineStatus';

export function useDogmaEngineStatus(): DogmaEngineStatus {
  return useSyncExternalStore(subscribeDogmaEngineStatus, dogmaEngineStatus, dogmaEngineStatus);
}

export function useShipDataNeedsConnection(): boolean {
  const online = useOnline();
  const status = useDogmaEngineStatus();
  return !online && status === 'failed';
}
