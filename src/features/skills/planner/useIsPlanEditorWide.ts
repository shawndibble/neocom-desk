import { useMediaQuery } from '@/lib/useMediaQuery';

export const PLAN_EDITOR_WIDE_QUERY = '(min-width: 80rem)';

export function useIsPlanEditorWide(): boolean {
  return useMediaQuery(PLAN_EDITOR_WIDE_QUERY);
}
