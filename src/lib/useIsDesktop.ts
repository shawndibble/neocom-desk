import { useMediaQuery } from './useMediaQuery';

export const DESKTOP_QUERY = '(min-width: 64rem)';

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
