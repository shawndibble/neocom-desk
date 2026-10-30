import { useTicker } from './ticker';
import { MINUTE_MS } from '@/lib/age';

const TICK_MS = MINUTE_MS;

/**
 * `Date.now()` is impure, so a live-ticking countdown reads it only through
 * this hook — never directly in a component's render body
 * (react-hooks/purity). Every caller shares one minute clock (`ticker.ts`),
 * which pauses while the tab is hidden.
 */
export function useNow(): number {
  return useTicker(TICK_MS);
}
