import { useMediaQuery } from './useMediaQuery';

export const XL_UP_QUERY = '(min-width: 80rem)';

export function useIsXlUp(): boolean {
  return useMediaQuery(XL_UP_QUERY);
}
