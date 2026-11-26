import { useMediaQuery } from './useMediaQuery';

export const BELOW_DESKTOP_QUERY = '(max-width: 63.999rem)';

export function useIsBelowDesktop(): boolean {
  return useMediaQuery(BELOW_DESKTOP_QUERY);
}
