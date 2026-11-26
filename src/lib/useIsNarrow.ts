import { useMediaQuery } from './useMediaQuery';

export const NARROW_QUERY = '(max-width: 47.999rem)';

export function useIsNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY);
}
