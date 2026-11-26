import { useTicker } from './ticker';
import { MINUTE_MS } from '@/lib/age';

const TICK_MS = MINUTE_MS;

export function useNow(): number {
  return useTicker(TICK_MS);
}
