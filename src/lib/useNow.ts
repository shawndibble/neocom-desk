import { useTicker } from './ticker';

const TICK_MS = 60_000;

/**
 * `Date.now()` is impure, so a live-ticking countdown reads it only through
 * this hook — never directly in a component's render body
 * (react-hooks/purity). Every caller shares one minute clock (`ticker.ts`),
 * which pauses while the tab is hidden.
 */
export function useNow(): number {
  return useTicker(TICK_MS);
}
