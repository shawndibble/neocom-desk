import { useMediaQuery } from './useMediaQuery';

export const XL_UP_QUERY = '(min-width: 78.125rem)';

export function useIsXlUp(): boolean {
  return useMediaQuery(XL_UP_QUERY);
}
