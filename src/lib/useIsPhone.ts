import { useMediaQuery } from './useMediaQuery';

export const PHONE_QUERY = '(max-width: 39.999rem)';

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
